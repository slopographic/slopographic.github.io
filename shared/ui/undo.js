// SlopUndo: undo steps for an app's edits (a drag that moves something, a delete). push(label, undo) records how to
// reverse one step, undo() runs the newest. Steps live in memory for this visit, most recent last, up to a limit.
// keys(history, run) makes Ctrl+Z (Cmd+Z on a Mac) call run(), unless a text field, a dialog or a menu has the focus.
// toast(history, what, run) says what was done and offers Undo in a SlopUI toast. Classic script, no dependencies.
// Exposes window.SlopUndo = { create({ limit }), keys(history, run, { when }), toast(what, run) }.
(function (g) {
  'use strict';
  /** A word from the shared tables (shared/i18n/ui/en.js), or the English given when SlopI18n or the key is absent. */
  function tr(key, en, vars) { const I = globalThis.SlopI18n; if (I && I.has && I.has(key)) return I.t(key, vars); return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en; }

  /** A history of undo steps. undo is an async function that reverses one step and resolves to a Result. */
  function create({ limit = 50 } = {}) {
    const steps = [];
    return {
      push(label, undo) {
        steps.push({ label, undo });
        if (steps.length > limit) steps.shift();
      },
      /** Runs the newest step's undo and removes it. Resolves to { ok, label } or { ok: false, message }. */
      async undo() {
        const step = steps.pop();
        if (!step) return { ok: false, message: tr('ui.undo.nothing', 'Nothing to undo.') };
        let r;
        try { r = await step.undo(); } catch (e) { r = { ok: false, message: e && e.message }; }
        if (!r || !r.ok) return { ok: false, message: (r && r.message) || tr('ui.undo.failed', 'Could not undo that.') };
        return { ok: true, label: step.label };
      },
      /** The label of the step undo() would reverse, or ''. */
      get next() { return steps.length ? steps[steps.length - 1].label : ''; },
      get size() { return steps.length; },
      clear() { steps.length = 0; },
    };
  }

  /** Ctrl+Z / Cmd+Z runs run() while the history has a step. Text fields keep their own undo. Returns an off function. */
  function keys(history, run, { when = () => true } = {}) {
    const doc = g.document;
    const onKey = (e) => {
      if ((e.key || '').toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (!!g.SlopTyping && g.SlopTyping.isTyping(e, { controls: true })) return;   // shared/input/typing.js
      if (doc.querySelector('.sui-dlg, .sui-menu') || !history.size || !when()) return;
      e.preventDefault();
      run();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }

  /** Says what was done ("Moved Design to Doing.") with an Undo button in the toast. */
  function toast(what, run) {
    if (g.SlopUI) g.SlopUI.toast(`${what}.`, 6000, { label: tr('ui.undo', 'Undo'), run });
  }

  g.SlopUndo = { create, keys, toast };
})(typeof window !== 'undefined' ? window : globalThis);
