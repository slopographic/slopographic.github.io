/* Slop Press — print-ready PDF export, written by hand: exact TrimBox/BleedBox/MediaBox, crop, bleed and
   registration marks in the Registration colour (Separation /All), page information in the slug,
   embedded subset fonts, JPEG passthrough and Flate images with soft masks. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, P = PR.pages, D = PR.pdfDraw, num = PR.pdfw.num;
  var X = PR.pdf = {};

  /* ---------- images ---------- */
  function jpegInfo(b) {
    for (var i = 2; i < b.length - 9;) {
      if (b[i] !== 0xFF) { i++; continue; }
      var m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
      i += 2 + len;
    }
    return null;
  }
  function prepareImage(doc, id, W) {
    var url = doc.assets[id]; if (!url) return Promise.resolve(null);
    var bin = U.dataURLToBytes(url);
    if (bin.type === 'image/jpeg') {
      var info = jpegInfo(bin.bytes);
      if (info && (info.comps === 3 || info.comps === 1)) {
        var ref = W.stream({ Type: '/XObject', Subtype: '/Image', Width: info.w, Height: info.h, ColorSpace: info.comps === 1 ? '/DeviceGray' : '/DeviceRGB', BitsPerComponent: 8, Filter: '/DCTDecode' }, bin.bytes, false);
        return Promise.resolve({ ref: ref, natW: info.w * 0.75, natH: info.h * 0.75 });
      }
    }
    return PR.render.imageReady(doc, id).then(function (img) {
      if (!img) return null;
      var w = img.naturalWidth, h = img.naturalHeight, sc = Math.min(1, 4000 / Math.max(w, h)), cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
      var c = document.createElement('canvas'); c.width = cw; c.height = ch;
      var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, cw, ch);
      var px = ctx.getImageData(0, 0, cw, ch).data, rgb = new Uint8Array(cw * ch * 3), alpha = new Uint8Array(cw * ch), hasA = false;
      for (var i = 0, j = 0, k = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; alpha[k++] = px[i + 3]; if (px[i + 3] < 255) hasA = true; }
      var smask = hasA ? W.stream({ Type: '/XObject', Subtype: '/Image', Width: cw, Height: ch, ColorSpace: '/DeviceGray', BitsPerComponent: 8 }, alpha, true) : undefined;
      var ref = W.stream({ Type: '/XObject', Subtype: '/Image', Width: cw, Height: ch, ColorSpace: '/DeviceRGB', BitsPerComponent: 8, SMask: smask }, rgb, true);
      return { ref: ref, natW: w * 0.75, natH: h * 0.75 };
    });
  }

  /* ---------- marks ---------- */
  function marks(o, W, H, b, off, len, opts, label) {
    var out = ['q /CSReg CS 1 SCN /CSReg cs 1 scn 0.25 w 0 J'];
    function ln(x1, y1, x2, y2) { out.push(num(x1) + ' ' + num(y1) + ' m ' + num(x2) + ' ' + num(y2) + ' l S'); }
    if (opts.cropMarks) {
      [[0, 0, -1, -1], [W, 0, 1, -1], [0, H, -1, 1], [W, H, 1, 1]].forEach(function (c) {
        ln(c[0] + c[2] * off, c[1], c[0] + c[2] * (off + len), c[1]);
        ln(c[0], c[1] + c[3] * off, c[0], c[1] + c[3] * (off + len));
      });
    }
    if (opts.bleedMarks && (b.top || b.left || b.right || b.bottom)) {
      var bx0 = -b.left, by0 = -b.top, bx1 = W + b.right, by1 = H + b.bottom, l2 = len * 0.6;
      out.push('[2 1] 0 d');
      [[bx0, by0, -1, -1], [bx1, by0, 1, -1], [bx0, by1, -1, 1], [bx1, by1, 1, 1]].forEach(function (c) {
        ln(c[0] + c[2] * off, c[1], c[0] + c[2] * (off + l2), c[1]);
        ln(c[0], c[1] + c[3] * off, c[0], c[1] + c[3] * (off + l2));
      });
      out.push('[] 0 d');
    }
    if (opts.regMarks) {
      var r = 5, d = off + len / 2;
      [[W / 2, -d], [W / 2, H + d], [-d, H / 2], [W + d, H / 2]].forEach(function (p) {
        var k = 0.5523 * r, x = p[0], y = p[1];
        out.push(num(x + r) + ' ' + num(y) + ' m ' + [x + r, y + k, x + k, y + r, x, y + r].map(num).join(' ') + ' c ' + [x - k, y + r, x - r, y + k, x - r, y].map(num).join(' ') + ' c ' +
          [x - r, y - k, x - k, y - r, x, y - r].map(num).join(' ') + ' c ' + [x + k, y - r, x + r, y - k, x + r, y].map(num).join(' ') + ' c S');
        ln(x - r * 1.6, y, x + r * 1.6, y); ln(x, y - r * 1.6, x, y + r * 1.6);
      });
    }
    if (opts.pageInfo && label) out.push('BT /' + label.res + ' 6 Tf 1 0 0 -1 ' + num(0) + ' ' + num(H + off + len + 6) + ' Tm <' + label.hex + '> Tj ET');
    out.push('Q');
    void o;
    return out.join('\n');
  }

  /** Exports pages to PDF bytes. opts: { pages:[idx] (all), bleed, cropMarks, bleedMarks, regMarks, pageInfo, embed } */
  X.export = function (opts) {
    opts = opts || {};
    var doc = PR.state.doc, pages = opts.pages && opts.pages.length ? opts.pages : doc.pages.map(function (p, i) { return i; });
    var anyMarks = opts.cropMarks || opts.bleedMarks || opts.regMarks || opts.pageInfo;
    var W = new PR.PDFWriter(), fonts = PR.pdfFonts.create(doc), imgs = {}, gstates = {}, gsN = 0;
    return PR.fonts.ready(doc).then(function () { PR.engine.clear(); PR.touch(); return PR.render.ready(doc); }).then(function () {
      return fonts.prepare(D.fontKeys(doc, pages), opts.embed !== false);
    }).then(function () {
      var ids = {};
      pages.forEach(function (i) { PR.render.pageItems(doc, i).forEach(function (it) { if (it.type === 'image' && it.asset) ids[it.asset] = 1; }); });
      var n = 0;
      return Promise.all(Object.keys(ids).map(function (id) { return prepareImage(doc, id, W).then(function (r) { if (r) { r.res = 'Im' + (++n); imgs[id] = r; } }); }));
    }).then(function () {
      var pagesRef = W.alloc(), kids = [], contents = [];
      pages.forEach(function (i) {
        var w = doc.size.w, h = doc.size.h, b = opts.bleed || anyMarks ? P.bleed(doc, i) : { top: 0, bottom: 0, left: 0, right: 0 };
        var bmax = Math.max(b.top, b.bottom, b.left, b.right), off = Math.max(6, bmax + 3), len = 18;
        var M = anyMarks ? off + len + 12 : 0;
        var ox = anyMarks ? M : b.left, oy = anyMarks ? M : b.top;
        var mw = anyMarks ? w + 2 * M : w + b.left + b.right, mh = anyMarks ? h + 2 * M : h + b.top + b.bottom;
        var C = { out: [], fonts: fonts, pageIdx: i, gs: function (a) { var k = num(a); if (!gstates[k]) gstates[k] = 'GS' + (++gsN); return gstates[k]; }, image: function (id) { return imgs[id] || null; } };
        C.out.push('q 1 0 0 -1 ' + num(ox) + ' ' + num(mh - oy) + ' cm');
        C.out.push('q ' + [-b.left, -b.top, w + b.left + b.right, h + b.top + b.bottom].map(num).join(' ') + ' re W n');
        var masterSet = {}; P.masterItems(doc, i).forEach(function (it) { masterSet[it.id] = 1; });
        PR.render.pageItems(doc, i).forEach(function (it) { D.item(C, it, masterSet[it.id] ? i : null); });
        C.out.push('Q');
        if (anyMarks) {
          var rec = fonts.get('Helvetica', 'Regular'), info = (doc.name || 'Untitled') + '   Page ' + P.label(doc, i) + '   ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
          var hex = info.split('').map(function (ch) { return fonts.encode(rec, ch).hex; }).join('');
          C.out.push(marks(null, w, h, b, off, len, opts, { res: rec.res, hex: hex }));
        }
        C.out.push('Q');
        contents.push({ ops: C.out.join('\n'), mw: mw, mh: mh, trim: [ox, mh - oy - h, ox + w, mh - oy], bleed: [ox - b.left, mh - oy - h - b.bottom, ox + w + b.right, mh - oy + b.top] });
      });
      var fontRes = fonts.write(W), xo = {}, gs = {};
      Object.keys(imgs).forEach(function (id) { xo[imgs[id].res] = imgs[id].ref; });
      Object.keys(gstates).forEach(function (a) { gs[gstates[a]] = W.add({ Type: '/ExtGState', ca: +a, CA: +a }); });
      var tint = W.add({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 1, 1, 1], N: 1 });
      var res = W.add({ Font: fontRes, XObject: xo, ExtGState: gs, ColorSpace: { CSReg: [{ raw: '/Separation' }, '/All', '/DeviceCMYK', tint] }, ProcSet: ['/PDF', '/Text', '/ImageB', '/ImageC'] });
      contents.forEach(function (c) {
        var cs = W.stream({}, c.ops, true), media = [0, 0, c.mw, c.mh];
        kids.push(W.add({ Type: '/Page', Parent: pagesRef, MediaBox: media, CropBox: media, BleedBox: c.bleed.map(function (v) { return +num(v); }), TrimBox: c.trim.map(function (v) { return +num(v); }), Resources: res, Contents: cs }));
      });
      W.set(pagesRef, { Type: '/Pages', Kids: kids, Count: kids.length });
      var cat = W.add({ Type: '/Catalog', Pages: pagesRef, PageLayout: doc.facing ? '/TwoPageRight' : '/SinglePage', ViewerPreferences: { DisplayDocTitle: true } });
      var d = new Date(), pad = function (n) { return ('0' + n).slice(-2); };
      var date = 'D:' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
      var info = W.add({ Title: { text: doc.name || 'Untitled' }, Producer: { str: 'Slop Press (slopographic.com)' }, Creator: { str: 'Slop Press' }, CreationDate: { str: date }, ModDate: { str: date }, Trapped: '/False' });
      return W.finish(cat, info);
    });
  };
  /** Exports and downloads. */
  X.download = function (opts) {
    return X.export(opts).then(function (bytes) {
      window.SlopUI.download(new Blob([bytes], { type: 'application/pdf' }), PR.io.baseName() + '.pdf');
      return bytes;
    });
  };
})();
