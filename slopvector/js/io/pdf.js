/* SlopVector — io: hand-made PDF 1.4 writer */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};

  /* ================= PDF writer (hand-made PDF 1.4) ================= */
  var HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  var HELVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
  var WINANSI = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F, 0x2212: 0x2D, 0x2032: 0x27 };
  function toWinAnsi(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF) { i++; out += '?'; continue; }
      if (c < 128 || (c >= 160 && c <= 255)) out += String.fromCharCode(c);
      else if (WINANSI[c]) out += String.fromCharCode(WINANSI[c]);
      else out += '?';
    }
    return out;
  }
  function pdfStr(s) { return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + ')'; }
  function pdfFontFor(f) {
    var fam = (f.family || '').toLowerCase(), bold = (+f.weight || 400) >= 600, it = f.style === 'italic';
    var mono = /mono|courier|consol|menlo/.test(fam), serif = /georgia|times|serif/.test(fam) && !/sans/.test(fam);
    if (mono) return { name: 'Courier' + (bold ? (it ? '-BoldOblique' : '-Bold') : (it ? '-Oblique' : '')), kind: 'mono' }; // i18n-ignore: PDF names / font names, not UI
    if (serif) return { name: bold ? (it ? 'Times-BoldItalic' : 'Times-Bold') : (it ? 'Times-Italic' : 'Times-Roman'), kind: 'serif', bold: bold };
    return { name: 'Helvetica' + (bold ? (it ? '-BoldOblique' : '-Bold') : (it ? '-Oblique' : '')), kind: 'sans', bold: bold }; // i18n-ignore: PDF names / font names, not UI
  }
  var measCtx = null;
  function pdfTextWidth(enc, size, font) {
    if (font.kind === 'mono') return enc.length * 600 * size / 1000;
    if (font.kind === 'sans') {
      var tab = font.bold ? HELVB : HELV, w = 0;
      for (var i = 0; i < enc.length; i++) { var c = enc.charCodeAt(i); w += (c >= 32 && c <= 126) ? tab[c - 32] : 556; }
      return w * size / 1000;
    }
    if (!measCtx) measCtx = document.createElement('canvas').getContext('2d');
    measCtx.font = (font.bold ? 'bold ' : '') + size + "px 'Times New Roman', Times, serif";
    return measCtx.measureText(enc).width;
  }
  function hexRGB(c) {
    c = String(c || '#000');
    if (c[0] === '#' && c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    var n = parseInt(c.slice(1, 7), 16); if (isNaN(n)) n = 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  function rgbStr(c) { return hexRGB(c).map(function (v) { return fmt(v); }).join(' '); }
  function solidOf(p) { if (!p) return null; if (typeof p === 'string') return p; return p.stops && p.stops.length ? p.stops[Math.floor((p.stops.length - 1) / 2)].c : '#000000'; }
  function pathOps(subs) {
    var out = [];
    subs.forEach(function (sp) {
      if (!sp.pts.length) return;
      out.push(fmt(sp.pts[0].x) + ' ' + fmt(sp.pts[0].y) + ' m');
      G.eachSeg(sp, function (a, b) {
        if (G.isLineSeg(a, b)) out.push(fmt(b.x) + ' ' + fmt(b.y) + ' l');
        else out.push(fmt(a.ox) + ' ' + fmt(a.oy) + ' ' + fmt(b.ix) + ' ' + fmt(b.iy) + ' ' + fmt(b.x) + ' ' + fmt(b.y) + ' c');
      });
      if (sp.closed) out.push('h');
    });
    return out.join('\n');
  }
  // alphaMode: build a DeviceGray shading from stop opacities (for a luminosity soft mask)
  function shadingDict(g, alphaMode) {
    var stops = g.stops.slice().sort(function (a, b) { return a.o - b.o; }).map(function (s) { return { o: SV.clamp(s.o, 0, 1), c: s.c, a: s.a == null ? 1 : s.a }; });
    if (!stops.length) stops = [{ o: 0, c: '#000', a: 1 }];
    if (stops[0].o > 0) stops.unshift({ o: 0, c: stops[0].c, a: stops[0].a });
    if (stops[stops.length - 1].o < 1) stops.push({ o: 1, c: stops[stops.length - 1].c, a: stops[stops.length - 1].a });
    if (stops.length === 1) stops.push({ o: 1, c: stops[0].c, a: stops[0].a });
    var col = function (s) { return alphaMode ? fmt(SV.clamp(s.a, 0, 1)) : rgbStr(s.c); };
    var cs = alphaMode ? '/DeviceGray' : '/DeviceRGB';
    for (var i = 1; i < stops.length - 1; i++) { if (stops[i].o <= stops[i - 1].o) stops[i].o = Math.min(1, stops[i - 1].o + 1e-4); }
    var fns = [];
    for (i = 0; i < stops.length - 1; i++) fns.push('<< /FunctionType 2 /Domain [0 1] /C0 [' + col(stops[i]) + '] /C1 [' + col(stops[i + 1]) + '] /N 1 >>');
    var fn = fns.length === 1 ? fns[0] : '<< /FunctionType 3 /Domain [0 1] /Functions [' + fns.join(' ') + '] /Bounds [' + stops.slice(1, -1).map(function (s) { return fmt(s.o); }).join(' ') + '] /Encode [' + fns.map(function () { return '0 1'; }).join(' ') + '] >>';
    if (g.type === 'radial') {
      var fx = g.fx != null ? g.fx : g.cx, fy = g.fy != null ? g.fy : g.cy;
      return '<< /ShadingType 3 /ColorSpace ' + cs + ' /Coords [' + [fx, fy, 0, g.cx, g.cy, g.r].map(fmt).join(' ') + '] /Function ' + fn + ' /Extend [true true] >>';
    }
    return '<< /ShadingType 2 /ColorSpace ' + cs + ' /Coords [' + [g.x1, g.y1, g.x2, g.y2].map(fmt).join(' ') + '] /Function ' + fn + ' /Extend [true true] >>';
  }
  var BM = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'ColorDodge', 'color-burn': 'ColorBurn', 'hard-light': 'HardLight', 'soft-light': 'SoftLight', difference: 'Difference', exclusion: 'Exclusion', hue: 'Hue', saturation: 'Saturation', color: 'Color', luminosity: 'Luminosity' };
  function latin1Bytes(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.resolve(null);
    try {
      var cs = new CompressionStream('deflate');
      var stream = new Blob([bytes]).stream().pipeThrough(cs);
      return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function loadImg(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { rej(new Error('image')); }; i.src = src; });
  }
  IO.buildPDF = function () {
    var doc = S.doc, W = doc.width, H = doc.height;
    var gstates = {}, gsN = 0, shadings = [], fonts = {}, fontN = 0, images = [], content = [], masks = [];
    content.push('1 0 0 -1 0 ' + fmt(H) + ' cm');
    function gs(alpha, blend) {
      var k = fmt(alpha) + '|' + (blend || 'normal');
      if (!gstates[k]) gstates[k] = { name: 'GS' + (++gsN), dict: '<< /Type /ExtGState /ca ' + fmt(alpha) + ' /CA ' + fmt(alpha) + ' /BM /' + (BM[blend] || 'Normal') + ' >>' };
      return '/' + gstates[k].name + ' gs';
    }
    function fontRes(f) {
      var pf = pdfFontFor(f);
      if (!fonts[pf.name]) fonts[pf.name] = { name: 'F' + (++fontN), base: pf.name };
      return { res: fonts[pf.name].name, pf: pf };
    }
    function emit(o, alpha, blend) {
      if (o.hidden) return;
      var st = o.style || {}, a = alpha * (st.opacity == null ? 1 : st.opacity), bl = (st.blend && st.blend !== 'normal') ? st.blend : blend;
      if (o.type === 'group' && o.clip && o.children.length) { // clipping mask: the clipped objects, clipped to the shape's path
        content.push('q', SV.clipMask.pdfClip(pathOps(SV.docSubs(o.children[o.children.length - 1]))));
        o.children.slice(0, -1).forEach(function (c) { emit(c, a, bl); });
        content.push('Q'); return;
      }
      if (o.type === 'group') { o.children.forEach(function (c) { emit(c, a, bl); }); return; }
      content.push('q');
      if (!G.isIdentity(o.m)) content.push(o.m.map(fmt).join(' ') + ' cm');
      if (a < 0.999 || (bl && bl !== 'normal')) content.push(gs(a, bl));
      if (o.type === 'image') {
        var href = S.doc.assets[o.asset] || o.href;
        if (href) {
          images.push({ name: 'Im' + (images.length + 1), href: href }); // i18n-ignore: PDF names / font names, not UI
          content.push(fmt(o.w) + ' 0 0 ' + fmt(-o.h) + ' ' + fmt(o.x) + ' ' + fmt(o.y + o.h) + ' cm /' + images[images.length - 1].name + ' Do');
        }
        content.push('Q'); return;
      }
      var fill = st.fill, stroke = st.stroke && st.sw > 0 ? st.stroke : null;
      var strokeSetup = function () {
        var sc = solidOf(stroke);
        content.push(rgbStr(sc) + ' RG ' + fmt(st.sw) + ' w ' + ({ butt: 0, round: 1, square: 2 }[st.cap] || 0) + ' J ' + ({ miter: 0, round: 1, bevel: 2 }[st.join] || 0) + ' j ' + fmt(st.miter || 10) + ' M [' + (st.dash || []).map(fmt).join(' ') + '] 0 d');
      };
      if (o.type === 'text') {
        var fr = fontRes(o.font), lay = SV.textLayout(o), f = o.font, fc = solidOf(fill);
        if (fc) content.push(rgbStr(fc) + ' rg');
        var mode = fc && stroke ? 2 : stroke ? 1 : 0;
        if (stroke) strokeSetup();
        if (!fc && !stroke) { content.push('Q'); return; }
        lay.lines.forEach(function (ln, i) {
          var enc = toWinAnsi(ln), w = pdfTextWidth(enc, f.size, fr.pf) + lay.tr * enc.length;
          var x = f.align === 'center' ? o.x - w / 2 : f.align === 'right' ? o.x - w : o.x, y = o.y + i * lay.L;
          content.push('BT /' + fr.res + ' ' + fmt(f.size) + ' Tf ' + (lay.tr ? fmt(lay.tr) + ' Tc ' : '') + mode + ' Tr 1 0 0 -1 ' + fmt(x) + ' ' + fmt(y) + ' Tm ' + pdfStr(enc) + ' Tj ET');
        });
        content.push('Q'); return;
      }
      var subs = SV.localSubs(o), ops = pathOps(subs), eo = st.rule === 'evenodd';
      if (!ops) { content.push('Q'); return; }
      if (fill && typeof fill === 'object') {
        var bb = G.subsBBox(subs);
        if (bb && bb.w > 0 && bb.h > 0) {
          shadings.push({ name: 'Sh' + (shadings.length + 1), dict: shadingDict(fill) }); // i18n-ignore: PDF names / font names, not UI
          var needMask = fill.stops.some(function (s) { return s.a != null && s.a < 0.999; });
          content.push('q', ops, eo ? 'W* n' : 'W n', fmt(bb.w) + ' 0 0 ' + fmt(bb.h) + ' ' + fmt(bb.x) + ' ' + fmt(bb.y) + ' cm');
          if (needMask) {
            var mk = { name: 'GM' + (masks.length + 1), dict: shadingDict(fill, true) };
            masks.push(mk); content.push('/' + mk.name + ' gs');
          }
          content.push('/' + shadings[shadings.length - 1].name + ' sh', 'Q');
        }
        if (stroke) { strokeSetup(); content.push(ops, 'S'); }
      } else if (fill && stroke) {
        content.push(rgbStr(fill) + ' rg'); strokeSetup(); content.push(ops, eo ? 'B*' : 'B');
      } else if (fill) {
        content.push(rgbStr(fill) + ' rg', ops, eo ? 'f*' : 'f');
      } else if (stroke) {
        strokeSetup(); content.push(ops, 'S');
      }
      content.push('Q');
    }
    doc.layers.forEach(function (L) { if (!L.hidden) L.children.forEach(function (o) { emit(o, 1, null); }); });
    var contentStr = content.join('\n');
    // prepare images (async)
    return Promise.all(images.map(function (im) {
      return loadImg(im.href).then(function (img) {
        var w = img.naturalWidth || 1, h = img.naturalHeight || 1, sc = min(1, 2048 / max(w, h));
        w = max(1, Math.round(w * sc)); h = max(1, Math.round(h * sc));
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var cx = c.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
        var px = cx.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3), al = new Uint8Array(w * h), hasA = false;
        for (var i = 0, j = 0, k = 0; i < px.length; i += 4) { rgb[j++] = px[i]; rgb[j++] = px[i + 1]; rgb[j++] = px[i + 2]; al[k++] = px[i + 3]; if (px[i + 3] < 255) hasA = true; }
        im.w = w; im.h = h;
        return Promise.all([deflate(rgb), hasA ? deflate(al) : Promise.resolve(null)]).then(function (r) {
          im.rgb = r[0] || rgb; im.rgbZ = !!r[0];
          if (hasA) { im.alpha = r[1] || al; im.alphaZ = !!r[1]; }
        });
      }).catch(function () { im.failed = true; });
    })).then(function () { return deflate(latin1Bytes(contentStr)); }).then(function (zc) {
      // assemble objects
      var objs = []; // each: {dict, stream?}
      function add(o) { objs.push(o); return objs.length; }
      var catalog = add(null), pages = add(null), page = add(null);
      var contentObj = add({ dict: zc ? '<< /Filter /FlateDecode' : '<<', stream: zc || latin1Bytes(contentStr) });
      var info = add({ dict: '<< /Producer (SlopVector - slopographic.com) /Creator (SlopVector) /Title ' + pdfStr(toWinAnsi(doc.name)) + ' /CreationDate (D:' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z) >>' });
      var xobj = [];
      images.forEach(function (im) {
        if (im.failed) return;
        var smask = '';
        if (im.alpha) {
          var sm = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceGray /BitsPerComponent 8' + (im.alphaZ ? ' /Filter /FlateDecode' : ''), stream: im.alpha });
          smask = ' /SMask ' + sm + ' 0 R';
        }
        var io = add({ dict: '<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' + smask + (im.rgbZ ? ' /Filter /FlateDecode' : ''), stream: im.rgb });
        xobj.push('/' + im.name + ' ' + io + ' 0 R');
      });
      var res = '<< /ProcSet [/PDF /Text /ImageB /ImageC]';
      var fk = Object.keys(fonts);
      if (fk.length) res += ' /Font << ' + fk.map(function (k) { return '/' + fonts[k].name + ' << /Type /Font /Subtype /Type1 /BaseFont /' + fonts[k].base + ' /Encoding /WinAnsiEncoding >>'; }).join(' ') + ' >>';
      var gk = Object.keys(gstates), gsEntries = gk.map(function (k) { return '/' + gstates[k].name + ' ' + gstates[k].dict; });
      masks.forEach(function (mk) {
        // luminosity soft mask: a transparency-group form painting the stop opacities as gray
        var formStr = '/Sa sh';
        var form = add({ dict: '<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Group << /S /Transparency /CS /DeviceGray >> /Resources << /Shading << /Sa ' + mk.dict + ' >> >>', stream: latin1Bytes(formStr) });
        gsEntries.push('/' + mk.name + ' << /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ' + form + ' 0 R >> >>');
      });
      if (gsEntries.length) res += ' /ExtGState << ' + gsEntries.join(' ') + ' >>';
      if (shadings.length) res += ' /Shading << ' + shadings.map(function (s) { return '/' + s.name + ' ' + s.dict; }).join(' ') + ' >>';
      if (xobj.length) res += ' /XObject << ' + xobj.join(' ') + ' >>';
      res += ' >>';
      objs[catalog - 1] = { dict: '<< /Type /Catalog /Pages ' + pages + ' 0 R >>' };
      objs[pages - 1] = { dict: '<< /Type /Pages /Kids [' + page + ' 0 R] /Count 1 >>' };
      objs[page - 1] = { dict: '<< /Type /Page /Parent ' + pages + ' 0 R /MediaBox [0 0 ' + fmt(W) + ' ' + fmt(H) + '] /Resources ' + res + ' /Contents ' + contentObj + ' 0 R /Group << /S /Transparency /CS /DeviceRGB >> >>' };
      // serialise
      var parts = [], off = 0, offsets = [];
      function push(x) { var b = typeof x === 'string' ? latin1Bytes(x) : x; parts.push(b); off += b.length; }
      push('%PDF-1.4\n%âãÏÓ\n');
      objs.forEach(function (o, i) {
        offsets.push(off);
        push((i + 1) + ' 0 obj\n');
        if (o.stream) { push(o.dict + ' /Length ' + o.stream.length + ' >>\nstream\n'); push(o.stream); push('\nendstream\nendobj\n'); }
        else push(o.dict + '\nendobj\n');
      });
      var xref = off, x = 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
      offsets.forEach(function (o) { x += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
      push(x);
      push('trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
      return new Blob(parts, { type: 'application/pdf' });
    });
  };
  IO.exportPDF = function (asAI) {
    return IO.buildPDF().then(function (blob) {
      var name = IO.baseName() + (asAI ? '.ai' : '.pdf');
      IO.download(asAI ? new Blob([blob], { type: 'application/postscript' }) : blob, name);
      SV.toast(SV.t('vector.msg.exported_file', { file: name })); SlopSupport.afterExport('slopvector');
      return blob;
    }).catch(function (e) { SV.toast(SV.t('vector.msg.pdf_failed', { error: e.message }), 'warn'); });
  };

  $.loadImg = loadImg;
})();
