/* SlopIsolate — context menus. The queue thumbnail (open, select, retry, export, Open in, remove; the selection's menu
 * on a selected picture) and the canvas (undo, tools,
 * view, zoom, clear edits, or open/sample when empty). Every item calls the shared action it names: CO.menus.act,
 * CO.queue.open, CO.process and CO.export, so a menu item, a key and a palette row run the same code. */
(function () {
  'use strict';
  const CO = window.CO, S = CO.state, H = CO.history, U = CO.util, t = U.t;
  const cur = () => S.current();
  const act = () => CO.menus.act;
  const keyOf = (id, fallback) => (window.SlopCtx ? SlopCtx.keyFor(id, fallback) : fallback || '');

  /** Queue thumbnail: the image under the pointer. A picture that is part of a selection of two or more: the selection's
   *  menu (the settings panel's menu, ui/bulk-act.js). */
  function queueItems(it) {
    if (S.bulk() && S.sel.has(it.id)) return CO.bulk.menuItems();
    const out = [{ label: t('menu.open'), act: () => CO.queue.open(it) }, { label: t(S.sel.has(it.id) ? 'cutout.menu.unselect' : 'cutout.menu.select'), act: () => CO.bulk.toggle(it.id, { seed: true }) }];
    if (it.status === 'done') {
      out.push({ label: t('cutout.menu.export'), key: keyOf('co.export-one', 'Ctrl+S'), act: () => act().exportOne(it) });
      const sub = CO.openIn.items(it);
      if (sub.length) out.push({ label: t('cutout.menu.open_in'), sub });
    }
    if (it.status === 'error') out.push({ label: t('cutout.menu.retry'), act: () => CO.process.rerun(it) });
    out.push('-', { label: t('cutout.menu.remove_queue'), act: () => CO.process.remove(it) });
    return out;
  }

  /** Canvas: what the person can do to the image in view (or to start one when the stage is empty). */
  function canvasItems() {
    const it = cur(), a = act(), out = [];
    if (!it) {
      return [
        { label: t('cutout.menu.open_images'), key: keyOf('co.file-open', 'Ctrl+O'), act: a.open },
        { label: t('cutout.menu.try_sample'), key: keyOf('co.file-sample'), act: a.sample },
      ];
    }
    if (H.can(it, 'undo')) out.push({ label: CO.menus.stepLabel('undo', H.label(it, 'undo')), key: keyOf('co.undo', 'Ctrl+Z'), act: a.undo });
    if (H.can(it, 'redo')) out.push({ label: CO.menus.stepLabel('redo', H.label(it, 'redo')), key: keyOf('co.redo', 'Ctrl+Shift+Z'), act: a.redo });
    if (CO.brush.hasEdits(it)) out.push({ label: t('cutout.menu.clear_edits'), key: keyOf('co.clear-edits'), act: a.clearEdits });
    if (out.length) out.push('-');
    out.push(
      { label: t('cutout.menu.keep_brush'), key: keyOf('co.tool-keep', 'K'), check: S.tool === 'keep', act: () => a.tool('keep') },
      { label: t('cutout.menu.remove_brush'), key: keyOf('co.tool-remove', 'R'), check: S.tool === 'remove', act: () => a.tool('remove') },
      { label: t('cutout.menu.pan'), key: keyOf('co.tool-pan', 'H'), check: S.tool === 'pan', act: () => a.tool('pan') },
    );
    out.push('-', { label: t('ui.zoom_in'), key: keyOf('co.zoom-in', '+'), act: () => a.zoom(1.25) }, { label: t('ui.zoom_out'), key: keyOf('co.zoom-out', '-'), act: () => a.zoom(0.8) }, { label: t('cutout.menu.fit'), key: keyOf('co.view-fit', '0'), act: a.fit });
    if (it.status === 'done') {
      out.push('-', { label: t('cutout.menu.view'), sub: [['result', 'cutout.menu.view_result'], ['before', 'cutout.menu.view_before'], ['mask', 'cutout.menu.view_mask']].map(([v, l]) => ({ label: t(l), check: S.view === v, act: () => a.view(v) })) });
      out.push({ label: t('cutout.menu.export'), key: keyOf('co.export-one', 'Ctrl+S'), act: () => a.exportOne(it) });
    }
    return out;
  }

  function resolve(target) {
    const tile = target && target.closest && target.closest('.q-item');
    if (tile) {
      const it = S.items.find((i) => String(i.id) === tile.dataset.id);
      return it ? queueItems(it) : null;
    }
    if (target && target.closest && target.closest('#stage')) return canvasItems();
    return null;
  }

  function init() {
    if (!window.SlopCtx) return;
    const queue = U.$('#queue'), stage = U.$('#stage');
    if (queue) SlopCtx.bind(queue, resolve);
    if (stage) SlopCtx.bind(stage, resolve);
  }

  CO.ctxmenu = { init, queueItems, canvasItems };
})();
