'use strict';

/**
 * Similarity — Jaro-Winkler e Score composto para comparação de endereços.
 *
 * Exposto como objeto global para uso via <script> tag.
 */
const Similarity = (() => {

  /**
   * Distância de Jaro entre duas strings.
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

  /**
   * Jaro-Winkler — bonus de prefixo comum (até 4 chars).
   * @param {string} s1
   * @param {string} s2
   * @param {number} p - fator de escala do prefixo (padrão 0.1)
   * @returns {number} valor em [0, 1]
   */
  function jaroWinkler(s1, s2, p = 0.1) {
    const j = jaro(s1, s2);

    const maxPfx = Math.min(4, s1.length, s2.length);
    let prefix = 0;
    for (let i = 0; i < maxPfx; i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }

    return j + prefix * p * (1 - j);
  }

  /**
   * Calcula o score composto (0–100) entre dois endereços já processados.
   *
   * Pesos:
   *  - 35%  Jaro-Winkler sobre strings normalizadas
   *  - 65%  Jaro-Winkler sobre códigos fonéticos
   *
   * Método retornado:
   *  - "Exato"    → strings normalizadas idênticas
   *  - "Fonetico" → códigos fonéticos idênticos (strings divergem)
   *  - "Jaro"     → apenas Jaro-Winkler, sem match fonético perfeito
   *
   * @param {string} normOrig   - endereço original normalizado
   * @param {string} normRef    - endereço da base normalizado
   * @param {string} phonOrig   - código fonético do original
   * @param {string} phonRef    - código fonético da base
   * @returns {{ score: number, method: string }}
   */
  function computeScore(normOrig, normRef, phonOrig, phonRef) {
    if (normOrig === normRef) {
      return { score: 100, method: 'Exato' };
    }

    const jwNorm = jaroWinkler(normOrig, normRef);
    const jwPhon = jaroWinkler(phonOrig, phonRef);

    const composite = jwNorm * 0.35 + jwPhon * 0.65;
    const score = Math.min(99, Math.round(composite * 100)); // máx 99 se não for exato

    let method;
    if (phonOrig === phonRef) {
      method = 'Fonetico';
    } else if (jwNorm >= 0.95) {
      method = 'Exato'; // quase exato, só diferença de espaço/pontuação
    } else {
      method = 'Jaro';
    }

    return { score, method };
  }

  return { jaro, jaroWinkler, computeScore };
})();
