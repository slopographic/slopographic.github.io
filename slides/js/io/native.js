/* Slop Slides: the native file. A .sslide is the deck as JSON (mime application/x-slop-slides), media included.
   Reading turns what Slop Drive hands us into a deck: a zero-byte file of our type (what Drive's New menu makes)
   is a blank deck, an image becomes a one-picture slide, a PowerPoint file is imported (io/pptx-in.js), and anything else is
   reported as foreign so the editor never overwrites a file it could not read. Classic script; exposes window.SS.native. */
(function () {
  'use strict';
  var SS = window.SS, M = SS.model, U = SS.util, O = SS.objects;
  var N = SS.native = {};
  N.MIME = 'application/x-slop-slides';
  N.EXT = 'sslide';
  N.DEFAULT_NAME = 'Untitled presentation.sslide'; // i18n-ignore

  N.blank = function (opts) { return M.newDeck(Object.assign({ title: 'Untitled presentation' }, opts || {})); }; // i18n-ignore
  N.toBlob = function (deck) { return new Blob([JSON.stringify(deck)], { type: N.MIME }); };

  /** The one deck validator (io/validate.js): throws with the reason if d is not a deck. Then fills in defaults
      (older or hand-made files may lack fields). Used for .sslide files, drafts and template files alike. */
  N.normalize = function (d) {
    SS.deckCheck.run(d);   // version check, migration of version 1 files, structure
    d.media = d.media || {};
    d.fonts = (Array.isArray(d.fonts) ? d.fonts : []).filter(function (r) { return r && typeof r.family === 'string' && /^data:/.test(r.data); });
    if (SS.fonts && SS.fonts.registerDeck) SS.fonts.registerDeck(d);   // the fonts the person added to this deck
    d.master = Object.assign({ footer: '', showNumber: false }, d.master);
    if (!d.theme || !d.theme.colors) d.theme = U.clone(SS.themes.byId(typeof d.theme === 'string' ? d.theme : 'slop'));
    d.slides.forEach(function (s) {
      s.objects = s.objects || [];
      s.notes = s.notes || '';
      s.hidden = !!s.hidden;
      s.layout = s.layout || 'blank';
      if (SS.anim) {
        s.transition = SS.anim.transitionOf(s);
        O.walk(s.objects, function (o) { o.anims = SS.anim.cleanList(o.anims); });
      }
    });
    if (!d.slides.length) M.addSlide(d, 'title');
    return d;
  };
  N.parse = function (text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('This file is damaged and could not be read'); }
    return N.normalize(d);
  };

  /** A deck with one slide holding the picture, fitted and centred (for "Send to Slides" with an image). */
  N.fromImage = function (dataUrl, name) {
    var d = M.newDeck({ empty: true, title: (name || 'Picture').replace(/\.[^.]+$/, '') }); // i18n-ignore
    var s = M.addSlide(d, 'blank');
    return new Promise(function (res) {
      var im = new Image();
      im.onload = im.onerror = function () {
        var iw = im.naturalWidth || 800, ih = im.naturalHeight || 600, k = Math.min(d.size.w * 0.9 / iw, d.size.h * 0.9 / ih, 1e9);
        var w = iw * k, h = ih * k;
        var o = SS.objects.make('image', { x: (d.size.w - w) / 2, y: (d.size.h - h) / 2, w: w, h: h, name: name || 'Picture', media: M.addMedia(d, dataUrl, name) }); // i18n-ignore
        s.objects.push(o);
        res(d);
      };
      im.src = dataUrl;
    });
  };

  /**
   * Reads a Drive record's blob (or a File). Resolves with { deck, kind } where kind is 'deck' | 'blank' | 'image' | 'pptx' |
   * 'foreign'; a PowerPoint file also gives { report } (what was left out, pptx-in.js). Rejects when a native or PowerPoint
   * file is damaged (the caller then opens nothing over it).
   */
  N.PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  N.read = async function (blob, type, name) {
    type = type || (blob && blob.type) || '';
    if (!blob || blob.size === 0) return { deck: N.blank(), kind: 'blank' };
    if (type === N.PPTX || /\.pptx$/i.test(name || '')) {
      var r = await SS.pptxIn.read(blob, name);   // pptx-in.js; throws with the reason for a damaged or foreign file
      return { deck: N.normalize(r.deck), kind: 'pptx', report: r.report };
    }
    if (type === N.MIME || /json/.test(type) || /\.sslide$/i.test(name || '')) return { deck: N.parse(await blob.text()), kind: 'deck' };
    if (/^image\//.test(type)) return { deck: await N.fromImage(await U.blobToDataUrl(blob), name || 'Picture'), kind: 'image' }; // i18n-ignore
    return { deck: N.blank(), kind: 'foreign', type: type };
  };

  /** Plain file name for a deck title ("Gooey launch" → "Gooey launch.sslide"). */
  N.fileName = function (title) {
    var base = String(title || 'Untitled presentation').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim(); // i18n-ignore
    return (base || 'Untitled presentation') + '.' + N.EXT; // i18n-ignore
  };
})();
