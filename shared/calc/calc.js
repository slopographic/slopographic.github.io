/* Slopculator public entry: calc(text, opts) → { ok, value, text, name } or { ok:false, error:{ code, message, pos, from?, to? } }.
 * program(text, opts) runs several statements (split on ';'), each may assign a name for the next.
 * opts: { today, ans, rate, vars } (see evaluate.js). vars is an object of names to values; program() updates it.
 * Pure, classic script, loaded last. Exposes window.SlopCalc.calc and .program. */
(function (g) {
  'use strict';
  const ns = (g.SlopCalc = g.SlopCalc || {});
  /** A word from the shared tables (shared/i18n/ui/<code>/calc.js), the key without SlopI18n. */
  const say = (key, vars) => (g.SlopI18n ? g.SlopI18n.t(key, vars) : key);

  function calc(text, opts) {
    const o = opts || {};
    try {
      const st = ns.parseStatement(text);
      const value = ns.evaluate(st.tree, { today: o.today, ans: o.ans || null, rate: o.rate || null, vars: o.vars || null });
      return { ok: true, value, text: ns.format(value), name: st.name };
    } catch (e) {
      if (e && e.name === 'CalcError') {
        return { ok: false, error: { code: e.code, message: e.message, pos: e.pos, from: e.from, to: e.to } };
      }
      return { ok: false, error: { code: 'syntax', message: say('ui.calc.failed', { why: e && e.message ? e.message : say('ui.calc.unknown_error') }), pos: 0 } };
    }
  }

  /** Several statements in one line: split on ';' (a semicolon is never part of an expression). Each is run in order, and
   *  a name it assigns is there for the next one. The vars object is updated in place. Stops at the first error. */
  function program(text, opts) {
    const o = opts || {};
    const vars = o.vars || {};
    let ans = o.ans || null;
    const steps = [];
    for (const src of String(text).split(';').map((s) => s.trim()).filter(Boolean)) {
      const r = calc(src, { today: o.today, ans, rate: o.rate, vars });
      if (!r.ok) { steps.push({ src, ok: false, error: r.error }); break; }
      if (r.name) vars[r.name] = r.value;
      ans = r.value;
      steps.push({ src, ok: true, name: r.name, value: r.value, result: r.text, text: r.name ? r.name + ' = ' + r.text : r.text });
    }
    const last = steps[steps.length - 1];
    return { ok: !!steps.length && steps.every((s) => s.ok), steps, vars, value: last && last.ok ? last.value : null, ans };
  }

  ns.calc = calc;
  ns.program = program;
})(typeof window !== 'undefined' ? window : globalThis);
