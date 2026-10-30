/* Slop Press — templates (built in code): magazine spread here; flyer, business card and zine in templates2.js. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model, I = PR.items;
  var TP = PR.templates = { defs: {} };
  var mm = U.UNITS.mm;

  /** Runs fn with `doc` temporarily as the open document (layout and rendering read PR.state.doc). */
  PR.withDoc = function (doc, fn) {
    var S = PR.state, prev = S.doc, rev = S.rev;
    S.doc = doc; S.rev = rev + 1e6 + Math.random();
    try { return fn(); } finally { S.doc = prev; S.rev = rev + 1; PR.engine.clear(); }
  };
  /** Procedural artwork (no network): soft gradient blobs, returned as a JPEG data URL. */
  var artCache = {};
  TP.art = function (w, h, palette, seed) {
    var key = [w, h, seed].concat(palette).join(',');
    return artCache[key] || (artCache[key] = drawArt(w, h, palette, seed));
  };
  function drawArt(w, h, palette, seed) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true }), rnd = function () { seed = (seed * 16807 + 11) % 2147483647; return seed / 2147483647; };
    var g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, palette[0]); g.addColorStop(1, palette[1]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 14; i++) {
      var cx = rnd() * w, cy = rnd() * h, r = (0.1 + rnd() * 0.35) * Math.max(w, h), rg = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, palette[2 + (i % (palette.length - 2))]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.globalAlpha = 0.55; x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
    // a friendly slime silhouette
    x.fillStyle = 'rgba(212,255,58,.92)'; x.beginPath();
    var bx = w * 0.62, by = h * 0.72, s = Math.min(w, h) * 0.32;
    x.moveTo(bx, by - s * 1.3); x.bezierCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by - s * 0.2, bx + s, by + s * 0.25); x.arc(bx, by + s * 0.25, s, 0, Math.PI); x.bezierCurveTo(bx - s, by - s * 0.2, bx - s * 0.4, by - s * 0.7, bx, by - s * 1.3); x.fill();
    x.fillStyle = '#0a0a0a';
    [[-0.35, 0.05], [0.35, 0.05]].forEach(function (e) { x.beginPath(); x.ellipse(bx + e[0] * s, by + e[1] * s, s * 0.11, s * 0.16, 0, 0, Math.PI * 2); x.fill(); });
    x.lineWidth = s * 0.06; x.strokeStyle = '#0a0a0a'; x.beginPath(); x.arc(bx, by + s * 0.3, s * 0.25, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    return c.toDataURL('image/jpeg', 0.86);
  }
  /** Helpers used by every template. A template's name and description in the picker are press.tpl.<id>_name / _desc. */
  TP.text = function (doc, items, x, y, w, h, text, ps, extra) { var f = M.item('text', x, y, w, h, extra); I.add(doc, items, f, { text: text, ps: ps, layer: doc.layers[doc.layers.length - 1].id }); return f; };
  TP.shape = function (doc, items, type, x, y, w, h, extra) { var s = M.item(type, x, y, w, h, extra); I.add(doc, items, s, { layer: doc.layers[0].id }); return s; };
  TP.image = function (doc, items, x, y, w, h, url, extra) { var id = U.uid('A'); doc.assets[id] = url; var s = M.item('image', x, y, w, h, U.assign({ asset: id, fit: 'fill' }, extra)); I.add(doc, items, s, { layer: doc.layers[0].id }); return s; };
  TP.thread = function (doc, a, b) { if (b.story !== a.story) delete doc.stories[b.story]; b.story = a.story; a.next = b.id; b.prev = a.id; };
  TP.make = function (id) { var d = TP.defs[id]; if (!d) throw new Error('No template ' + id); return d.make(); };

  var COPY = [
    'Desktop publishing used to need a workstation, a licence server and a font budget. Now it needs a browser tab. Slop Press lays out pages the way print designers expect: spreads with an inside and an outside, master pages that carry the furniture, and text that flows through threaded frames from one page to the next.',
    'Every line here was broken by the paragraph composer, which looks at the whole paragraph before it decides where each line ends. Words are hyphenated with English patterns when the measure is tight, and justified columns keep an even texture from top to bottom.', // i18n-ignore: sample document content
    'Styles do the heavy lifting. Change the body style once and every page reflows; change a master and every folio follows. Wrap text around a picture, nudge a pull quote, and export a PDF with crop marks that a print shop will accept without a phone call.', // i18n-ignore: sample document content
    'Nothing leaves your computer. The document lives in this browser until you save a .slpress file, and the PDF writer, the line breaker and the font subsetter all run right here on the page.']; // i18n-ignore: sample document content
  TP.COPY = COPY;

  TP.defs.magazine = { make: function () {
    var doc = M.create({ name: 'Slop Monthly', pages: 4, facing: true, columns: { count: 2, gutter: 5 * mm }, margins: { top: 20 * mm, bottom: 22 * mm, inside: 18 * mm, outside: 14 * mm } }); // i18n-ignore: sample document content
    doc.layers.push(M.layer('Text', 1)); // i18n-ignore: sample document content
    var ps = doc.styles.para;
    ps['Kicker'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 9, leading: 12, tracking: 120, caps: 'allcaps', color: '#e0245e', spaceAfter: 6, hyphenate: false }; // i18n-ignore: sample document content
    ps['Title'] = { basedOn: 'Heading 1', size: 44, leading: 46, tracking: -25, spaceAfter: 14 }; // i18n-ignore: sample document content
    ps['Deck'] = { basedOn: '[Basic Paragraph]', font: 'Georgia', fontStyle: 'Italic', size: 14, leading: 19, color: '#444444', spaceAfter: 18, hyphenate: false }; // i18n-ignore: sample document content
    ps['Body Drop'] = { basedOn: 'Body First', dropLines: 3, dropChars: 1 }; // i18n-ignore: sample document content
    ps['Cover Title'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 92, leading: 84, tracking: -40, color: '#ffffff', hyphenate: false }; // i18n-ignore: sample document content
    ps['Cover Line'] = { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 16, leading: 19, color: '#ffffff', spaceAfter: 8, hyphenate: false }; // i18n-ignore: sample document content
    var A = doc.masters[0], W = doc.size.w, H = doc.size.h;
    // master: folios + running head on both sides
    A.pages.forEach(function (mp, side) {
      var m = PR.pages.marginsSide(doc, side ? 'right' : 'left');
      var fol = TP.text(doc, mp.items, side ? W - m.right - 120 : m.left, H - 14 * mm, 120, 14, side ? 'Slop Monthly  ·  ' + M.PAGE_NUM : M.PAGE_NUM + '  ·  Slop Monthly', 'Folio'); // i18n-ignore: sample document content
      doc.stories[fol.story].paras[0].ov = { align: side ? 'right' : 'left' };
      TP.shape(doc, mp.items, 'line', m.left, 12 * mm, W - m.left - m.right, 0, { stroke: '#1a1a1a', sw: 0.5 });
    });
    // cover (page 1, no master)
    doc.pages[0].master = null;
    var p1 = doc.pages[0].items, b = doc.bleed.top;
    TP.image(doc, p1, -b, -b, W + 2 * b, H + 2 * b, TP.art(720, 1016, ['#2f1d6b', '#0f8a8a', '#e0245e', '#f5a623', '#3b82f6'], 7));
    TP.text(doc, p1, 14 * mm, 20 * mm, W - 28 * mm, 90 * mm, 'SLOP\nMONTHLY', 'Cover Title'); // i18n-ignore: sample document content
    TP.text(doc, p1, 14 * mm, H - 70 * mm, 90 * mm, 50 * mm, 'The browser is the new print shop\nThreads, masters & styles explained\nWhy your PDF needs crop marks', 'Cover Line'); // i18n-ignore: sample document content
    // feature spread (pages 2–3)
    var mL = PR.pages.marginsSide(doc, 'left'), mR = PR.pages.marginsSide(doc, 'right'), top = mL.top, colH = H - mL.top - mL.bottom;
    var p2 = doc.pages[1].items, p3 = doc.pages[2].items, cw = W - mL.left - mL.right;
    TP.text(doc, p2, mL.left, top, cw, 70 * mm, 'Feature\nSetting type in a browser tab\nHow a page layout engine fits real typography into a few hundred kilobytes of script.', 'Kicker'); // i18n-ignore: sample document content
    var head = doc.stories[p2[p2.length - 1].story]; head.paras[1].ps = 'Title'; head.paras[2].ps = 'Deck'; // i18n-ignore: sample document content
    var t1 = TP.text(doc, p2, mL.left, top + 72 * mm, cw, colH - 72 * mm, COPY.concat(COPY, COPY, COPY, COPY).join('\n'), 'Body', { cols: 2, gutter: 5 * mm }); // i18n-ignore: sample document content
    var st = doc.stories[t1.story]; st.paras[0].ps = 'Body Drop'; // i18n-ignore: sample document content
    var t2 = TP.text(doc, p3, mR.left, top, cw, colH, '', 'Body', { cols: 2, gutter: 5 * mm }); TP.thread(doc, t1, t2); // i18n-ignore: sample document content
    var art = TP.image(doc, p3, mR.left + cw / 2 - 32 * mm, top + 40 * mm, 64 * mm, 64 * mm, TP.art(500, 500, ['#ffd166', '#ef476f', '#06d6a0', '#118ab2'], 3), { radius: 0 });
    var ell = TP.shape(doc, p3, 'ellipse', art.x, art.y, art.w, art.h, { fill: null, stroke: '#1a1a1a', sw: 1.5, wrap: { type: 'contour', off: 5 } }); void ell;
    art.wrap = { type: 'none', off: 0 };
    art.radius = 32 * mm; // rounded corners clip the picture into a circle
    var pq = TP.text(doc, p3, mR.left, top + colH - 48 * mm, cw, 34 * mm, '“The composer looks at the whole paragraph before it decides where a single line ends.”', 'Pull Quote', { wrap: { type: 'box', off: 6 } }); // i18n-ignore: sample document content
    void pq;
    // back page
    var p4 = doc.pages[3].items;
    TP.shape(doc, p4, 'rect', -b, H * 0.55, W + 2 * b, H * 0.45 + b, { fill: '#d4ff3a' });
    TP.text(doc, p4, mL.left, H * 0.62, cw, 60 * mm, 'Print it\nExport a press-ready PDF with bleed, crop marks and embedded fonts — straight from this tab.', 'Title'); // i18n-ignore: sample document content
    doc.stories[p4[p4.length - 1].story].paras[1].ps = 'Deck'; // i18n-ignore: sample document content
    return doc;
  } };
})();
