/* Slop Press — fonts for PDF export.
   Embedded: TrueType (glyf) fonts are subset and written as Type0/CIDFontType2 (Identity-H) with ToUnicode;
   OpenType CFF fonts are embedded whole (FontFile3/OpenType). Families with no font file (system fonts)
   use the standard 14 fonts (WinAnsi); glyph positions always come from the layout, so metrics differences
   between the screen font and the PDF font never move text. */
(function () {
  'use strict';
  var PR = window.PR, F = PR.fonts, T = PR.ttf;
  var PF = PR.pdfFonts = {};
  var W1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
    0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  PF.winAnsi = function (cp) { if (cp === 0xA0) return 0x20; if ((cp >= 0x20 && cp < 0x7F) || (cp >= 0xA1 && cp <= 0xFF)) return cp; return W1252[cp] || 0x3F; };
  PF.stdName = function (std, style) {
    var b = F.isBold(style), i = F.isItalic(style);
    if (std === 'Times') return 'Times-' + (b && i ? 'BoldItalic' : b ? 'Bold' : i ? 'Italic' : 'Roman');
    var base = std === 'Courier' ? 'Courier' : 'Helvetica';
    return base + (b || i ? '-' + (b ? 'Bold' : '') + (i ? 'Oblique' : '') : '');
  };
  var pdfLibP = null;
  /** Loads vendor/pdf-lib (for the standard fonts' AFM widths). Resolves to window.PDFLib or null. */
  PF.loadPdfLib = function () {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (PR.offline && PR.offline.run) { PR.offline.run('vendor/pdf-lib/pdf-lib.min.js'); return Promise.resolve(window.PDFLib || null); }
    if (!pdfLibP) pdfLibP = new Promise(function (res) {
      var s = document.createElement('script'), base = (document.currentScript && document.currentScript.src) || PF.SRC;
      s.src = new URL('../../../vendor/pdf-lib/pdf-lib.min.js', base).href;
      s.onload = function () { res(window.PDFLib || null); }; s.onerror = function () { res(null); };
      document.head.append(s);
    });
    return pdfLibP;
  };
  PF.SRC = document.currentScript && document.currentScript.src;

  /** A font set for one export. */
  PF.create = function (doc) {
    var fonts = {}, n = 0, lib = null;
    var api = {};
    /** Loads what the given (family|style) keys need. */
    api.prepare = function (keys, embed) {
      return PF.loadPdfLib().then(function (L) { lib = L; return Promise.all(keys.map(function (k) {
        var p = k.split('|'), fam = F.family(p[0]);
        var std = PF.stdName(fam.std || 'Helvetica', p[1]);
        var make = function (bytes) {
          var f = null;
          if (bytes && embed !== false) { try { f = T.parse(bytes); } catch (e) { console.warn('Font not embeddable', k, e.message); f = null; } }
          if (f && f.fsType === 2) { console.warn('Font licence forbids embedding:', k); f = null; }
          var rec = fonts[k] = { key: k, res: 'F' + (++n), embed: !!f, ttf: f, std: std, used: {}, uni: {} };
          if (!f) { var stdKey = 'std:' + std; if (fonts[stdKey]) { rec.res = fonts[stdKey].res; rec.alias = fonts[stdKey]; } else fonts[stdKey] = rec; }
          try { rec.afm = lib && !f ? lib.StandardFontEmbedder.for(std) : null; } catch (e) { rec.afm = null; }
        };
        return F.bytes(doc, p[0], p[1]).then(make, function () { make(null); });
      })); });
    };
    api.get = function (family, style) { var r = fonts[F.key(family, style)]; return r && r.alias ? r.alias : r; };
    /** Encodes one character: { hex, w } where w is the advance in 1/1000 em in the PDF font. */
    api.encode = function (rec, ch, fk) {
      var cp = ch.codePointAt(0);
      if (cp === 0xA0) cp = 0x20;
      if (rec.embed) {
        var gid = T.gid(rec.ttf, cp);
        rec.used[gid] = 1; if (gid && !rec.uni[gid]) rec.uni[gid] = cp;
        return { hex: ('0000' + gid.toString(16)).slice(-4), w: T.advance(rec.ttf, gid) };
      }
      var code = PF.winAnsi(cp), w;
      if (rec.afm) { try { w = rec.afm.widthOfTextAtSize(code === 0x3F ? '?' : String.fromCodePoint(cp), 1000); } catch (e) { w = null; } }
      if (w == null || isNaN(w)) w = F.adv(fk || 'Helvetica|Regular', String.fromCharCode(cp)) * 1000;
      return { hex: ('0' + code.toString(16)).slice(-2), w: w };
    };
    /** Writes font objects. Returns { F1: ref, … } for page resources. */
    api.write = function (W) {
      var res = {};
      Object.keys(fonts).forEach(function (k) {
        var rec = fonts[k]; if (rec.alias || res[rec.res]) return;
        res[rec.res] = rec.embed ? writeEmbedded(W, rec) : W.add({ Type: '/Font', Subtype: '/Type1', BaseFont: '/' + rec.std, Encoding: '/WinAnsiEncoding' });
      });
      return res;
    };
    api.list = function () { return Object.keys(fonts).map(function (k) { return fonts[k]; }); };
    return api;
  };
  var TAGN = 0;
  function writeEmbedded(W, rec) {
    var f = rec.ttf, sc = 1000 / f.upm, tag = ''; TAGN++;
    for (var i = 0; i < 6; i++) tag += String.fromCharCode(65 + ((TAGN * 7 + i * 3 + f.psName.length) % 26));
    var name = '/' + tag + '+' + f.psName, gids = Object.keys(rec.used).map(Number).sort(function (a, b) { return a - b; });
    var data = f.cff ? f.u8 : T.subset(f, rec.used);
    var file = W.stream(f.cff ? { Subtype: '/OpenType' } : { Length1: data.length }, data, true);
    var desc = W.add({ Type: '/FontDescriptor', FontName: name, Flags: 32 + (F.isItalic(rec.key.split('|')[1]) ? 64 : 0), FontBBox: f.bbox.map(function (v) { return Math.round(v * sc); }),
      ItalicAngle: f.italicAngle, Ascent: Math.round(f.ascent * sc), Descent: Math.round(f.descent * sc), CapHeight: Math.round(f.capHeight * sc), StemV: 80,
      FontFile2: f.cff ? undefined : file, FontFile3: f.cff ? file : undefined });
    var w = [], run = null;
    gids.forEach(function (g) { var a = Math.round(T.advance(f, g)); if (run && g === run.last + 1) { run.ws.push(a); run.last = g; } else { run = { first: g, last: g, ws: [a] }; w.push(run); } });
    var warr = []; w.forEach(function (r) { warr.push(r.first, r.ws); });
    var cid = W.add({ Type: '/Font', Subtype: f.cff ? '/CIDFontType0' : '/CIDFontType2', BaseFont: name, CIDSystemInfo: { Registry: { str: 'Adobe' }, Ordering: { str: 'Identity' }, Supplement: 0 },
      FontDescriptor: desc, DW: 1000, W: warr, CIDToGIDMap: f.cff ? undefined : '/Identity' });
    var tu = W.stream({}, toUnicode(rec.uni), true);
    return W.add({ Type: '/Font', Subtype: '/Type0', BaseFont: name, Encoding: '/Identity-H', DescendantFonts: [cid], ToUnicode: tu });
  }
  function hex4(n) { return ('0000' + n.toString(16)).slice(-4).toUpperCase(); }
  function utf16(cp) { if (cp < 0x10000) return hex4(cp); cp -= 0x10000; return hex4(0xD800 + (cp >> 10)) + hex4(0xDC00 + (cp & 0x3FF)); }
  function toUnicode(uni) {
    var keys = Object.keys(uni).map(Number).sort(function (a, b) { return a - b; }), body = '';
    for (var i = 0; i < keys.length; i += 100) {
      var chunk = keys.slice(i, i + 100);
      body += chunk.length + ' beginbfchar\n' + chunk.map(function (g) { return '<' + hex4(g) + '> <' + utf16(uni[g]) + '>'; }).join('\n') + '\nendbfchar\n';
    }
    return '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
      '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' + body + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  }
})();
