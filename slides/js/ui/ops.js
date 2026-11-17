/* Slop Slides: document operations behind the toolbar, the inspector, the slide list and the shortcuts. Every
   operation is one undo step (A.change). Objects are added centred, and pasted or duplicated copies sit offset.
   Exposes window.SS.ops. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, M = SS.model, O = SS.objects, U = SS.util;
  var OP = SS.ops = {};

  /** Adds an object of `type` with `props`, centred on the slide and selected. Returns it. */
  OP.add = function (type, props, label) {
    var slide = A.slide(), d = A.deck, o = O.make(type, props || {});
    if (props && props.x == null) o.x = (d.size.w - o.w) / 2;
    if (props && props.y == null) o.y = (d.size.h - o.h) / 2;
    A.change(label || SU.t('slides.op.add_object', { kind: SU.kindName(type).toLowerCase() }), function () { slide.objects.push(o); });
    A.select([o.id]);
    return o;
  };
  OP.addText = function () {
    var o = OP.add('text', { w: 360, h: 80, text: O.defaultText('Text'),
      style: { font: 'body', size: 28, color: 'text', bold: false, italic: false, align: 'l', lineHeight: 1.2 } }, SU.t('slides.op.add_text'));
    SS.textEdit.open(o);
  };
  OP.addShape = function (kind) {
    var name = kind === 'ellipse' ? 'Ellipse' : 'Rectangle'; // i18n-ignore (the object's name: document data)
    OP.add('shape', { shape: kind, w: kind === 'ellipse' ? 200 : 260, h: kind === 'ellipse' ? 200 : 160, name: name }, SU.t('slides.op.add_shape', { shape: SU.t(kind === 'ellipse' ? 'slides.app.ins_ellipse' : 'slides.app.ins_rect').toLowerCase() }));
  };
  function imageSize(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 }); };
      im.onerror = function () { res({ w: 400, h: 300 }); };
      im.src = url;
    });
  }
  /** Insert picture…: the intake's picker (file-drop.js, mode 'image'). */
  OP.addImage = function () { return SS.fileDrop.addImage(); };
  /** Places a picture (the intake's reader, mode 'image'), scaled to at most 60% of the slide. */
  OP.placeImage = async function (f) {
    var url = await U.blobToDataUrl(f), sz = await imageSize(url), d = A.deck;
    var k = Math.min(1, d.size.w * 0.6 / sz.w, d.size.h * 0.6 / sz.h);
    var mid = M.addMedia(d, url, f.name);
    OP.add('image', { w: sz.w * k, h: sz.h * k, src: { w: sz.w, h: sz.h }, media: mid, name: f.name.replace(/\.[^.]+$/, '') || 'Picture' }, SU.t('slides.op.insert_picture'));
  };

  OP.deleteSel = function () {
    var slide = A.slide(), ids = A.sel.slice();
    if (!ids.length) return;
    A.change(SU.t('slides.op.delete'), function () {
      slide.objects = slide.objects.filter(function (o) { return ids.indexOf(o.id) < 0; });
    });
    A.select([]);
  };
  function copies(objs, dx) {
    return objs.map(function (o) { var c = U.clone(o); O.reId(c); c.x += dx; c.y += dx; return c; });
  }
  OP.duplicateSel = function () {
    var slide = A.slide(), objs = A.selObjs();
    if (!objs.length) return;
    var out = copies(objs, 16);
    A.change(SU.t('slides.op.duplicate'), function () { out.forEach(function (c) { slide.objects.push(c); }); });
    A.select(out.map(function (c) { return c.id; }));
  };
  OP.copy = function () { var objs = A.selObjs(); if (objs.length) { A.clip = U.clone(objs); A.clipT = Date.now(); } };
  OP.paste = function () {
    if (OP.pasteBuffer && OP.pasteBuffer()) return; // the shared buffer, when it is newer
    if (!A.clip || A.mode !== 'edit') return;
    var slide = A.slide(), out = copies(A.clip, 24);
    A.clip = copies(A.clip, 24);
    A.change(SU.t('slides.op.paste'), function () { out.forEach(function (c) { slide.objects.push(c); }); });
    A.select(out.map(function (c) { return c.id; }));
  };
  OP.arrange = function (how) {
    var slide = A.slide(), objs = A.selObjs();
    if (!objs.length) return;
    A.change(SU.t('slides.op.arrange'), function () { M.zorder(slide.objects, objs, how); });
  };
  OP.nudge = function (dx, dy) {
    var objs = A.selObjs();
    if (!objs.length) return;
    A.change(SU.t('slides.op.move'), function () { objs.forEach(function (o) { o.x += dx; o.y += dy; }); }, 'nudge');
  };

  /* slides */
  OP.newSlide = function () {
    var at = A.idx + 1;
    A.change(SU.t('slides.op.new_slide'), function () { M.addSlide(A.deck, 'title-content', at); });
    A.go(at);
  };
  OP.dupSlide = function () {
    var at = A.idx + 1;
    A.change(SU.t('slides.op.duplicate_slide'), function () { M.duplicateSlide(A.deck, A.slide().id); });
    A.go(at);
  };
  OP.delSlide = function () {
    var id = A.slide().id, at = A.idx;
    A.change(SU.t('slides.op.delete_slide'), function () { M.deleteSlides(A.deck, [id]); });
    A.go(Math.min(at, A.deck.slides.length - 1));
  };
  /** dir = -1 (up) or +1 (down). */
  OP.moveSlide = function (dir) {
    var i = A.idx, j = i + dir, id = A.slide().id;
    if (j < 0 || j >= A.deck.slides.length) return;
    A.change(SU.t('slides.op.move_slide'), function () { M.moveSlides(A.deck, [id], dir < 0 ? j : j + 1); });
    A.go(j);
  };
  /** Moves the slide with `id` to just before index `to` (used by drag and drop). */
  OP.moveSlideTo = function (id, to) {
    var from = M.index(A.deck, id);
    if (from < 0 || to === from || to === from + 1) return;
    A.change(SU.t('slides.op.move_slide'), function () { M.moveSlides(A.deck, [id], to); });
    A.go(M.index(A.deck, id));
  };
  OP.setLayout = function (id) {
    A.change(SU.t('slides.op.layout'), function () { SS.layouts.apply(A.deck, A.slide(), id); });
  };
  OP.setTheme = function (id) { A.change(SU.t('slides.op.theme'), function () { M.setTheme(A.deck, id); }); };
  OP.setHidden = function (on) { A.change(SU.t('slides.op.hide_slide'), function () { A.slide().hidden = !!on; }); };
  OP.setTitle = function (t) { A.change(SU.t('slides.op.rename'), function () { A.deck.title = t; }, 'title'); };
})();
