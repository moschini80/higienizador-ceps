'use strict';

/**
 * Processor — Gerenciamento de streams, cruzamento e exportação de resultados.
 *
 * Dependências (via script tags): PhoneticsPTBR, Similarity
 * Exposto como objeto global para uso via <script> tag.
 */
const Processor = (() => {

  // ── Estado interno ──────────────────────────────────────────────────────
  let referenceMap = new Map(); // CEP (somente dígitos) → endereço original
  let isRunning    = false;
  let isPaused     = false;
  let shouldCancel = false;

  // Buffers de resultado por categoria
  const results = { perfect: [], corrected: [], risk: [], invalid: [] };

  // Estatísticas em tempo real
  let stats = {
    processed: 0,
    startTime: null,
    perfect: 0, corrected: 0, risk: 0, invalid: 0,
    bytesRead: 0, fileSize: 0,
  };

  // Limiares configuráveis
  let thresholdPerfect   = 95;
  let thresholdCorrected = 70;

  // Engine fonética selecionada: 'ptbr' | 'levenshtein' (futuro)
  let phoneticEngine = 'ptbr';

  function setPhoneticEngine(engine) {
    phoneticEngine = engine || 'ptbr';
  }

  // ── Utilitários CSV ─────────────────────────────────────────────────────

  function detectDelimiter(line) {
    const candidates = [',', ';', '\t', '|'];
    let best = ','; let max = -1;
    for (const d of candidates) {
      // Conta ocorrências fora de aspas (simplificado)
      const count = line.split(d).length - 1;
      if (count > max) { max = count; best = d; }
    }
    return best;
  }

  function parseCSVLine(line, delimiter) {
    const fields = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  }

  function normalizeCEP(raw) {
    return (raw || '').replace(/\D/g, '');
  }

  // ── Carregamento da base de referência ──────────────────────────────────

  /**
   * Carrega a pasta OpenCEP (v1): múltiplos arquivos .json, um por CEP.
   * Formato de cada arquivo: { "cep": "01001-900", "logradouro": "...", ... }
   *
   * Lê os arquivos em lotes paralelos para performance máxima.
   *
   * @param {File[]}   files       lista de File (resultado de webkitdirectory)
   * @param {Function} onProgress  (loaded, total) → void
   * @returns {Promise<number>}    total de CEPs carregados
   */
  async function loadReferenceFolder(files, onProgress) {
    referenceMap = new Map();

    const total     = files.length;
    let   loaded    = 0;
    const BATCH     = 200; // arquivos lidos em paralelo por vez

    for (let i = 0; i < total; i += BATCH) {
      const batch = files.slice(i, i + BATCH);

      await Promise.all(batch.map(async (file) => {
        try {
          const text = await file.text();
          const obj  = JSON.parse(text);
          const cep  = normalizeCEP(obj.cep);
          // Monta logradouro completo: logradouro + bairro + localidade/UF
          const parts = [obj.logradouro, obj.bairro, obj.localidade]
            .map(v => (v || '').trim())
            .filter(Boolean);
          const address = parts.join(', ') || '';
          if (cep && address) {
            referenceMap.set(cep, address);
          }
        } catch (_) { /* arquivo inválido — ignora */ }
        loaded++;
      }));

      onProgress?.(loaded, total);

      // Cede ao thread principal entre lotes para não travar a UI
      await new Promise(r => setTimeout(r, 0));
    }

    return referenceMap.size;
  }

  /**
   * Carrega arquivo de referência no formato JSON (ex: OpenCEP array único).
   *
   * @param {File}     file
   * @param {string}   fieldCep      nome do campo CEP no objeto JSON
   * @param {string}   fieldAddress  nome do campo logradouro no objeto JSON
   * @param {Function} onProgress    (loaded, total) → void
   * @returns {Promise<number>}      total de CEPs carregados
   */
  async function loadReferenceJSON(file, fieldCep, fieldAddress, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let text = e.target.result;
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

          const data = JSON.parse(text);

          if (!Array.isArray(data)) {
            throw new Error('O arquivo JSON deve ser um array de objetos.');
          }

          referenceMap = new Map();
          const total  = data.length;

          for (let i = 0; i < total; i++) {
            const item    = data[i];
            const cep     = normalizeCEP(item[fieldCep]);
            const address = (item[fieldAddress] || '').trim();

            if (cep && address) {
              referenceMap.set(cep, address);
            }

            if (onProgress && i % 50000 === 0) {
              onProgress(i, total);
            }
          }

          resolve(referenceMap.size);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo JSON de referência.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Carrega arquivo de referência (CEP → logradouro) no formato CSV.
   * @param {File}     file
   * @param {number}   colCep      índice da coluna CEP (0-based)
   * @param {number}   colAddress  índice da coluna logradouro (0-based)
   * @param {boolean}  hasHeader
   * @param {Function} onProgress  (loaded, total) → void
   * @returns {Promise<number>}    total de CEPs carregados
   */
  async function loadReferenceFile(file, colCep, colAddress, hasHeader, onProgress) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let text = e.target.result;
          // Remove BOM UTF-8
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

          const lines = text.split(/\r?\n/);
          const delimiter = detectDelimiter(lines.find(l => l.trim()) || ',');

          referenceMap = new Map();
          const start = hasHeader ? 1 : 0;

          for (let i = start; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const fields = parseCSVLine(line, delimiter);
            const cep     = normalizeCEP(fields[colCep]);
            const address = (fields[colAddress] || '').trim();

            if (cep && address) {
              referenceMap.set(cep, address);
            }

            if (onProgress && i % 20000 === 0) {
              onProgress(i, lines.length);
            }
          }

          resolve(referenceMap.size);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo de referência.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ── Pipeline de classificação ────────────────────────────────────────────

  /**
   * Classifica um único registro aplicando o pipeline de batimento.
   */
  function classifyRecord(id, cepRaw, addressOriginal) {
    const cep = normalizeCEP(cepRaw);

    if (!referenceMap.has(cep)) {
      return {
        id_original: id, cep: cepRaw,
        endereco_original: addressOriginal,
        endereco_base_oficial: '',
        score_final: 0,
        metodo_batimento: 'N/A',
        category: 'invalid',
      };
    }

    const officialAddress = referenceMap.get(cep);

    const normOrig = PhoneticsPTBR.normalize(addressOriginal);
    const normRef  = PhoneticsPTBR.normalize(officialAddress);

    let score, method;

    if (phoneticEngine === 'jw-optimized') {
      // Engine 2: Jaro-Winkler com sanitização estrita e expansão de abreviações PT-BR
      ({ score, method } = SimilarityJWOptimized.computeScore(addressOriginal, officialAddress));
    } else {
      // Engine padrão: fonetização PT-BR + Jaro-Winkler composto
      const phonOrig = PhoneticsPTBR.phoneticCode(addressOriginal);
      const phonRef  = PhoneticsPTBR.phoneticCode(officialAddress);
      ({ score, method } = Similarity.computeScore(normOrig, normRef, phonOrig, phonRef));
    }

    let category;
    if (score >= thresholdPerfect)        category = 'perfect';
    else if (score >= thresholdCorrected) category = 'corrected';
    else                                  category = 'risk';

    return {
      id_original: id, cep: cepRaw,
      endereco_original: addressOriginal,
      endereco_base_oficial: officialAddress,
      score_final: score,
      metodo_batimento: method,
      category,
    };
  }

  // ── Processamento via Stream ─────────────────────────────────────────────

  /**
   * Processa o arquivo de trabalho usando ReadableStream (linha a linha).
   *
   * @param {File}   file
   * @param {object} config    { colId, colCep, colAddress, hasHeader, delimiter? }
   * @param {object} callbacks { onProgress(stats), onComplete(stats), onError(err) }
   */
  async function processWorkFile(file, config, callbacks) {
    if (referenceMap.size === 0) {
      callbacks.onError?.(new Error('Base de referência não carregada.'));
      return;
    }

    // ── Reset ────────────────────────────────────────────────────────────
    isRunning    = true;
    isPaused     = false;
    shouldCancel = false;

    results.perfect   = [];
    results.corrected = [];
    results.risk      = [];
    results.invalid   = [];

    stats = {
      processed: 0, startTime: Date.now(),
      perfect: 0, corrected: 0, risk: 0, invalid: 0,
      bytesRead: 0, fileSize: file.size,
    };

    const { colId, colCep, colAddress, hasHeader } = config;

    try {
      const stream  = file.stream();
      const reader  = stream.getReader();
      const decoder = new TextDecoder('utf-8');

      let lineBuffer      = '';
      let isFirstChunk    = true;
      let headerSkipped   = !hasHeader;
      let detectedDelim   = config.delimiter || null;

      // Lote acumulado para processamento em bloco
      const pendingLines = [];
      let lastUIUpdate   = Date.now();

      const flushBatch = async () => {
        for (const line of pendingLines) {
          if (!line) continue;

          if (!detectedDelim) detectedDelim = detectDelimiter(line);

          const fields  = parseCSVLine(line, detectedDelim);
          const id      = (fields[colId]  || '').trim() || String(stats.processed + 1);
          const cep     = (fields[colCep] || '').trim();
          const address = (fields[colAddress] || '').trim();

          if (!cep && !address) continue;

          const record = classifyRecord(id, cep, address);
          results[record.category].push(record);
          stats[record.category]++;
          stats.processed++;
        }
        pendingLines.length = 0;

        // Cede o controle ao UI thread aproximadamente a cada 100ms
        const now = Date.now();
        if (now - lastUIUpdate >= 100) {
          await new Promise(r => setTimeout(r, 0));
          lastUIUpdate = Date.now();
          callbacks.onProgress?.({ ...stats });
        }
      };

      // ── Loop de leitura do stream ────────────────────────────────────
      while (true) {
        if (shouldCancel) break;

        // Suporte a pause
        while (isPaused && !shouldCancel) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (shouldCancel) break;

        const { done, value } = await reader.read();

        if (done) {
          // Linha residual no buffer
          if (lineBuffer.trim()) pendingLines.push(lineBuffer.trim());
          if (pendingLines.length) await flushBatch();
          break;
        }

        stats.bytesRead += value.byteLength;

        let chunk = decoder.decode(value, { stream: true });

        // Remove BOM do primeiro chunk
        if (isFirstChunk) {
          if (chunk.charCodeAt(0) === 0xFEFF) chunk = chunk.slice(1);
          isFirstChunk = false;
        }

        lineBuffer += chunk;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer  = lines.pop(); // guarda linha incompleta

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!headerSkipped) { headerSkipped = true; continue; }

          pendingLines.push(trimmed);
        }

        // Processa lote se acumulou 1000 linhas
        if (pendingLines.length >= 1000) {
          await flushBatch();
        }
      }

      isRunning = false;
      reader.cancel().catch(() => {});

      const finalStats = { ...stats, cancelled: shouldCancel };
      callbacks.onComplete?.(finalStats);

    } catch (err) {
      isRunning = false;
      callbacks.onError?.(err);
    }
  }

  // ── Controles ────────────────────────────────────────────────────────────

  function pause()  { isPaused = true; }
  function resume() { isPaused = false; }
  function cancel() { shouldCancel = true; isPaused = false; }

  function setThresholds(perfect, corrected) {
    thresholdPerfect   = Math.min(100, Math.max(0, perfect));
    thresholdCorrected = Math.min(thresholdPerfect - 1, Math.max(0, corrected));
  }

  // ── Geração de CSV e exportação ─────────────────────────────────────────

  const CSV_HEADER = 'ID_ORIGINAL,CEP,ENDERECO_ORIGINAL,ENDERECO_BASE_OFICIAL,SCORE_FINAL,METODO_BATIMENTO';

  function escapeField(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  }

  function recordToCSVRow(rec) {
    return [
      rec.id_original, rec.cep, rec.endereco_original,
      rec.endereco_base_oficial, rec.score_final, rec.metodo_batimento,
    ].map(escapeField).join(',');
  }

  function generateCSVBlob(category) {
    const rows = results[category] || [];
    const lines = [CSV_HEADER, ...rows.map(recordToCSVRow)];
    return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  }

  function downloadCSV(category, filename) {
    const blob = generateCSVBlob(category);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ── Preview de arquivo ───────────────────────────────────────────────────

  /**
   * Lê as primeiras linhas de um arquivo para exibição prévia.
   * @param {File}   file
   * @param {number} maxLines
   * @returns {Promise<{ delimiter: string, rows: string[][] }>}
   */
  function previewFile(file, maxLines = 5) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let text = e.target.result;
          if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

          const lines    = text.split(/\r?\n/).filter(l => l.trim()).slice(0, maxLines);
          const delim    = detectDelimiter(lines[0] || '');
          const rows     = lines.map(l => parseCSVLine(l, delim));
          resolve({ delimiter: delim, rows });
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
      // Lê apenas os primeiros 16KB para preview rápido
      reader.readAsText(file.slice(0, 16384), 'UTF-8');
    });
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  function getStats()        { return { ...stats }; }
  function getReferenceSize(){ return referenceMap.size; }
  function getResults()      { return results; }
  function isProcessing()    { return isRunning; }

  // ── Helpers expostos para testes unitários ───────────────────────────────

  /** Classifica um único registro usando o referenceMap atual. */
  function classifyOne(cepRaw, addressOriginal, id = 'TEST') {
    return classifyRecord(id, cepRaw, addressOriginal);
  }

  /** Injeta entradas diretamente no referenceMap (uso exclusivo em testes). */
  function _testLoadMap(entries) {
    referenceMap = new Map(entries.map(([cep, addr]) => [normalizeCEP(cep), addr]));
  }

  return {
    loadReferenceFile,
    loadReferenceJSON,
    loadReferenceFolder,
    processWorkFile,
    pause, resume, cancel,
    setThresholds, setPhoneticEngine,
    downloadCSV, generateCSVBlob,
    previewFile, detectDelimiter,
    getStats, getReferenceSize, getResults, isProcessing,
    // testes
    classifyOne, _testLoadMap, normalizeCEP,
  };
})();
