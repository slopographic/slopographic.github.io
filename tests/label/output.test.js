/* SlopLabel output tests: stocks, history, scene, ZPL snapshot and round trip, EPL/TSPL, PDF structure,
 * @page CSS, project files, form-link hashing and the offline builder's escaping. */
(function () {
  const { describe, it, expect } = SlopTest;
  const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; };
  /** A small fixed label: 50 × 25 mm at 203 dpi with text, Code 128, a box and a line. */
  function sampleDoc() {
    const d = W.newDoc({ stock: W.stockById('roll-50x25'), unit: 'mm', name: 'Sample' });
    d.objects.push(
      W.makeObject('text', { id: 't1', x: 2, y: 2, content: 'Hello {Who}', size: 10, font: 'sans' }),
      W.makeObject('barcode', { id: 'b1', x: 2, y: 8, content: 'SLOP-{Serial}', symbology: 'code128', module: 0.25, barHeight: 10, hr: 'none', quiet: false }),
      W.makeObject('rect', { id: 'r1', x: 30, y: 2, w: 18, h: 5, stroke: 0.5 }),
      W.makeObject('line', { id: 'l1', x: 0, y: 23.75, w: 50, h: 0.5, stroke: 0.5, dir: 'h' }));
    d.vars.push(W.makeVar('prompt', 'Who', { def: 'World' }), W.makeVar('counter', 'Serial', { start: 1, pad: 3 }));
    return d;
  }

  describe('stocks and layout', () => {
    it('places Avery 5160 slots exactly', () => {
      const d = W.newDoc({ stock: W.stockById('avery-5160') });
      const st = W.stockOf(d), pos = W.sheetPositions(st);
      expect(pos.length).toBe(30);
      expect(pos[0]).toEqual({ x: 4.7625, y: 12.7, col: 0, row: 0 });
      expect(pos[1].x - pos[0].x).toBeCloseTo(69.85);
      expect(pos[3].y - pos[0].y).toBeCloseTo(25.4);
      expect([st.pageW, st.pageH]).toEqual([215.9, 279.4]);
    });
    it('starts a sheet job at a used-label offset and spills onto a new page', () => {
      const d = W.newDoc({ stock: W.stockById('avery-5160') });
      const L = W.layoutPages(d, 32, 5);
      expect(L.pages.length).toBe(2);
      expect(L.pages[0].slots.length).toBe(25);
      expect(L.pages[0].slots[0]).toEqual({ x: 144.4625, y: 38.1, label: 0 });
      expect(L.pages[1].slots[0].label).toBe(25);
    });
    it('writes an exact @page rule', () => {
      const d = W.newDoc({ stock: W.stockById('roll-4x6') });
      expect(W.pageCSS(W.stockOf(d))).toBe('@page { size: 101.6mm 152.4mm; margin: 0; }');
      expect(W.pageCSS(W.stockOf(W.newDoc({ stock: W.stockById('avery-l7160') })))).toBe('@page { size: 210mm 297mm; margin: 0; }');
    });
    it('expands jobs with records, quantity columns and copies', () => {
      const d = sampleDoc();
      d.data = W.tableToSource([['Who', 'Qty'], ['Ann', '2'], ['Bob', 'x'], ['Cy', '0']]);
      d.data.qtyCol = 'Qty';
      const j = W.buildJob(d, { copies: 2 });
      expect(j.labels.length).toBe(6); // Ann ×2, Bob ×1 (bad qty), Cy ×0, each twice
      expect(j.serials).toBe(3);
      expect(j.warnings.length).toBe(1);
      expect(j.labels[0].get('Who')).toBe('Ann');
      expect(j.labels[2].get('Serial')).toBe('002');
      expect(j.labels[4].get('Who')).toBe('Bob');
    });
  });

  describe('history', () => {
    it('undoes, redoes and coalesces edits', () => {
      const d = W.newDoc(), h = new W.History();
      h.reset(d);
      d.name = 'A'; h.push(d, 'Rename');
      d.objects.push(W.makeObject('rect')); h.push(d, 'Add');
      d.objects[0].x = 6; h.push(d, 'Move', 'mv'); d.objects[0].x = 7; h.push(d, 'Move', 'mv');
      expect(h.stack.length).toBe(4);
      expect(h.push(d, 'Same')).toBe(false);
      let r = h.undo(d); expect(r.objects[0].x).toBe(5);
      r = h.undo(r); expect(r.objects.length).toBe(0);
      expect(h.redoLabel).toBe('Add');
      r = h.redo(r); r = h.redo(r); expect(r.objects[0].x).toBe(7);
      expect(h.canRedo).toBe(false);
    });
  });

  describe('scene', () => {
    it('lays out auto-size text and barcodes without errors', () => {
      const d = sampleDoc(), sc = W.buildScene(d, W.previewResolver(d));
      expect(W.sceneErrors(sc)).toEqual([]);
      const t = sc.find((i) => i.obj.id === 't1');
      expect(t.text).toBe('Hello World');
      expect(t.box.w).toBeGreaterThan(10);
      const b = sc.find((i) => i.obj.id === 'b1');
      expect(b.value).toBe('SLOP-001');
      expect(b.geom.module).toBeCloseTo(0.2502, 1e-3); // 2 dots at 203 dpi
    });
    it('reports invalid barcode data as an item error', () => {
      const d = W.newDoc(); d.objects.push(W.makeObject('barcode', { symbology: 'ean13', content: '123' }));
      const sc = W.buildScene(d, W.previewResolver(d));
      expect(W.sceneErrors(sc)[0]).toMatch(/EAN-13 needs 12 digits/);
    });
  });

  describe('ZPL', () => {
    it('matches the snapshot for a known label', () => {
      const d = sampleDoc(), sc = W.buildScene(d, W.previewResolver(d));
      const z = W.buildZPL(d, [sc]);
      const lines = z.split('\n');
      expect(lines.slice(0, 6)).toEqual(['~SD15', '^XA', '^CI28', '^PW400', '^LL200', '^LH0,0']);
      expect(lines[6]).toBe('^MNY^MTD^PR4^PON');
      expect(z).toContain('^A0N,28,24^FB');
      expect(z).toContain('^FDHello World^FS');
      expect(z).toContain('^BY2^BCN,80,N,N,N,N^FD>:SLOP-001^FS');
      expect(z).toContain('^FO240,16^GB144,40,4,B,0^FS');
      expect(z).toMatch(/\^FO0,19\d\^GB400,4,4\^FS/);
      expect(z.trim().endsWith('^PQ1,0,1,Y\n^XZ'.trim())).toBe(true);
    });
    it('round-trips through the ZPL importer', async () => {
      const d = sampleDoc(), sc = W.buildScene(d, W.previewResolver(d));
      const back = await W.importZPL(W.buildZPL(d, [sc]), { dpi: 203 });
      expect(back.label.w).toBeCloseTo(50.04, 0.05);
      expect(back.label.h).toBeCloseTo(25.02, 0.05);
      const bc = back.objects.find((o) => o.type === 'barcode');
      expect(bc.symbology).toBe('code128');
      expect(bc.content).toBe('SLOP-001');
      expect(bc.x).toBeCloseTo(2, 0.15); expect(bc.y).toBeCloseTo(8, 0.15);
      const tx = back.objects.find((o) => o.type === 'text');
      expect(tx.content).toBe('Hello World');
      expect(back.objects.some((o) => o.type === 'rect')).toBe(true);
      expect(back.objects.some((o) => o.type === 'line' && o.dir === 'h')).toBe(true);
      // and the re-imported label renders without errors
      expect(W.sceneErrors(W.buildScene(back, W.previewResolver(back)))).toEqual([]);
    });
    it('merges identical copies into ^PQ and escapes field data', () => {
      const d = sampleDoc(), J = W.buildJob(d, { qty: 2, copies: 3 });
      const scenes = J.labels.map((l) => W.buildScene(d, l.get));
      const z = W.buildZPL(d, scenes, { keys: J.labels.map((l) => l.serial) });
      expect((z.match(/\^XA/g) || []).length).toBe(2);
      expect((z.match(/\^PQ3,/g) || []).length).toBe(2);
      expect(W.zplFieldData('a^b~c\\é')).toEqual({ fh: '^FH\\', data: 'a\\5Eb\\7Ec\\5C\\C3\\A9' });
    });
    it('exports GS1 DataMatrix natively and rotated QR as a graphic', () => {
      const d = W.newDoc({ stock: W.stockById('roll-50x25') });
      d.objects.push(W.makeObject('barcode', { symbology: 'gs1datamatrix', content: '(01)09501101530003(10)A1', module: 0.5, hr: 'none', x: 2, y: 2 }),
        W.makeObject('barcode', { symbology: 'qrcode', content: 'hi', module: 0.5, hr: 'none', x: 25, y: 2, rot: 90 }));
      const z = W.buildZPL(d, [W.buildScene(d, W.previewResolver(d))]);
      expect(z).toContain('^BXN,4,200,,,,_^FD_1010950110153000310A1^FS');
      expect(z).toMatch(/\^GFA,\d+,\d+,\d+,/);
    });
    it('compresses and decodes ^GFA graphics losslessly', () => {
      const bpr = 3, h = 4, bits = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 0x81, 0x00, 0x42]);
      const enc = W.zplCompressGFA(bits, bpr, h);
      expect(enc.startsWith(',')).toBe(true);
      expect(Array.from(W.zplDecodeGFA(enc, bpr, bpr * h))).toEqual(Array.from(bits));
    });
    it('imports Zebra fields, serials and GS1 barcodes', async () => {
      const zpl = '^XA^PW406^LL203^FO20,20^A0N,30,30^FN1^FDLot 7^FS^FO20,60^BY2^BCN,50,Y,N,N^FD>;>80109501101530003>610LOT^FS^FO20,140^A0N,25,25^SNA001,1,Y^FS^FO300,20^BQN,2,4^FDMA,https://x.y^FS^XZ';
      const d = await W.importZPL(zpl);
      expect(d.vars.map((v) => v.type)).toEqual(['prompt', 'counter']);
      const gs = d.objects.find((o) => o.symbology === 'gs1-128');
      expect(gs.content).toBe('(01)09501101530003(10)LOT');
      const qr = d.objects.find((o) => o.symbology === 'qrcode');
      expect(qr.content).toBe('https://x.y');
      expect(qr.ec).toBe('M');
    });
  });

  describe('EPL and TSPL', () => {
    it('emits native commands for text, barcodes and boxes', () => {
      const d = sampleDoc(), sc = W.buildScene(d, W.previewResolver(d));
      const t = new TextDecoder().decode(W.buildTSPL(d, [sc]));
      expect(t).toContain('SIZE 50 mm,25 mm');
      expect(t).toContain('TEXT 16,');
      expect(t).toMatch(/BARCODE 16,64,"128",80,0,0,2,2,"SLOP-001"/);
      expect(t).toContain('PRINT 1,1');
      const e = new TextDecoder().decode(W.buildEPL(d, [sc]));
      expect(e).toContain('q400');
      expect(e).toMatch(/B16,64,0,1,2,5,80,N,"SLOP-001"/);
      expect(e).toContain('P1,1');
    });
  });

  describe('PDF', () => {
    it('builds a valid PDF with exact page size and correct xref offsets', async () => {
      const d = W.TEMPLATES.find((t) => t.id === 'shipping').build();
      const sc = W.buildScene(d, W.previewResolver(d));
      const bytes = await W.buildPDF(d, [sc, sc], { compress: false });
      const s = latin1(bytes);
      expect(s.startsWith('%PDF-1.4')).toBe(true);
      expect(s).toContain('/MediaBox [0 0 288 432]');
      expect(s).toContain('/Count 2');
      expect(s).toContain('/BaseFont /Helvetica-Bold');
      expect(s).toMatch(/\/Font << \/F1 \d+ 0 R \/F2 \d+ 0 R/); // resource names keep their slash
      const sx = +/startxref\n(\d+)/.exec(s)[1];
      expect(s.slice(sx, sx + 4)).toBe('xref');
      const m = /xref\n0 (\d+)\n/.exec(s.slice(sx)), n = +m[1];
      const table = s.slice(sx + m[0].length).split('\n').slice(1, n);
      table.forEach((row, i) => { const off = +row.slice(0, 10); expect(s.slice(off, off + String(i + 1).length + 6)).toBe(`${i + 1} 0 obj`); });
    });
    it('compresses streams and falls back to images for non-Latin text', async () => {
      const d = W.newDoc({ stock: W.stockById('roll-50x25') });
      d.objects.push(W.makeObject('text', { content: 'Привет ☃', x: 2, y: 2 }), W.makeObject('inverse', { x: 1, y: 1, w: 10, h: 5 }));
      const s = latin1(await W.buildPDF(d, [W.buildScene(d, W.previewResolver(d))]));
      expect(s).toContain('/FlateDecode');
      expect(s).toContain('/Subtype /Image');
      expect(s).toContain('/BM /Difference');
      expect(s).toContain('/MediaBox [0 0 141.7323 70.8661]');
    });
  });

  describe('files', () => {
    it('saves and re-opens projects', async () => {
      const d = sampleDoc();
      const back = W.parseProject(await W.projectBlob(d).text());
      expect(back.objects.length).toBe(4);
      expect(back.vars.map((v) => v.name)).toEqual(['Who', 'Serial']);
      expect(() => W.parseProject('{"app":"other"}')).toThrow(/Not a SlopLabel/);
    });
    it('encodes documents into form links and back', async () => {
      const d = W.TEMPLATES.find((t) => t.id === 'sscc').build();
      const h = await W.encodeDocHash(d);
      expect(h[0]).toBe('z');
      const back = await W.decodeDocHash(h);
      expect(back.objects.length).toBe(d.objects.length);
      expect(back.vars.find((v) => v.name === 'SSCC').expr).toBe('{SSCCBody|gs1check}');
    });
    it('builds an offline page whose embedded sources survive tricky code', () => {
      const index = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="a.css"></head><body><p>x</p><script src="b.js"></script></body></html>';
      const js = 'var s = "</script><!-- $& $$ $1 </body></html>"; var u = " ";';
      const src = { 'index.html': index, 'a.css': 'b::after { content: "</style>"; }', 'b.js': js };
      const html = W.buildOfflineHTML(src);
      expect(html).toContain('<meta name="sloplabel-build" content="offline">');
      expect(html.indexOf('</script><!--')).toBe(-1);
      const back = W.extractOfflineSources(html);
      expect(back).toEqual(src);
      expect(W.offlineManifest(index)).toEqual(['a.css', 'b.js']);
    });
  });
})();
