/* Slop PDF: true redaction. Find (text, regex, presets), marks, apply, and proof that the text inside
   the boxes is gone from the exported file while untouched pages keep their text.
   Covers: pdf/js/redact/apply.js */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;

  /** pages: [{lines: [[x, y, text]], rotate, field: [name, x, y, w, h], link: [x, y, w, h, uri]}] */
  async function makeDoc(pages, opts = {}) {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.create(), font = await doc.embedFont(L.StandardFonts.Helvetica);
    const form = doc.getForm();
    for (const p of pages) {
      const pg = doc.addPage(PT.win.Array.of(400, 300));
      for (const l of p.lines) pg.drawText(l[2], { x: l[0], y: l[1], size: 14, font });
      if (p.rotate) pg.setRotation(L.degrees(p.rotate));
      if (p.field) { const tf = form.createTextField(p.field[0]); tf.setText('field secret ' + p.field[0]); tf.addToPage(pg, { x: p.field[1], y: p.field[2], width: p.field[3], height: p.field[4] }); }
      if (p.link) {
        const [x, y, w, h, uri] = p.link;
        const ref = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: PT.win.Array.of(x, y, x + w, y + h), A: { Type: 'Action', S: 'URI', URI: L.PDFString.of(uri) } }));
        pg.node.addAnnot(ref);
      }
    }
    if (opts.title) { doc.setTitle(opts.title); doc.setAuthor('Agent Smith'); }
    if (opts.edit) await opts.edit(doc, L, font);
    return doc.save();
  }
  /** True if `needle` occurs in any decoded stream or string of the PDF (plain or as hex). */
  async function rawContains(bytes, needle) {
    const L = PT.win.PDFLib, doc = await L.PDFDocument.load(bytes, { updateMetadata: false });
    const hex = [...needle].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      let txt = '';
      if (obj instanceof L.PDFRawStream) { try { txt = String.fromCharCode(...L.decodePDFRawStream(obj).decode()); } catch (e) { txt = ''; } }
      txt += ' ' + obj.toString();
      if (txt.includes(needle) || txt.toUpperCase().includes(hex)) return true;
    }
    return false;
  }
  const R = () => PT.SP.redact;
  const allText = (out) => out.pages.map((p) => p.text).join(' | ');

  describe('redaction: find', () => {
    it('finds e-mails, phone numbers, Luhn-valid cards and SSN-like IDs, plus text and regex', async () => {
      if (!PT.SP) await PT.boot();
      const f = (str, q) => R().findIn(str, R().matchers(q)).map((h) => str.slice(h[0], h[1]));
      const s = 'Mail jane.doe@example.co.uk or call +46 70-123 45 67. Card 4111 1111 1111 1111, bad 4111 1111 1111 1112. SSN 123-45-6789, pnr 19800101-1234. Order 2024-10-11.';
      expect(f(s, { presets: ['email'] })).toEqual(['jane.doe@example.co.uk']);
      expect(f(s, { presets: ['card'] })).toEqual(['4111 1111 1111 1111']);
      expect(f(s, { presets: ['ssn'] })).toEqual(['123-45-6789', '19800101-1234']);
      expect(f(s, { presets: ['phone'] }).includes('+46 70-123 45 67')).toBe(true);
      expect(f(s, { text: 'CARD' })).toEqual(['Card']);
      expect(f(s, { text: 'CARD', matchCase: true })).toEqual([]);
      expect(f(s, { text: 'Order \\d+', regex: true })).toEqual(['Order 2024']);
      expect(R().luhn('4111111111111111')).toBe(true);
      let bad = null; try { R().matchers({ text: '(', regex: true }); } catch (e) { bad = e; }
      expect(!!bad).toBe(true);
    });

    it('locates matches on every page with boxes around the words', async () => {
      PT.reset();
      await PT.open(await makeDoc([{ lines: [[20, 250, 'Nothing here']] }, { lines: [[40, 200, 'Contact: bob@secret.example now']], rotate: 90 }]), 'find.pdf');
      const res = await R().search({ presets: ['email'] });
      expect(res.length).toBe(1);
      expect(res[0].index).toBe(1);
      expect(res[0].text).toBe('bob@secret.example');
      const b = res[0].boxes[0];
      // text baseline y=200 → page-space top ~ 300-200-14; starts after "Contact: " (x > 40)
      expect(b.x > 80 && b.x < 120).toBe(true);
      expect(b.y > 80 && b.y < 90).toBe(true);
      expect(b.y + b.h > 100 && b.y + b.h < 106).toBe(true);
      expect(b.w > 110 && b.w < 160).toBe(true);
    });
  });

  describe('redaction: apply', () => {
    it('removes the text inside the boxes from the exported file and keeps untouched pages as text', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await makeDoc([
        { lines: [[20, 250, 'Public intro page']] },
        { lines: [[20, 250, 'Visible heading'], [20, 200, 'Mail agent007@spy.example today'], [20, 150, 'TOPSECRET plan']], rotate: 90, field: ['ssn', 20, 60, 160, 24], link: [250, 250, 100, 20, 'https://slopographic.com/'] },
        { lines: [[20, 250, 'Keep this page']] }], { title: 'Secret dossier' }), 'dossier.pdf');
      const p2 = E.state.pages[1];
      expect(R().markMatches(await R().search({ presets: ['email'] }))).toBe(1);
      expect(R().markMatches(await R().search({ text: 'TOPSECRET' }))).toBe(1);
      // a drawn box over the form field
      E.commit('box', () => p2.annots.push(R().mark({ x: 15, y: 210, w: 175, h: 34 }), { id: 'pen1', type: 'pen', pts: [[30, 225], [60, 230]], color: '#00f', width: 2 }));
      let err = null; try { await E.build(); } catch (e) { err = e; }
      expect(String(err && err.message)).toContain('marked for redaction');
      const res = await E.applyRedactions({ dpi: 150, stripMeta: true });
      expect(res).toEqual({ pages: 1, marks: 3 });
      expect(E.state.pages[1].redacted).toBe(true);
      expect(E.state.pages[1].annots.length).toBe(0); // the pen stroke inside a box went too
      expect(PT.win.document.querySelector('#grid .thumb:nth-child(2) .thumb-redact').textContent).toBe('Redacted');
      const bytes = await E.build(), out = await PT.read(bytes);
      expect(out.n).toBe(3);
      const t = allText(out);
      expect(t.includes('agent007')).toBe(false);
      expect(t.includes('spy.example')).toBe(false);
      expect(t.includes('TOPSECRET')).toBe(false);
      expect(t.includes('field secret')).toBe(false);
      expect(out.pages[1].text).toBe('');
      expect(out.pages[0].text).toBe('Public intro page');
      expect(out.pages[2].text).toBe('Keep this page');
      expect(out.pages[1].rotate).toBe(90);
      expect(out.pages[1].view).toEqual([0, 0, 400, 300]);
      expect(out.info.Title == null || out.info.Title === '').toBe(true);
      expect(out.info.Author == null || out.info.Author === '').toBe(true);
      expect(out.fields == null || !Object.keys(out.fields).length).toBe(true);
      const links = await (await out.doc.getPage(2)).getAnnotations();
      expect(links.map((a) => a.url)).toEqual(['https://slopographic.com/']);
      await out.doc.destroy();
      for (const s of ['agent007', 'TOPSECRET', 'field secret', 'Secret dossier', 'Agent Smith']) expect(await rawContains(bytes, s)).toBe(false);
      expect(await rawContains(bytes, 'Keep this page')).toBe(true);
      // the box is solid black in the image (rotated 90: page-space (x, y) → view (300 - y, x))
      const c = await PT.render(bytes, 1, 1);
      const px = PT.px(c, 300 - 225, 100);
      expect(px[0] < 30 && px[1] < 30 && px[2] < 30).toBe(true);
      const outside = PT.px(c, 150, 300);
      expect(PT.isWhite(outside)).toBe(true);
    });

    it('does not carry XObjects of a redacted page along through shared resources', async () => {
      PT.reset();
      const E = PT.E;
      const bytes0 = await makeDoc([{ lines: [[20, 250, 'Clean page']] }, { lines: [] }], {
        edit: async (doc, L, font) => {
          const donor = await L.PDFDocument.create(), dp = donor.addPage(PT.win.Array.of(200, 100));
          dp.drawText('SharedSecret inside', { x: 10, y: 40, size: 14, font: await donor.embedFont(L.StandardFonts.Helvetica) });
          const emb = await doc.embedPage(dp);
          const [a, b] = doc.getPages();
          b.drawPage(emb, { x: 20, y: 100 });
          a.node.set(L.PDFName.of('Resources'), b.node.get(L.PDFName.of('Resources'))); // one shared dict
        }
      });
      await PT.open(bytes0, 'shared.pdf');
      expect(await rawContains(await E.build(), 'SharedSecret')).toBe(true); // without redaction it is there
      E.commit('box', (st) => st.pages[1].annots.push(R().mark({ x: 20, y: 100, w: 200, h: 100 })));
      await E.applyRedactions({ dpi: 100 });
      const bytes = await E.build(), out = await PT.read(bytes);
      expect(out.pages[0].text).toBe('Clean page');
      expect(allText(out).includes('SharedSecret')).toBe(false);
      await out.doc.destroy();
      expect(await rawContains(bytes, 'SharedSecret')).toBe(false);
    });

    it('asks before applying, asks again on download, and can be undone', async () => {
      PT.reset();
      const E = PT.E, d = PT.win.document;
      await PT.open(await makeDoc([{ lines: [[20, 250, 'Undo me secret']] }]), 'undo.pdf');
      PT.A.setTool('redact');
      E.commit('box', (st) => st.pages[0].annots.push(R().mark({ x: 10, y: 30, w: 200, h: 30 }, 'Undo me')));
      expect(d.querySelectorAll('#props .rd-review .rd-item').length).toBe(1);
      expect(d.querySelector('.pv-svg .an-redact pattern') != null).toBe(true);
      const p = PT.A.applyRedactions();
      await SlopTest.waitFor(() => d.querySelector('.sui-dlg'));
      expect(d.querySelector('.sui-dlg').textContent).toContain('permanent');
      d.querySelector('.sui-dlg .sui-danger').click();
      expect(await p).toBe(true);
      expect(E.state.pages[0].redacted).toBe(true);
      expect(d.querySelector('.pv-page').classList.contains('is-redacted')).toBe(true);
      PT.A.undo();
      expect(!!E.state.pages[0].redacted).toBe(false);
      expect(R().pending().length).toBe(1);
      const cap = PT.captureDownloads();
      try {
        const dl = PT.A.download();
        await SlopTest.waitFor(() => d.querySelector('.sui-dlg'));
        expect(d.querySelector('.sui-dlg').textContent).toContain('not removed yet');
        d.querySelector('.sui-dlg .sui-primary').click();
        await dl;
        expect(cap.list.length).toBe(1);
        const out = await PT.read(await PT.bytesOf(cap.list[0].blob));
        expect(out.pages[0].text).toBe('');
        await out.doc.destroy();
      } finally { cap.restore(); }
      PT.A.showGrid(true); PT.A.setTool('organize');
    });
  });
})();
