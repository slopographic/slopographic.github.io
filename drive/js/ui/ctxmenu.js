/* Slop Drive — ui/ctxmenu: the context menus for the file pane and the folder tree, by target kind. Right-click on an
 * item (a file, a folder or a Trash item) selects it first; on empty space it clears the selection, which gives the
 * empty-area menu. The Menu key or Shift+F10 opens the menu for the focused item (or the pane's empty-area menu). The
 * rows come from DR.menuRows (ui/menus.js), the same ones the More button and a touch long press show. Classic script. */
(function (DR) {
  'use strict';
  const S = DR.S;

  function resolve(target, ev) {
    if (!target || !target.closest) return null;
    if (ev && target.closest('.lhead')) return DR.columnRows(); // the List header: its columns menu
    const item = target.closest('[data-key]');
    if (ev) {
      if (target.closest('input, textarea')) return null;
      if (item) { if (!S.sel.has(item.dataset.key)) DR.select([item.dataset.key]); }
      else DR.select([]);
    } else if (item) {
      if (!S.sel.has(item.dataset.key)) DR.select([item.dataset.key]);
    } else if (target.id !== 'pane') return null;
    const items = DR.selected();
    return DR.menuRows(DR.targetKind(items), items);
  }

  DR.wireCtxMenu = function () {
    if (!window.SlopCtx) return;
    for (const id of ['pane', 'tree']) { const root = document.getElementById(id); if (root) SlopCtx.bind(root, resolve); }
  };
  DR.resolveCtx = resolve;
})(window.DR);
