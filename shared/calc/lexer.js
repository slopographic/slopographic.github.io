/* Slopculator tokens. Pure, classic script. Exposes window.SlopCalc.lexer:
 *   CalcError(message, pos, code, extra)  the one error type every stage throws (code: syntax | unit | type | math | rate);
 *                                         the message is in the chosen language (shared/i18n/ui/<code>/calc.js)
 *   tokenize(text)  → [{ type, value, pos }], types: num, word, date, time, op, lp, rp, comma, pct, end
 * Numbers are plain (1000, 2.5; no thousands separator, because a comma separates function arguments).
 * × ÷ − √ are the same as * / - sqrt. ** is the same as ^. */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  class CalcError extends Error {
    constructor(message, pos = 0, code = 'syntax', extra = {}) {
      super(message);
      this.name = 'CalcError';
      this.pos = pos;
      this.code = code;
      Object.assign(this, extra);
    }
  }

  const OPS = { '+': '+', '-': '-', '−': '-', '*': '*', '×': '*', '/': '/', '÷': '/', '^': '^', '**': '^', '√': 'sqrt' };
  const RULES = [
    ['date', /^\d{4}-\d{2}-\d{2}(?![\d-])/],
    ['time', /^\d{1,2}:\d{2}(?![\d:])/],
    ['num', /^(?:\d+(?:\.\d+)?|\.\d+)/],
    ['word', /^[A-Za-z_][A-Za-z0-9_]*/],
    ['op', /^(?:\*\*|[-+*/^−×÷√])/],
  ];
  const PUNCT = { '(': 'lp', ')': 'rp', ',': 'comma', '%': 'pct' };
  /** yyyymmdd written without dashes (20261011). Only a real calendar date counts, so 12345678 stays a number. */
  const COMPACT = /^\d{8}(?![\d.:])/;
  function compactIso(text) {
    const y = +text.slice(0, 4), mo = +text.slice(4, 6), d = +text.slice(6, 8);
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  }

  function tokenize(text) {
    const s = String(text == null ? '' : text);
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c) || c === '°') { i++; continue; }
      const rest = s.slice(i);
      let hit = null;
      const compact = COMPACT.exec(rest);
      const compactDate = compact && compactIso(compact[0]);
      if (compactDate) hit = { type: 'date', text: compact[0], value: compactDate };
      for (const [type, rx] of RULES) {
        if (hit) break;
        const m = rx.exec(rest);
        if (m) { hit = { type, text: m[0] }; break; }
      }
      if (!hit && PUNCT[c]) hit = { type: PUNCT[c], text: c };
      if (!hit) throw new CalcError(say('ui.calc.bad_char', { c }), i);
      const tok = { type: hit.type, value: hit.value !== undefined ? hit.value : hit.text, pos: i };
      if (hit.type === 'num') tok.value = parseFloat(hit.text);
      if (hit.type === 'op') { tok.value = OPS[hit.text]; }
      out.push(tok);
      i += hit.text.length;
    }
    out.push({ type: 'end', value: '', pos: s.length });
    return out;
  }

  ns.lexer = Object.freeze({ CalcError, tokenize });
  ns.CalcError = CalcError;
})(typeof window !== 'undefined' ? window : globalThis);
