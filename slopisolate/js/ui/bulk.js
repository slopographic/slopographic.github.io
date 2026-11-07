/* SlopIsolate — the queue selection (S.sel) for bulk editing. Ways to select: the checkbox on each queue tile, Select all
 * / none in the queue header, Ctrl/Cmd-click (adds to the image on screen), Shift-click (a range from the anchor), Ctrl+A,
 * and on a touch screen a long press (then a tap adds or removes). Escape clears it. With two or more selected the
 * settings panel edits all of them (S.targets(), ui/edit.js); the bulk actions are in ui/bulk-act.js.
 * Ticking a picture that is not the one on screen puts it on screen, so the panel always previews on a picture it edits.
 * CO.bulk.toggle / range / clear / selectAll / items / run(label, items, fn). */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util, S = CO.state, B = CO.bulk = {};

  B.items = () => S.items.filter((it) => S.sel.has(it.id));
  const emitSel = () => CO.emit('sel', [...S.sel]);
  /** The image on screen joins the selection when it is not in it (only when a picture was ticked). */
  function follow(id) {
    if (!S.sel.has(id) || S.sel.has(S.activeId)) return;
    const it = S.get(id);
    if (it && CO.queue) CO.queue.open(it);
  }
  /** Add or remove one. opts.seed: an empty selection starts with the image on screen (Ctrl/Cmd-click). */
  B.toggle = (id, opts = {}) => {
    if (opts.seed && !S.sel.size && S.activeId && S.activeId !== id && S.get(S.activeId)) S.sel.add(S.activeId);
    if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id);
    S.anchor = id;
    follow(id);
    emitSel();
  };
  B.clear = () => { if (S.sel.size) { S.sel.clear(); emitSel(); } };
  B.range = (from, to) => {
    const a = S.index(from), b = S.index(to);
    if (a < 0 || b < 0) return;
    S.sel.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.sel.add(S.items[i].id);
    follow(to);
    emitSel();
  };
  B.selectAll = () => { S.items.forEach((it) => S.sel.add(it.id)); emitSel(); };
  /** Select all, or none when all are selected (the queue header's button). */
  B.toggleAll = () => (S.items.length && S.items.every((it) => S.sel.has(it.id)) ? B.clear() : B.selectAll());

  /** Run fn(item, index) over items, one at a time, with one progress bar. Resolves with the number that succeeded. */
  B.run = async function (label, items, fn) {
    let ok = 0;
    for (let i = 0; i < items.length; i++) {
      CO.emit('busy', { on: true, msg: CO.util.t('cutout.act.progress', { what: label, i: i + 1, n: items.length }), progress: i / items.length });
      try { await fn(items[i], i); ok++; } catch (e) { CO.emit('toast', `${items[i].name}: ${e.message || e}`); }
    }
    CO.emit('busy', { on: false });
    CO.emit('toast', CO.util.t('cutout.act.done_n', { what: label, ok, n: items.length }));
    return ok;
  };

  const typing = (t) => (!!window.SlopTyping && window.SlopTyping.isTyping(t));   // shared/input/typing.js
  const overlayOpen = () => !!document.querySelector('.sui-menu, .sui-dlg, [role="dialog"][aria-modal="true"]');

  B.init = function () {
    // A removed picture leaves the selection.
    CO.on('list', () => {
      let gone = false;
      for (const id of [...S.sel]) if (!S.get(id)) { S.sel.delete(id); gone = true; }
      if (gone) emitSel();
    });
    // Capture: runs before a menu or the bottom sheet closes on the same Escape, so that Escape closes only them.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.sel.size && !typing(e.target) && !overlayOpen() && !(CO.sheet && CO.sheet.isPhone() && CO.sheet.isOpen())) {
        B.clear();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a' && S.items.length && !typing(e.target) && !overlayOpen()) {
        e.preventDefault(); B.selectAll();
      }
    }, true);
  };
})();
