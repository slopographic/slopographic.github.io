/* Slop PDF — the built-in sample document, generated with pdf-lib (includes a fillable form). Its words come from the
 * brand profile's tone (the TONE marker below, set by the white-label build): playful is "Sloppo's Guide to Goo", plain is a
 * neutral four-page sample with the same layout, form fields and page sizes. E.sampleInfo: its file name and busy line.
 * E.makeSample(tone?) makes it in the profile's tone, or the one asked for. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var TONE = /*profile:tone*/'playful';
  var TEXT = {
    playful: {
      file: "Sloppo's Guide to Goo.pdf", slug: 'sloppos-guide-to-goo.pdf', busy: 'pdf.io.sample_busy_playful', // i18n-ignore: sample document content
      footer: 'SLOPOGRAPHIC · FIELD MANUAL Nº 001', kicker: 'FIELD MANUAL Nº 001', title: ["Sloppo's Guide", 'to Goo'], // i18n-ignore: sample document content
      sub: 'Everything a well-adjusted slime needs to know.', badge: 'SLOPOGRAPHIC', // i18n-ignore: sample document content
      h2: 'What is goo?', p2: ['Goo is any substance that is too thick to pour politely and too thin to stack. Scientists call it a non-Newtonian fluid. Sloppo calls it home, lunch and, on Sundays, a bed.', // i18n-ignore: sample document content
        'This guide covers the four classical goos, how to store them, and what to do when your goo develops opinions. Use the Slop PDF editor to reorder, rotate, sign or stamp these pages: everything happens in your browser.'], // i18n-ignore: sample document content
      chart: 'Viscosity by goo type', bars: ['Lime slime', 'Pink ooze', 'Blue gel', 'Grey sludge'], fig: 'Fig. 1 — Sloppo, at rest.', // i18n-ignore: sample document content
      h3: 'The goo spectrum', swatches: [['LIME', 'Classic. Glows faintly.'], ['BUBBLEGUM', 'Sticky. Smells of 1997.'], ['GLACIER', 'Cold, polite, wobbly.'], ['MARMALADE', 'Bitter. Rare. Prized.']], // i18n-ignore: sample document content
      h4: 'Goo licence application', fields: ['Applicant name', 'Favourite goo'], grade: ['Goo grade', 'Starter slime', 'Advanced ooze', 'Master of muck'], // i18n-ignore: sample document content
      agree: 'I promise to keep my goo hydrated and never feed it after midnight.', // i18n-ignore: sample document content
      meta: ["Sloppo's Guide to Goo", 'Sloppo', 'A Slopographic field manual', ['goo', 'slime', 'slopographic']], // i18n-ignore: sample document content
      shape: 'M100 0C100 0 30 78 30 122a70 70 0 0 0 140 0C170 78 100 0 100 0z', colors: [[0.831, 1, 0.227], [1, 0.37, 0.64], [0.22, 0.84, 1], [1, 0.62, 0.11], [0.945, 0.929, 0.894], [0.45, 0.6, 0]],
    },
    plain: {
      file: 'Sample PDF.pdf', slug: 'sample.pdf', busy: 'pdf.io.sample_busy_plain', // i18n-ignore: sample document content
      footer: 'SAMPLE DOCUMENT · Nº 001', kicker: 'SAMPLE DOCUMENT', title: ['A Short Guide', 'to PDF Editing'], // i18n-ignore: sample document content
      sub: 'Four pages to try the editor on.', badge: 'SAMPLE', // i18n-ignore: sample document content
      h2: 'What is in this file?', p2: ['This sample has four pages: a cover, a page of text with a chart, a landscape page and a fillable form. Nothing in it is real, so change anything you like.', // i18n-ignore: sample document content
        'Reorder, rotate, sign or stamp these pages, fill in the form or add text. Everything happens in your browser, and the file never leaves your device.'], // i18n-ignore: sample document content
      chart: 'Time saved by task', bars: ['Merging', 'Signing', 'Filling forms', 'Redacting'], fig: 'Fig. 1 — A shape drawn as vectors.', // i18n-ignore: sample document content
      h3: 'Colour swatches', swatches: [['OCEAN', 'Deep and calm.'], ['CORAL', 'Warm and bright.'], ['FOREST', 'Steady and green.'], ['AMBER', 'Bold and sunny.']], // i18n-ignore: sample document content
      h4: 'Membership application', fields: ['Applicant name', 'Department'], grade: ['Membership level', 'Basic', 'Standard', 'Premium'], // i18n-ignore: sample document content
      agree: 'I agree to the terms of membership.', // i18n-ignore: sample document content
      meta: ['Sample PDF', '', 'A sample document', ['sample', 'pdf']], // i18n-ignore: sample document content
      shape: 'M40 0h80l50 50v150H40z', colors: [[0.15, 0.39, 0.92], [0.96, 0.45, 0.36], [0.05, 0.58, 0.53], [0.96, 0.62, 0.04], [0.95, 0.96, 0.97], [0.15, 0.39, 0.92]],
    },
  };
  var X0 = TEXT[TONE] || TEXT.playful;
  // the busy line is UI (a key, read when shown); the file name and the words of the document are its content
  E.sampleInfo = { file: X0.file, slug: X0.slug, get busy() { return U.t(X0.busy); } };

  /* --------------------------------------------------------- sample PDF */
  /** tone: 'playful' or 'plain' for that wording (tests that read the sample's lines ask for one); default the profile's. */
  E.makeSample = async function (tone) {
    var X = (tone && TEXT[tone]) || X0;
    await E.libs();
    var L = PDFLib, doc = await L.PDFDocument.create();
    var H = doc.embedStandardFont(L.StandardFonts.HelveticaBold), R = doc.embedStandardFont(L.StandardFonts.Helvetica), T = doc.embedStandardFont(L.StandardFonts.TimesRomanItalic);
    var K = X.colors.map(function (c) { return L.rgb(c[0], c[1], c[2]); });
    var ink = L.rgb(0.04, 0.04, 0.04), lime = K[0], pink = K[1], cyan = K[2], bone = K[4], grey = L.rgb(0.35, 0.35, 0.35);
    var blob = X.shape;
    function para(pg, text, x, y, w, size, font, color) {
      var words = text.split(' '), line = '', lh = size * 1.45;
      words.forEach(function (wd) {
        var test = line ? line + ' ' + wd : wd;
        if (font.widthOfTextAtSize(test, size) > w && line) { pg.drawText(line, { x: x, y: y, size: size, font: font, color: color }); y -= lh; line = wd; } else line = test;
      });
      if (line) { pg.drawText(line, { x: x, y: y, size: size, font: font, color: color }); y -= lh; }
      return y;
    }
    function footer(pg, n) {
      pg.drawText(X.footer, { x: 56, y: 30, size: 7.5, font: H, color: grey });
      pg.drawText(String(n), { x: pg.getWidth() - 64, y: 30, size: 9, font: H, color: grey });
    }
    // 1 — cover
    var p1 = doc.addPage(E.SIZES.a4);
    p1.drawRectangle({ x: 0, y: 0, width: p1.getWidth(), height: p1.getHeight(), color: ink });
    p1.drawSvgPath(blob, { x: 330, y: 760, scale: 1.6, color: lime });
    p1.drawSvgPath('M60 140a40 40 0 0 0 32 39', { x: 330, y: 760, scale: 1.6, borderColor: L.rgb(1, 1, 1), borderWidth: 6, borderLineCap: L.LineCapStyle.Round, borderOpacity: 0.85 });
    p1.drawCircle({ x: 120, y: 420, size: 26, color: pink }); p1.drawCircle({ x: 175, y: 470, size: 12, color: cyan }); p1.drawCircle({ x: 92, y: 488, size: 7, color: lime });
    p1.drawText(X.kicker, { x: 56, y: 330, size: 11, font: H, color: lime });
    p1.drawText(X.title[0], { x: 56, y: 270, size: 50, font: H, color: bone });
    p1.drawText(X.title[1], { x: 56, y: 214, size: 50, font: H, color: bone });
    p1.drawText(X.sub, { x: 56, y: 172, size: 16, font: T, color: bone });
    p1.drawRectangle({ x: 56, y: 96, width: 140, height: 26, color: lime });
    p1.drawText(X.badge, { x: 66, y: 104, size: 11, font: H, color: ink });
    // 2 — what is goo
    var p2 = doc.addPage(E.SIZES.a4);
    p2.drawRectangle({ x: 0, y: 0, width: p2.getWidth(), height: p2.getHeight(), color: bone });
    p2.drawText('01', { x: 56, y: 760, size: 13, font: H, color: pink });
    p2.drawText(X.h2, { x: 56, y: 722, size: 34, font: H, color: ink });
    var y = para(p2, X.p2[0], 56, 680, 483, 12.5, R, ink);
    y = para(p2, X.p2[1], 56, y - 10, 483, 12.5, R, ink);
    p2.drawText(X.chart, { x: 56, y: y - 34, size: 15, font: H, color: ink });
    var bars = [[X.bars[0], 0.92, lime], [X.bars[1], 0.64, pink], [X.bars[2], 0.41, cyan], [X.bars[3], 0.78, grey]], by = y - 70;
    bars.forEach(function (b) {
      p2.drawText(b[0], { x: 56, y: by + 5, size: 11, font: R, color: ink });
      p2.drawRectangle({ x: 160, y: by, width: 360, height: 20, color: L.rgb(0.88, 0.86, 0.81) });
      p2.drawRectangle({ x: 160, y: by, width: 360 * b[1], height: 20, color: b[2] });
      p2.drawText(Math.round(b[1] * 100) + '%', { x: 165 + 360 * b[1] - 34, y: by + 6, size: 9, font: H, color: ink });
      by -= 34;
    });
    p2.drawSvgPath(blob, { x: 420, y: by - 10, scale: 0.55, color: lime, borderColor: ink, borderWidth: 3 });
    p2.drawText(X.fig, { x: 56, y: by - 60, size: 11, font: T, color: grey });
    footer(p2, 2);
    // 3 — the goo spectrum (landscape)
    var p3 = doc.addPage([841.89, 595.28]);
    p3.drawRectangle({ x: 0, y: 0, width: p3.getWidth(), height: p3.getHeight(), color: L.rgb(1, 1, 1) });
    p3.drawText('02', { x: 56, y: 530, size: 13, font: H, color: cyan });
    p3.drawText(X.h3, { x: 56, y: 494, size: 34, font: H, color: ink });
    para(p3, 'A landscape page, so you can try rotating it in the organizer. Each swatch below is a vector shape: zoom in all you like.', 56, 458, 700, 12.5, R, grey); // i18n-ignore: sample document content
    var sw = [lime, pink, cyan, K[3]].map(function (c, i) { return [c, X.swatches[i][0], X.swatches[i][1]]; });
    sw.forEach(function (s, i) {
      var x = 56 + i * 186;
      p3.drawRectangle({ x: x, y: 230, width: 170, height: 170, color: s[0] });
      p3.drawCircle({ x: x + 120, y: 350, size: 22, color: L.rgb(1, 1, 1), opacity: 0.55 });
      p3.drawText(s[1], { x: x, y: 204, size: 13, font: H, color: ink });
      p3.drawText(s[2], { x: x, y: 186, size: 10.5, font: R, color: grey });
    });
    p3.drawLine({ start: { x: 56, y: 140 }, end: { x: 786, y: 140 }, thickness: 2, color: ink, dashArray: [6, 6] });
    p3.drawText('Warmer  >>', { x: 720, y: 120, size: 10, font: H, color: ink }); // i18n-ignore: sample document content
    footer(p3, 3);
    // 4 — license form
    var p4 = doc.addPage(E.SIZES.a4);
    p4.drawRectangle({ x: 0, y: 0, width: p4.getWidth(), height: p4.getHeight(), color: bone });
    p4.drawText('03', { x: 56, y: 760, size: 13, font: H, color: K[5] });
    p4.drawText(X.h4, { x: 56, y: 722, size: 30, font: H, color: ink });
    para(p4, 'A real fillable form. Open the Forms tool to fill it in, then sign it with the Sign tool.', 56, 690, 483, 12, R, grey); // i18n-ignore: sample document content
    var form = doc.getForm();
    var labels = [[X.fields[0], 'applicant', 620], [X.fields[1], 'favourite', 560]];
    labels.forEach(function (l) {
      p4.drawText(l[0], { x: 56, y: l[2] + 30, size: 10, font: H, color: ink });
      var tf = form.createTextField(l[1]);
      tf.addToPage(p4, { x: 56, y: l[2], width: 483, height: 24, borderColor: ink, borderWidth: 1, backgroundColor: L.rgb(1, 1, 1) });
    });
    p4.drawText(X.grade[0], { x: 56, y: 530, size: 10, font: H, color: ink });
    var dd = form.createDropdown('grade');
    dd.addOptions(X.grade.slice(1));
    dd.addToPage(p4, { x: 56, y: 500, width: 220, height: 24, borderColor: ink, borderWidth: 1, backgroundColor: L.rgb(1, 1, 1) });
    var cb = form.createCheckBox('agree');
    cb.addToPage(p4, { x: 56, y: 450, width: 16, height: 16, borderColor: ink, borderWidth: 1, backgroundColor: L.rgb(1, 1, 1) });
    p4.drawText(X.agree, { x: 82, y: 454, size: 11, font: R, color: ink });
    p4.drawLine({ start: { x: 56, y: 330 }, end: { x: 300, y: 330 }, thickness: 1, color: ink });
    p4.drawText('Signature', { x: 56, y: 314, size: 9, font: H, color: grey }); // i18n-ignore: sample document content
    p4.drawLine({ start: { x: 340, y: 330 }, end: { x: 539, y: 330 }, thickness: 1, color: ink });
    p4.drawText('Date', { x: 340, y: 314, size: 9, font: H, color: grey }); // i18n-ignore: sample document content
    p4.drawSvgPath(blob, { x: 470, y: 250, scale: 0.4, color: pink });
    footer(p4, 4);
    form.updateFieldAppearances(R);
    doc.setTitle(X.meta[0]); doc.setAuthor(X.meta[1]); doc.setSubject(X.meta[2]); doc.setKeywords(X.meta[3]);
    doc.setProducer('Slop PDF · slopographic.com/pdf'); doc.setCreator('Slop PDF'); // i18n-ignore: sample document content
    return doc.save();
  };
})();
