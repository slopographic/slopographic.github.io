/* Helpers for the SlopCmd tests: a fresh app scope per test, synthetic key presses, a command spy. */
(function () {
  'use strict';
  let n = 0;
  const made = [];
  /** Start a clean app scope: unique storage keys, PC key semantics, no leftover test commands. */
  function fresh(app) {
    for (const id of made.splice(0)) SlopCmd.unregister(id);
    SlopCmd.close();
    document.querySelectorAll('.sui-dlg .sui-x').forEach((x) => x.click());
    SlopCmd.mac = false;
    const name = app || 'test-' + Date.now() + '-' + (++n);
    try { localStorage.removeItem('slop.keys.' + name); localStorage.removeItem('slop.cmd.recent.' + name); } catch (e) { /* ignore */ }
    SlopCmd.init({ app: name });
    return name;
  }
  /** Register commands that count their runs: spy({ id, keys, ... }) → { calls, id }. */
  function spy(def) {
    const s = { calls: 0, ctx: null };
    SlopCmd.register(Object.assign({ title: def.id, group: 'Test' }, def, { run: (ctx) => { s.calls++; s.ctx = ctx; } }));
    made.push(def.id);
    return s;
  }
  const CODES = { ' ': 'Space', '/': 'Slash', '?': 'Slash', '=': 'Equal', '+': 'Equal', '-': 'Minus' };
  /** press('Mod+S', target) with PC semantics (Mod = Ctrl). Key names: 's', 'ArrowUp', 'Escape', '?' … */
  function press(combo, target = document.body, extra = {}) {
    const parts = combo.split(/\+(?!$)/), key = parts.pop();
    const mods = new Set(parts.map((p) => p.toLowerCase()));
    const code = /^[a-z]$/i.test(key) ? 'Key' + key.toUpperCase() : /^[0-9]$/.test(key) ? 'Digit' + key : CODES[key] || key;
    const e = new KeyboardEvent('keydown', Object.assign({ key, code, bubbles: true, cancelable: true, composed: true,
      ctrlKey: mods.has('mod') || mods.has('ctrl'), shiftKey: mods.has('shift'), altKey: mods.has('alt'), metaKey: mods.has('meta') }, extra));
    target.dispatchEvent(e);
    target.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
    return e;
  }
  const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
  window.T = { fresh, spy, press, tick, made };
})();
