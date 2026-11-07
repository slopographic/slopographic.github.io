/* Slop PDF: export: page order/rotation, annotation placement on rotated/offset pages, stamps,
   metadata, forms (fill/keep editable/flatten), split to zip/files and extract. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const RED = '#ff0000';

  describe('export', () => {
    it('keeps page order, user rotation, blank pages and text when merging two files', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'Alpha one' }, { text: 'Alpha two', rotate: 90 }]), 'a.pdf');
      await PT.open(await PT.makePdf([{ text: 'Beta one', w: 400, h: 500 }]), 'b.pdf');
      const [a1, a2, b1] = E.state.pages.map((p) => p.id);
      E.commit('Move', (st) => E.ops.move(st, [b1], 0));
      PT.A.rotate([a1], 90);
      PT.A.rotate([a2], -90);
      E.commit('Blank', (st) => E.ops.insert(st, 3, [E.blankPage(200, 100)]));
      const out = await PT.read(await E.build());
      expect(out.n).toBe(4);
      expect(out.pages.map((p) => p.text)).toEqual(['Beta one', 'Alpha one', 'Alpha two', '']);
      expect(out.pages.map((p) => p.rotate)).toEqual([0, 90, 0, 0]);
      expect(out.pages[0].view).toEqual([0, 0, 400, 500]);
      expect(out.pages[3].view).toEqual([0, 0, 200, 100]);
      expect(PT.win.document.querySelectorAll('#grid .sheet').length).toBe(4);
    });

    it('places annotations pixel-exact on /Rotate 90, user-rotated and offset-MediaBox pages', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'r90', rotate: 90 }, { text: 'plain' }, { text: 'off', box: [50, 60, 350, 260] }]), 'geo.pdf');
      PT.A.rotate([E.state.pages[1].id], 270);
      PT.A.rotate([E.state.pages[2].id], 180);
      const expected = [];
      E.commit('Add boxes', (st) => st.pages.forEach((p, k) => {
        const g = E.geom(p), R = E.rotation(p);
        const a = { id: 'a' + k, type: 'rect', cx: 200, cy: 70, w: 50, h: 24, rot: R, fill: RED, color: 'none', width: 0, opacity: 1 };
        p.annots.push(a);
        expected.push(E.annotViewRect(a, R, g.W, g.H));
      }));
      const bytes = await E.build();
      for (let k = 0; k < 3; k++) {
        const c = await PT.render(bytes, k, 1), r = expected[k];
        expect(PT.isRed(PT.px(c, r.x + r.w / 2, r.y + r.h / 2))).toBe(true);
        expect(PT.isRed(PT.px(c, r.x + 2, r.y + 2))).toBe(true);
        expect(PT.isRed(PT.px(c, r.x + r.w - 2, r.y + r.h - 2))).toBe(true);
        expect(PT.isWhite(PT.px(c, r.x - 3, r.y + r.h / 2))).toBe(true);
        expect(PT.isWhite(PT.px(c, r.x + r.w / 2, r.y + r.h + 3))).toBe(true);
      }
    });

    it('draws text, pen, arrow, image and stamp annotations into the output', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'x' }, { text: 'y' }]), 'ann.pdf');
      const c = PT.win.document.createElement('canvas'); c.width = c.height = 4;
      const g = c.getContext('2d'); g.fillStyle = '#00f'; g.fillRect(0, 0, 4, 4);
      const asset = E.addAsset({ mime: 'image/png', url: c.toDataURL('image/png'), w: 4, h: 4 });
      E.commit('Annots', (st) => {
        st.pages[0].annots.push({ id: 't', type: 'text', text: 'Hello goo', font: 'Helvetica', size: 14, color: '#000000', cx: 150, cy: 100, w: 80, h: 20, rot: 0 });
        st.pages[0].annots.push({ id: 'p', type: 'pen', pts: [[10, 150], [60, 160]], color: RED, width: 3 });
        st.pages[0].annots.push({ id: 'ar', type: 'arrow', pts: [[200, 150], [280, 150]], color: RED, width: 2 });
        st.pages[1].annots.push({ id: 'i', type: 'image', asset: asset.id, cx: 150, cy: 100, w: 40, h: 40, rot: 0 });
        st.stamps.pageNumbers = { format: 'page-of', position: 'bottom-right', size: 10 };
        st.stamps.watermark = { text: 'DRAFT', size: 40, opacity: 0.3 };
      });
      const bytes = await E.build(), out = await PT.read(bytes), bare = await E.build({ stamps: false });
      expect(out.pages[0].text).toContain('Hello goo');
      expect(out.pages[0].text).toContain('Page 1 of 2');
      expect(out.pages[1].text).toContain('Page 2 of 2');
      expect(out.pages[1].text).toContain('DRAFT');
      const c1 = await PT.render(bare, 1, 1), blue = PT.px(c1, 150, 100);
      expect(blue[2] > 200 && blue[0] < 60).toBe(true);
      const c0 = await PT.render(bare, 0, 1);
      expect(PT.isRed(PT.px(c0, 240, 150))).toBe(true);
      const plain = await PT.read(bare);
      expect(plain.pages[0].text).not.toContain('Page 1');
    });

    it('writes metadata (title, author, subject, keywords, producer)', async () => {
      const E = PT.E;
      E.commit('Meta', (st) => Object.assign(st.meta, { title: 'Goo Report', author: 'Sloppo', subject: 'Slime', keywords: 'goo, jelly; slime' }));
      const out = await PT.read(await E.build());
      expect(out.info.Title).toBe('Goo Report');
      expect(out.info.Author).toBe('Sloppo');
      expect(out.info.Subject).toBe('Slime');
      expect(out.info.Keywords).toContain('jelly');
      expect(out.info.Producer).toContain('Slop PDF');
    });

    it('reads the title of the first opened file into the metadata panel model', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'm' }], { title: 'Original Title' }), 'meta.pdf');
      expect(PT.E.state.meta.title).toBe('Original Title');
      PT.A.setTool('metadata');
      await waitFor(() => [...PT.win.document.querySelectorAll('#props input')].some((i) => i.value === 'Original Title'));
      PT.A.setTool('organize');
    });
  });

  describe('forms', () => {
    const makeForm = () => PT.makePdf([{ text: 'Form', w: 400, h: 400 }], { form: (doc, form, pages) => {
      const p = pages[0];
      form.createTextField('name').addToPage(p, { x: 20, y: 300, width: 200, height: 24 });
      form.createCheckBox('agree').addToPage(p, { x: 20, y: 250, width: 18, height: 18 });
      const dd = form.createDropdown('color'); dd.addOptions(PT.win.Array.of('Red', 'Green')); dd.addToPage(p, { x: 20, y: 200, width: 120, height: 22 });
      const rg = form.createRadioGroup('size'); rg.addOptionToPage('S', p, { x: 20, y: 150, width: 16, height: 16 }); rg.addOptionToPage('M', p, { x: 60, y: 150, width: 16, height: 16 });
    } });
    it('lists fields, shows them in the Forms panel and keeps them editable with the values set', async () => {
      PT.reset();
      const E = PT.E, f = await PT.open(await makeForm(), 'form.pdf');
      const fields = await E.loadFields(f);
      expect(fields.map((x) => x.name + ':' + x.type).sort()).toEqual(['agree:checkbox', 'color:combobox', 'name:text', 'size:radiobutton']);
      expect(fields.find((x) => x.name === 'size').options).toEqual(['S', 'M']);
      PT.A.setTool('forms');
      await waitFor(() => PT.win.document.querySelectorAll('#props .form-field').length === 4);
      E.commit('Fill', (st) => { st.forms[f.id] = { name: 'Sloppo', agree: true, color: 'Green', size: 'M' }; });
      const out = await PT.read(await E.build());
      const val = (n) => out.fields[n].find((w) => w.type).value;
      expect(val('name')).toBe('Sloppo');
      expect(val('agree') !== 'Off' && !!val('agree')).toBe(true);
      expect(String(val('color'))).toBe('Green');
      const sz = out.fields.size.filter((w) => w.type);
      expect(sz.findIndex((w) => w.exportValues === w.value)).toBe(1);
      PT.A.setTool('organize');
    });
    it('flattens forms into page content', async () => {
      const E = PT.E;
      E.commit('Flatten forms', (st) => { st.flattenForms = true; });
      const out = await PT.read(await E.build());
      expect(!out.fields || !Object.keys(out.fields).length).toBe(true);
      expect(out.pages[0].text).toContain('Sloppo');
    });
  });

  describe('split / extract', () => {
    it('splits by ranges into a zip of valid PDFs', async () => {
      PT.reset();
      await PT.open(await PT.makePdf([{ text: 'S1' }, { text: 'S2' }, { text: 'S3' }]), 'split.pdf');
      Object.assign(PT.SP.panels.split, { mode: 'ranges', ranges: '1-2, 3', output: 'zip' });
      const cap = PT.captureDownloads();
      try { await PT.A.split(); } finally { cap.restore(); }
      expect(cap.list.length).toBe(1);
      expect(cap.list[0].name).toMatch(/split.*\.zip$/);
      const files = PT.unzip(new Uint8Array(await cap.list[0].blob.arrayBuffer()));
      expect(files.length).toBe(2);
      expect(files[0].name).toMatch(/part1-p1-2\.pdf$/);
      const r1 = await PT.read(files[0].data), r2 = await PT.read(files[1].data);
      expect(r1.pages.map((p) => p.text)).toEqual(['S1', 'S2']);
      expect(r2.pages.map((p) => p.text)).toEqual(['S3']);
    });
    it('splits every page into separate files and extracts a selection', async () => {
      Object.assign(PT.SP.panels.split, { mode: 'each', output: 'files' });
      let cap = PT.captureDownloads();
      try { await PT.A.split(); } finally { cap.restore(); }
      expect(cap.list.length).toBe(3);
      expect((await PT.read(await PT.bytesOf(cap.list[2].blob))).pages[0].text).toBe('S3');
      const ids = PT.E.state.pages.map((p) => p.id);
      PT.SP.organizer.setSelection([ids[0], ids[2]], ids[0]);
      cap = PT.captureDownloads();
      try { await PT.A.extract(); } finally { cap.restore(); }
      expect(cap.list.length).toBe(1);
      expect((await PT.read(await PT.bytesOf(cap.list[0].blob))).pages.map((p) => p.text)).toEqual(['S1', 'S3']);
      PT.SP.organizer.setSelection([]);
    });
  });
})();
