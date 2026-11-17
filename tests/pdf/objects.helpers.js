/* Slop PDF test helpers for page objects, PDF layers and Extract all: fixtures made in the test with the app's pdf-lib (a
   page with two images and a placed form, a PDF with two optional content groups, a PDF with two attachments and an
   embedded font), pictures drawn on a canvas, pointer events on the page as a mouse sends them, and the positions of the
   pictures and forms a saved PDF paints, read back from pdf.js's operator list. Extends window.PT (pdf.helpers.js). */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const Ed = () => PT.SP.editor, S = () => PT.SP.editor._;

  /** A picture made on a canvas: { bytes, type }. kind: 'jpeg' | 'png'. */
  PT.picture = async function (w, h, colour, kind = 'jpeg') {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = colour; g.fillRect(0, 0, w, h); g.fillStyle = '#000'; g.fillRect(0, 0, Math.max(1, w / 4), Math.max(1, h / 4));
    const blob = await new Promise((r) => c.toBlob(r, 'image/' + kind, 0.92));
    return { bytes: new PT.win.Uint8Array(await blob.arrayBuffer()), type: 'image/' + kind };
  };
  /** One 600 × 800 page: a JPEG (40 × 20 px) at 100,500 200 × 100 pt, a PNG (10 × 10 px) at 350,550 60 × 60 pt and a placed
   * page (a Form XObject: a red square with a blue bar, 150 × 100) at 100,200. Resolves { bytes, jpeg, png }. */
  PT.objectsPdf = async function () {
    const L = PT.win.PDFLib, A = PT.win.Array, doc = await L.PDFDocument.create();
    const art = await L.PDFDocument.create(), ap = art.addPage(A.of(150, 100));
    ap.drawRectangle({ x: 0, y: 0, width: 150, height: 100, color: L.rgb(1, 0, 0) });
    ap.drawRectangle({ x: 20, y: 40, width: 110, height: 20, color: L.rgb(0, 0, 1) });
    const jpeg = await PT.picture(40, 20, '#22aa44', 'jpeg'), png = await PT.picture(10, 10, '#ffcc00', 'png');
    const page = doc.addPage(A.of(600, 800)), ji = await doc.embedJpg(jpeg.bytes), pi = await doc.embedPng(png.bytes), form = await doc.embedPage(art.getPages()[0]);
    page.drawImage(ji, { x: 100, y: 500, width: 200, height: 100 });
    page.drawImage(pi, { x: 350, y: 550, width: 60, height: 60 });
    page.drawPage(form, { x: 100, y: 200 });
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2022, 0, 1) + (++PT._nonce) * 1000));
    return { bytes: await doc.save(), jpeg: jpeg.bytes, png: png.bytes };
  };

  /** Opens bytes and shows page 1 in page view. */
  PT.openView = async function (bytes, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(bytes, name);
    const id = PT.E.state.pages[0].id;
    PT.A.openPage(id);
    await waitFor(() => S().pageEl && Ed().pid === id && S().slots.get(id) && S().slots.get(id).key, { timeout: 15000 });
    return id;
  };

  /* -------------------------------------------------------------- pointer events on the active page */
  const pe = (type, init) => new PT.win.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }, init));
  /** Client coordinates of a point in page space (points from the page's top-left). */
  PT.at = function (x, y) { const r = S().pageEl.getBoundingClientRect(), z = Ed().zoom; return { clientX: r.left + x * z, clientY: r.top + y * z }; };
  /** A drag from one page point to another (points from the top-left), through the element under the first point. */
  PT.drag = function (from, to, { el, shift = false } = {}) {
    const pg = S().pageEl;
    pg.setPointerCapture = () => {}; pg.releasePointerCapture = () => {};
    const target = el || pg, a = PT.at(from[0], from[1]), b = PT.at(to[0], to[1]);
    target.dispatchEvent(pe('pointerdown', Object.assign({ shiftKey: shift }, a)));
    for (let k = 1; k <= 4; k++) pg.dispatchEvent(pe('pointermove', { clientX: a.clientX + (b.clientX - a.clientX) * k / 4, clientY: a.clientY + (b.clientY - a.clientY) * k / 4, shiftKey: shift }));
    pg.dispatchEvent(pe('pointerup', Object.assign({ shiftKey: shift }, b)));
  };

  /** The pictures and forms a PDF's page paints, from pdf.js's operator list: [{ kind: 'image' | 'inline' | 'form', w, h,
   * box: [x0, y0, x1, y1] (user space) }] in paint order. */
  PT.painted = async function (bytes, i = 0) {
    const lib = await PT.E.pdfjs(), OPS = lib.OPS;
    const doc = await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes))).promise;
    try {
      const pg = await doc.getPage(i + 1), ol = await pg.getOperatorList(), out = [], st = [];
      let m = [1, 0, 0, 1, 0, 0];
      const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
      const box = (mm, x0, y0, x1, y1) => { const p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [mm[0] * x + mm[2] * y + mm[4], mm[1] * x + mm[3] * y + mm[5]]); const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 10) / 10); };
      ol.fnArray.forEach((fn, k) => {
        const a = ol.argsArray[k];
        if (fn === OPS.save) st.push(m);
        else if (fn === OPS.restore) m = st.pop() || m;
        else if (fn === OPS.transform) m = mul(a, m);
        else if (fn === OPS.paintImageXObject) out.push({ kind: 'image', w: a[1], h: a[2], box: box(m, 0, 0, 1, 1), m: m.slice() });
        else if (fn === OPS.paintInlineImageXObject) out.push({ kind: 'inline', w: a[0].width, h: a[0].height, box: box(m, 0, 0, 1, 1) });
        else if (fn === OPS.paintFormXObjectBegin) { st.push(m); if (a[0]) m = mul(a[0], m); out.push({ kind: 'form', box: a[1] ? box(m, a[1][0], a[1][1], a[1][2], a[1][3]) : null }); }
        else if (fn === OPS.paintFormXObjectEnd) m = st.pop() || m;
      });
      return out;
    } finally { await doc.destroy(); }
  };
  PT.near = (a, b, t = 0.6) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) <= t);
  /** The page's objects once Objects mode has read them. */
  PT.objects = async function () { const p = Ed().page(); return S().obj.load(p); };
})();
(function () {
  'use strict';
  /** One 500 × 300 page with two PDF layers: "Red" (a red square at 50,50) and "Blue" (a blue square at 300,50), drawn in
   * /OC marked content, both on by default. */
  PT.layersPdf = async function () {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create(), ctx = doc.context, N = (k) => L.PDFName.of(k);
    const page = doc.addPage(PT.win.Array.of(500, 300));
    const red = ctx.register(ctx.obj({ Type: 'OCG', Name: L.PDFString.of('Red') })), blue = ctx.register(ctx.obj({ Type: 'OCG', Name: L.PDFString.of('Blue') }));
    doc.catalog.set(N('OCProperties'), ctx.obj({ OCGs: [red, blue], D: ctx.obj({ ON: [red, blue], OFF: [], Order: [red, blue] }) }));
    page.node.set(N('Resources'), ctx.obj({ Properties: ctx.obj({ oc1: red, oc2: blue }) }));
    const text = 'q /OC /oc1 BDC 1 0 0 rg 50 50 100 100 re f EMC /OC /oc2 BDC 0 0 1 rg 300 50 100 100 re f EMC 0 g 0 280 500 2 re f Q';
    page.node.set(N('Contents'), ctx.register(ctx.flateStream(text)));
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2023, 0, 1) + (++PT._nonce) * 1000));
    return doc.save();
  };
  /** The layers of a PDF as pdf.js reads them: { name: visible }. */
  PT.layersOf = async function (bytes) {
    const lib = await PT.E.pdfjs(), doc = await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes))).promise;
    try { const cfg = await doc.getOptionalContentConfig(), out = {}; for (const [, g] of cfg) out[g.name] = g.visible; return out; } finally { await doc.destroy(); }
  };
  /** A PDF with a JPEG, a line of text in an embedded Barlow subset, and two attachments: factur-x.xml (the document's)
   * and notes.txt. Resolves { bytes, jpeg, xml, notes }. */
  PT.partsPdf = async function () {
    const L = PT.win.PDFLib, kit = await PT.win.SlopFontCatalog.fontkit(), doc = await L.PDFDocument.create();
    doc.registerFontkit(kit);
    const font = await doc.embedFont(await PT.fixture('Barlow-Regular.ttf'), { subset: true, customName: 'ABCDEF+Barlow-Regular' });
    const jpeg = await PT.picture(64, 48, '#aa3366', 'jpeg'), page = doc.addPage(PT.win.Array.of(400, 300));
    page.drawImage(await doc.embedJpg(jpeg.bytes), { x: 20, y: 120, width: 128, height: 96 });
    page.drawText('Invoice 2024-17 total 120 EUR', { x: 20, y: 60, size: 14, font });
    const enc = (s) => new PT.win.Uint8Array(new TextEncoder().encode(s));
    const xml = enc('<?xml version="1.0"?><rsm:CrossIndustryInvoice xmlns:rsm="urn:x"><ID>2024-17</ID></rsm:CrossIndustryInvoice>');
    const notes = enc('Paid by card.\n');
    await doc.attach(xml, 'factur-x.xml', { mimeType: 'text/xml', description: 'Factur-X invoice' });
    await doc.attach(notes, 'notes.txt', { mimeType: 'text/plain', description: 'Notes' });
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2024, 0, 1) + (++PT._nonce) * 1000));
    return { bytes: await doc.save(), jpeg: jpeg.bytes, xml, notes };
  };
})();
