/* SlopBuffer clipboard: turns a record into the standard system formats (image/png, text/html, text/plain) and writes
 * them to the system clipboard, so the item pastes outside the site too. Vectors are rasterised for the clipboard
 * (the system clipboard has no SVG type). Where the browser refuses, writeSystem resolves false and nothing else changes.
 * Classic script; adds SlopBuffer.rasterize, toPng, writeSystem, plainFor and isSystemCopyOf. */
(function (g) {
  'use strict';
  var B = g.SlopBuffer = g.SlopBuffer || {};

  /** Draws SVG markup into a canvas of w x h pixels (0 means the SVG's own size, or 512 when it has none). Resolves the canvas. */
  B.rasterize = function (svgText, w, h) {
    return new Promise(function (res, rej) {
      var doc = new DOMParser().parseFromString(svgText, 'image/svg+xml'), root = doc.documentElement;
      if (!root || root.localName !== 'svg') { rej(new Error('Not an SVG')); return; }
      var vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      var nw = parseFloat(root.getAttribute('width')) || (vb.length === 4 && vb[2]) || 512;
      var nh = parseFloat(root.getAttribute('height')) || (vb.length === 4 && vb[3]) || 512;
      var cw = Math.max(1, Math.round(w || nw)), ch = Math.max(1, Math.round(h || nh));
      var url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(im, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        res(c);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('The SVG could not be drawn')); };
      im.src = url;
    });
  };

  /** A PNG Blob for a record: its own image/png, or the SVG drawn at its size. Resolves null when neither can be made. */
  B.toPng = function (rec) {
    if (!rec || !rec.formats) return Promise.resolve(null);
    if (rec.formats['image/png']) return Promise.resolve(rec.formats['image/png']);
    var svg = rec.formats['image/svg+xml'];
    if (!svg) return Promise.resolve(null);
    return B.rasterize(svg).then(function (c) {
      return new Promise(function (res) { c.toBlob(function (b) { res(b || null); }, 'image/png'); });
    }, function () { return null; });
  };

  /** The text/plain a record gives the system clipboard: its own, or a table as TSV. */
  B.plainFor = function (rec) {
    var f = rec.formats;
    if (f['text/plain']) return f['text/plain'];
    if (f['text/csv']) return B.csvToTsv(f['text/csv']);
    return null;
  };

  /** True when a file from a paste event is the PNG this buffer put on the system clipboard (same record, same size and
   *  type), so the app can use the buffer's own item instead of the flattened picture. */
  B.isSystemCopyOf = function (file) {
    var s = B.systemFile, c = B.get ? B.get() : null;
    return !!(file && s && c && s.t === c.t && file.size === s.size && file.type === s.type);
  };

  /** Writes the record to the system clipboard. The write starts at once (so the user gesture still counts) and
   *  rasterising is done lazily through promises. Resolves true when the browser took it, false when it refused. */
  B.writeSystem = function (rec) {
    var nav = g.navigator, CI = g.ClipboardItem;
    if (!nav || !nav.clipboard || !nav.clipboard.write || !CI || !rec) return Promise.resolve(false);
    var items = {}, f = rec.formats;
    if (f['image/png'] || f['image/svg+xml']) {
      items['image/png'] = B.toPng(rec).then(function (b) {
        if (!b) throw new Error('no image');
        B.systemFile = { t: rec.t, size: b.size, type: b.type };
        return b;
      });
    }
    if (f['text/html']) items['text/html'] = Promise.resolve(new Blob([f['text/html']], { type: 'text/html' }));
    var plain = B.plainFor(rec);
    if (plain != null) items['text/plain'] = Promise.resolve(new Blob([plain], { type: 'text/plain' }));
    if (!Object.keys(items).length) return Promise.resolve(false);
    try {
      return nav.clipboard.write([new CI(items)]).then(function () { return true; }, function () { return false; });
    } catch (e) { return Promise.resolve(false); }
  };
})(window);
