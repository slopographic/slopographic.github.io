/* Slop Slides: presenter view. File ▸ Present with presenter view (Alt+F5) starts the show in this window, for the
   audience (move it to the projector), and opens a second window for the speaker (presenter-view.js): the current and
   next slide, the notes, a timer and the slide counter. The two stay in step through the opener reference: the second
   window's keys and buttons call Present mode (present.js) directly, and every change of place there (A.emit('present'))
   redraws the presenter view. Ending the show closes the window it opened. Exposes SS.presenter: start(opts), open(opts),
   close(), view (the open view, for tests). opts.win: a window to build the view in instead of a new one. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, P = SS.present, D = SS.dom;
  var PR = SS.presenter = { view: null };
  var own = false;

  var actions = {
    next: function () { P.advance(); },
    prev: function () { P.step(-1); },
    first: function () { P.jump(0); },
    last: function () { P.jump(P.list.length - 1); },
    black: function () { P.toggleBlack(); },
    end: function () { P.stop(); }
  };
  function sync() {
    var v = PR.view;
    if (!v) return;
    if (v.win.closed) { PR.view = null; return; }
    v.update(P.view());
  }

  /** Opens the presenter view for the show that is running (or about to). Returns the view, or null when the window was blocked. */
  PR.open = function (opts) {
    opts = opts || {};
    if (PR.view && !PR.view.win.closed) { try { PR.view.win.focus(); } catch (e) { /* another window */ } sync(); return PR.view; }
    var win = opts.win || window.open('', 'slop-slides-presenter', 'width=1100,height=720');
    if (!win) { D.toast(SU.t('slides.show.the_presenter_view_needs_a_second_window'), 5200); return null; }
    own = !opts.win || !!opts.own;
    PR.view = SS.presenterView.mount(win, actions);
    if (own) win.addEventListener('beforeunload', function () { PR.view = null; });
    sync();
    return PR.view;
  };
  /** Starts the show and opens the presenter view. */
  PR.start = function (opts) {
    opts = opts || {};
    if (A.mode !== 'edit' && !P.on) return null;
    // the window opens first: opening it needs the click, and going full screen may use the click up
    var win = opts.win || (P.on ? null : window.open('', 'slop-slides-presenter', 'width=1100,height=720'));
    if (!P.on) P.start();
    if (!P.on) { if (win && !opts.win) win.close(); return null; }
    return PR.open(win ? { win: win, own: !opts.win } : {});
  };
  PR.close = function () {
    var v = PR.view;
    PR.view = null;
    if (!v) return;
    if (own && !v.win.closed) v.win.close(); else v.ended();
  };

  A.on('present', sync);
  A.on('mode', function () { if (A.mode !== 'present') PR.close(); });
  window.addEventListener('pagehide', function () { if (own) PR.close(); });
})();
