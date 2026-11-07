/* Slop PDF Edit text ▸ Paragraphs in other languages and fonts: Swedish å ä ö are kept; a paragraph in an embedded subset
   font is redrawn in that font (its own glyphs), and a character the subset lacks in the substitute font; an Arabic
   paragraph is found right to left, stays right aligned, and is saved in its language font. The Noto Sans Arabic file is
   the real one (tests/pdf/fixtures); only its download is stubbed, as in intl.test.html. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const AR = ['مرحبا بالعالم الجميل اليوم', 'هذا نص عربي قصير للتجربة', 'في آخر السطر'];
  async function stubJit() {
    const J = PT.win.SlopFontJIT;
    await J.deps();
    J.ready = async () => true;
    J.bytes = async (pack) => (pack === 'noto-arabic' ? (await PT.fixture('NotoSansArabic-Regular.ttf')).buffer : null);
    J.family = async (pack) => (pack === 'noto-arabic' ? 'Noto Sans Arabic' : '');
    J.face = async () => null;
  }

  describe('Edit text ▸ Paragraphs: languages and fonts', () => {
    it('Swedish å ä ö are typed, kept and saved as text', async () => {
      await PP.open(await PP.pdf((pg, f) => PP.lines(pg, f.hel, ['Hej och välkommen till', 'en kort text på svenska.'], 40, 280)), 'sv.pdf');
      await PP.click(60, 320 - 280 - 4);
      const sv = 'Smörgåsbord är gott, och blåbär från skogen är söta i år. Ölet är kallt.';
      await PP.type(sv);
      expect(PP.textOf(PP.para())).toBe(sv);
      const all = (await PP.saved()).map((i) => i.str).join(' ').replace(/\s+/g, ' ');
      for (const w of ['Smörgåsbord', 'blåbär', 'söta', 'Ölet']) expect(all.includes(w)).toBe(true, all);
      expect(all.includes('?')).toBe(false);
    }, { timeout: 60000 });

    it('a paragraph in a subset font is redrawn in that font; a character it lacks is set in the substitute font', async () => {
      const kit = await PT.win.SlopFontCatalog.fontkit();
      const bytes = await PP.pdf(async (pg, f) => {
        f.doc.registerFontkit(kit);
        const bar = await f.doc.embedFont(await PT.fixture('Barlow-Regular.ttf'), { subset: true, customName: 'ABCDEF+Barlow-Regular' });
        PP.lines(pg, bar, ['hello world, the old words', 'drawn in a subset of Barlow'], 40, 280, 18, 14);
      });
      await PP.open(bytes, 'barlow-para.pdf');
      await PP.click(60, 320 - 280 - 4);
      const m = PP.P().sel.model;
      expect(m.styles[0].ps).toBe('ABCDEF+Barlow-Regular');
      expect(!!m.styles[0].cm.h).toBe(true, 'the subset has h');
      await PP.type('hello old world ö');
      const a = PP.para(), segs = a.lines.flatMap((l) => l.segs);
      expect(segs.some((s) => !s.fb && /hello/.test(s.t))).toBe(true, JSON.stringify(segs));
      expect(segs.some((s) => s.fb && s.t === 'ö')).toBe(true, 'ö is not in the subset');
      const items = await PP.saved();
      const own = items.find((i) => /hello/.test(i.str) && /Barlow/.test(i.font) && i.y < 281 && i.x >= 39);
      expect(!!own).toBe(true, items.map((i) => i.str + ':' + i.font).join(' | '));
      const sub = items.find((i) => i.str.includes('ö'));
      expect(!!sub && !/Barlow/.test(sub.font)).toBe(true, sub && sub.font);
      expect(items.map((i) => i.str).join(' ').includes('old')).toBe(true);
    }, { timeout: 60000 });

    it('an Arabic paragraph is one right-to-left block, right aligned, and is saved in its language font at the right edge', async () => {
      await stubJit();
      const kit = await PT.win.SlopFontCatalog.fontkit();
      const bytes = await PP.pdf(async (pg, f) => {
        f.doc.registerFontkit(kit);
        const pf = await PT.win.SlopPdfRuns.embed(f.doc, await PT.fixture('NotoSansArabic-Regular.ttf')), font = pf.embedder.font;
        AR.forEach((t, i) => {
          const w = font.layout(t, undefined, undefined, undefined, 'rtl').advanceWidth * 14 / font.unitsPerEm;
          PT.win.SlopPdfRuns.drawRun(PT.win.PDFLib, pg, pf, { text: t, x: 380 - w, y: 280 - i * 20, size: 14, rtl: true, shaped: true }, { color: [0, 0, 0] });
        });
      });
      await PP.open(bytes, 'arabic.pdf');
      await PP.click(300, 320 - 280 - 4);
      const sel = PP.P().sel;
      expect(sel.blocks.length).toBe(1);
      expect(sel.blocks[0].lines.length).toBe(3);
      expect(sel.model.rtl).toBe(true);
      expect(sel.model.align).toBe('right');
      await PP.type('هذه فقرة جديدة مكتوبة باللغة العربية وهي أطول من السطر الواحد لكي تلتف داخل الإطار');
      const a = PP.para();
      expect(a.lines.length >= 2).toBe(true);
      a.lines.forEach((l) => { const s = l.segs[0]; expect(s.rtl).toBe(true); expect(Math.abs(s.x + s.w - a.w) < 0.05).toBe(true, 'right edge ' + (s.x + s.w)); });
      const e = PP.edges(a), items = await PP.saved();
      const ar = items.filter((i) => /[؀-ۿ]/.test(i.str) && i.y < e.top + 1 && i.y > e.top - a.h - 1 && /Arabic/.test(i.font));
      expect(ar.length > 0).toBe(true, items.map((i) => i.str + ':' + i.font).join(' | '));
      expect(items.map((i) => i.str).join('').includes('?')).toBe(false);
      const rows = PP.rows(ar);
      expect(rows.length >= a.lines.length).toBe(true, rows.length + ' rows');
      // the rows reach the frame's right edge (pdf.js may start an RTL item with joiners a point or so off; the ink is inside)
      rows.forEach((r) => expect(r.x1 <= e.x1 + 1.5).toBe(true, r.x1 + ' > ' + e.x1));
      expect(rows.some((r) => Math.abs(r.x1 - e.x1) < 1.5)).toBe(true, rows.map((r) => r.x0.toFixed(1) + '..' + r.x1.toFixed(1)).join(' ') + ' edge ' + e.x1);
      PP.off();
    }, { timeout: 90000 });
  });
})();
