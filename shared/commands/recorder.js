/* SlopCmd part: shortcut recording, assigning with conflict resolution ("replace?"), and
 * export/import of a user's shortcuts as JSON. Used by the keymap editor (keymap.js). */
(function () {
  'use strict';
  const C = window.SlopCmd;
  if (!C || !C._parts || C._parts.recorder) return;
  /** A word from the shared tables (shared/i18n/ui/<code>.js) in the chosen language. */
  function tr(key, vars) { const I = globalThis.SlopI18n; return I && I.t ? I.t(key, vars) : key; }   // shared/i18n/ui/<code>.js; the key where no table is loaded

  /**
   * Record the next key combination. While recording, app shortcuts are suspended and every key is
   * swallowed. A second combination within chordMs makes a chord ("Mod+K Mod+S"). Escape cancels.
   * Returns { promise (binding string or null), cancel(), commit() }.
   */
  function record(opts = {}) {
    const steps = [];
    const chordMs = opts.chordMs != null ? opts.chordMs : 900, maxSteps = opts.maxSteps || 2;
    let timer = 0, done = false, resolve;
    const promise = new Promise((r) => { resolve = r; });
    const value = () => (steps.length ? steps.join(' ') : null);
    function finish(v) {
      if (done) return; done = true;
      clearTimeout(timer);
      removeEventListener('keydown', onKey, true); removeEventListener('keyup', swallow, true); removeEventListener('pointerdown', onPtr, true);
      C._recording(-1);
      resolve(v);
    }
    function swallow(e) { e.preventDefault(); e.stopPropagation(); }
    function onKey(e) {
      swallow(e);
      if (e.repeat) return;
      const st = C.eventSteps(e);
      if (!st) return;
      if (st[0] === 'Escape') { finish(null); return; }
      steps.push(st[1] || st[0]); // prefer the symbol form ('?' over 'Shift+?')
      if (opts.onStep) opts.onStep(steps.join(' '));
      clearTimeout(timer);
      if (steps.length >= maxSteps) finish(value());
      else timer = setTimeout(() => finish(value()), chordMs);
    }
    function onPtr(e) { if (opts.keepOn && opts.keepOn.contains(e.target)) return; finish(value()); }
    C._recording(1);
    addEventListener('keydown', onKey, true); addEventListener('keyup', swallow, true); addEventListener('pointerdown', onPtr, true);
    return { promise, cancel: () => finish(null), commit: () => finish(value()) };
  }

  const titleOf = (id) => { const c = C.get(id); return c ? c.title || id : id; };
  /**
   * Give command `id` the binding `b`, replacing `old` (or adding when old is null).
   * When b is already used (or chord-shadowed) by other commands, asks "Replace?" first
   * (opts.confirm can be passed for tests/headless use). Resolves true when assigned.
   */
  async function assign(id, old, b, opts = {}) {
    const nb = C.canon(b);
    if (!nb) return false;
    const mine = C.bindings(id).map((k) => C.canon(k));
    if (mine.includes(nb) && (!old || C.canon(old) === nb)) return true;
    const cl = C.conflicts(nb, id);
    if (cl.length) {
      const names = [...new Set(cl.map((c) => '“' + c.title + '”'))].join(', ');
      const ask = opts.confirm || ((t, m) => (window.SlopUI ? SlopUI.confirm(t, m, tr('ui.replace')) : Promise.resolve(window.confirm(m))));
      const ok = await ask(tr('ui.cmd.in_use'), tr('ui.cmd.in_use_body', { keys: C.format(nb), names }));
      if (!ok) return false;
      for (const c of cl) C.setKeys(c.id, C.bindings(c.id).filter((k) => C.canon(k) !== c.key));
    }
    const next = old ? mine.map((k) => (k === C.canon(old) ? nb : k)) : mine.concat(nb);
    C.setKeys(id, next);
    if (window.SlopUI && !opts.quiet) SlopUI.toast(titleOf(id) + ': ' + C.format(nb));
    return true;
  }
  function removeBinding(id, b) { const nb = C.canon(b); C.setKeys(id, C.bindings(id).filter((k) => C.canon(k) !== nb)); }

  function exportFile() {
    const blob = new Blob([JSON.stringify(C.exportKeys(), null, 2)], { type: 'application/json' });
    const name = 'slop-keys-' + C.app + '.json';
    if (window.SlopUI) SlopUI.download(blob, name);
    return { blob, name };
  }
  /** Import from a File (or pick one). Resolves to the number of commands imported, or -1 on error. */
  async function importFile(file) {
    if (!file && window.SlopIntake && window.SlopIntake.part) {
      // a part of the one intake ('keys.import') where the page has it: its reader is this function, with the file
      let n = 0;
      await window.SlopIntake.pick({ to: window.SlopIntake.part({ id: 'keys.import', limit: 1, accept: { types: ['application/json'], exts: ['.json'], noun: 'ui.cmd.keys_file' }, process: async (f) => { n = await importFile(f); return f.name; } }), multiple: false, accept: '.json,application/json' });
      return n;
    }
    if (!file) { const picked = window.SlopUI ? await SlopUI.pickFiles({ accept: '.json,application/json' }) : []; file = picked[0]; } // intake-ok: a page without shared/intake
    if (!file) return 0;
    try {
      const data = JSON.parse(await file.text());
      if (data && data.app && data.app !== C.app && window.SlopUI && !(await SlopUI.confirm(tr('ui.cmd.import_title'), tr('ui.cmd.import_other', { app: data.app }), tr('ui.import')))) return 0;
      const n = C.importKeys(data);
      if (window.SlopUI) SlopUI.toast(tr('ui.cmd.imported', { n }));
      return n;
    } catch (err) {
      if (window.SlopUI) SlopUI.alert(tr('ui.cmd.import_failed'), err.message); else console.warn(err);
      return -1;
    }
  }
  C._parts.recorder = { record, assign, removeBinding, exportFile, importFile };
})();
