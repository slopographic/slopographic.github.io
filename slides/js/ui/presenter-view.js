/* Slop Slides: the presenter view's page. Built by the editor inside a second window (or any window handed in, such as a
   test's iframe), so it runs on the editor's own state and needs no page of its own: the current slide as the audience
   sees it (builds included), the next slide, the speaker notes, a timer (pause, reset), the clock and the slide counter.
   The slides are drawn by the same display list (render/canvas.js) into canvases of that window; the slide faces are
   registered with that window's fonts from the bytes the editor already has. Keys work as in Present mode.
   Exposes SS.presenterView: mount(win, actions) → view { update(state), ended(), win }. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, R = SS.canvasRender, F = SS.fonts;
  var V = SS.presenterView = {};
  var CSS = ['../../../shared/slopui.css', '../../css/presenter.css'].map(function (p) { return new URL(p, (document.currentScript && document.currentScript.src) || location.href).href; });

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(doc, label, act, primary) {
    var b = el(doc, 'button', 'sui-btn' + (primary ? ' sui-primary' : ''), label);
    b.type = 'button';
    b.addEventListener('click', act);
    return b;
  }
  /** mm:ss, or h:mm:ss from an hour on. */
  V.clock = function (ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, pad = function (v) { return (v < 10 ? '0' : '') + v; };
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s % 60);
  };
  /** The slide faces in the other window's document (FontFace objects of that window, from the bytes already loaded). */
  function fonts(win, onLoad) {
    var keys = {};
    F.LIST.forEach(function (f) { var d = F.FAMILIES[f]; [d.regular, d.bold, d.italic].forEach(function (k) { if (k) keys[k] = true; }); });
    var loads = Object.keys(keys).map(function (k) {
      var u8 = F.bytes(k);
      if (!u8 || !win.FontFace) return null;
      var ff = new win.FontFace('SSF-' + k, u8.slice().buffer);
      win.document.fonts.add(ff);
      return ff.load().catch(function () { return null; });
    }).filter(Boolean);
    Promise.all(loads).then(onLoad);
  }

  V.mount = function (win, act) {
    var doc = win.document;
    doc.title = SU.t('slides.show.title', { app: 'Slop Slides' });
    if (!doc.querySelector('meta[charset]')) { var mc = doc.createElement('meta'); mc.setAttribute('charset', 'utf-8'); doc.head.append(mc); }
    CSS.forEach(function (href) { var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.append(l); });
    doc.body.className = 'pv';
    doc.body.replaceChildren();
    var count = el(doc, 'span', 'pv-count'), steps = el(doc, 'span', 'pv-steps'), timer = el(doc, 'span', 'pv-timer', '00:00'), now = el(doc, 'span', 'pv-now');
    var pause = button(doc, SU.t('slides.show.pause'), function () { t.toggle(); }), reset = button(doc, SU.t('slides.show.reset'), function () { t.reset(); });
    var head = el(doc, 'header', 'pv-head');
    head.append(count, steps, el(doc, 'span', 'pv-flex'), timer, pause, reset, now);
    var cur = el(doc, 'canvas', 'pv-cur'), nxt = el(doc, 'canvas', 'pv-next'), end = el(doc, 'div', 'pv-end', SU.t('slides.show.end_of_the_presentation'));
    var notes = el(doc, 'div', 'pv-notes'), black = el(doc, 'div', 'pv-black', SU.t('slides.show.the_screen_is_black_b_to_bring_it_back'));
    var curBox = el(doc, 'section', 'pv-curbox'), side = el(doc, 'aside', 'pv-side'), nextBox = el(doc, 'div', 'pv-nextbox');
    curBox.setAttribute('aria-label', SU.t('slides.show.current_slide')); nextBox.setAttribute('aria-label', SU.t('slides.show.next_slide'));
    notes.setAttribute('aria-label', SU.t('slides.show.speaker_notes')); notes.setAttribute('aria-live', 'polite');
    curBox.append(cur, black);
    nextBox.append(el(doc, 'h2', 'pv-h', SU.t('slides.show.next')), nxt, end);
    side.append(nextBox, el(doc, 'h2', 'pv-h', SU.t('slides.show.notes')), notes);
    var foot = el(doc, 'footer', 'pv-foot');
    foot.append(button(doc, SU.t('slides.show.previous'), act.prev), button(doc, SU.t('slides.show.next'), act.next, true), button(doc, SU.t('slides.show.black_screen'), act.black), el(doc, 'span', 'pv-flex'), button(doc, SU.t('slides.show.end_show'), act.end));
    var main = el(doc, 'main', 'pv-main');
    main.append(curBox, side);
    doc.body.append(head, main, foot);

    // the timer counts the show from when the presenter view opened; Pause stops it, Reset starts it again from zero
    var t = { start: Date.now(), paused: 0, at: 0,
      ms: function () { return t.paused ? t.at : Date.now() - t.start; },
      toggle: function () { if (t.paused) { t.start = Date.now() - t.at; t.paused = 0; } else { t.at = t.ms(); t.paused = 1; } pause.textContent = t.paused ? SU.t('slides.show.resume') : SU.t('slides.show.pause'); tick(); },
      reset: function () { t.start = Date.now(); t.at = 0; tick(); } };
    function tick() {
      timer.textContent = V.clock(t.ms());
      timer.classList.toggle('paused', !!t.paused);
      var d = new Date();
      now.textContent = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    }
    var iv = win.setInterval(tick, 500);
    tick();

    var last = null;
    function draw(cv, slide, states, box) {
      var deck = SS.app.deck, r = box.getBoundingClientRect(), dpr = win.devicePixelRatio || 1;
      var w = Math.max(40, Math.min(r.width, (r.height || r.width) * deck.size.w / deck.size.h)), h = w * deck.size.h / deck.size.w;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      R.slideToCanvas(deck, slide, Math.round(w * dpr), { canvas: cv, scene: { editor: false, state: states ? function (o) { return states[o.id]; } : null },
        onImage: function () { if (last) view.update(last); } });
    }
    var view = {
      win: win,
      update: function (s) {
        if (!s) return;
        last = s;
        count.textContent = SU.t('slides.show.count', { i: s.n + 1, n: s.total });
        steps.textContent = s.left ? SU.t('slides.show.clicks', { n: s.left }) : '';
        draw(cur, s.slide, s.states, curBox);
        nxt.hidden = !s.next; end.hidden = !!s.next;
        if (s.next) draw(nxt, s.next, null, nextBox);
        notes.textContent = (s.slide.notes || '').trim() || SU.t('slides.show.no_notes');
        notes.classList.toggle('empty', !(s.slide.notes || '').trim());
        black.hidden = !s.black;
      },
      ended: function () {
        win.clearInterval(iv);
        doc.body.classList.add('pv-over');
        count.textContent = SU.t('slides.show.ended');
      },
      timer: t
    };
    win.addEventListener('keydown', function (e) {
      var k = e.key;
      if (!!window.SlopTyping && window.SlopTyping.isTyping(e, { controls: true })) return;   // shared/input/typing.js (this page's)
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].indexOf(k) >= 0) act.next();
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(k) >= 0) act.prev();
      else if (k === 'Home') act.first();
      else if (k === 'End') act.last();
      else if (k === 'b' || k === 'B' || k === '.') act.black();
      else if (k === 'Escape') act.end();
      else return;
      e.preventDefault();
    });
    win.addEventListener('resize', function () { if (last) view.update(last); });
    fonts(win, function () { if (last) view.update(last); });
    return view;
  };
})();
