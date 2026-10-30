/* Slop Slides: the font registry. Each face is a static TTF in slides/fonts/, loaded once as bytes, registered
   with the browser as its own family ("SSF-<file>") and parsed for metrics. Layout measures with the TTF tables,
   the canvas draws with the same file (kerning off), and the PDF embeds a subset of the same file.
   Families the deck names but we do not ship (Calibri, Arial, Georgia…) are substituted by kind. */
(function () {
  'use strict';
  var SS = window.SS, T = SS.ttf;
  var F = SS.fonts = {};
  F.BASE = new URL('../../fonts/', (document.currentScript && document.currentScript.src) || location.href).href;
  F.FAMILIES = {
    'Inter Tight': { regular: 'InterTight-Regular', bold: 'InterTight-Bold', kind: 'sans' }, // i18n-ignore
    'Archivo': { regular: 'Archivo-Regular', bold: 'Archivo-ExtraBold', kind: 'sans' }, // i18n-ignore
    'Instrument Serif': { regular: 'InstrumentSerif-Regular', italic: 'InstrumentSerif-Italic', kind: 'serif' }, // i18n-ignore
    'JetBrains Mono': { regular: 'JetBrainsMono-Regular', bold: 'JetBrainsMono-SemiBold', kind: 'mono' }, // i18n-ignore
    'Caveat': { regular: 'Caveat-Regular', kind: 'hand' } // i18n-ignore
  };
  F.LIST = Object.keys(F.FAMILIES);
  var faces = {}, ready = false, loading = null;

  /** Maps any family name to one we ship. */
  F.family = function (name) {
    if (F.FAMILIES[name]) return name;
    var n = String(name || '').toLowerCase();
    if (/mono|courier|consol|code|menlo/.test(n)) return 'JetBrains Mono'; // i18n-ignore
    if (/serif|times|georgia|garamond|baskerville|cambria|palatino|didot|playfair|merriweather|book/.test(n) && !/sans/.test(n)) return 'Instrument Serif'; // i18n-ignore
    if (/hand|script|caveat|comic|marker|brush/.test(n)) return 'Caveat'; // i18n-ignore
    if (/archivo|impact|black|display|oswald|bebas/.test(n)) return 'Archivo'; // i18n-ignore
    return 'Inter Tight'; // i18n-ignore
  };
  /** Resolves family + bold/italic to a face, noting what has to be synthesised. */
  F.face = function (family, bold, italic) {
    var fam = F.FAMILIES[F.family(family)];
    var key = (italic && fam.italic) ? fam.italic : (bold && fam.bold) ? fam.bold : fam.regular;
    return { key: key, css: 'SSF-' + key, font: faces[key] && faces[key].font, synthItalic: !!italic && !(fam.italic && key === fam.italic), synthBold: !!bold && !fam.bold };
  };
  F.isReady = function () { return ready; };

  /** Adds a font the person owns to the deck's fonts: TrueType bytes (one face: bold and italic are synthesised). Parsed first, so a
   * file the engine cannot read throws before anything changes. A name a shipped family uses is refused; adding a name again
   * replaces its file. The face is registered with the browser in the background, and the canvas is redrawn when it is loaded. */
  var ownN = 0;
  F.addUser = function (name, u8, data) {
    var label = String(name || '').trim();
    if (!label) throw new Error('That font has no family name.');
    if (F.FAMILIES[label] && !F.FAMILIES[label].user) throw new Error(label + ' is a built-in family');
    var font = T.parse(u8);
    if (!F.FAMILIES[label]) F.LIST.push(label);
    var key = 'own-' + (++ownN), d = F.FAMILIES[label] = { regular: key, kind: 'sans', user: true, data: data || null };
    faces[key] = { key: key, u8: u8, font: font };
    var ff = new FontFace('SSF-' + key, u8.slice().buffer), gf = new FontFace('SSG-' + key, u8.slice().buffer);
    document.fonts.add(ff); document.fonts.add(gf);
    return Promise.all([ff.load(), gf.load()]).then(function () { if (SS.app) SS.app.emit('render'); }, function (e) { console.warn('Slop Slides: ' + label + ' did not load', e); }); // i18n-ignore
  };
  /** Registers the fonts a deck keeps in its file (deck.fonts: [{ family, file, data }]). A font already registered from the same data is
   * left alone, so a deck that is read again costs nothing. */
  F.registerDeck = function (deck) {
    (deck.fonts || []).forEach(function (r) {
      var have = F.FAMILIES[r.family];
      if (have && have.user && have.data === r.data) return;
      try { F.addUser(r.family, SS.util.dataUrlToU8(r.data), r.data); } catch (e) { console.warn('Slop Slides: ' + r.family + ' is not used: ' + e.message); } // i18n-ignore
    });
  };

  /** Loads every face. `src(key)` may supply bytes (the offline build does); otherwise they are fetched. */
  F.load = function (src) {
    if (loading) return loading;
    var keys = [], familyOfKey = {};
    F.LIST.forEach(function (f) { var d = F.FAMILIES[f]; [d.regular, d.bold, d.italic].forEach(function (k) { if (k && keys.indexOf(k) < 0) { keys.push(k); familyOfKey[k] = f; } }); });
    loading = Promise.all(keys.map(function (k) {
      var p = src && src(k) ? Promise.resolve(src(k)) : fetch(F.BASE + k + '.ttf').then(function (r) { if (!r.ok) throw new Error('Font ' + k + ' ' + r.status); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); });
      return p.then(function (u8) {
        var font = T.parse(u8);
        faces[k] = { key: k, u8: u8, font: font };
        var ff = new FontFace('SSF-' + k, u8.slice().buffer);
        document.fonts.add(ff);
        // the same file again under the family name with weight/style descriptors, for DOM text (the editor)
        var fam = familyOfKey[k], d = F.FAMILIES[fam];
        var gf = new FontFace('SSG-' + fam, u8.slice().buffer, { weight: k === d.bold ? '700' : '400', style: k === d.italic ? 'italic' : 'normal' });
        document.fonts.add(gf);
        return Promise.all([ff.load(), gf.load()]).catch(function () { /* metrics still work */ });
      });
    })).then(function () { ready = true; });
    return loading;
  };
  F.bytes = function (key) { return faces[key] && faces[key].u8; };
  F.parsed = function (key) { return faces[key] && faces[key].font; };

  var mctx = null, fallbacks = [], fbCss = 'sans-serif';
  /** A language font now in this browser (a Noto pack the PDF export downloaded): the canvas and measuring use it for the
   * characters the slide faces lack, so the screen and the PDF set them in the same font. */
  F.addFallback = function (family) {
    if (!family || fallbacks.indexOf(family) >= 0) return;
    fallbacks.push(family);
    fbCss = fallbacks.map(function (f) { return '"' + f.replace(/"/g, '') + '"'; }).concat(['sans-serif']).join(', ');
    if (SS.app && SS.app.emit) SS.app.emit('render');
  };
  function fallbackWidth(ch, size) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = '100px ' + fbCss;
    return mctx.measureText(ch).width * size / 100;
  }
  /** Width in points of `s` at `size` pt in the given face (from F.face). Unknown glyphs use a system font. */
  F.measure = function (face, s, size, letterSpacing) {
    var f = face.font || F.parsed(face.key), w = 0, ls = letterSpacing || 0;
    if (!f) return fallbackWidth(s, size);
    for (var i = 0; i < s.length; i++) {
      var cp = s.codePointAt(i), ch = String.fromCodePoint(cp); if (cp > 0xFFFF) i++;
      var g = f.cmap.get(cp);
      w += (g ? f.adv[g] * size / f.upm : fallbackWidth(ch, size)) + ls;
    }
    return w;
  };
  /** Vertical metrics in points for a face at size: ascent, descent (positive), cap height. */
  F.vmetrics = function (face, size) {
    var f = face.font || F.parsed(face.key);
    if (!f) return { ascent: size * 0.92, descent: size * 0.24, cap: size * 0.7 };
    return { ascent: f.ascent * size / f.upm, descent: -f.descent * size / f.upm, cap: f.capHeight * size / f.upm };
  };
  /** CSS font string for canvas. Sizes are in canvas units (the caller scales the context). */
  /** CSS font-family for DOM text in a family (bold/italic come from font-weight/font-style). */
  F.domFamily = function (family) { var f = F.family(family), d = F.FAMILIES[f]; return '"SSG-' + (d.user ? d.regular : f) + '", ' + (d.kind === 'serif' ? 'serif' : d.kind === 'mono' ? 'monospace' : 'sans-serif'); };
  F.css = function (face, size) { return size + 'px "' + face.css + '", ' + fbCss; };
})();
