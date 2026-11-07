/* Slop PDF watermark: the site's one watermark panel (shared/watermark/panel.js) on the document's spec (stamps.wm). Two
   layers stacked (a text layer and a logo dropped on the panel), moved and undone one step at a time, and burned into the
   downloaded page content in stacking order; a page range; a document saved with the layers of before still shows them.
   Covers: pdf/js/tools/watermark-panel.js, pdf/js/core/watermark-annots.js, pdf/js/core/watermark.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const spec = () => PT.E.state.stamps.wm || { layers: [] };
  const layers = () => spec().layers;
  const D = () => PT.win.document;
  const panel = () => D().querySelector('.swp');
  const labelsTopFirst = () => [...D().querySelectorAll('.swp-item')].map((b) => b.textContent);
  const btn = (label) => [...D().querySelectorAll('.swp-stack button, .swp-top button')].find((b) => b.textContent.trim() === label);
  /** A small PNG made in the app's window, as a File (what a drop delivers). */
  async function logoFile() {
    const c = D().createElement('canvas'); c.width = 40; c.height = 20;
    const g = c.getContext('2d'); g.fillStyle = '#e0245e'; g.fillRect(0, 0, 40, 20);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new PT.win.File([blob], 'logo.png', { type: 'image/png' });
  }
  async function drop(file) {
    const dt = new PT.win.DataTransfer(); dt.items.add(file);
    panel().dispatchEvent(new PT.win.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await waitFor(() => layers().some((L) => L.kind === 'logo' && L.logo));
  }
  function type(text) {
    const input = D().querySelector('.swp input[aria-label="Watermark text"]');
    input.value = text;
    input.dispatchEvent(new PT.win.Event('input', { bubbles: true }));
  }

  describe('watermark layers', () => {
    it('two layers stacked with a logo and text are moved and undone step by step, and burn into the download', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'Body', w: 300, h: 200 }]), 'wm.pdf');
      PT.A.setTool('watermark');
      await waitFor(() => panel());
      // a text layer from the panel's button, then a logo dropped on the panel (it lands on top)
      btn('+ Text').click();
      expect(layers().length).toBe(1);
      expect(PT.E.undoLabel()).toBe('Add text layer');
      type('DRAFT');
      expect(layers()[0].text).toBe('DRAFT');
      await drop(await logoFile());
      expect(layers().length).toBe(2);
      expect(layers()[1].kind).toBe('logo');
      expect(layers()[1].logo.startsWith('data:image/png')).toBe(true);
      expect(labelsTopFirst()[0].startsWith('Logo')).toBe(true);
      expect(labelsTopFirst()[1]).toBe('“DRAFT”');
      // move the logo down: it is now bottom (drawn first, under the text)
      D().querySelectorAll('.swp-item')[0].click();
      btn('Down').click();
      expect(layers()[0].kind).toBe('logo');
      expect(PT.E.undoLabel()).toBe('Move layer down');
      // undo the move: the logo is on top again, with the text below it
      PT.A.undo();
      expect(layers()[1].kind).toBe('logo');
      expect(layers()[0].kind).toBe('text');
      // the download draws the text (real text) and the logo into the page content
      const bytes = await PT.E.build();
      const read = await PT.read(bytes);
      expect(read.pages[0].text.includes('DRAFT')).toBe(true);
      const L = PT.win.PDFLib, out = await L.PDFDocument.load(bytes, { updateMetadata: false });
      const xo = out.getPage(0).node.Resources().lookup(L.PDFName.of('XObject'));
      expect(!!xo && String(xo).includes('/Im')).toBe(true); // the logo is an image XObject in the page resources
    }, { timeout: 90000 });

    it('a layer’s page range puts it on those pages only', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'One' }, { text: 'Two' }, { text: 'Three' }]), 'range.pdf');
      PT.A.setTool('watermark');
      await waitFor(() => panel());
      btn('+ Text').click();
      type('ONLYTWO');
      [...D().querySelectorAll('.swp-pages .sui-btn')].find((b) => b.dataset.mode === 'range').click();
      const range = D().querySelector('.swp input[data-f="pages"]');
      range.value = '2';
      range.dispatchEvent(new PT.win.Event('input', { bubbles: true }));
      expect(layers()[0].pages).toBe('2');
      const read = await PT.read(await PT.E.build());
      expect(read.pages.map((p) => p.text.includes('ONLYTWO'))).toEqual([false, true, false]);
    }, { timeout: 90000 });

    it('a document with the watermark layers of before shows them in the panel and the download', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'Old', w: 400, h: 300 }]), 'old.pdf');
      PT.E.commit('Old layers', (st) => { st.stamps.watermarks = [{ id: 'old1', kind: 'text', text: 'LEGACY', size: 30, opacity: 0.5, rot: 0, anchor: 'tl', dx: 10, dy: 10, show: true }]; });
      PT.A.setTool('watermark');
      await waitFor(() => panel());
      expect(labelsTopFirst()).toEqual(['“LEGACY”']);
      expect(D().querySelector('.swp-cell[data-pos="tl"]').getAttribute('aria-pressed')).toBe('true');
      expect((await PT.read(await PT.E.build())).pages[0].text.includes('LEGACY')).toBe(true);
    }, { timeout: 90000 });
  });
})();
