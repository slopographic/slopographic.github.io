/* Slop PDF — layer commands: hide or show, lock or unlock, move up or down, delete. Each one is an undoable step
   (E.commit), so History and the saved edit log see them like any other edit. The pure state changes are in
   core/layers.js. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, L = SP.layers;

  /** Sets 'hidden' or 'locked' on one layer. Hiding the selected layer clears the selection. */
  L.set = function (pid, aid, key, val) {
    var label = key === 'hidden' ? U.t(val ? 'pdf.ed.undo_hide_layer' : 'pdf.ed.undo_show_layer') : U.t(val ? 'pdf.ed.undo_lock_layer' : 'pdf.ed.undo_unlock_layer');
    E.commit(label, function (st) { L.setFlag(st, pid, aid, key, val); });
    if (key === 'hidden' && val && Ed.selId === aid) Ed.select(null);
  };
  /** Moves a layer up (+1, towards the top of the stack) or down (-1). */
  L.moveLayer = function (pid, aid, dir) {
    E.commit(U.t(dir > 0 ? 'pdf.ed.undo_layer_up' : 'pdf.ed.undo_layer_down'), function (st) { L.move(st, pid, aid, dir); });
  };
  /** Deletes a layer. */
  L.deleteLayer = function (pid, aid) {
    E.commit(U.t('pdf.ed.undo_delete_layer'), function (st) { L.remove(st, pid, aid); });
    if (Ed.selId === aid) Ed.select(null);
  };
})();
