/* SlopLabel UI flow tests: dialogs, data merge, variables, print dialog and outputs, templates,
 * themes, Slop Hub, print-form links and the phone layout.
 * Covers: label/js/ui/panels.js */
(function () {
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const frame = () => new Promise((r) => WIN.requestAnimationFrame(() => WIN.requestAnimationFrame(r)));
  const dlg = () => [...W.document.querySelectorAll('.sui-dlg')].filter((d) => !d.parentNode.classList.contains('sui-out')).pop();
  const clickBtn = (label) => { const b = [...dlg().querySelectorAll('button')].find((x) => x.textContent.trim() === label); if (!b) throw new Error('No button ' + label); b.click(); };
  const closeAll = async () => { for (const x of W.document.querySelectorAll('.sui-back .sui-x')) x.click(); await sleep(160); for (const d of W.document.querySelectorAll('.sui-back')) d.remove(); };
  let downloads = [];
  const captureDownloads = () => { downloads = []; WIN.SlopUI.download = (blob, name) => downloads.push({ blob, name }); };

  describe('data merge', () => {
    it('imports a CSV through the mapping dialog and steps records', async () => {
      captureDownloads();
      const d = W.newDoc({ stock: W.stockById('roll-62x29') });
      d.objects.push(W.makeObject('text', { content: '{Name} ({City|upper})', x: 2, y: 2 }), W.makeObject('barcode', { content: '{SKU}', symbology: 'code128', x: 2, y: 10 }));
      W.setDoc(d, 'Merge test');
      const file = new WIN.File(['Name;City;SKU;Qty\nAda;Portland;A-1;2\nGrace;Arlington;G-2;1\n'], 'people.csv', { type: 'text/csv' });
      const p = W.importDataDialog(file);
      await waitFor(() => dlg() && /Map data columns/.test(dlg().textContent));
      expect(dlg().querySelectorAll('select').length).toBe(5); // 4 columns + quantity
      clickBtn('Use data');
      expect(await p).toBe(true);
      expect(W.App.doc.data.qtyCol).toBe('Qty');
      await frame();
      expect(W.itemOf(W.App.doc.objects[0].id).text).toBe('Ada (PORTLAND)');
      W.setRecord(1); await frame();
      expect(W.itemOf(W.App.doc.objects[0].id).text).toBe('Grace (ARLINGTON)');
      expect(W.$('recInfo').textContent).toBe('2 / 2');
      W.App.tab = 'data'; W.refreshNow();
      expect(W.$('dockBody').querySelectorAll('tbody tr').length).toBe(2);
      // No stray "null" text node under the records table (append() turns a null argument into that text).
      const stray = [...W.$('dockBody').querySelectorAll('*')].concat(W.$('dockBody')).flatMap((e) => [...e.childNodes]).filter((t) => t.nodeType === 3 && t.data.trim() === 'null');
      expect(stray.length).toBe(0);
      expect(/null/.test(W.$('dockBody').textContent)).toBe(false);
      expect(W.jobScenes({}).scenes.length).toBe(3); // Ada ×2 + Grace ×1
    });
    it('adds a variable through the editor and renames references', async () => {
      const p = W.varDialog(null, 'counter');
      await waitFor(() => dlg() && /New counter/.test(dlg().textContent));
      const inputs = dlg().querySelectorAll('input.inp');
      inputs[0].value = 'Serial'; inputs[3].value = '4'; inputs[0].dispatchEvent(new WIN.Event('input', { bubbles: true }));
      expect(dlg().textContent).toContain('Preview: 0001');
      clickBtn('Add');
      const v = await p;
      expect(v.name).toBe('Serial');
      W.App.doc.objects[1].content = '{SKU}-{Serial}'; W.commit('x');
      const p2 = W.varDialog(W.App.doc.vars[0]);
      await waitFor(() => dlg() && /Edit counter/.test(dlg().textContent));
      dlg().querySelector('input.inp').value = 'No';
      clickBtn('Save'); await p2;
      expect(W.App.doc.objects[1].content).toBe('{SKU}-{No}');
    });
  });

  describe('print dialog and outputs', () => {
    it('previews pages and exports PDF, ZPL, EPL, TSPL and PNG', async () => {
      await closeAll(); captureDownloads();
      W.openPrintDialog();
      await waitFor(() => dlg() && dlg().querySelector('.pd-canvas canvas'));
      expect(dlg().textContent).toContain('3 labels on 3 pages');
      for (const b of ['PDF', 'ZPL (Zebra)', 'EPL2', 'TSPL (TSC)', 'PNG']) clickBtn(b);
      await waitFor(() => downloads.length === 5, { timeout: 10000 });
      const names = downloads.map((x) => x.name.split('.').pop()).sort();
      expect(names).toEqual(['epl', 'pdf', 'png', 'tspl', 'zpl']);
      const zpl = await downloads.find((x) => x.name.endsWith('.zpl')).blob.text();
      expect((zpl.match(/\^XA/g) || []).length).toBe(3); // Ada ×2 (different serials), Grace ×1
      expect(zpl).toContain('^FD>:A-1->50001^FS'); // Code 128 B, then subset C for the digit run
      expect(zpl).toContain('^FD>:A-1->50002^FS');
      const pdf = new Uint8Array(await downloads.find((x) => x.name.endsWith('.pdf')).blob.arrayBuffer());
      expect(String.fromCharCode(...pdf.slice(0, 8))).toBe('%PDF-1.4');
      const counter = W.App.doc.vars.find((v) => v.type === 'counter');
      expect(counter.start).toBe(1); // not remembered: unchanged
      await closeAll();
    });
    it('lays out sheet labels from a start position', async () => {
      const d = W.TEMPLATES.find((t) => t.id === 'address').build();
      W.setDoc(d, 'Sheet');
      const { scenes } = W.jobScenes({});
      const pg = W.pagePreviewCanvas(W.App.doc, scenes, 25, 0);
      expect(pg.pages).toBe(2);
      expect(W.layoutPages(W.App.doc, scenes.length, 25).pages[0].slots.length).toBe(5);
      expect(W.printHTML(W.App.doc, scenes.slice(0, 2))).toContain('@page { size: 215.9mm 279.4mm; margin: 0; }');
    });
    it('renders ZPL back to a picture for preview', async () => {
      const c = await W.zplPreviewCanvas('^XA^PW400^LL200^FO20,20^GB100,50,50^FS^XZ', 203);
      expect([c.width, c.height]).toEqual([400, 200]);
      expect(SlopTest.pixel(c, 50, 40)[0]).toBe(0);
      expect(SlopTest.pixel(c, 300, 150)[0]).toBe(255);
    });
  });

  describe('templates, themes and files', () => {
    it('builds every template without barcode errors', () => {
      for (const t of W.TEMPLATES) { const d = t.build(); expect([t.id, W.sceneErrors(W.buildScene(d, W.previewResolver(d)))]).toEqual([t.id, []]); }
    });
    it('opens the template gallery with a thumbnail per template', async () => {
      W.templatesDialog();
      await waitFor(() => dlg() && dlg().querySelectorAll('.tpl').length === W.TEMPLATES.length + 1);
      expect(dlg().querySelectorAll('.tpl canvas').length).toBe(W.TEMPLATES.length);
      await closeAll();
    });
    it('switches between Pro, Light and Classic 98 (the ones the site offers)', () => {
      const classic = BRAND_FACTS.themes.includes('classic');   // a profile can hide it (tests/brand-facts.js)
      for (const t of ['light', 'classic', 'pro']) { W.setTheme(t); expect(W.document.documentElement.dataset.theme).toBe(t === 'classic' && !classic ? 'pro' : t); }
      expect([...W.THEMES].map(([id]) => id)).toEqual(classic ? ['pro', 'light', 'classic'] : ['pro', 'light']);
      if (!classic) return;
      W.setTheme('classic');
      expect(WIN.getComputedStyle(W.document.body).backgroundColor).toBe('rgb(192, 192, 192)');
      W.setTheme('pro');
    });
    it('opens the label setup dialog and applies a stock', async () => {
      const p = W.labelSetupDialog();
      await waitFor(() => dlg() && dlg().querySelector('.stock-list'));
      [...dlg().querySelectorAll('.stock-list button')].find((b) => /^4 × 6"/.test(b.textContent)).click();
      clickBtn('Apply');
      expect(await p).toBe(true);
      expect([W.App.doc.label.w, W.App.doc.label.h]).toEqual([101.6, 152.4]);
    });
    it('opens dropped project, ZPL and image files', async () => {
      const proj = new WIN.File([await W.projectBlob(W.TEMPLATES[1].build()).text()], 'p.sloplabel');
      W.App.dirty = false;
      await W.openFiles([proj]);
      expect(W.App.doc.name).toBe('Product label');
      W.App.dirty = false;
      await W.openFiles([new WIN.File(['^XA^FO10,10^A0N,30,30^FDZPL in^FS^XZ'], 'f.zpl')]);
      expect(W.App.doc.objects[0].content).toBe('ZPL in');
      const png = await new Promise((r) => { const c = W.document.createElement('canvas'); c.width = 40; c.height = 20; c.getContext('2d').fillRect(0, 0, 20, 20); c.toBlob(r, 'image/png'); });
      await W.openFiles([new WIN.File([png], 'logo.png', { type: 'image/png' })]);
      const img = W.App.doc.objects[W.App.doc.objects.length - 1];
      expect(img.type).toBe('image'); expect(img.aspect).toBe(2);
    });
  });

  describe('hub, form links and menus', () => {
    it('registers with Slop Hub and offers Send to', () => {
      expect(W.SlopHub.self.app).toBe('label');
      const labels = W.sendToItems().filter((i) => i.label).map((i) => i.label);
      expect(labels).toContain('Send to Slop PDF (PDF)');
      expect(labels).toContain('Send to PhotoSlop (PNG)');
      expect(labels).toContain('Send to SlopVector (PNG)');
      expect(labels.some((l) => /Slop PDF \(PNG\)/.test(l))).toBe(false);
    });
    it('opens every menu', async () => {
      for (const b of W.document.querySelectorAll('.mb')) { b.click(); expect(W.document.querySelectorAll('.sui-menu .sui-row').length).toBeGreaterThanOrEqual(3); W.SlopUI.closeMenu(); }
      const file = W.menuFile().filter((i) => i && i.label).map((i) => i.label);
      expect(file).toContain('Send to');
    });
    it('makes a print form link that opens in form mode', async () => {
      const link = await W.formLink();
      expect(link).toMatch(/#form=[jz]/);
      const f = W.document.createElement('iframe'); f.style.cssText = 'width:600px;height:700px'; document.body.append(f);
      f.src = link.replace(/^.*\/label\//, '../../label/');
      await waitFor(() => f.contentDocument && f.contentDocument.body && f.contentDocument.body.classList.contains('form-mode') && f.contentDocument.body.classList.contains('ready'), { timeout: 20000 });
      expect(f.contentDocument.querySelector('.pform canvas')).toBeTruthy();
      f.remove();
    }, { timeout: 30000 });
  });

  describe('phone layout', () => {
    it('puts tools along the bottom and panels in a sheet at 390 px', async () => {
      const win = document.getElementById('phone').contentWindow;
      await waitFor(() => win.document.body && win.document.body.classList.contains('ready'), { timeout: 30000 });
      const doc = win.document, tb = doc.getElementById('toolbox').getBoundingClientRect(), st = doc.getElementById('stage').getBoundingClientRect();
      expect(tb.top).toBeGreaterThan(st.bottom - 1);
      expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(390);
      expect(doc.getElementById('btnDock').offsetParent).toBeTruthy();
      // closed, the sheet shows only its foot (Print…, the shared panel footer); the tabs wait inside
      expect(doc.getElementById('dockTabs').getBoundingClientRect().height).toBe(0);
      expect(doc.getElementById('btnPrint').getBoundingClientRect().bottom).toBeLessThanOrEqual(win.innerHeight);
      expect(doc.getElementById('btnPrint').getBoundingClientRect().height).toBeGreaterThan(20);
      doc.getElementById('btnDock').click();
      await sleep(300);
      expect(win.getComputedStyle(doc.getElementById('dock')).visibility).toBe('visible');
      expect(doc.getElementById('dockTabs').getBoundingClientRect().height).toBeGreaterThan(0);
      const lab = win.eval('App.doc.label'), z = win.eval('App.zoom');
      expect(lab.w * z).toBeLessThanOrEqual(390);
      doc.getElementById('btnDock').click();
    });
    it('the panels sheet (SlopSheet): Panels opens it, again closes it, × closes and refocuses, Escape and a tap on the label close it', async () => {
      const win = document.getElementById('phone').contentWindow, doc = win.document, btn = doc.getElementById('btnDock'), sheet = win.eval('App.sheet');
      const esc = () => doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(sheet.isOpen()).toBe(false);
      btn.click(); expect([sheet.isOpen(), btn.getAttribute('aria-expanded')]).toEqual([true, 'true']);
      btn.click(); expect(sheet.isOpen()).toBe(false);
      btn.focus(); btn.click();
      const x = doc.querySelector('#dock > .ssh-x');
      expect(x.getAttribute('aria-label')).toBe('Close panels');
      x.click(); expect([sheet.isOpen(), doc.activeElement]).toEqual([false, btn]);
      btn.click(); esc(); expect(sheet.isOpen()).toBe(false);
      win.showDock('objects'); expect([sheet.isOpen(), win.eval('App.tab')]).toEqual([true, 'objects']);
      doc.getElementById('stage').dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true }));
      expect(sheet.isOpen()).toBe(false);
      win.showDock('props');
      await sleep(0); expect(doc.getElementById('dock').firstElementChild.classList.contains('ssh-x')).toBe(true);
      win.hideDock();
    });
  });
})();
