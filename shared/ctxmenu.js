/* SlopCtx: context menus for app targets. Classic script, no dependencies; uses SlopUI.menu.
 * bind(root, resolve): resolve(target, ev) returns the menu items for what sits under the pointer (or null when
 * the target has no menu). A right-click opens it at the pointer. The Menu key or Shift+F10 opens the same menu for
 * the focused element (resolve gets ev === null), so keyboard users reach every menu too. */
(function () {
  'use strict';
  if (window.SlopCtx) return;
  let keyOpenedAt = -Infinity;

  function show(items, x, y) {
    if (!items || !items.length || !window.SlopUI) return false;
    SlopUI.menu(items, x, y);
    return true;
  }

  /** Binds the right-click and keyboard menus to root. Returns an unbind function. */
  function bind(root, resolve) {
    if (!root || typeof resolve !== 'function') return () => {};
    const onContext = (e) => {
      // A Menu key or Shift+F10 press already opened the menu; some browsers then fire contextmenu too.
      if (e.detail === 0 && performance.now() - keyOpenedAt < 400) { e.preventDefault(); return; } // detail 0: not a mouse click
      const items = resolve(e.target, e);
      if (!items || !items.length) return; // no menu for this target: keep the browser's own menu
      e.preventDefault();
      show(items, e.clientX, e.clientY);
    };
    const onKey = (e) => {
      if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
      const t = document.activeElement;
      if (!t || t === document.body || !root.contains(t)) return;
      const items = resolve(t, null);
      if (!items || !items.length) return;
      e.preventDefault();
      keyOpenedAt = performance.now();
      const r = t.getBoundingClientRect();
      show(items, r.left + Math.min(24, r.width / 2), r.top + Math.min(r.height, 28));
    };
    root.addEventListener('contextmenu', onContext);
    root.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('contextmenu', onContext); root.removeEventListener('keydown', onKey); };
  }

  /** The SlopCmd shortcut for a command id, or '' (menus show it beside the label). */
  function keyFor(id, fallback) {
    try { return (window.SlopCmd && SlopCmd.keyFor && SlopCmd.keyFor(id)) || fallback || ''; } catch (e) { return fallback || ''; }
  }

  window.SlopCtx = { bind, show, keyFor };
})();
