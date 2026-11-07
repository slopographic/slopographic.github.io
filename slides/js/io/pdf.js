/* Slop Slides: PDF export. One page per slide (hidden slides are left out unless asked), at the slide size, drawn from the
   same display list as the canvas, the thumbnails and Present (render/scene.js): vector shapes and gradients, embedded
   pictures, and real text in the slide fonts, with language fonts fetched just in time for other writing systems
   (pdf-text.js). Objects are drawn as they stand once every animation has played. pdf-lib, fontkit and the
   regenerator runtime fontkit's Indic shaper needs are loaded on first use (vendor/). Exposes SS.pdfExport:
   write(deck, { hidden, ask }) → Promise<{ blob, pages, missing: [language font labels] }>. */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util;
  var X = SS.pdfExport = {};
  var BASE = (document.currentScript && document.currentScript.src) || location.href;
  var LIBS = [['regeneratorRuntime', '../../../vendor/regenerator-runtime/runtime.js'], ['fontkit', '../../../vendor/fontkit/fontkit.min.js'], ['PDFLib', '../../../vendor/pdf-lib/pdf-lib.min.js']];
  var libsP = null;

  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = new URL(src, BASE).href; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src.replace(/^.*\//, ''))); };
      document.head.append(s);
    });
  }
  /** pdf-lib and fontkit (and the regenerator runtime first: fontkit's Indic and Universal shapers need it). */
  X.libs = function () {
    if (!libsP) libsP = LIBS.reduce(function (p, l) { return p.then(function () { return window[l[0]] ? null : load(l[1]); }); }, Promise.resolve());
    libsP.catch(function () { libsP = null; });
    return libsP;
  };

  /** PNG bytes of a picture the PDF cannot embed as it is (GIF, WebP, SVG): drawn once onto a canvas. */
  function toPng(dataUrl) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth || 1024, h = im.naturalHeight || 768, k = /^data:image\/svg/.test(dataUrl) ? Math.max(1, 1024 / Math.max(w, h)) : 1;
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error('picture')); }, 'image/png');
      };
      im.onerror = function () { rej(new Error('A picture could not be read')); };
      im.src = dataUrl;
    });
  }
  async function images(doc, deck, scenes) {
    var used = {}, out = {};
    function walk(n) { if (n.k === 'group') n.children.forEach(walk); else if (n.k === 'image' && n.media) used[n.media] = true; }
    scenes.forEach(function (s) { s.items.forEach(walk); });
    for (var id in used) {
      var rec = deck.media && deck.media[id];
      if (!rec) continue;
      try {
        if (rec.mime === 'image/png') out[id] = await doc.embedPng(U.dataUrlToU8(rec.data));
        else if (rec.mime === 'image/jpeg') out[id] = await doc.embedJpg(U.dataUrlToU8(rec.data));
        else if (/^image\//.test(rec.mime)) out[id] = await doc.embedPng(await toPng(rec.data));
      } catch (e) { console.warn('Slop Slides: picture left out of the PDF', e); }
    }
    return out;
  }

  /** The scenes the PDF draws: every visible slide (or every slide), as it stands after its animations. */
  X.scenes = function (deck, opts) {
    return deck.slides.filter(function (s) { return (opts && opts.hidden) || !s.hidden; }).map(function (s) {
      return SS.scene.slide(deck, s, { editor: false, index: deck.slides.indexOf(s) });
    });
  };

  X.write = async function (deck, opts) {
    opts = opts || {};
    await X.libs();
    if (SS.fonts.load) await SS.fonts.load();
    var L = window.PDFLib, scenes = X.scenes(deck, opts);
    if (!scenes.length) throw new Error('Every slide is hidden');
    var doc = await L.PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    doc.setTitle(deck.title || 'Presentation'); // i18n-ignore
    doc.setCreator('Slop Slides'); // i18n-ignore
    doc.setProducer('Slop Slides (pdf-lib)'); // i18n-ignore
    var fonts = await SS.pdfText.prepare(doc, scenes, { ask: opts.ask });
    var imgs = await images(doc, deck, scenes);
    scenes.forEach(function (sc) {
      var page = doc.addPage([sc.w, sc.h]);
      SS.pdfPaint.page({ doc: doc, page: page, fonts: fonts, images: imgs }, sc);
    });
    var bytes = await doc.save();
    return { blob: new Blob([bytes], { type: 'application/pdf' }), pages: scenes.length, missing: fonts.missing };
  };
})();
