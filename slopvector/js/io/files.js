/* SlopVector — io: images and files (placed or opened as documents; they come in through the intake, io/intake.js) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};
  function loadImg() { return $.loadImg.apply(this, arguments); }

  /* ================= images & files ================= */
  function readFile(file, asText) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); };
      if (asText) fr.readAsText(file); else fr.readAsDataURL(file);
    });
  }
  IO.placeImageURL = function (url, name, at) {
    return loadImg(url).then(function (img) {
      if (!SV.canDraw()) return null;
      var w = img.naturalWidth || 100, h = img.naturalHeight || 100, maxW = S.doc.width * 0.8, maxH = S.doc.height * 0.8;
      var sc = min(1, maxW / w, maxH / h); w *= sc; h *= sc;
      var c = at; if (!c) { var rr = SV.dom.stage.getBoundingClientRect(); c = SV.toDoc(rr.width / 2, rr.height / 2); }
      var aid = 'a' + SV.uid(); S.doc.assets[aid] = url;
      var o = SV.mk.image(aid, c.x - w / 2, c.y - h / 2, w, h, name || 'Image'); // i18n-ignore: a name stored in the document
      o.src = { w: img.naturalWidth || w, h: img.naturalHeight || h }; // the source ratio, for Restore original aspect ratio
      SV.insertObj(o); SV.select([o.id]); SV.commit('place image');
      return o;
    }).catch(function () { SV.toast(SV.t('vector.msg.bad_image'), 'warn'); });
  };
  /** Places one file into the document (the intake's reader, io/intake.js): an SVG as grouped artwork (a SlopVector
   *  document dropped alone at a point may open), a picture as an image object. Resolves the placed object. */
  IO.placeFile = function (f, pt, alone) {
    var isSVG = /svg/.test(f.type) || /\.svg$/i.test(f.name);
    if (isSVG) return readFile(f, true).then(function (t) { return IO.importSVGText(t, { name: f.name.replace(/\.svg$/i, ''), at: pt, allowOpen: !!(alone && pt && /slopvector-document/.test(t)) }); });
    if (/^image\//.test(f.type)) return readFile(f, false).then(function (u) { return IO.placeImageURL(u, f.name.replace(/\.[^.]+$/, ''), pt); });
    return Promise.reject(new Error('is not an SVG or a picture'));
  };
  /** Opens one file as a document: an SVG becomes the document, a picture a new artboard of its size. Resolves true. */
  IO.openAsDocument = function (f) {
    var isSVG = /svg/.test(f.type) || /\.svg$/i.test(f.name), base = String(f.name || 'Untitled').replace(/\.[^.\/]+$/, '');
    if (isSVG) return readFile(f, true).then(function (t) { return IO.openSVGText(t, f.name || 'Untitled.svg'); });
    if (!/^image\//.test(f.type)) return Promise.reject(new Error('is not an SVG or a picture'));
    return readFile(f, false).then(function (url) {
      return loadImg(url).then(function (img) {
        var w0 = img.naturalWidth || 1, h0 = img.naturalHeight || 1, sc = min(1, 8000 / max(w0, h0)), w = Math.round(w0 * sc), h = Math.round(h0 * sc);
        var doc = SV.newDoc(w, h, base);
        var aid = 'a' + SV.uid(); doc.assets[aid] = url;
        doc.layers[0].children.push(SV.mk.image(aid, 0, 0, w, h, base));
        SV.loadDoc(doc, { fit: true });
        SV.commit('open image'); SV.markSaved();
        return true;
      });
    });
  };
})();
