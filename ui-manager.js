'use strict';

/**
 * UIManager — Atualização do Dashboard, contadores e estado dos controles.
 *
 * Exposto como objeto global para uso via <script> tag.
 */
const UIManager = (() => {

  // ── Utilitários ──────────────────────────────────────────────────────────

  function $(id) { return document.getElementById(id); }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  function setVisible(id, visible) {
    const el = $(id);
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  function setWidth(id, pct) {
    const el = $(id);
    if (el) el.style.width = Math.min(100, Math.max(0, pct)) + '%';
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('pt-BR');
  }

  function formatTime(ms) {
    if (!ms || ms < 0 || !isFinite(ms)) return '--:--:--';
    const totalSec = Math.floor(ms / 1000);
    const h   = Math.floor(totalSec / 3600);
    const m   = Math.floor((totalSec % 3600) / 60);
    const s   = totalSec % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  // ── Timer ────────────────────────────────────────────────────────────────

  let timerInterval = null;
  let timerStart    = null;

  function startTimer() {
    timerStart = Date.now();
    timerInterval = setInterval(() => {
      setText('timer-elapsed', formatTime(Date.now() - timerStart));
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Status da base de referência ─────────────────────────────────────────

  function setRefStatus(state, detail) {
    const el = $('ref-status');
    if (!el) return;
    const icons = { loading: '⏳', ok: '✅', error: '❌' };
    el.textContent = `${icons[state] || ''} ${detail}`;
    el.className   = 'ref-status ref-status--' + state;
  }

  // ── Progresso geral ───────────────────────────────────────────────────────

  function updateProgress(stats) {
    const { processed, perfect, corrected, risk, invalid,
            bytesRead, fileSize, startTime } = stats;

    setText('counter-total', formatNumber(processed));

    // Barra global (por bytes lidos)
    const pctFile = fileSize > 0 ? (bytesRead / fileSize) * 100 : 0;
    setWidth('bar-overall', pctFile);
    setText('pct-overall', pctFile.toFixed(1) + '%');

    // ETA
    const elapsed = Date.now() - startTime;
    if (pctFile > 0.5 && elapsed > 0) {
      const estimated  = elapsed / (pctFile / 100);
      const remaining  = Math.max(0, estimated - elapsed);
      setText('timer-eta', formatTime(remaining));
    } else {
      setText('timer-eta', '--:--:--');
    }

    // Velocidade
    if (elapsed > 500 && processed > 0) {
      const rps = Math.round(processed / (elapsed / 1000));
      setText('records-per-sec', formatNumber(rps) + ' reg/s');
    }

    // Categorias
    if (processed > 0) {
      _updateCategory('perfect',   perfect,   processed);
      _updateCategory('corrected', corrected, processed);
      _updateCategory('risk',      risk,      processed);
      _updateCategory('invalid',   invalid,   processed);
    }
  }

  function _updateCategory(key, count, total) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    setText(`counter-${key}`, formatNumber(count));
    setText(`pct-${key}`,     pct.toFixed(1) + '%');
    setWidth(`bar-${key}`,    pct);
  }

  // ── Estado dos controles ──────────────────────────────────────────────────

  function setProcessingState(state) {
    const btnStart  = $('btn-start');
    const btnPause  = $('btn-pause');
    const btnCancel = $('btn-cancel');
    const statusEl  = $('processing-status');

    const cfg = {
      idle:       { start: true,  pause: false, cancel: false, status: '',                       pauseLabel: '⏸️ Pausar' },
      loading:    { start: false, pause: false, cancel: false, status: '⏳ Carregando base...',   pauseLabel: '⏸️ Pausar' },
      processing: { start: false, pause: true,  cancel: true,  status: '⚙️ Processando...',      pauseLabel: '⏸️ Pausar' },
      paused:     { start: false, pause: true,  cancel: true,  status: '⏸️ Pausado',             pauseLabel: '▶️ Continuar' },
      done:       { start: true,  pause: false, cancel: false, status: '✅ Processamento concluído!', pauseLabel: '⏸️ Pausar' },
      cancelled:  { start: true,  pause: false, cancel: false, status: '⛔ Cancelado',           pauseLabel: '⏸️ Pausar' },
      error:      { start: true,  pause: false, cancel: false, status: '❌ Erro no processamento', pauseLabel: '⏸️ Pausar' },
    }[state] || { start: true, pause: false, cancel: false, status: '', pauseLabel: '⏸️ Pausar' };

    if (btnStart)  btnStart.disabled  = !cfg.start;
    if (btnPause)  { btnPause.disabled = !cfg.pause;  btnPause.textContent  = cfg.pauseLabel; }
    if (btnCancel) btnCancel.disabled  = !cfg.cancel;
    if (statusEl)  statusEl.textContent = cfg.status;
  }

  // ── Seção de exportação ───────────────────────────────────────────────────

  function showExport(stats) {
    setVisible('export-section', true);
    setText('export-perfect-count',   formatNumber(stats.perfect));
    setText('export-corrected-count', formatNumber(stats.corrected));
    setText('export-risk-count',      formatNumber(stats.risk));
    setText('export-invalid-count',   formatNumber(stats.invalid));
    $('export-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  function showDashboard() {
    setVisible('dashboard', true);
  }

  // ── Erros ─────────────────────────────────────────────────────────────────

  function showError(msg) {
    const el = $('error-message');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 8000);
  }

  // ── Preview de colunas ────────────────────────────────────────────────────

  /**
   * Renderiza tabela de preview na div indicada.
   * @param {string}     containerId
   * @param {string[][]} rows        dados já parseados
   * @param {string}     delimiter   delimitador detectado
   */
  function renderPreview(containerId, rows, delimiter) {
    const container = $(containerId);
    if (!container || !rows.length) return;

    const delimLabels = { ',': 'vírgula', ';': 'ponto e vírgula', '\t': 'tab', '|': 'pipe' };
    const delimLabel  = delimLabels[delimiter] || delimiter;

    const header = rows[0].map((_, i) => `<th>Col ${i}</th>`).join('');
    const body   = rows.map(r =>
      `<tr>${r.map(c => `<td>${c.length > 40 ? c.slice(0, 37) + '…' : c}</td>`).join('')}</tr>`
    ).join('');

    container.innerHTML = `
      <p class="preview-info">Delimitador detectado: <strong>${delimLabel}</strong> · Exibindo ${rows.length} linha(s)</p>
      <div class="preview-scroll">
        <table class="preview-table">
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  // ── Sliders ────────────────────────────────────────────────────────────────

  function updateSliderDisplay(thPerfect, thCorrected) {
    setText('slider-perfect-val',   thPerfect + '%');
    setText('slider-corrected-val', thCorrected + '%');
    setText('label-range-perfect',   `≥ ${thPerfect}%`);
    setText('label-range-corrected', `${thCorrected}% – ${thPerfect - 1}%`);
    setText('label-range-risk',      `1% – ${thCorrected - 1}%`);
  }

  return {
    setText, setHTML, setVisible, setWidth,
    formatNumber, formatTime,
    startTimer, stopTimer,
    setRefStatus,
    updateProgress,
    setProcessingState,
    showExport, showDashboard,
    showError,
    renderPreview,
    updateSliderDisplay,
  };
})();
