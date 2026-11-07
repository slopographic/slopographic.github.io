/* Slop PDF: File ▸ Extract all. A PDF made in the test with a JPEG, text in an embedded Barlow subset and two attachments
   (a Factur-X XML and a note): the dialog lists the image with its size, both files with their types, and the font; the
   ZIP holds the JPEG as stored, both attachments byte for byte, the font program, each page's text and the page as a
   150 dpi PNG. A saved PDF keeps the attachments. The headless operation (shared/ops/pdf-extract.js, for File convert,
   Workflows and the assistant) gives the same files, and pdf.extract.list names them. */
// Covers: pdf/js/ui/assets.js, pdf/js/io/assets-scan.js, pdf/js/io/assets-save.js, pdf/js/io/assets-model.js, pdf/js/io/extract-more.js,
//   pdf/js/core/pdf-parts.js, pdf/js/io/export-oc.js, shared/ops/pdf-extract.js, shared/ops/all.js, shared/ops/registry.js,
//   pdf/js/ui/ai-objects.js
(function () {
  'use strict';
  const ok = (c, msg) => { if (!c) throw new Error('not so: ' + msg); };
  const { describe, it, expect, waitFor } = SlopTest;
  const doc = () => PT.win.document;
  const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
  let fx;

  describe('Slop PDF: Extract all', () => {
    it('lists the image, the two embedded files and the font', async () => {
      if (!PT.SP) await PT.boot();
      fx = await PT.partsPdf();
      await PT.openView(fx.bytes, 'invoice.pdf');
      PT.A.extractAssets();
      const dlg = await waitFor(() => doc().querySelector('.ea-dlg'), { timeout: 15000 });
      const titles = [...dlg.querySelectorAll('.ea-row .ea-title')].map((t) => t.textContent);
      ok(titles.includes('factur-x.xml') && titles.includes('notes.txt'), titles.join(', '));
      const img = [...dlg.querySelectorAll('.ea-row')].find((r) => r.textContent.includes('64×48'));
      ok(!!img, '!!img');
      const xml = [...dlg.querySelectorAll('.ea-row')].find((r) => r.textContent.includes('factur-x.xml'));
      ok(xml.textContent.includes('text/xml') && xml.textContent.includes('e-invoice'), xml.textContent);
      const font = [...dlg.querySelectorAll('.ea-row')].find((r) => r.textContent.includes('Barlow'));
      ok(!!font && !font.querySelector('input').disabled, "!!font && !font.querySelector('input').disabled");
    }, { timeout: 60000 });

    it('Download ZIP holds the JPEG as stored, both files byte for byte, the font, the text and the page as PNG', async () => {
      const dlg = doc().querySelector('.ea-dlg');
      dlg.querySelector('input[data-part="text"]').click();
      dlg.querySelector('input[data-part="pages"]').click();
      const dl = PT.captureDownloads();
      try {
        [...dlg.querySelectorAll('.sui-btn')].find((b) => b.textContent === 'Download ZIP').click();
        await waitFor(() => dl.list.length > 0, { timeout: 30000 });
      } finally { dl.restore(); }
      expect(dl.list[0].name).toBe('invoice-assets.zip');
      const zip = await import('../../shared/office/zip.js');
      const m = await zip.readZip(new Uint8Array(await dl.list[0].blob.arrayBuffer())), names = [...m.keys()];
      const jpg = names.find((n) => /^images\/.*\.jpg$/.test(n));
      ok(same(m.get(jpg), fx.jpeg), 'the JPEG as stored');
      ok(same(m.get('attachments/factur-x.xml'), fx.xml), "same(m.get('attachments/factur-x.xml'), fx.xml)");
      ok(same(m.get('attachments/notes.txt'), fx.notes), "same(m.get('attachments/notes.txt'), fx.notes)");
      const ttf = names.find((n) => /^fonts\/.*\.ttf$/.test(n));
      const sig = ttf ? [...m.get(ttf).slice(0, 4)].join(',') : '';
      ok(sig === '0,1,0,0' || sig === '116,114,117,101', 'a TrueType program (00 01 00 00 or "true"), got ' + sig + ' in ' + names.join(', '));
      ok(new TextDecoder().decode(m.get('text/page-01.txt')).includes('Invoice 2024-17 total 120 EUR'), "new TextDecoder().decode(m.get('text/page-01.txt')).includes('Invoice ");
      ok(new TextDecoder().decode(m.get('text/page-01.md')).startsWith('## Page 1'), "new TextDecoder().decode(m.get('text/page-01.md')).startsWith('## Page");
      const png = m.get('pages/page-01.png'), dv = new DataView(png.buffer, png.byteOffset);
      expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([Math.round(400 * 150 / 72), Math.round(300 * 150 / 72)]);
      expect(names.indexOf(jpg)).toBe(0, 'images first');
      PT.closeDialogs();
    }, { timeout: 90000 });

    it('a saved PDF keeps the attachments; the headless operation and pdf.extract.list give the same files', async () => {
      const r = await PT.read(await PT.E.build({}));
      const att = await r.doc.getAttachments();
      const got = Object.values(att || {}).map((a) => a.filename).sort();
      expect(got).toEqual(['factur-x.xml', 'notes.txt']);
      const op = await import('../../shared/ops/pdf-extract.js');
      const out = await op.extractParts(new Uint8Array(fx.bytes), { parts: 'all' });
      const by = Object.fromEntries(out.files.map((f) => [f.name, f]));
      ok(same(by['attachments/factur-x.xml'].data, fx.xml), Object.keys(by).join(', '));
      expect(by['attachments/factur-x.xml'].type).toBe('text/xml');
      ok(Object.keys(by).some((n) => /^images\/.*\.jpg$/.test(n) && same(by[n].data, fx.jpeg)), 'Object.keys(by).some((n) => /^images\\/.*\\.jpg$/.test(n) && same(by[n].');
      ok(Object.keys(by).some((n) => /^fonts\/.*\.ttf$/.test(n)), 'Object.keys(by).some((n) => /^fonts\\/.*\\.ttf$/.test(n))');
      const reg = await import('../../shared/ops/registry.js');
      ok(!!reg.byId('pdf.extract'), "!!reg.byId('pdf.extract')");
      const C = PT.win.SlopCmd;
      await C.prepare();
      const l = await C.exec('pdf.extract.list', {});
      ok(l.ok, l.error);
      expect(l.value.attachments.map((a) => a.name).sort()).toEqual(['factur-x.xml', 'notes.txt']);
      ok(l.value.attachments.find((a) => a.name === 'factur-x.xml').einvoice, "l.value.attachments.find((a) => a.name === 'factur-x.xml').einvoice");
    }, { timeout: 60000 });
  });
})();
