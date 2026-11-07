/* Slop PDF test helpers: boot the real app in an iframe, make fixture PDFs with the app's own
   pdf-lib, open bytes the way the UI does, and read results back with pdf.js. Exposes window.PT. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const PT = window.PT = {}; PT._nonce = 0;

  /** Loads pdf/index.html (plus an optional query) into the iframe #app and waits for boot. */
  PT.boot = async function (query = '', frameId = 'app') {
    const fr = document.getElementById(frameId);
    fr.src = 'about:blank';
    await waitFor(() => fr.contentWindow && fr.contentWindow.location.href === 'about:blank' && !fr.contentWindow.SP);
    fr.src = '../../pdf/index.html' + query;
    await waitFor(() => fr.contentWindow && fr.contentWindow.document.documentElement?.classList.contains('ready') && fr.contentWindow.SP && fr.contentWindow.SP.app, { timeout: 30000 });
    const win = fr.contentWindow;
    if (win.SlopBanner) win.SlopBanner.remove();   // the consent card floats over the page's bottom corner; no choice is stored
    await win.SP.engine.pdfjs();
    await win.SP.engine.initFonts();
    if (frameId === 'app') Object.assign(PT, { win, SP: win.SP, E: win.SP.engine, U: win.SP.util, A: win.SP.app });
    return win;
  };

  /** Fresh empty document (no confirm dialog). */
  PT.reset = function () { PT.A.showGrid(true); PT.E.closeAll(); PT.SP.organizer.setSelection([]); };

  /** A one-page PDF with `text` set in Barlow Regular (installed nowhere in the tests): subset (as most documents embed)
   * or the whole font. Built with the app's pdf-lib and fontkit. */
  PT.barlowPdf = async function (text, { subset = true } = {}) {
    if (!PT.SP) await PT.boot();
    const L = PT.win.PDFLib, kit = await PT.win.SlopFontCatalog.fontkit();
    const d = await L.PDFDocument.create();
    d.registerFontkit(kit);
    // a subset carries the PDF subset tag (ABCDEF+) as real writers add it; pdf-lib adds only a random -NNNN suffix,
    // which it adds to fonts embedded in full as well
    const font = await d.embedFont(await PT.fixture('Barlow-Regular.ttf'), subset ? { subset: true, customName: 'ABCDEF+Barlow-Regular' } : { subset: false });
    d.addPage(PT.win.Array.of(300, 200)).drawText(text, { x: 20, y: 20, size: 18, font });
    d.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2021, 0, 1) + (++PT._nonce) * 1000));
    return d.save();
  };

  /** pages: [{w, h, text, rotate, box:[x0,y0,x1,y1]}] → Uint8Array, made with pdf-lib. */
  PT.makePdf = async function (pages, opts = {}) {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create();
    const font = await doc.embedFont(L.StandardFonts.Helvetica);
    for (const p of pages) {
      const pg = doc.addPage(PT.win.Array.of(p.w || 300, p.h || 200));
      if (p.box) pg.setMediaBox(p.box[0], p.box[1], p.box[2] - p.box[0], p.box[3] - p.box[1]);
      const ox = p.box ? p.box[0] : 0, oy = p.box ? p.box[1] : 0;
      if (p.text) pg.drawText(p.text, { x: ox + 20, y: oy + 20, size: 18, font });
      if (p.rotate) pg.setRotation(L.degrees(p.rotate));
    }
    if (opts.form) opts.form(doc, doc.getForm(), doc.getPages());
    if (opts.title) doc.setTitle(opts.title);
    // pdf-lib dates have one-second resolution: a unique date keeps two fixtures made in the same second apart,
    // so one test's saved edits are never offered to the next (see pdf/js/io/edit-log.js)
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2020, 0, 1) + (++PT._nonce) * 1000));
    return doc.save();
  };

  /** Opens bytes through the real UI path (A.addFiles). Returns the registered file. */
  PT.open = async function (bytes, name = 'test.pdf', at) {
    const before = new Set(PT.E.files.keys());
    const file = new PT.win.File([bytes], name, { type: 'application/pdf' });
    await PT.A.addFiles([file], at == null ? {} : { at });
    return [...PT.E.files.values()].find((f) => !before.has(f.id));
  };
  PT.texts = () => PT.E.state.pages.map((p) => PT.pageLabel(p));
  /** Label of a page in the model: "<file page index>" or "blank". */
  PT.pageLabel = (p) => (p.blank ? 'blank' : String(p.i + 1));

  /** Reads a PDF back with pdf.js: page count, rotation, view box and text per page. */
  PT.read = async function (bytes) {
    const lib = await PT.E.pdfjs();
    const doc = await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes))).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i), tc = await pg.getTextContent();
      pages.push({ rotate: pg.rotate, view: pg.view.slice(), text: tc.items.map((t) => t.str).join(' ').trim() });
    }
    const meta = await doc.getMetadata().catch(() => null);
    const fields = await doc.getFieldObjects().catch(() => null);
    const out = { n: doc.numPages, pages, info: (meta && meta.info) || {}, fields, doc };
    return out;
  };
  /** Renders page i (0-based) of bytes at `scale` with pdf.js (rotation applied) → canvas. */
  PT.render = async function (bytes, i = 0, scale = 1) {
    const lib = await PT.E.pdfjs();
    const doc = await lib.getDocument(PT.E.docParams(new PT.win.Uint8Array(bytes))).promise;
    const pg = await doc.getPage(i + 1), vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: g, viewport: vp }).promise;
    await doc.destroy();
    return c;
  };
  PT.px = (c, x, y) => [...c.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
  PT.isRed = (rgb) => rgb[0] > 200 && rgb[1] < 60 && rgb[2] < 60;
  PT.isWhite = (rgb) => rgb[0] > 240 && rgb[1] > 240 && rgb[2] > 240;

  /** Fixture bytes from tests/pdf/fixtures/. */
  PT.fixture = async (name) => new PT.win.Uint8Array(await (await fetch('fixtures/' + name)).arrayBuffer());

  /** Captures U.download calls instead of saving: returns {list, restore}. Each item {name, blob}. */
  PT.captureDownloads = function () {
    const U = PT.U, orig = U.download, list = [];
    U.download = (data, name, mime) => { list.push({ name, blob: data instanceof PT.win.Blob || data instanceof Blob ? data : new Blob([data], { type: mime || '' }) }); };
    return { list, restore: () => { U.download = orig; } };
  };
  PT.bytesOf = async (blob) => new PT.win.Uint8Array(await blob.arrayBuffer());

  /** Minimal store-only zip reader: [{name, data, crc}] (checks the central directory too). */
  PT.unzip = function (u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), dec = new TextDecoder(), out = [];
    let eocd = u8.length - 22;
    while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('no end of central directory');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
      const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      if (dv.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header');
      const lnl = dv.getUint16(off + 26, true), lel = dv.getUint16(off + 28, true), start = off + 30 + lnl + lel;
      out.push({ name, crc, data: u8.slice(start, start + size) });
      p += 46 + nl;
    }
    return out;
  };

  /** Stubs window.open in a frame and records the URLs. */
  PT.stubOpen = function (win) {
    const urls = [], orig = win.open;
    win.open = (u) => { urls.push(String(u)); return {}; };
    return { urls, restore: () => { win.open = orig; } };
  };
})();
(function () {
  'use strict';
  /** Text of the open SlopUI dialogs in the app frame, then closes them all. */
  PT.closeDialogs = function () {
    const d = PT.win.document, txt = [...d.querySelectorAll('.sui-dlg')].map((b) => b.textContent).join('\n');
    d.querySelectorAll('.sui-dlg .sui-x').forEach((x) => x.click());
    return txt;
  };
})();
