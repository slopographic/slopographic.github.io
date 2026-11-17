/* Slop Paint Classic: every menu action and tool registered with the shared command palette
 * (shared/commands, window.SlopCmd). Ctrl/⌘+K (or Help ▸ Search commands…) finds them; every
 * shortcut can be rebound in Help ▸ Keyboard shortcuts… (stored in 'slop.keys.paint-classic').
 * Context keys (Esc cascade, Alt+letter menus, F10, Enter on curves/polygons, arrow nudges) stay in paint.js. */
(function () {
  'use strict';
  const C = window.SlopCmd, P = window.slopPaint && window.slopPaint.cmd;
  if (!C || !P) return;
  const toBinding = (k) => k.replace(/Ctrl\+/g, 'Mod+').replace(/\bDel\b/, 'Delete').replace('PgUp', 'PageUp').replace('PgDn', 'PageDown');
  const EXTRA = { redo: ['F4', 'Shift+Mod+Z'], zoomIn: ['Mod+=', 'Mod++'], zoomOut: ['Mod+-'], clearSel: ['Backspace'] };
  const NATIVE = { paste: true };
  const SKIP = { palette: true, keymap: true }; // the palette's own Help entries // Ctrl+V stays with the paste event, which also reads the OS clipboard
  const free = () => !P.busy();
  const t = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);
  /** The commands, titled in the chosen language (the menu labels and tool names are read each time). */
  function list() {
    const cmds = [];
    const seen = new Set();
    for (const menu of P.MENUS) {
      const group = menu.label.replace('&', '');
      for (const it of menu.items) {
        if (it === '-' || seen.has(it.act) || SKIP[it.act]) continue;
        seen.add(it.act);
        const keys = NATIVE[it.act] ? [] : (it.key ? [toBinding(it.key)] : []).concat(EXTRA[it.act] || []);
        const en = it.enabled;
        cmds.push({ id: 'paint.' + it.act, title: it.label.replace('&', '').replace(/\.\.\.$/, '…'), group, keys, checked: it.checked,
          when: en ? () => free() && en() : free, run: () => P.run(it.act) });
      }
    }
    for (const [id, name, tip] of P.TOOLS) cmds.push({ id: 'tool.' + id, title: t(name), group: t('paint-classic.cmd.tools'), keywords: ['tool', t(tip)], checked: () => window.slopPaint.state.tool === id, when: free, run: () => P.setTool(id) });
    cmds.push({ id: 'paint.swapColors', title: t('paint-classic.cmd.swap'), group: t('paint-classic.cmd.colors'), keys: ['X'], keywords: ['colour', 'foreground', 'background'], when: free, run: P.swapColors });
    return cmds;
  }
  C.init({ app: 'paint-classic' });
  C.register(list());
  // the titles and groups again after a language change, so the palette follows
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => C.register(list()));
})();
