/* Slop Paint Classic: context menus (SlopUI.menu). Items reuse the menu bar's own actions (P.run), so
 * they match the menus and the command palette; shortcuts come from SlopCmd when it is loaded.
 *  - Palette swatch: right-click (or the Menu key / Shift+F10 on a focused swatch) opens the swatch menu.
 *  - Canvas: the Menu key / Shift+F10 opens the edit menu. The right button paints with the secondary
 *    colour (as in MS Paint), so a right-click on the canvas is not a menu. */
(function () {
  'use strict';
  const P = window.slopPaint && window.slopPaint.cmd, C = window.SlopCmd;
  if (!P || !window.SlopUI) return;
  const ALL = P.MENUS.flatMap((m) => m.items).filter((it) => it && it !== '-');
  const t = (k) => (window.SlopI18n ? window.SlopI18n.t(k) : k);
  const tidy = (rows) => rows.filter((r, i) => r && (r !== '-' || (i > 0 && rows[i - 1] && rows[i - 1] !== '-' && i < rows.length - 1)));

  /** The menu-bar item for an action, as a SlopUI row. */
  function item(act, label) {
    const src = ALL.find((it) => it.act === act);
    if (!src) { console.error('context menu: unknown action ' + act); return null; }
    const id = 'paint.' + act;
    const key = C && C.get && C.get(id) ? C.keyFor(id) : (src.key || '');
    return { label: label || src.label.replace(/&/g, '').replace(/\.\.\.$/, '…'), key, disabled: !!(src.enabled && !src.enabled()), check: !!(src.checked && src.checked()), act: () => P.run(act) };
  }
  const show = (items, x, y) => { const rows = tidy(items); if (rows.some((r) => r && r !== '-')) SlopUI.menu(rows, x, y); };

  function swatchItems(i) {
    const c = P.palette[i];
    return [{ label: t('paint-classic.ctx.set_primary'), act: () => P.setColor(0, c) }, { label: t('paint-classic.ctx.set_secondary'), act: () => P.setColor(2, c) }, '-',
      { label: t('paint-classic.ctx.edit_color'), act: () => P.editSwatch(i) }];
  }
  function canvasItems() {
    const any = !!window.slopPaint.selection;
    return [item('undo'), item('redo'), '-', any ? item('cut') : null, any ? item('copy') : null, P.hasClip() ? item('paste') : null,
      any ? item('clearSel') : null, '-', item('selectAll'), '-', item('invert'), item('flipRotate')];
  }
  const swatchIndex = (btn) => [...btn.parentNode.children].indexOf(btn);
  const onPalette = (el) => { const b = el && el.closest && el.closest('#palette .sw'); return b && b.parentNode ? b : null; };

  // right-click on a palette swatch
  document.addEventListener('contextmenu', (e) => {
    const b = onPalette(e.target); if (!b) return;
    e.preventDefault(); show(swatchItems(swatchIndex(b)), e.clientX, e.clientY);
  });
  // Menu key / Shift+F10: the focused swatch, otherwise the canvas
  document.addEventListener('keydown', (e) => {
    if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || e.defaultPrevented || P.busy()) return;
    const a = document.activeElement, b = onPalette(a);
    const onCanvas = !a || a === document.body || a === window.slopPaint.canvas;
    if (!b && !onCanvas) return;
    e.preventDefault();
    const r = (b || window.slopPaint.canvas).getBoundingClientRect();
    if (b) show(swatchItems(swatchIndex(b)), r.left + 8, r.bottom);
    else show(canvasItems(), r.left + r.width / 2, r.top + r.height / 2);
  });
})();
