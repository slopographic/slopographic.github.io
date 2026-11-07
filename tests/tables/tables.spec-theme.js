/* Slop Tables grid colours: a cell's background and text, the gridlines and the header row read well in the light and
   dark themes. Colours are read from computed style, so a hard-coded or missing token fails here. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const doc = () => TB.doc, win = () => TB.win;

  /** Parses a computed colour: rgb()/rgba(), or color(srgb r g b / a) with 0..1 channels. Returns [r, g, b, a] in 0..255 / 0..1. */
  function parse(s) {
    let m = /^rgba?\(([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    }
    m = /^color\(srgb ([^)]+)\)$/.exec(s);
    if (m) {
      const p = m[1].split(/[ /]+/).filter(Boolean).map(Number);
      return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
    }
    throw new Error('unreadable colour: ' + s);
  }
  /** WCAG relative luminance of an opaque colour. */
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  /** WCAG contrast ratio between two colours (the first is composited over the second when it has alpha). */
  function contrast(fg, bg) {
    const [br, bgG, bb] = bg;
    const a = fg[3];
    const mixed = [fg[0] * a + br * (1 - a), fg[1] * a + bgG * (1 - a), fg[2] * a + bb * (1 - a)];
    const l1 = lum(mixed), l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /** Computed colours of an element: its own background and its text colour. */
  function paint(el) {
    const cs = win().getComputedStyle(el);
    return { bg: parse(cs.backgroundColor), fg: parse(cs.color), line: parse(cs.borderRightColor), style: cs };
  }
  /** Sets the shared theme on the open app, lays out a small sheet and returns the painted cell and header. */
  async function sheetIn(theme) {
    win().SlopTheme.set(theme);
    const T = TB.T;
    T.type('A1', 'Region');
    T.type('B1', 'Total');
    T.type('A2', 'North');
    T.type('B2', '42');
    T.flush();
    await TB.wait(50);
    return {
      root: doc().documentElement.getAttribute('data-slop-theme'),
      cell: doc().querySelector('.cell[data-rc="1,0"]'),
      head: doc().querySelector('.colhead'),
      ch: doc().querySelector('.ch'),
    };
  }

  describe('grid colours in each theme', () => {
    for (const theme of ['light', 'dark']) {
      it(`cell background and text differ and read at 4.5:1 in the ${theme} theme`, async () => {
        await TB.boot();
        const s = await sheetIn(theme);
        expect(s.root).toBe(theme);
        expect(s.cell).toBeTruthy();
        const p = paint(s.cell);
        const bgRgb = [p.bg[0], p.bg[1], p.bg[2]];
        expect(p.bg[3] > 0).toBe(true);
        expect(p.bg.slice(0, 3).join(',') !== p.fg.slice(0, 3).join(',')).toBe(true);
        const ratio = contrast(p.fg, bgRgb);
        expect(ratio >= 4.5).toBe(true);
      });

      it(`gridlines and the header row are visible in the ${theme} theme`, async () => {
        await TB.boot();
        const s = await sheetIn(theme);
        const cell = paint(s.cell);
        // The gridline must differ from the cell background so the grid stays visible.
        expect(cell.line.slice(0, 3).join(',') !== cell.bg.slice(0, 3).join(',')).toBe(true);
        expect(contrast(cell.line, [cell.bg[0], cell.bg[1], cell.bg[2]]) >= 1.5).toBe(true);
        // Header row: the header text reads on the header background.
        const head = paint(s.head), label = paint(s.ch);
        const headRgb = [head.bg[0], head.bg[1], head.bg[2]];
        expect(contrast(label.fg, headRgb) >= 4.5).toBe(true);
      });
    }

    it('keeps the grid usable when the shared grid colour is missing', async () => {
      await TB.boot();
      const s = await sheetIn('dark');
      const root = doc().documentElement;
      const before = root.style.getPropertyValue('--sl-border');
      root.style.removeProperty('--sl-border');
      try {
        const cell = paint(s.cell);
        expect(cell.line[3] > 0).toBe(true);
        expect(cell.line.slice(0, 3).join(',') !== cell.bg.slice(0, 3).join(',')).toBe(true);
      } finally {
        if (before) root.style.setProperty('--sl-border', before);
        win().SlopTheme.set('system');
      }
    });
  });
})();
