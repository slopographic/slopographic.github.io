/* Slop PDF: zoom keeps the workspace centre. The zoom buttons (toolbar + and −), the zoom menu's presets and a value set
   through Ed.setZoom all zoom about the centre of the visible page area, so a page that is wider than the viewer stays
   centred as it grows and shrinks. The harness hides scrollbars, so a right border stands in for the scrollbar gutter:
   the viewer's border box is then wider than its visible area, which is what a desktop browser shows. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  const viewer = () => PT.win.document.getElementById('viewer');
  const settle = () => waitFor(() => !PT.SP.editor.easing(), { timeout: 8000 }).then(() => sleep(60));
  const zoomBtn = (label) => PT.win.document.querySelector('#ctxPage button[aria-label="' + label + '"]');
  /** The centre of the visible area, and the first page's offset from it (layout units), plus its horizontal offset (px). */
  function probe(Ed) {
    const v = viewer(), vr = v.getBoundingClientRect();
    const cx = vr.left + v.clientLeft + v.clientWidth / 2, cy = vr.top + v.clientTop + v.clientHeight / 2;
    const pr = v.querySelector('.pv-page').getBoundingClientRect();
    return { docX: (cx - pr.left) / Ed.zoom, docY: (cy - pr.top) / Ed.zoom, pageDx: (pr.left + pr.width / 2) - cx, zoom: Ed.zoom };
  }
  /** Two 612 × 792 pages fitted to the width, so the page is wider than the viewer once zoomed in. */
  async function openWide() {
    if (!PT.SP) await PT.boot();
    PT.reset();
    await PT.open(await PT.makePdf([{ text: 'centre one', w: 612, h: 792 }, { text: 'centre two', w: 612, h: 792 }]), 'centre.pdf');
    PT.A.openPage(PT.E.state.pages[0].id);
    const Ed = PT.SP.editor;
    Ed.fit('width');
    await settle();
    return Ed;
  }
  /** Waits until the fit has followed the viewer's new width. A border change reaches the page view through its
      ResizeObserver, a frame or more later, so a probe taken straight after it would read the old layout. */
  async function followWidth() {
    await waitFor(() => { const v = viewer(); return Math.abs(v.querySelector('.pv-page').getBoundingClientRect().width - (v.clientWidth - 48)) < 1.5; }, { timeout: 8000 });
    await sleep(60);
  }
  /** Checks one step: the document point at the centre has not moved (within a pixel) and the page is centred. */
  function expectCentred(Ed, base, now, label) {
    const drift = Math.hypot((now.docX - base.docX) * now.zoom, (now.docY - base.docY) * now.zoom);
    if (drift > 1) throw new Error(label + ': the centre drifted ' + drift.toFixed(2) + ' px');
    if (Math.abs(now.pageDx) > 1) throw new Error(label + ': the page is ' + now.pageDx.toFixed(2) + ' px off the centre');
  }

  describe('Slop PDF zoom about the workspace centre', () => {
    it('the zoom buttons keep the centre of the visible area fixed, with a scrollbar gutter', async () => {
      const Ed = await openWide();
      const v = viewer();
      v.style.borderRight = '16px solid transparent';
      try {
        await followWidth();
        const base = probe(Ed);
        expect(Math.abs(base.pageDx)).toBeLessThanOrEqual(1);
        for (let i = 0; i < 3; i++) {
          zoomBtn('Zoom in (+)').click();
          await settle();
          expectCentred(Ed, base, probe(Ed), 'zoom in ' + (i + 1));
        }
        expect(Ed.zoom).toBeGreaterThan(base.zoom * 1.5);
        for (let i = 0; i < 3; i++) {
          zoomBtn('Zoom out (−)').click();
          await settle();
          expectCentred(Ed, base, probe(Ed), 'zoom out ' + (i + 1));
        }
      } finally { v.style.borderRight = ''; }
    }, { timeout: 60000 });

    it('a zoom set by value (the zoom menu presets and a typed value use Ed.setZoom) zooms about the centre too', async () => {
      const Ed = await openWide();
      const v = viewer();
      v.style.borderRight = '16px solid transparent';
      try {
        await followWidth();
        const base = probe(Ed);
        for (const pct of [150, 200, 120]) {
          Ed.setZoom(PT.win.SlopPdfZoom.fromPercent(pct));
          await settle();
          expectCentred(Ed, base, probe(Ed), 'set ' + pct + '%');
        }
      } finally { v.style.borderRight = ''; }
    }, { timeout: 60000 });
  });
})();
