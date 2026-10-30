/* Slop Slides: the shared copy-and-drop buffer (window.SlopBuffer, see shared/buffer/). Copy to buffer puts the selected
 * shapes as one transparent PNG picture, and a single text box as text/html and text/plain. Paste (Mod+V, when the buffer
 * is newer than this app's clipboard) and drop place a picture (a vector is drawn to a PNG and the note says so) or a
 * text box. Exposes SS.ops.copyToBuffer, pasteBuffer and hasBuffer. Reads SlopBuffer only. */
(function () {
  'use strict';
  var SU = window.SS.util;
  var SS = window.SS, A = SS.app, M = SS.model, O = SS.objects, U = SS.util, OP = SS.ops;
  var SB = window.SlopBuffer;
  var R = SS.canvasRender;
  var SCALE = 2; // picture pixels per slide point, so edges stay sharp

  function toast(msg, ms) { if (window.SlopUI) SlopUI.toast(msg, ms || 3200); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function blobPromise(cv) { return new Promise(function (res) { cv.toBlob(res, 'image/png'); }); }

  /** The objects, drawn into one transparent canvas at their union's size. */
  function picturePng(deck, objs) {
    var theme = SS.themes.of(deck), b = O.union(objs), items = [];
    objs.forEach(function (o) {
      var m = U.clone(o);
      m.x = o.x - b.x; m.y = o.y - b.y;
      var n = SS.scene.object(deck, theme, m, {});
      if (n) items.push(n);
    });
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(b.w * SCALE)); cv.height = Math.max(1, Math.ceil(b.h * SCALE));
    var ctx = cv.getContext('2d');
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    R.draw(ctx, { w: b.w, h: b.h, items: items }, { deck: deck });
    return blobPromise(cv);
  }
  function textHtml(t) {
    return t.paras.map(function (p) {
      return '<p>' + p.runs.map(function (r) {
        var s = esc(r.t);
        if (r.b) s = '<b>' + s + '</b>';
        if (r.i) s = '<i>' + s + '</i>';
        return s;
      }).join('') + '</p>';
    }).join('');
  }

  /** Copy to buffer: a text box as text, anything else as a picture. The ordinary clipboard copy happens too. */
  OP.copyToBuffer = function () {
    var objs = A.selObjs(), deck = A.deck;
    if (!objs.length || !SB) { toast(SU.t('slides.io.select_a_shape_or_a_text_box_to_copy_to')); return; }
    var stamp = Date.now(); // the buffer item and this app's clipboard share it, so the objects paste back as objects
    A.clip = U.clone(objs);
    A.clipT = stamp;
    if (objs.length === 1 && objs[0].type === 'text') {
      var t = objs[0].text;
      SB.put({ kind: 'text', formats: { 'text/html': textHtml(t), 'text/plain': O.plain(t) }, source: 'slides', t: stamp })
        .then(function () { toast(SU.t('slides.io.copied_the_text_box_to_the_buffer')); }, function () { toast(SU.t('slides.io.could_not_copy_to_the_buffer')); });
      return;
    }
    picturePng(deck, objs).then(function (blob) {
      return SB.put({ kind: 'image', formats: { 'image/png': blob }, source: 'slides', t: stamp });
    }).then(function () { toast(SU.t('slides.io.copied_to_the_buffer')); }, function () { toast(SU.t('slides.io.could_not_copy_to_the_buffer')); });
  };

  /** HTML from the buffer as paragraphs of runs (bold and italic kept, anything else dropped). */
  function htmlParas(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
    function runs(node, acc) {
      Array.prototype.forEach.call(node.childNodes, function (c) {
        if (c.nodeType === 3) { if (c.nodeValue) acc.push({ t: c.nodeValue }); return; }
        if (c.nodeType !== 1) return;
        var tag = c.localName, sub = [];
        runs(c, sub);
        sub.forEach(function (r) { if (tag === 'b' || tag === 'strong') r.b = true; if (tag === 'i' || tag === 'em') r.i = true; acc.push(r); });
      });
      return acc;
    }
    var blocks = doc.body.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6');
    if (!blocks.length) return plainParas(doc.body.textContent || '');
    Array.prototype.forEach.call(blocks, function (b) {
      var r = runs(b, []);
      out.push({ runs: r.length ? r : [{ t: '' }] });
    });
    return out;
  }
  function plainParas(text) { return String(text).replace(/\r\n?/g, '\n').split('\n').map(function (line) { return { runs: [{ t: line }] }; }); }

  function imageSize(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 }); };
      im.onerror = function () { res({ w: 400, h: 300 }); };
      im.src = url;
    });
  }
  function placeImage(url, name) {
    return imageSize(url).then(function (sz) {
      var d = A.deck, k = Math.min(1, d.size.w * 0.6 / sz.w, d.size.h * 0.6 / sz.h);
      var mid = M.addMedia(d, url, name);
      OP.add('image', { w: sz.w * k, h: sz.h * k, media: mid, name: name || 'Picture' }, SU.t('slides.io.paste_picture')); // i18n-ignore
    });
  }
  function placeText(paras) {
    OP.add('text', { w: 360, h: 80, text: { paras: paras, valign: 'top', autofit: 'none' } }, SU.t('slides.io.paste_text'));
  }

  /** Places one buffer record on the current slide (centred). Returns true when it started. */
  function place(rec) {
    var c = SB.choose(rec, ['image/png', 'image/svg+xml', 'text/html', 'text/plain']);
    if (!c || A.mode !== 'edit' || !A.deck) return false;
    if (c.type === 'text/html') { placeText(htmlParas(c.data)); return true; }
    if (c.type === 'text/plain') { placeText(plainParas(c.data)); return true; }
    var pngOf = c.type === 'image/png' ? U.blobToDataUrl(c.data) : SB.rasterize(c.data).then(function (cv) {
      return new Promise(function (res) { cv.toBlob(function (b) { res(U.blobToDataUrl(b)); }, 'image/png'); });
    });
    pngOf.then(function (url) {
      placeImage(url, 'Buffer picture'); // i18n-ignore
      if (c.type === 'image/svg+xml') toast(SU.t('slides.io.vector_converted_to_a_picture'), 4200);
    }, function () { toast(SU.t('slides.io.the_buffer_could_not_be_read_as_a_pictur'), 4200); });
    return true;
  }
  function bufferNewer() { var rec = SB && SB.get(); return !!rec && (!A.clipT || A.clipT < rec.t); }

  OP.hasBuffer = function () { return !!(SB && SB.get()); };
  /** Paste: the buffer when it is newer than this app's own clipboard. Returns true when it handled the paste. */
  OP.pasteBuffer = function () {
    if (!SB || !bufferNewer()) return false;
    return place(SB.get());
  };

  function bindDrop() {
    var stage = document.getElementById('stage');
    if (!SB || !stage) return;
    SB.bindDrop(stage, function (rec) { place(rec); });
    SB.tray(document.body);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindDrop);
  else bindDrop();
})();
