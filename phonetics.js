'use strict';

/**
 * PhoneticsPTBR — Normalização e codificação fonética para o Português Brasileiro.
 *
 * Exposto como objeto global para uso via <script> tag (sem módulos ES).
 */
const PhoneticsPTBR = (() => {

  /**
   * Remove cedilha antes do NFD (NFD transforma Ç → C + combining cedilla,
   * que é depois descartado, perdendo a informação de som /S/).
   * Também remove acentos diacríticos restantes.
   */
  function removeAccents(str) {
    return str
      .replace(/[çÇ]/g, m => m === 'ç' ? 's' : 'S') // cedilha → s/S antes do NFD
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');               // descarta combinadores
  }

  /**
   * Normalização básica: maiúsculas, sem acentos, apenas A-Z 0-9 e espaço.
   */
  function normalize(str) {
    if (!str) return '';
    return removeAccents(str.toUpperCase())
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * S intervocálico → Z (ex: "CASA" permanece, "CASAS" = /z/ → Z).
   */
  function interVocalicS(s) {
    const vowels = 'AEIOU';
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (
        s[i] === 'S' &&
        i > 0 && i < s.length - 1 &&
        vowels.includes(s[i - 1]) &&
        vowels.includes(s[i + 1])
      ) {
        out += 'Z';
      } else {
        out += s[i];
      }
    }
    return out;
  }

  /**
   * Gera código fonético para um token (palavra) já normalizado.
   */
  function codeWord(word) {
    let w = word;

    // ── Dígrafos (ordem importa!) ──────────────────────────────────────────
    w = w.replace(/PH/g, 'F');          // phone → fone
    w = w.replace(/CH/g, 'X');          // chave → xave
    w = w.replace(/LH/g, 'LI');         // filho → filio
    w = w.replace(/NH/g, 'NI');         // vinho → vinio
    w = w.replace(/GU(?=[EI])/g, 'G');  // guerra → gera
    w = w.replace(/QU(?=[EI])/g, 'K');  // quero → kero
    w = w.replace(/QU(?=[AO])/g, 'KV'); // quartel → kvartel
    w = w.replace(/SC(?=[EI])/g, 'S');  // cena com sc
    w = w.replace(/XC(?=[EI])/g, 'S');  // exceto → eseto
    w = w.replace(/RR/g, 'R');          // carro → caro (som único)
    w = w.replace(/SS/g, 'S');          // passo → paso

    // ── Consoantes contextuais ──────────────────────────────────────────────
    w = w.replace(/C(?=[EI])/g, 'S');   // cedo → sedo
    w = w.replace(/G(?=[EI])/g, 'J');   // gente → jente
    w = w.replace(/Y/g, 'I');           // yohanna → iohanna
    w = w.replace(/W/g, 'V');           // wagner → vagner

    // ── S intervocálico → Z ────────────────────────────────────────────────
    w = interVocalicS(w);

    // ── Correções finais ───────────────────────────────────────────────────
    w = w.replace(/Z$/, 'S');                        // Faz → FaS
    w = w.replace(/([BCDFGJKLMNPQRSTVX])H/g, '$1'); // H mudo após consoante

    // ── Colapsa duplicatas consecutivas ───────────────────────────────────
    w = w.replace(/(.)\1+/g, '$1');

    return w;
  }

  /**
   * Retorna código fonético para uma string completa.
   * Cada token (palavra) é codificado independentemente.
   */
  function phoneticCode(str) {
    if (!str) return '';
    return normalize(str)
      .split(' ')
      .filter(Boolean)
      .map(codeWord)
      .join(' ');
  }

  return { normalize, phoneticCode, removeAccents };
})();
