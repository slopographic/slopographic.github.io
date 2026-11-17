/* Slop Slides — ui/view-state: coming back to Slop Slides reopens the presentation you left (the Slop Drive file, or
 * the open tab) on the same slide, with the same objects selected. The tabs and their unsaved edits come back from the strip (ui/tabs.js);
 * the place itself is kept in SlopSession. Restored only for the same file. Exposes SS.viewState. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, APP = 'slides';
  var ready = false; // nothing is saved until the saved place has been applied
  var auto = window.SlopSession.autosave(APP, 'place', function () {
    return { driveId: (A.doc && A.doc.driveId) || null, idx: A.idx, sel: A.sel.slice() };
  }, { delay: 400 });
  var touch = function () { if (ready && A.deck) auto.touch(); };
  ['slide', 'select', 'change'].forEach(function (ev) { A.on(ev, touch); });
  ['pointerup', 'keyup', 'click'].forEach(function (t) { document.addEventListener(t, touch, true); });

  SS.viewState = {
    /** Boot, after the deck is open: the slide and the selection the presentation was left on. */
    restore: async function () {
      var p = await window.SlopSession.load(APP, 'place', null).catch(function () { return null; });
      if (p && typeof p === 'object' && A.deck && (p.driveId || null) === ((A.doc && A.doc.driveId) || null)) {
        if (Number.isInteger(p.idx) && p.idx >= 0 && p.idx < A.deck.slides.length) A.idx = p.idx;
        var slide = A.slide();
        A.sel = slide && Array.isArray(p.sel) ? p.sel.filter(function (id) { return !!SS.objects.find(slide, id); }) : [];
        A.emit('slide');
        A.emit('select');
      }
      ready = true;
    },
  };
})();
