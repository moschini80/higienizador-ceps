'use strict';

/**
 * SimilarityJWOptimized — Jaro-Winkler com sanitização estrita e
 * normalização de abreviações em PT-BR.
 *
 * Especificação:
 *  1. Sanitização pré-algoritmo: remoção de acentos, caixa alta e expansão
 *     de abreviações comuns de logradouro.
 *  2. Prefix scale p = 0.1 (padrão Winkler); bônus aplicado apenas quando
 *     o score Jaro base for > 0.7.
 *  3. Tokens de uma única letra são ignorados na comparação para evitar
 *     que abreviações intermediárias (ex: "PROF. A. FONSECA") distorçam
 *     o resultado.
 *
 * Exposto como objeto global para uso via <script> tag.
 */
const SimilarityJWOptimized = (() => {

  // ── Dicionário de abreviações → forma canônica ───────────────────────────

  /** @type {Array<[RegExp, string]>} Pares [padrão, substituição] */
  const ABBREV_MAP = [
    [/\bAVENIDA\b/g,  'AVENIDA'],
    [/\bAVDA\b/g,     'AVENIDA'],
    [/\bAV\b\.?/g,    'AVENIDA'],
    [/\bRUA\b/g,      'RUA'],
    [/\bR\b\.?/g,     'RUA'],
    [/\bDOUTOR\b/g,   'DOUTOR'],
    [/\bDR\b\.?/g,    'DOUTOR'],
    [/\bPRACA\b/g,    'PRACA'],
    [/\bPRACa\b/g,    'PRACA'],
    [/\bP[CÇ]A\b\.?/g, 'PRACA'],
    [/\bCORONEL\b/g,  'CORONEL'],
    [/\bCEL\b\.?/g,   'CORONEL'],
  ];

  // ── Sanitização ──────────────────────────────────────────────────────────

  /**
   * Normaliza uma string para comparação:
   *  - Remove acentos via decomposição Unicode
   *  - Força caixa alta
   *  - Remove pontuação residual (exceto espaços)
   *  - Expande abreviações para a forma canônica
   *  - Remove tokens de uma única letra (ex: "A", "B")
   *
   * @param {string} raw
   * @returns {string}
   */
  function sanitize(raw) {
    if (!raw) return '';

    // 1. Remove acentos e caracteres diacríticos
    let s = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    // 2. Remove pontuação, mantém espaços e alfanuméricos
    s = s.replace(/[^A-Z0-9 ]/g, ' ');

    // 3. Colapsa múltiplos espaços
    s = s.replace(/\s+/g, ' ').trim();

    // 4. Expande abreviações (ordem importa: termos mais longos primeiro)
    for (const [pattern, canonical] of ABBREV_MAP) {
      s = s.replace(pattern, canonical);
    }

    // 5. Remove tokens de uma única letra (abreviações intermediárias)
    s = s
      .split(' ')
      .filter(token => token.length > 1)
      .join(' ');

    return s;
  }

  // ── Algoritmo Jaro ───────────────────────────────────────────────────────

  /**
   * Distância de Jaro entre duas strings já sanitizadas.
   * @param {string} s1
   * @param {string} s2
   * @returns {number} valor em [0, 1]
   */
  function jaro(s1, s2) {
    if (s1 === s2) return 1.0;

    const l1 = s1.length;
    const l2 = s2.length;
    if (l1 === 0 || l2 === 0) return 0.0;

    const matchDist = Math.max(Math.floor(Math.max(l1, l2) / 2) - 1, 0);

    const s1Matched = new Uint8Array(l1);
    const s2Matched = new Uint8Array(l2);
    let matches = 0;

    for (let i = 0; i < l1; i++) {
      const lo = Math.max(0, i - matchDist);
      const hi = Math.min(l2, i + matchDist + 1);
      for (let j = lo; j < hi; j++) {
        if (!s2Matched[j] && s1[i] === s2[j]) {
          s1Matched[i] = 1;
          s2Matched[j] = 1;
          matches++;
          break;
        }
      }
    }

    if (matches === 0) return 0.0;

    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < l1; i++) {
      if (!s1Matched[i]) continue;
      while (!s2Matched[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }

    return (
      matches / l1 +
      matches / l2 +
      (matches - transpositions / 2) / matches
    ) / 3;
  }

  // ── Jaro-Winkler com threshold de bônus ─────────────────────────────────

  /**
   * Jaro-Winkler com bônus de prefixo condicional.
   *
   * Parâmetros:
   *  - p = 0.1  (escala do prefixo — padrão Winkler)
   *  - bônus aplicado apenas se Jaro base > 0.7
   *
   * @param {string} s1
   * @param {string} s2
   * @returns {number} valor em [0, 1]
   */
  function jaroWinkler(s1, s2) {
    const PREFIX_SCALE   = 0.1;
    const BONUS_THRESHOLD = 0.7;

    const j = jaro(s1, s2);

    if (j <= BONUS_THRESHOLD) return j;

    const maxPfx = Math.min(4, s1.length, s2.length);
    let prefix = 0;
    for (let i = 0; i < maxPfx; i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return j + prefix * PREFIX_SCALE * (1 - j);
  }

  // ── Score composto ───────────────────────────────────────────────────────

  /**
   * Calcula o score de similaridade (0–100) entre dois endereços brutos,
   * aplicando sanitização + Jaro-Winkler otimizado.
   *
   * @param {string} addressOriginal  - endereço do arquivo de trabalho
   * @param {string} addressOfficial  - endereço da base de referência
   * @returns {{ score: number, method: string }}
   */
  function computeScore(addressOriginal, addressOfficial) {
    const a = sanitize(addressOriginal);
    const b = sanitize(addressOfficial);

    if (a === b) {
      return { score: 100, method: 'Exato' };
    }

    if (a === '' || b === '') {
      return { score: 0, method: 'JW-Otimizado' };
    }

    const jw = jaroWinkler(a, b);
    const score = Math.min(99, Math.round(jw * 100));

    const method = jw >= 0.95 ? 'Exato' : 'JW-Otimizado';

    return { score, method };
  }

  // ── API pública ──────────────────────────────────────────────────────────

  return {
    sanitize,
    jaro,
    jaroWinkler,
    computeScore,
  };
})();
