/* Slop Slides: Present mode. The show fills the screen (Fullscreen API where allowed) and draws with the same display
   list as the editor. Each slide opens with its transition (SlopMotion, see present-view.js), then plays its first
   build. A click, Right, Down, Page Down, Space or Enter finishes a motion that is running, else plays the next build
   (an on-click object animation), else moves to the next slide. Left, Up, Page Up and Backspace go back; Home and End
   jump; a click on the left third goes back; B blacks the screen; Escape ends the show on the slide that was on screen.
   Hidden slides are skipped. "Play animations" (P.animsOn, set in the inspector) turns builds and transitions off: every
   slide appears whole and each click moves to the next slide. Playback runs on SlopMotion.playback; P.clock is for tests.
   Every change of place emits A.emit('present'), which the presenter view (presenter.js) follows. Exposes window.SS.present. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, MO = window.SlopMotion, V = SS.presentView;
  var P = SS.present = { on: false, list: [], n: 0, black: false, animsOn: true, clock: null };
  var root = null, flash = null, timer = 0;
  var plan = null, next = 0, time = 0, cur = null;   // plan: SS.anim.plan of the slide; next: steps consumed; cur: motion running

  function visibleIdx() {
    var out = [];
    A.deck.slides.forEach(function (s, i) { if (!s.hidden) out.push(i); });
    return out;
  }
  function slideAt(n) { return A.deck.slides[P.list[n]]; }
  function statesAt(t) { return plan ? SS.anim.stateAt(plan, t) : null; }

  P.start = function () {
    if (P.on || A.mode !== 'edit' || !A.deck) return;
    if (SS.textEdit.editing) SS.textEdit.commit();
    P.list = visibleIdx();
    if (!P.list.length) { SS.dom.toast(SU.t('slides.show.every_slide_is_hidden')); return; }
    var at = P.list.indexOf(A.idx);
    P.n = at >= 0 ? at : 0;
    P.on = true; P.black = false;
    A.mode = 'present';
    build();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () {}); } catch (e) { /* not allowed here */ }
    A.emit('mode');
    enter(null);
    show();
  };
  P.stop = function () {
    if (!P.on) return;
    stopMotion();
    P.on = false;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    if (root) root.remove();
    root = null;
    V.unmount();
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) { /* ignore */ }
    var idx = P.list[P.n];
    A.mode = 'edit';
    A.go(idx != null ? idx : A.idx);
    A.emit('mode');
  };
  P.current = function () { return P.list[P.n]; };
  /** For tests and the presenter: the slide, how many builds are consumed, how many on-click builds there are, and whether one is running. */
  P.status = function () { return { slide: P.n, build: next, builds: plan ? plan.clicks : 0, playing: !!cur }; };
  /** What the presenter view shows: the slide on screen and its build state, the next slide, the place in the show, the
   * on-click builds left on this slide and the black screen. null when no show runs. */
  P.view = function () {
    if (!P.on) return null;
    var left = plan ? plan.steps.slice(next).filter(function (s) { return s.click; }).length : 0;
    return { slide: slideAt(P.n), next: slideAt(P.n + 1) || null, n: P.n, total: P.list.length, left: left, black: P.black, states: statesAt(plan && next > 0 ? plan.steps[next - 1].to : time) };   // a build shows as it ends
  };
  /** B: blacks the screen out, or brings the slide back. */
  P.toggleBlack = function () {
    if (!P.on) return;
    P.black = !P.black;
    root.classList.toggle('black', P.black);
    A.emit('present');
  };

  /** Next key or click: finishes a running motion, else plays the next on-click build, else the next slide. */
  P.advance = function () {
    if (!P.on) return;
    if (cur) { cur.finish(); return; }
    if (plan && next < plan.steps.length) { playStep(plan.steps[next++]); A.emit('present'); return; }
    P.step(1);
  };
  /** Moves by d slides (clamped), playing the transition of the slide entered. */
  P.step = function (d) {
    if (!P.on) return;
    var n = Math.max(0, Math.min(P.list.length - 1, P.n + d));
    if (n === P.n) { show(); return; }
    var from = slideAt(P.n);
    stopMotion();
    P.n = n;
    enter(from);
    show();
  };
  /** Jumps to a slide (Home, End) with no transition. */
  P.jump = function (n) {
    if (!P.on) return;
    stopMotion();
    P.n = Math.max(0, Math.min(P.list.length - 1, n));
    enter(null);
    show();
  };

  /** Shows list slide P.n. from: the slide being left, when its transition should play. */
  function enter(from) {
    var s = slideAt(P.n);
    stopMotion();
    plan = P.animsOn ? SS.anim.plan(s, { w: A.deck.size.w, h: A.deck.size.h }) : null;
    next = 0; time = 0;
    V.fit(A.deck);
    var tr = SS.anim.transitionOf(s);
    if (from && plan && tr.name !== 'none') { transition(from, s, tr); return; }
    V.paint(A.deck, s, 'to', statesAt(0));
    V.only('to');
    autoplay();
  }
  function transition(fromSlide, s, tr) {
    V.paint(A.deck, fromSlide, 'from', null);
    V.paint(A.deck, s, 'to', statesAt(0));
    V.transitionAt(tr.name, 0);
    var h = run(tr.duration, function (t) { V.transitionAt(tr.name, t / tr.duration); }, function () { V.only('to'); autoplay(); });
    if (!h.done) cur = h;
  }
  /** Plays the first build step when it is not an on-click step. */
  function autoplay() {
    if (plan && next < plan.steps.length && !plan.steps[next].click) playStep(plan.steps[next++]);
  }
  function playStep(st) {
    var len = st.to - st.from;
    if (len <= 0) { time = st.to; repaint(); return; }
    var h = run(len, function (t) { time = t >= len ? st.to : st.from + t; repaint(); }, function () {});
    if (!h.done) cur = h;
  }
  function repaint() {
    if (!P.on) return;
    V.paint(A.deck, slideAt(P.n), 'to', statesAt(time));
  }
  /** Runs onFrame(t) for dur seconds of SlopMotion playback, then onEnd. Returns a handle: finish() jumps to the end, stop() drops it. */
  function run(dur, onFrame, onEnd) {
    var h = { done: false };
    function end() {
      if (h.done) return;
      h.done = true;
      h.pb.destroy();
      if (cur === h) cur = null;
      onEnd();
    }
    h.finish = function () { if (!h.done) { onFrame(dur); end(); } };
    h.stop = function () { if (!h.done) { h.done = true; h.pb.destroy(); if (cur === h) cur = null; } };
    h.pb = MO.playback.create(Object.assign({ duration: dur, loop: 'none', onFrame: function (t, st) {
      if (h.done) return;
      onFrame(t);
      if (st.ended) end();
    } }, P.clock ? { clock: P.clock } : {}));
    h.pb.play();
    return h;
  }
  function stopMotion() { if (cur) cur.stop(); }

  function build() {
    root = document.createElement('div');
    root.className = 'present';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', SU.t('slides.app.presentation'));
    V.mount(root);
    flash = document.createElement('div');
    flash.className = 'present-count';
    root.append(flash);
    root.addEventListener('click', function (e) {
      if (e.clientX < window.innerWidth / 3) P.step(-1); else P.advance();
    });
    document.body.append(root);
  }
  function onResize() {
    if (!P.on) return;
    if (cur) cur.finish();
    V.fit(A.deck);
    repaint();
  }
  function show() {
    A.emit('present');
    if (!flash) return;
    flash.textContent = (P.n + 1) + ' / ' + P.list.length;
    flash.classList.add('show');
    clearTimeout(timer);
    timer = setTimeout(function () { flash.classList.remove('show'); }, 1400);
  }
  function onKey(e) {
    if (!P.on) return;
    var k = e.key, fwd = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'], back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
    e.stopPropagation();
    if (k === 'Escape') { e.preventDefault(); P.stop(); return; }
    if (fwd.indexOf(k) >= 0) { e.preventDefault(); P.advance(); }
    else if (back.indexOf(k) >= 0) { e.preventDefault(); P.step(-1); }
    else if (k === 'Home') { e.preventDefault(); P.jump(0); }
    else if (k === 'End') { e.preventDefault(); P.jump(P.list.length - 1); }
    else if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); P.toggleBlack(); }
  }
})();
