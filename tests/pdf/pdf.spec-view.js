/* Slop PDF page view: continuous scroll with the page indicator, single and two-page layouts (remembered), lazy rasters
   in a long document, Ctrl+wheel about the pointer on any page with the status bar, and Extract assets (the dialog and a
   zip whose first entry is the JPEG as stored). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  const viewer = () => PT.win.document.getElementById('viewer');
  const pageEls = () => [...PT.win.document.querySelectorAll('#viewer .pv-page')];
  const loaded = () => PT.win.document.querySelectorAll('#viewer .pv-page.loaded').length;
  const pvNum = () => PT.win.document.getElementById('pvNum').textContent;
  const settle = () => waitFor(() => !PT.SP.editor.easing(), { timeout: 8000 }).then(() => sleep(30));
  /** Document point (layout units) under a client point, for one page element. */
  const docPoint = (Ed, el, x, y) => { const r = el.getBoundingClientRect(); return { x: (x - r.left) / Ed.zoom, y: (y - r.top) / Ed.zoom }; };
  function wheel(el, init) {
    const ev = new PT.win.WheelEvent('wheel', Object.assign({ bubbles: true, cancelable: true }, init));
    el.dispatchEvent(ev);
    return ev;
  }
  /** A small JPEG made in the app's window (so pdf-lib can embed it). */
  async function jpegBytes(w, h) {
    const c = PT.win.document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, w, h); g.fillStyle = '#fc0'; g.fillRect(w / 4, h / 4, w / 2, h / 2);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    return new PT.win.Uint8Array(await blob.arrayBuffer());
  }
  /** n pages 300×200 with a label; page 1 also holds a 64×48 JPEG. */
  async function imagePdf(n) {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica);
    const jpg = await doc.embedJpg(await jpegBytes(64, 48));
    for (let i = 0; i < n; i++) {
      const pg = doc.addPage(PT.win.Array.of(300, 200));
      pg.drawText('page ' + (i + 1), { x: 20, y: 150, size: 18, font });
      if (i === 0) pg.drawImage(jpg, { x: 20, y: 40, width: 128, height: 96 });
    }
    doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2021, 0, 1) + (++PT._nonce) * 1000));
    return doc.save();
  }
  /** Opens n pages in page view at a layout zoom (the first page is active). */
  async function openView(n, zoom, name) {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(await imagePdf(n), name || 'view.pdf');
    PT.A.openPage(PT.E.state.pages[0].id);
    const Ed = PT.SP.editor;
    Ed.zoomMode = 'num'; Ed.zoom = zoom; Ed.layout();
    await sleep(350);
    return Ed;
  }

  describe('Slop PDF page view', () => {
    it('continuous scroll shows both pages, the indicator follows the scroll, and the layout is remembered', async () => {
      const Ed = await openView(2, 1.5, 'two.pdf');
      expect(Ed.layoutMode).toBe('continuous');
      expect(pageEls().length).toBe(2);
      const vr = viewer().getBoundingClientRect();
      pageEls().forEach((el) => { const r = el.getBoundingClientRect(); expect(r.bottom > vr.top && r.top < vr.bottom).toBe(true); });
      expect(pvNum()).toBe('1 / 2');
      const v = viewer(), second = pageEls()[1];
      v.scrollTop += second.getBoundingClientRect().top - v.getBoundingClientRect().top - 30;
      await sleep(250);
      expect(pvNum()).toBe('2 / 2');
      expect(Ed.pid).toBe(PT.E.state.pages[1].id);
      PT.A.gotoPage(-1);
      await sleep(150);
      expect(pvNum()).toBe('1 / 2');
      Ed.setLayout('two');
      await sleep(150);
      expect(pageEls().length).toBe(2);
      expect(PT.win.document.querySelectorAll('#viewer .pv-row').length).toBe(1);
      expect(PT.win.localStorage.getItem('slop-pdf.pageLayout')).toBe('two');
      Ed.setLayout('continuous');
      expect(PT.win.localStorage.getItem('slop-pdf.pageLayout')).toBe('continuous');
    }, { timeout: 60000 });

    it('a long document renders only the pages near the view, and gives the others back when they leave', async () => {
      await openView(40, 0.5, 'long.pdf');
      expect(pageEls().length).toBe(40);
      await waitFor(() => loaded() > 0, { timeout: 8000 });
      await sleep(300);
      const first = loaded();
      expect(first >= 1 && first < 40).toBe(true);
      const v = viewer();
      v.scrollTop = v.scrollHeight;
      await waitFor(() => pageEls()[39].classList.contains('loaded'), { timeout: 8000 });
      await sleep(200);
      expect(loaded() < 40).toBe(true);
      expect(pageEls()[0].classList.contains('loaded')).toBe(false);
      expect(pvNum()).toBe('40 / 40');
    }, { timeout: 60000 });

    it('single page shows one page at a time and the previous and next page turn it', async () => {
      const Ed = await openView(2, 0.5, 'single.pdf');
      Ed.setLayout('single');
      await sleep(150);
      expect(pageEls().length).toBe(1);
      PT.A.gotoPage(1);
      await sleep(200);
      expect(pageEls().length).toBe(1);
      expect(pvNum()).toBe('2 / 2');
      Ed.setLayout('continuous');
    }, { timeout: 60000 });

    it('Ctrl+wheel over a page that is not the active one zooms about that point and the status bar follows', async () => {
      const Ed = await openView(2, 0.5, 'pointer.pdf');
      const el = pageEls()[1], r = el.getBoundingClientRect();
      const x = r.left + r.width * 0.3, y = r.top + r.height * 0.6;
      const before = docPoint(Ed, el, x, y), z0 = Ed.zoom;
      wheel(el, { deltaY: -100, ctrlKey: true, clientX: x, clientY: y });
      await settle();
      expect(Ed.zoom / z0).toBeCloseTo(Math.exp(0.2), 1e-3);
      const after = docPoint(Ed, el, x, y);
      expect(Math.abs(after.x - before.x) < 0.5).toBe(true);
      expect(Math.abs(after.y - before.y) < 0.5).toBe(true);
      expect(PT.win.document.getElementById('statusZoom').textContent).toBe('Zoom ' + Ed.percent(Ed.zoom) + '%');
    }, { timeout: 60000 });

    it('a press on a page that is not active makes it the active page, so the tools work on the page under the pointer', async () => {
      const Ed = await openView(2, 1.5, 'press.pdf');
      const el = pageEls()[1];
      const init = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 2, buttons: 2, clientX: 0, clientY: 0 };
      const r = el.getBoundingClientRect(); init.clientX = r.left + 20; init.clientY = r.top + 20;
      el.dispatchEvent(new PT.win.PointerEvent('pointerdown', init));
      expect(Ed.pid).toBe(PT.E.state.pages[1].id);
      expect(el.contains(PT.win.document.querySelector('.pv-overlay'))).toBe(true);
      expect(pvNum()).toBe('2 / 2');
      el.dispatchEvent(new PT.win.PointerEvent('pointerup', Object.assign({}, init, { buttons: 0 })));
      PT.win.dispatchEvent(new PT.win.PointerEvent('pointerup', Object.assign({}, init, { buttons: 0 })));
    }, { timeout: 60000 });

    it('a raw RGB image (Flate, 8 bits) is decoded through a canvas and saved as PNG; a skipped one has its reason', async () => {
      if (!PT.SP) await PT.boot();
      PT.reset();
      const L = PT.win.PDFLib, doc = await L.PDFDocument.create();
      const pg = doc.addPage(PT.win.Array.of(300, 200));
      const raw = new PT.win.Uint8Array(4 * 2 * 3);
      for (let i = 0; i < raw.length; i++) raw[i] = (i * 17) & 255;
      const dict = { Type: L.PDFName.of('XObject'), Subtype: L.PDFName.of('Image'), Width: 4, Height: 2, ColorSpace: L.PDFName.of('DeviceRGB'), BitsPerComponent: 8 };
      pg.node.newXObject('Im9', doc.context.register(doc.context.flateStream(raw, dict)));
      const jpx = { Type: L.PDFName.of('XObject'), Subtype: L.PDFName.of('Image'), Width: 2, Height: 2, ColorSpace: L.PDFName.of('DeviceRGB'), BitsPerComponent: 8, Filter: L.PDFName.of('JPXDecode') };
      pg.node.newXObject('Im8', doc.context.register(doc.context.stream(new PT.win.Uint8Array(8), jpx)));
      doc.setCreationDate(new PT.win.Date(PT.win.Date.UTC(2021, 0, 1) + (++PT._nonce) * 1000));
      await PT.open(await doc.save(), 'raw.pdf');
      const found = await PT.SP.assets.scan();
      const out = await PT.SP.assets.entries(found.images, []);
      const png = out.entries.find((e) => e.path.startsWith('images/'));
      expect(!!png).toBe(true);
      // pdf-lib adds a random number to a resource name given as a prefix, so the name is matched by its start
      expect(png.path.startsWith('images/p1-Im9') && png.path.endsWith('.png')).toBe(true);
      expect(png.data[0]).toBe(0x89);
      expect(png.data[1]).toBe(0x50);
      expect(out.skipped.length).toBe(1);
      expect(out.skipped[0].name.startsWith('Im8')).toBe(true);
      expect(/JPEG 2000/.test(out.skipped[0].reason)).toBe(true);
    }, { timeout: 60000 });

    it('Extract assets lists the image and saves a zip whose first entry is the JPEG as stored', async () => {
      await openView(2, 0.5, 'assets.pdf');
      PT.A.extractAssets();
      const dlg = await waitFor(() => PT.win.document.querySelector('.ea-dlg'), { timeout: 15000 });
      const rows = [...dlg.querySelectorAll('.ea-row:not(.ea-opt)')]; // the text and page options are rows of their own
      // the image, and the standard Helvetica font, which the PDF refers to but does not embed (listed, not selectable)
      expect(rows.length).toBe(2);
      const img = rows.find((r) => r.textContent.includes('64×48'));
      expect(!!img && img.textContent.includes('page 1')).toBe(true);
      expect(rows.find((r) => r.textContent.includes('Helvetica')).querySelector('input').disabled).toBe(true);
      const saved = [], orig = PT.U.download;
      PT.U.download = (data, name, mime) => { saved.push({ data, name, mime }); };
      try {
        [...dlg.querySelectorAll('.sui-btn')].find((b) => b.textContent === 'Download ZIP').click();
        await waitFor(() => saved.length > 0, { timeout: 15000 });
      } finally { PT.U.download = orig; }
      expect(saved[0].name).toBe('assets-assets.zip');
      const zip = await import('../../shared/office/zip.js');
      const entries = await zip.readZip(new Uint8Array(await saved[0].data.arrayBuffer()));
      const first = [...entries.keys()][0], bytes = entries.get(first);
      expect(first.startsWith('images/')).toBe(true);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(PT.SP.assets.baseName()).toBe('assets');
    }, { timeout: 60000 });
  });
})();
