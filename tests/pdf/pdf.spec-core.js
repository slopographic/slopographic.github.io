/* Slop PDF: pure logic: ranges, zip/CRC, geometry, page operations, undo/redo, stamps text, build helpers. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;

  describe('boot', () => {
    it('loads the app with its engine, rail and empty state', async () => {
      await PT.boot();
      expect(typeof PT.E.build).toBe('function');
      expect(PT.win.document.querySelectorAll('.rail-b').length).toBe(13);
      expect(PT.win.document.getElementById('empty').hidden).toBe(false);
      expect(PT.win.document.title).toContain('Slop PDF');
    }, { timeout: 40000 });
  });

  describe('util', () => {
    it('parses page ranges (open ends, reverse, words) and rejects bad ones', () => {
      const r = PT.U.parseRanges;
      expect(r('1-3, 5, 8-', 10)).toEqual([[0, 1, 2], [4], [7, 8, 9]]);
      expect(r('-2; 4 to 5', 6)).toEqual([[0, 1], [3, 4]]);
      expect(r('3-1', 5)).toEqual([[2, 1, 0]]);
      expect(r('2..3', 5)).toEqual([[1, 2]]);
      expect(() => r('', 5)).toThrow(/at least one/);
      expect(() => r('1-9', 5)).toThrow(/outside 1/);
      expect(() => r('abc', 5)).toThrow(/not a page range/);
      expect(() => r('0', 5)).toThrow(/outside/);
    });
    it('describes index lists compactly', () => {
      expect(PT.U.describeIdx([0, 1, 2, 4, 6, 7])).toBe('1–3, 5, 7–8');
    });
    it('computes CRC-32 and writes a valid store-only zip with unique names', async () => {
      const U = PT.U, enc = new TextEncoder();
      expect(U.crc32(enc.encode('123456789'))).toBe(0xcbf43926);
      expect(U.crc32(new Uint8Array(0))).toBe(0);
      const a = enc.encode('hello'), b = enc.encode('world!!');
      const zip = U.makeZip([{ name: 'a.pdf', data: a }, { name: 'a.pdf', data: b }, { name: 'ünï.txt', data: a }], new Date(2024, 0, 2, 3, 4, 6));
      expect(zip.type).toBe('application/zip');
      const files = PT.unzip(new Uint8Array(await zip.arrayBuffer()));
      expect(files.map((f) => f.name)).toEqual(['a.pdf', 'a (2).pdf', 'ünï.txt']);
      expect(new TextDecoder().decode(files[1].data)).toBe('world!!');
      files.forEach((f) => expect(U.crc32(f.data)).toBe(f.crc));
    });
    it('sniffs file types and makes safe names', () => {
      const U = PT.U;
      expect(U.sniff(U.ascii('%PDF-1.7\n'))).toBe('pdf');
      expect(U.sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe('png');
      expect(U.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
      expect(U.sniff(U.ascii('hello world'))).toBe('unknown');
      expect(U.safeName('a/b:c?', 'pdf')).toBe('a-b-c-.pdf');
      expect(U.safeName('x.PDF', 'pdf')).toBe('x.PDF');
      expect(U.safeName('', 'pdf')).toBe('document.pdf');
    });
  });

  describe('geometry', () => {
    it('maps page ↔ view points for every rotation (round trip)', () => {
      const E = PT.E, W = 300, H = 200;
      expect(E.toView(90, W, H, 10, 20)).toEqual([180, 10]);
      expect(E.toView(180, W, H, 10, 20)).toEqual([290, 180]);
      expect(E.toView(270, W, H, 10, 20)).toEqual([20, 290]);
      for (const R of [0, 90, 180, 270]) { const v = E.toView(R, W, H, 37, 81); expect(E.toPage(R, W, H, v[0], v[1])).toEqual([37, 81]); }
    });
    it('gives box annotations the right view rect and moves them back', () => {
      const E = PT.E, a = { type: 'rect', cx: 50, cy: 40, w: 60, h: 20, rot: 0 };
      expect(E.annotViewRect(a, 0, 300, 200)).toEqual({ x: 20, y: 30, w: 60, h: 20 });
      const r90 = E.annotViewRect(a, 90, 300, 200);
      expect(r90).toEqual({ x: 150, y: 20, w: 20, h: 60 });
      E.setAnnotViewRect(a, { x: 100, y: 100, w: 40, h: 80 }, 90, 300, 200);
      expect(E.annotViewRect(a, 90, 300, 200)).toEqual({ x: 100, y: 100, w: 40, h: 80 });
      const pen = { type: 'pen', pts: [[10, 10], [30, 50]] };
      expect(E.annotViewRect(pen, 0, 300, 200)).toEqual({ x: 10, y: 10, w: 20, h: 40 });
      E.setAnnotViewRect(pen, { x: 0, y: 0, w: 40, h: 80 }, 0, 300, 200);
      expect(pen.pts).toEqual([[0, 0], [40, 80]]);
    });
  });

  describe('page operations + undo', () => {
    const pg = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, f: 'f', i, rot: 0, annots: [] }));
    const ids = (st) => st.pages.map((p) => p.id);
    it('rotate, remove, duplicate, insert, move', () => {
      const ops = PT.E.ops, st = { pages: pg(5) };
      ops.rotate(st, ['p1'], -90); ops.rotate(st, ['p1'], 450);
      expect(st.pages[1].rot).toBe(0);
      ops.rotate(st, ['p2'], -90); expect(st.pages[2].rot).toBe(270);
      ops.remove(st, ['p0', 'p4']); expect(ids(st)).toEqual(['p1', 'p2', 'p3']);
      const added = ops.duplicate(st, ['p2']);
      expect(st.pages.length).toBe(4); expect(st.pages[2].id).toBe(added[0]); expect(st.pages[2].i).toBe(2);
      ops.insert(st, 0, [{ id: 'b', blank: { w: 1, h: 1 }, annots: [] }]); expect(ids(st)[0]).toBe('b');
      const s2 = { pages: pg(5) };
      ops.move(s2, ['p0', 'p1'], 4); expect(ids(s2)).toEqual(['p2', 'p3', 'p0', 'p1', 'p4']);
      ops.move(s2, ['p4'], 0); expect(ids(s2)).toEqual(['p4', 'p2', 'p3', 'p0', 'p1']);
      ops.move(s2, ['p2'], 99); expect(ids(s2)[4]).toBe('p2');
    });
    it('reverse (all / selection) and sort (collate, odd-even, even-odd)', () => {
      const ops = PT.E.ops;
      let st = { pages: pg(4) }; ops.reverse(st, null); expect(ids(st)).toEqual(['p3', 'p2', 'p1', 'p0']);
      st = { pages: pg(5) }; ops.reverse(st, ['p1', 'p3']); expect(ids(st)).toEqual(['p0', 'p3', 'p2', 'p1', 'p4']);
      st = { pages: pg(6) }; ops.sort(st, 'collate'); expect(ids(st)).toEqual(['p0', 'p5', 'p1', 'p4', 'p2', 'p3']);
      st = { pages: pg(6) }; ops.sort(st, 'collate-same'); expect(ids(st)).toEqual(['p0', 'p3', 'p1', 'p4', 'p2', 'p5']);
      st = { pages: pg(5) }; ops.sort(st, 'odd-even'); expect(ids(st)).toEqual(['p0', 'p2', 'p4', 'p1', 'p3']);
      st = { pages: pg(5) }; ops.sort(st, 'even-odd'); expect(ids(st)).toEqual(['p1', 'p3', 'p0', 'p2', 'p4']);
    });
    it('undo/redo restores every step, coalesces edits and clears redo on a new commit', async () => {
      PT.reset();
      const E = PT.E;
      await PT.open(await PT.makePdf([{ text: 'A' }, { text: 'B' }, { text: 'C' }]), 'abc.pdf');
      expect(PT.texts()).toEqual(['1', '2', '3']);
      PT.A.rotate([E.state.pages[0].id], 90);
      PT.A.remove([E.state.pages[1].id]);
      E.commit('Reverse order', (st) => E.ops.reverse(st, null));
      expect(PT.texts()).toEqual(['3', '1']);
      expect(E.undoLabel()).toBe('Reverse order');
      E.undo(); expect(PT.texts()).toEqual(['1', '3']);
      E.undo(); expect(PT.texts()).toEqual(['1', '2', '3']);
      E.undo(); expect(E.state.pages[0].rot).toBe(0);
      E.redo(); expect(E.state.pages[0].rot).toBe(90);
      E.commit('Edit title', (st) => { st.meta.title = 'a'; }, 'meta:title');
      E.commit('Edit title', (st) => { st.meta.title = 'ab'; }, 'meta:title');
      expect(E.canRedo()).toBe(false);
      E.undo(); expect(E.state.meta.title).toBe(''); expect(E.state.pages[0].rot).toBe(90);
      expect(PT.win.document.getElementById('btnRedo').disabled).toBe(false);
      PT.A.undo();
      expect(E.state.pages[0].rot).toBe(0);
      expect(E.state.pages.length).toBe(3);
      expect(PT.win.document.querySelectorAll('#grid .sheet').length).toBe(3);
    });
  });

  describe('stamps text + offline build helpers', () => {
    it('formats page numbers', () => {
      const t = PT.E.pageNumberText;
      expect(t({ format: 'n' }, 3, 9)).toBe('3');
      expect(t({ format: 'page' }, 3, 9)).toBe('Page 3');
      expect(t({ format: 'n-of' }, 3, 9)).toBe('3 / 9');
      expect(t({ format: 'page-of' }, 3, 9)).toBe('Page 3 of 9');
      expect(t({ format: 'dash' }, 3, 9)).toBe('– 3 –');
    });
    it('escapes JSON for a <script> element and converts an ES module to a classic script', () => {
      const B = PT.SP.build;
      const s = B.escapeJSON({ a: '</script><b>  ' });
      expect(s).not.toContain('</');
      expect(JSON.parse(s).a).toBe('</script><b>  ');
      const code = B.toClassic('const x=1;function y(){return import.meta.url}\nexport{x as A,y};', 'TMod');
      new PT.win.Function(code)();
      expect(PT.win.TMod.A).toBe(1);
      expect(PT.win.TMod.y()).toBe('about:blank');
      expect(() => B.toClassic('var z=1;', 'N')).toThrow(/No export list/);
    });
  });
})();
