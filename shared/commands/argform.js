/* SlopCmdForm: commands with arguments in the palette. A command with an args schema (args.js) runs with args = null
 * from a key or Ctrl+K; SlopCmdForm.wrap gives such commands a small form instead: the schema's fields, prefilled from
 * the defaults and the command's prefill() (the selection, the playhead…), then the command's own run with the checked
 * args. A macro being recorded (shared/macros) keeps the step with the values chosen. Read-only commands show their
 * answer. Classic script after slopui.js and args.js; window.SlopCmdForm.
 *   ask(cmd, init) → Promise<args | null>        the form (null: Cancel)
 *   wrap(cmd) → cmd                               run(args, ctx): args null → the form, else cmd.run(args, ctx)
 *     cmd.prefill?() → { name: value }, cmd.ok? (the button's word), cmd.noForm (run with the defaults, no form) */
(function (g) {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/<code>.js) in the chosen language. */
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded
  const A = () => g.SlopCmdArgs, UI = () => g.SlopUI;
  const el = (tag, attrs) => Object.assign(document.createElement(tag), attrs || {});
  const choices = (a) => (a.options ? a.options.map((o) => (Array.isArray(o) ? o : [o, String(o)])) : (a.values || []).map((v) => [v, String(v)]));

  function ask(cmd, init = {}) {
    const rows = [], read = [];
    for (const a of A().normalize(cmd.args)) {
      const v = init[a.name] !== undefined ? init[a.name] : a.default;
      if (a.type === 'boolean') { const c = UI().check(a.description || a.name.replace(/_/g, ' '), !!v); rows.push(c.el); read.push([a.name, () => c.input.checked]); continue; }
      let input;
      if (a.type === 'enum') input = UI().select([['', '—']].concat(choices(a)), v == null ? '' : v);
      else if (a.type === 'json' || a.type === 'array' || a.type === 'object') { input = el('textarea', { rows: 8, className: 'sui-input' }); input.value = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 1); }
      else { input = el('input', { type: a.type === 'color' ? 'color' : 'text', className: 'sui-input' }); input.value = v == null ? '' : String(v); }
      input.title = a.description || '';
      rows.push(UI().field(a.name.replace(/_/g, ' '), input));
      read.push([a.name, () => input.value]);
    }
    return new Promise((resolve) => {
      let done = false;
      const body = el('div', { className: 'sui-form' });
      body.append(...rows);
      UI().dialog({ title: String(cmd.title || cmd.id).replace(/…$/, ''), body, onClose: () => { if (!done) resolve(null); },
        buttons: [{ label: tr('menu.cancel') }, { label: cmd.ok || tr('ui.cmd.run'), primary: true, act: () => {
          const raw = {};
          for (const [k, get] of read) { const x = get(); if (x !== '') raw[k] = x; }
          const r = A().validate(cmd.args, raw);
          if (!r.ok) { UI().toast(r.errors[0], 4000); return false; }
          done = true; resolve(r.args);
        } }] });
    });
  }

  function show(cmd, v) {
    if (v == null || v === true || v === false) return;
    if (typeof v === 'string') { UI().toast(v, 3600); return; }
    if (v.media) { UI().toast(v.text || tr('ui.done'), 3600); return; }
    UI().alert(String(cmd.title || cmd.id).replace(/…$/, ''), JSON.stringify(v, null, 1).slice(0, 4000));
  }

  async function fromPalette(cmd, ctx) {
    const init = Object.assign(A().defaults(cmd.args), cmd.prefill ? cmd.prefill() : {});
    const args = cmd.args.length && !cmd.noForm ? await ask(cmd, init) : A().validate(cmd.args, init).args;
    const MC = g.SlopMacros, steps = MC && MC.steps && MC.steps();
    if (!args) { if (steps && steps.length && steps[steps.length - 1].cmd === cmd.id) MC.removeStep(steps.length - 1); return null; }
    if (MC && MC.recording) MC.note(cmd.id, args, cmd.title, { merge: true });   // the palette's step, with what was chosen
    try { const v = await cmd.run(args, ctx || {}); show(cmd, v); return v; } catch (e) { UI().toast(e.message, 5000); return null; }
  }

  function wrap(cmd) {
    const own = cmd.run;
    return Object.assign({}, cmd, { run: (args, ctx) => (args == null ? fromPalette(Object.assign({}, cmd, { run: own }), ctx) : own(args, ctx || {})) });
  }

  g.SlopCmdForm = { ask, wrap };
})(window);
