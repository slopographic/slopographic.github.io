/* Slop Scan for the assistant: SlopCmd commands with argument schemas (the AI panel, Ctrl+K, macros and WebMCP), loaded
 * by SlopCmd.prepare() (commands.js). The work is the page's own (SlopScan.pages, io, render), so the assistant and the
 * buttons do the same thing.
 *   new_scan          start again: no pages, and the PDF's settings (page size, margins, quality, name, searchable text)
 *   add_photo         a photo from Slop Drive (name or id), or the sample, as a new page; its edges are found
 *   set_page_style    the look of a page (or every page): original, color, gray, bw, photo; brightness and contrast
 *   set_corners       a page's corners, 0..1 of the photo (top-left, top-right, bottom-right, bottom-left), or find them again
 *   rotate_page       quarter turns; move_page, remove_page
 *   export_pdf        download the PDF, save it to Slop Drive, or open it in Slop PDF */
(function () {
  'use strict';
  const C = window.SlopCmd, S = window.SlopScan;
  if (!C || C.get('scan.ai.new-scan')) return;
  const add = C.aiAdder('scan');   // shared/commands/commands.js
  const L = S.pages, STYLES = S.filters.STYLES;
  const PAGE = { name: 'page', type: 'number', min: 1, max: 500, integer: true, description: 'the page number (1 = first); empty: the page shown' };
  const pageOf = (n) => {
    const p = n ? L.all()[n - 1] : L.current();
    if (!p) throw new Error(L.size() ? `There is no page ${n}: the scan has ${L.size()}` : 'There are no pages: add_photo first');
    return p;
  };
  const describe = (p) => `page ${L.index(p.id) + 1}: ${p.style}${p.turn ? `, turned ${p.turn * 90}°` : ''}${p.found ? '' : ', edges not found (whole photo)'}`;
  const DOC = [
    { name: 'size', type: 'enum', values: ['auto', 'a4', 'letter'], description: 'page size: auto keeps each scan\'s shape' },   // i18n-ignore: for the assistant (English: API)
    { name: 'margin', type: 'enum', values: Object.keys(S.page.MARGINS), description: 'white margin around each scan' },   // i18n-ignore: for the assistant (English: API)
    { name: 'quality', type: 'number', min: 30, max: 95, integer: true, description: 'JPEG quality, %' },   // i18n-ignore: for the assistant (English: API)
    { name: 'filename', type: 'string', maxLength: 120, description: 'the PDF\'s name' },   // i18n-ignore: for the assistant (English: API)
    { name: 'ocr', type: 'boolean', description: 'searchable text: read each page with OCR (needs the OCR model on this device)' },   // i18n-ignore: for the assistant (English: API)
  ];
  const docPatch = (a) => {
    const o = {};
    if (a.size) o.size = a.size;
    if (a.margin) o.margin = a.margin;
    if (a.quality != null && a.quality !== '') o.quality = a.quality / 100;
    if (a.filename != null) o.name = a.filename;
    if (a.ocr != null) o.ocr = !!a.ocr;
    return o;
  };

  C.register([
    add('new_scan', 'Start a new scan', DOC, (a) => {
      L.clear();
      L.setDoc(docPatch(a));
      return 'Ready: no pages yet. Add photos (add_photo), or ask the person to press Take photo.';
    }, { destructive: true, description: 'Removes every page and sets the PDF\'s settings. The camera needs the person: ask them to press Take photo.' }),   // i18n-ignore: for the assistant (English: API)
    add('add_photo', 'Add a photo as a page', [{ name: 'file', type: 'string', maxLength: 300, description: 'Slop Drive name or id of a photo' },   // i18n-ignore: for the assistant (English: API)
      { name: 'sample', type: 'boolean', description: 'the sample photo instead (a letter on a desk)' }], async (a) => {   // i18n-ignore: for the assistant (English: API)
      const files = a.sample || !a.file ? await S.sample(1) : [await window.SlopCmdSources.driveAsFile(a.file)];
      for (const f of files) await S.io.take(f, {});
      S.app.added();
      const p = L.current();
      return `Added ${describe(p)}. The scan has ${L.size()} page${L.size() === 1 ? '' : 's'}.`;
    }),
    add('set_page_style', 'Set a page\'s look', [PAGE, { name: 'style', type: 'enum', values: STYLES, description: 'original; color (enhanced: white paper, more contrast); gray; bw (black and white, shadows removed); photo (light touch)' },
      { name: 'brightness', type: 'number', min: -100, max: 100, integer: true }, { name: 'contrast', type: 'number', min: -100, max: 100, integer: true },
      { name: 'all', type: 'boolean', description: 'every page' }], (a) => {   // i18n-ignore: for the assistant (English: API)
      const p = pageOf(a.page), patch = {};
      if (a.style) patch.style = a.style;
      if (a.brightness != null && a.brightness !== '') patch.brightness = a.brightness;
      if (a.contrast != null && a.contrast !== '') patch.contrast = a.contrast;
      L.set(p.id, patch);
      if (a.all) L.applyAll(p.id);
      return a.all ? `Every page is now ${p.style}.` : `Set ${describe(p)}.`;
    }),
    add('set_corners', 'Set a page\'s corners', [PAGE, { name: 'corners', type: 'array', maxItems: 4, items: { type: 'array', items: { type: 'number' } }, description: 'four [x, y] pairs 0..1 of the photo: top-left, top-right, bottom-right, bottom-left' },   // i18n-ignore: for the assistant (English: API)
      { name: 'detect', type: 'boolean', description: 'find the edges again instead' }], (a) => {   // i18n-ignore: for the assistant (English: API)
      const p = pageOf(a.page);
      if (a.detect || !a.corners) { const d = S.render.detect(p.photo); L.set(p.id, { quad: d.quad, found: d.found }); return d.found ? 'Edges found.' : 'No edges found: the whole photo is used.'; }
      const q = a.corners.map((c) => ({ x: Number(c[0]), y: Number(c[1]) }));
      if (q.length !== 4 || q.some((c) => !(c.x >= 0 && c.x <= 1 && c.y >= 0 && c.y <= 1))) throw new Error('Give four [x, y] pairs between 0 and 1');
      const o = S.geom.order(q);
      if (!S.geom.convex(o)) throw new Error('Those corners cross: give them around the page');
      L.set(p.id, { quad: o, found: true });
      return `Corners set on page ${L.index(p.id) + 1}.`;
    }),
    add('rotate_page', 'Turn a page', [PAGE, { name: 'quarters', type: 'number', min: -3, max: 3, integer: true, default: 1, description: 'quarter turns clockwise (negative: anticlockwise)' }], (a) => {   // i18n-ignore: for the assistant (English: API)
      const p = pageOf(a.page);
      L.set(p.id, { turn: p.turn + (a.quarters == null ? 1 : a.quarters), auto: false });
      return `Turned: ${describe(p)}.`;
    }),
    add('move_page', 'Move a page', [Object.assign({}, PAGE, { required: true }), { name: 'to', type: 'number', min: 1, max: 500, integer: true, required: true }], (a) => {
      const p = pageOf(a.page);
      L.move(p.id, a.to - 1);
      return `Page moved to ${L.index(p.id) + 1}.`;
    }),
    add('remove_page', 'Remove a page', [Object.assign({}, PAGE, { required: true })], (a) => {
      L.remove(pageOf(a.page).id);
      return `Removed. ${L.size()} left.`;
    }, { destructive: true }),
    add('export_pdf', 'Make the PDF', [...DOC, { name: 'to', type: 'enum', values: ['download', 'drive', 'pdf_editor'], default: 'download' }], async (a) => {
      L.setDoc(docPatch(a));
      if (L.doc.ocr) await S.ocr.ready();
      if (a.to === 'drive') { const r = await S.io.saveToDrive(); return `Saved ${r.name} to Slop Drive (id ${r.id}).`; }
      if (a.to === 'pdf_editor') { await S.io.toPdfEditor(); return 'Opened in Slop PDF.'; }
      const r = await S.io.downloadPdf();
      return `Downloaded ${r.name} (${L.size()} pages).`;
    }, { description: 'One PDF of every page, in order, with the page size, margins and quality given (or set before).' }),   // i18n-ignore: for the assistant (English: API)
  ]);
  C.provide({ state: () => ({
    app: 'Slop Scan', pages: L.all().map((p, i) => ({ page: i + 1, name: p.name, style: p.style, brightness: p.brightness, contrast: p.contrast, turn: p.turn * 90, edgesFound: p.found })),
    shown: L.current() ? L.index(L.current().id) + 1 : null, mode: S.view.mode(), pdf: Object.assign({}, L.doc),
  }), checkpoint: () => () => true });
})();
