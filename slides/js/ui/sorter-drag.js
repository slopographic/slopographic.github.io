/* Slop Slides: drag a thumbnail in the slide sorter to reorder slides (HTML5 drag and drop, mouse and most desktop
   browsers). The thumbnail under the pointer gets a drop-before or drop-after class that shows where the slide lands.
   Phones use the Move up and Move down buttons instead. Exposes window.SS.sorterDrag. */
(function () {
  'use strict';
  var SS = window.SS, OP = SS.ops;
  var DG = SS.sorterDrag = {};
  var dragId = null, marked = null;

  function thumbAt(list, e) {
    var t = e.target && e.target.closest ? e.target.closest('.thumb') : null;
    return t && list.contains(t) ? t : null;
  }
  /** Where the slide dropped on thumbnail t lands: before index `index` of the current list. */
  function slot(list, t, e) {
    var r = t.getBoundingClientRect(), row = getComputedStyle(list).flexDirection === 'row';
    var after = row ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    var at = Array.prototype.indexOf.call(list.children, t.parentNode) + (after ? 1 : 0);
    return { index: at, after: after };
  }
  function mark(t, after) {
    if (marked && marked !== t) marked.classList.remove('drop-before', 'drop-after');
    marked = t || null;
    if (t) { t.classList.toggle('drop-after', !!after); t.classList.toggle('drop-before', !after); }
  }
  DG.mount = function (list) {
    list.addEventListener('dragstart', function (e) {
      var t = thumbAt(list, e);
      if (!t) return;
      dragId = t.getAttribute('data-id');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    });
    list.addEventListener('dragover', function (e) {
      var t = thumbAt(list, e);
      if (!dragId || !t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      mark(t, slot(list, t, e).after);
    });
    list.addEventListener('dragleave', function (e) { if (!list.contains(e.relatedTarget)) mark(null); });
    list.addEventListener('drop', function (e) { // intake-ok: a slide thumbnail moved in the sorter, not a file
      var t = thumbAt(list, e), id = dragId;
      mark(null);
      dragId = null;
      if (!id || !t) return;
      e.preventDefault();
      OP.moveSlideTo(id, slot(list, t, e).index);
    });
    list.addEventListener('dragend', function () { dragId = null; mark(null); });
  };
})();
