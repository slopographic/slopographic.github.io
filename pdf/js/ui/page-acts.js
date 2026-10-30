/* Slop PDF — per-page actions from the thumbnails: duplicate, move up or down, extract this page (rotate and delete
   are in ui/actions.js). Each action is one undo step (E.commit) and keeps the selection on the moved pages. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, A = SP.app, t = SP.util.t;

  /** Moves pages one place up (dir -1) or down (dir 1), as one step. The first page cannot move up, the last not down. */
  A.moveBy = function (ids, dir) {
    if (!ids.length) return;
    var idx = ids.map(function (id) { return E.indexOf(id); }).filter(function (i) { return i >= 0; }).sort(function (a, b) { return a - b; });
    if (!idx.length) return;
    if (dir < 0 && idx[0] === 0) { A.announce(t('pdf.act.first_no_up')); return; }
    if (dir > 0 && idx[idx.length - 1] === E.state.pages.length - 1) { A.announce(t('pdf.act.last_no_down')); return; }
    var before = dir < 0 ? idx[0] - 1 : idx[idx.length - 1] + 2; // E.ops.move puts the pages before this index
    E.commit(dir < 0 ? t('pdf.act.undo_move_up', { n: ids.length }) : t('pdf.act.undo_move_down', { n: ids.length }), function (st) { E.ops.move(st, ids, before); });
    if (SP.organizer && SP.organizer.setSelection) SP.organizer.setSelection(ids, ids[0]);
    A.announce(dir < 0 ? t('pdf.act.moved_up', { n: ids.length }) : t('pdf.act.moved_down', { n: ids.length }));
  };

  /** A thumbnail's action button. ids: the selection when the page is selected, else the page itself. */
  A.pageAct = function (act, ids) {
    if (!ids || !ids.length) return;
    if (act === 'dup') A.duplicate(ids);
    else if (act === 'up') A.moveBy(ids, -1);
    else if (act === 'down') A.moveBy(ids, 1);
    else if (act === 'ext') A.extract(ids);
  };
})();
