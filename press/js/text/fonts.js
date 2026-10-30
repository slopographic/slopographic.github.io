/* Slop Press — font registry and measurement.
   Families map to a CSS stack (for the canvas) and a PDF strategy: 'embed' (bundled Liberation Sans or a
   font file the user loaded: embedded and subset) or a standard PDF font (Helvetica/Times/Courier).
   Glyph advances are measured with kerning off, so layout = sum of advances everywhere (canvas, PDF, PNG). */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util;
  var F = PR.fonts = {};
  var VENDOR = (function () {
    var s = document.currentScript && document.currentScript.src;
    try { return s ? new URL('../../../vendor/pdfjs/standard_fonts/', s).href : new URL('../vendor/pdfjs/standard_fonts/', document.baseURI).href; } catch (e) { return '../vendor/pdfjs/standard_fonts/'; }
  })();
  F.STYLES = ['Regular', 'Bold', 'Italic', 'Bold Italic'];
  var LIB = { Regular: 'LiberationSans-Regular.ttf', Bold: 'LiberationSans-Bold.ttf', Italic: 'LiberationSans-Italic.ttf', 'Bold Italic': 'LiberationSans-BoldItalic.ttf' };
  F.FAMILIES = {
    'Liberation Sans': { css: '"Liberation Sans", Arial, Helvetica, sans-serif', std: 'Helvetica', bundled: LIB },
    'Helvetica': { css: 'Helvetica, Arial, "Liberation Sans", sans-serif', std: 'Helvetica' },
    'Arial': { css: 'Arial, Helvetica, "Liberation Sans", sans-serif', std: 'Helvetica' },
    'Verdana': { css: 'Verdana, "DejaVu Sans", sans-serif', std: 'Helvetica' },
    'Trebuchet MS': { css: '"Trebuchet MS", "DejaVu Sans", sans-serif', std: 'Helvetica' },
    'System UI': { css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', std: 'Helvetica' },
    'Times': { css: '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif', std: 'Times' },
    'Georgia': { css: 'Georgia, "Times New Roman", "Liberation Serif", serif', std: 'Times' },
    'Palatino': { css: '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", serif', std: 'Times' },
    'Garamond': { css: 'Garamond, "EB Garamond", "Times New Roman", serif', std: 'Times' },
    'Courier': { css: '"Courier New", Courier, "Liberation Mono", monospace', std: 'Courier' },
    'Impact': { css: 'Impact, "Arial Black", "Liberation Sans", sans-serif', std: 'Helvetica', bold: true },
    // self-hosted OFL web fonts (shared/fonts): on screen as designed; PDF export substitutes a standard font
    'Archivo': { css: '"Archivo", "Liberation Sans", sans-serif', std: 'Helvetica', web: true },
    'Inter Tight': { css: '"Inter Tight", "Liberation Sans", sans-serif', std: 'Helvetica', web: true },
    'Instrument Serif': { css: '"Instrument Serif", Georgia, serif', std: 'Times', web: true },
    'JetBrains Mono': { css: '"JetBrains Mono", "Courier New", monospace', std: 'Courier', web: true },
    'Caveat': { css: '"Caveat", cursive', std: 'Times', web: true },
    'Dancing Script': { css: '"Dancing Script", cursive', std: 'Times', web: true },
    'Great Vibes': { css: '"Great Vibes", cursive', std: 'Times', web: true }
  };
  /** Families whose PDF output is a substitute (no font file to embed). */
  F.substituted = function (name) { var f = F.family(name); return !f.bundled && !(F.user[name]); };
  /** User fonts: family → { style → { asset, face } } (from doc.fonts). Built-in families are F.FAMILIES only. */
  F.user = {};
  F.isBold = function (style) { return /bold|black|heavy/i.test(style || ''); };
  F.isItalic = function (style) { return /italic|oblique/i.test(style || ''); };
  F.family = function (name) { return F.FAMILIES[name] || (F.user[name] && { css: '"' + name + '", sans-serif', std: 'Helvetica', user: true }) || F.FAMILIES['Liberation Sans']; };
  F.list = function () { return Object.keys(F.FAMILIES).concat(Object.keys(F.user).filter(function (k) { return !F.FAMILIES[k]; })); };
  /** Canvas font string at a given size. */
  F.css = function (family, style, size) {
    var fam = F.family(family);
    return (F.isItalic(style) ? 'italic ' : '') + (F.isBold(style) || fam.bold ? '700 ' : '400 ') + size + 'px ' + fam.css;
  };

  /* ---------- measurement ---------- */
  var mctx = null, widths = {}, metrics = {};
  function ctx() {
    if (!mctx) { var c = document.createElement('canvas'); c.width = c.height = 4; mctx = c.getContext('2d'); }
    return mctx;
  }
  var REF = 100;
  function setFont(key) { var c = ctx(), p = key.split('|'); c.font = F.css(p[0], p[1], REF); c.fontKerning = 'none'; return c; }
  F.key = function (family, style) { return (family || 'Liberation Sans') + '|' + (style || 'Regular'); };
  /** Advance of one character at size 1 (em fraction). */
  F.adv = function (key, ch) {
    var t = widths[key] || (widths[key] = {});
    var w = t[ch];
    if (w === undefined) { w = t[ch] = setFont(key).measureText(ch).width / REF; }
    return w;
  };
  /** Ascent, descent, cap height, x-height as em fractions. */
  F.metrics = function (key) {
    var m = metrics[key];
    if (m) return m;
    var c = setFont(key), a = c.measureText('Hxgjpqy'), h = c.measureText('H'), x = c.measureText('x');
    var asc = a.fontBoundingBoxAscent != null ? a.fontBoundingBoxAscent / REF : 0.9, desc = a.fontBoundingBoxDescent != null ? a.fontBoundingBoxDescent / REF : 0.22;
    m = { asc: Math.min(asc, 1.1), desc: Math.min(desc, 0.5), cap: (h.actualBoundingBoxAscent || 72) / REF, xh: (x.actualBoundingBoxAscent || 52) / REF };
    return (metrics[key] = m);
  };
  F.clear = function () { widths = {}; metrics = {}; };

  /* ---------- loading ---------- */
  var faces = {}, bytesCache = {};
  F.fontURL = function (file) { return (PR.offline && PR.offline.fontURL && PR.offline.fontURL(file)) || VENDOR + file; };
  function addFace(family, style, src) {
    var k = family + '|' + style;
    if (faces[k]) return faces[k];
    if (!window.FontFace) return Promise.resolve(null);
    var face = new FontFace(family, src, { weight: F.isBold(style) ? '700' : '400', style: F.isItalic(style) ? 'italic' : 'normal' });
    faces[k] = face.load().then(function (f) { document.fonts.add(f); F.clear(); PR.emit('fonts'); return f; }).catch(function (e) { console.warn('Font failed', family, style, e && e.message); return null; });
    return faces[k];
  };
  /** Loads the bundled Liberation Sans faces (they are also what PDF export embeds). */
  F.loadBundled = function () {
    return Promise.all(F.STYLES.map(function (st) { return addFace('Liberation Sans', st, 'url("' + F.fontURL(LIB[st]) + '")'); }));
  };
  /** Registers a font file the user loaded (asset = data URL in doc.assets). */
  F.registerUser = function (doc, rec) {
    var url = doc.assets[rec.asset]; if (!url) return Promise.resolve(null);
    F.user[rec.family] = F.user[rec.family] || {};
    F.user[rec.family][rec.style] = { asset: rec.asset };
    var bin = U.dataURLToBytes(url).bytes;
    return addFace(rec.family, rec.style, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  };
  F.registerDoc = function (doc) { return Promise.all((doc.fonts || []).map(function (r) { return F.registerUser(doc, r); })); };
  /** Reads a font file and adds it to the document (as the family name given, when a font is dropped on a missing family). Returns the family name. */
  F.addFile = function (doc, file, name) {
    return file.arrayBuffer().then(function (buf) {
      var info = PR.ttf ? PR.ttf.names(new Uint8Array(buf)) : null;
      var family = name || (info && info.family) || file.name.replace(/\.[^.]+$/, '').replace(/[-_](Regular|Bold|Italic|BoldItalic)$/i, '');
      var sub = (info && info.subfamily) || 'Regular', style = F.isBold(sub) ? (F.isItalic(sub) ? 'Bold Italic' : 'Bold') : F.isItalic(sub) ? 'Italic' : 'Regular';
      var asset = U.uid('A');
      doc.assets[asset] = U.bytesToDataURL(new Uint8Array(buf), /otf$/i.test(file.name) ? 'font/otf' : 'font/ttf');
      doc.fonts = (doc.fonts || []).filter(function (r) { return !(r.family === family && r.style === style); });
      doc.fonts.push({ family: family, style: style, asset: asset, file: file.name });
      return F.registerUser(doc, doc.fonts[doc.fonts.length - 1]).then(function () { return family; });
    });
  };
  /** Raw font bytes for PDF embedding (bundled or user), or null if only a system font is available. */
  F.bytes = function (doc, family, style) {
    var fam = F.family(family);
    if (F.user[family]) {
      var u = F.user[family][style] || F.user[family].Regular || F.user[family][Object.keys(F.user[family])[0]];
      return Promise.resolve(u && doc.assets[u.asset] ? U.dataURLToBytes(doc.assets[u.asset]).bytes : null);
    }
    if (!fam.bundled) return Promise.resolve(null);
    var file = fam.bundled[style] || fam.bundled.Regular;
    if (!bytesCache[file]) bytesCache[file] = fetch(F.fontURL(file)).then(function (r) { if (!r.ok) throw new Error('font ' + r.status); return r.arrayBuffer(); })
      .then(function (b) { return new Uint8Array(b); }).catch(function () { delete bytesCache[file]; return null; });
    return bytesCache[file];
  };
  /** Waits until every face used by the document is ready (layout must not measure fallback fonts). */
  F.ready = function (doc) {
    var used = {};
    Object.keys(doc.styles.para).forEach(function (k) { var s = doc.styles.para[k]; if (s.font) used[F.key(s.font, s.fontStyle || 'Regular')] = 1; });
    var loads = Object.keys(used).map(function (k) { var p = k.split('|'); return document.fonts ? document.fonts.load(F.css(p[0], p[1], 12)).catch(function () { return null; }) : null; });
    return Promise.all([F.loadBundled(), F.registerDoc(doc)].concat(loads)).then(function () { F.clear(); });
  };
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { F.clear(); PR.emit('fonts'); });
})();
