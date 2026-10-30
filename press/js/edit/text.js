/* Slop Press — on-canvas text editing: caret, selection, mouse, IME-safe input through a hidden textarea.
   S.text = { frame, story, caret, anchor }. Keys live in textkeys.js; formatting in format.js. */
(function () {
  'use strict';
  var PR = window.PR, V = PR.view, S = PR.state, N = PR.nav, ST = PR.story, M = PR.model, I = PR.items, PT = PR.paint, H = PR.history;
  var TE = PR.textEdit = { input: null, composing: false, pend: null, goalX: null };

  TE.story = function () { return S.text && S.doc.stories[S.text.story]; };
  TE.range = function () { var t = S.text; return t ? [Math.min(t.caret, t.anchor), Math.max(t.caret, t.anchor)] : [0, 0]; };
  TE.enter = function (fr, offset, anchor) {
    if (PR.selectTool) PR.selectTool.loaded = null;
    var s = S.doc.stories[fr.story]; if (!s) return;
    var o = Math.max(0, Math.min(offset == null ? s.text.length : offset, s.text.length));
    S.text = { frame: fr.id, story: fr.story, caret: o, anchor: anchor == null ? o : anchor };
    TE.pend = null; TE.goalX = null;
    if (S.sel.length !== 1 || S.sel[0] !== fr.id) S.sel = [fr.id];
    if (S.tool !== 'text') { S.tool = 'text'; PR.emit('tool', 'text'); if (V.canvas) V.canvas.dataset.tool = 'text'; }
    TE.focus(); TE.changed();
  };
  TE.enterAt = function (fr, s, w) { var p = I.toLocal(fr, w.x - s.x, w.y - s.y); TE.enter(fr, N.hit(fr, p.x, p.y)); };
  TE.exit = function () {
    if (!S.text) return;
    var id = S.text.frame; S.text = null; TE.composing = false;
    if (TE.input) TE.input.blur();
    S.sel = [id]; PR.emit('select', S.sel); PR.emit('textsel'); V.request();
  };
  TE.focus = function () { if (TE.input) { try { TE.input.focus({ preventScroll: true }); } catch (e) { TE.input.focus(); } TE.place(); } };
  /** Keeps the hidden textarea next to the caret so IME candidate windows appear in the right place. */
  TE.place = function () {
    if (!TE.input || !S.text) return;
    var at = N.locate(S.text.story, S.text.caret);
    if (!at) return;
    var s = PT.surfaceOf(at.fr); if (!s) return;
    var p = I.toPage(at.fr, at.x, at.y1), sc = V.toScreen(s.x + p.x, s.y + p.y);
    TE.input.style.left = Math.max(0, Math.min(V.w - 4, sc.x)) + 'px'; TE.input.style.top = Math.max(0, Math.min(V.h - 4, sc.y)) + 'px';
    if (window.SlopKeyboard && !TE.kbPan) SlopKeyboard.reveal();   // a phone's keyboard: the caret's line stays above it
  };
  /** The caret's line on screen (client px), for the on-screen keyboard (shared/input/keyboard.js). */
  TE.caretBox = function () {
    var at = S.text && N.locate(S.text.story, S.text.caret), s = at && PT.surfaceOf(at.fr), host = TE.input && TE.input.offsetParent;
    if (!s || !host) return TE.input.getBoundingClientRect();
    var p0 = I.toPage(at.fr, at.x, at.y0), p1 = I.toPage(at.fr, at.x, at.y1), r = host.getBoundingClientRect();
    var a = V.toScreen(s.x + p0.x, s.y + p0.y).y, b = V.toScreen(s.x + p1.x, s.y + p1.y).y;
    return { top: r.top + Math.min(a, b), bottom: r.top + Math.max(a, b) };
  };
  TE.changed = function () {
    PT.caretOn = true;
    // frame holding the caret becomes the selected frame (threads can move it)
    var at = S.text && N.locate(S.text.story, S.text.caret);
    if (at && at.fr.id !== S.text.frame) { S.text.frame = at.fr.id; S.sel = [at.fr.id]; var s = PT.surfaceOf(at.fr); if (s) PR.selectTool.activate(s); }
    TE.place(); PR.emit('textsel'); V.request();
  };
  TE.setCaret = function (o, extend) {
    var s = TE.story(); if (!s) return;
    o = Math.max(0, Math.min(o, s.text.length));
    S.text.caret = o; if (!extend) S.text.anchor = o;
    TE.pend = null; TE.changed(); TE.reveal();
  };
  /** Scrolls the view so the caret is visible. */
  TE.reveal = function () {
    var at = S.text && N.locate(S.text.story, S.text.caret); if (!at) return;
    var s = PT.surfaceOf(at.fr); if (!s) { var pi = PR.engine.pageOf(S.doc, at.fr); if (pi >= 0) { S.page = pi; V.showPage(pi); } return; }
    var p = I.toPage(at.fr, at.x, at.y0), sc = V.toScreen(s.x + p.x, s.y + p.y), m = 40;
    if (sc.y < m) V.panBy(0, m - sc.y); else if (sc.y > V.h - m) V.panBy(0, V.h - m - sc.y);
    if (sc.x < m) V.panBy(m - sc.x, 0); else if (sc.x > V.w - m) V.panBy(V.w - m - sc.x, 0);
  };

  /* ---------- editing ---------- */
  TE.insert = function (str, label) {
    var s = TE.story(); if (!s || !str) return;
    var r = TE.range();
    if (r[0] !== r[1]) ST.remove(s, r[0], r[1]);
    var attrs = TE.pend ? { cs: TE.pend.cs, ov: TE.pend.ov } : null;
    var o = ST.insert(s, r[0], str, attrs);
    // a new paragraph after a style with "next style" takes that style
    if (str === '\n') { var k = ST.paraAt(s, o), prev = s.paras[k - 1], ps = prev && S.doc.styles.para[prev.ps]; if (ps && ps.nextStyle && S.doc.styles.para[ps.nextStyle] && o === ST.paraRange(s, k)[1]) s.paras[k] = { ps: ps.nextStyle, ov: {} }; }
    S.text.caret = S.text.anchor = o;
    H.commit(label || PR.util.t('press.edit.undo_typing'), !label);
    TE.changed(); TE.reveal();
  };
  TE.deleteDir = function (dir, word) {
    var s = TE.story(); if (!s) return;
    var r = TE.range();
    if (r[0] === r[1]) {
      if (dir < 0) { if (r[0] === 0) return; r[0] = word ? wordStart(s.text, r[0]) : r[0] - 1; }
      else { if (r[1] >= s.text.length) return; r[1] = word ? wordEnd(s.text, r[1]) : r[1] + 1; }
    }
    ST.remove(s, r[0], r[1]);
    S.text.caret = S.text.anchor = r[0];
    H.commit(PR.util.t('press.edit.undo_delete_text'), true); TE.changed(); TE.reveal();
  };
  function wordStart(t, o) { while (o > 0 && /\s/.test(t[o - 1])) o--; while (o > 0 && !/\s/.test(t[o - 1])) o--; return o; }
  function wordEnd(t, o) { while (o < t.length && /\s/.test(t[o])) o++; while (o < t.length && !/\s/.test(t[o])) o++; return o; }
  TE.wordStart = wordStart; TE.wordEnd = wordEnd;
  TE.selectAll = function () { var s = TE.story(); if (!s) return; S.text.anchor = 0; S.text.caret = s.text.length; TE.changed(); };

  /* ---------- mouse ---------- */
  function offsetAtWorld(sid, w) {
    var best = null, bd = Infinity;
    M.storyFrames(S.doc, sid).forEach(function (fr) {
      var s = PT.surfaceOf(fr); if (!s) return;
      var p = I.toLocal(fr, w.x - s.x, w.y - s.y), dx = p.x < 0 ? -p.x : p.x > fr.w ? p.x - fr.w : 0, dy = p.y < 0 ? -p.y : p.y > fr.h ? p.y - fr.h : 0;
      var d = dx + dy;
      if (d < bd) { bd = d; best = { fr: fr, p: p }; }
    });
    return best ? N.hit(best.fr, best.p.x, best.p.y) : 0;
  }
  var lastClick = { t: 0, n: 0, o: -1 };
  TE.pointerDown = function (h, w, e) {
    var fr = h.it, o = offsetAtWorld(fr.story, w);
    var now = Date.now();
    lastClick.n = now - lastClick.t < 400 && Math.abs(lastClick.o - o) < 2 ? lastClick.n + 1 : 1; lastClick.t = now; lastClick.o = o;
    if (!S.text || S.text.story !== fr.story) TE.enter(fr, o);
    else TE.setCaret(o, e.shiftKey);
    if (lastClick.n === 3) TE.selectParagraph();
    var anchor = S.text.anchor;
    return {
      move: function (w2) { var o2 = offsetAtWorld(fr.story, w2); S.text.anchor = anchor; S.text.caret = o2; TE.changed(); },
      up: function () { TE.focus(); }
    };
  };
  TE.selectWord = function (h, w) {
    var o = offsetAtWorld(h.it.story, w), s = S.doc.stories[h.it.story], r = ST.wordAt(s, o);
    if (!S.text) TE.enter(h.it, o);
    S.text.anchor = r[0]; S.text.caret = r[1]; TE.changed();
  };
  TE.selectParagraph = function () {
    var s = TE.story(); if (!s) return;
    var r = ST.paraRange(s, ST.paraAt(s, S.text.caret));
    S.text.anchor = r[0]; S.text.caret = r[1]; TE.changed();
  };

  /* ---------- hidden input (IME-safe) ---------- */
  TE.attach = function (ta) {
    TE.input = ta;
    // the on-screen keyboard (shared/input/keyboard.js) asks for the caret's line and pans the view to show it
    ta.slopKeyboard = { rect: TE.caretBox, reveal: function (need) { TE.kbPan = true; V.panBy(0, -need.dy); TE.place(); TE.kbPan = false; V.request(); } };
    ta.addEventListener('compositionstart', function () { TE.composing = true; });
    ta.addEventListener('compositionend', function (e) { TE.composing = false; ta.value = ''; if (e.data) TE.insert(e.data); });
    ta.addEventListener('input', function (e) {
      if (TE.composing || e.isComposing) return;
      var v = ta.value; ta.value = '';
      if (v && S.text) TE.insert(v.replace(/\r\n?/g, '\n'));
    });
    ta.addEventListener('keydown', function (e) { if (PR.textKeys) PR.textKeys(e); });
    ta.addEventListener('copy', function (e) { TE.clip(e, false); });
    ta.addEventListener('cut', function (e) { TE.clip(e, true); });
    ta.addEventListener('paste', function (e) { TE.paste(e); }); // intake-ok: text pasted into the story being edited
    ta.addEventListener('blur', function () { PT.caretOn = false; V.request(); });
  };
  var styledClip = null;
  TE.clip = function (e, cut) {
    var s = TE.story(); if (!s) return;
    var r = TE.range(); if (r[0] === r[1]) return;
    var frag = ST.slice(s, r[0], r[1]);
    styledClip = { text: frag.text, frag: frag };
    e.clipboardData.setData('text/plain', frag.text.split(M.PAGE_NUM).join('#').replace(/\u2028/g, '\n'));
    e.preventDefault();
    if (cut) TE.deleteDir(-1);
  };
  TE.paste = function (e) {
    var s = TE.story(); if (!s) return;
    e.preventDefault();
    var t = e.clipboardData.getData('text/plain');
    if (styledClip && styledClip.frag.text.replace(/\u2028/g, '\n').split(M.PAGE_NUM).join('#') === t) {
      var r = TE.range(); if (r[0] !== r[1]) ST.remove(s, r[0], r[1]);
      var o = ST.insertFragment(s, r[0], PR.util.clone(styledClip.frag));
      S.text.caret = S.text.anchor = o; H.commit(PR.util.t('press.edit.undo_paste')); TE.changed(); return;
    }
    if (t) TE.insert(t.replace(/\r\n?/g, '\n').replace(/\t/g, '\t'), PR.util.t('press.edit.undo_paste'));
  };
})();
