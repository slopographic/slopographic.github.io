/* SlopCut tests: the Layout lane (switches over time, a 1x1 then 1x3 switch), the middle-button pan of the
   timeline, and export presets (the chosen size is the sequence size). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const still = (i) => {
    const c = ST.win.document.createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + i * 60 + ' 70% 45%)'; g.fillRect(0, 0, 320, 180);
    return new Promise((r) => c.toBlob(r, 'image/png')).then((blob) => new ST.win.File([blob], 'lane-' + i + '.png', { type: 'image/png' }));
  };
  async function importStills(n) {
    const files = [];
    for (let i = 0; i < n; i++) files.push(await still(i + 1));
    const metas = await ST.SE.media.importFiles(files);
    await waitFor(() => metas.every((m) => ST.SE.media.ready(m.id)), { timeout: 20000 });
    return metas;
  }

  describe('layout lane', () => {
    it('a 1x1 then 1x3 switch puts one clip in the first span and three in the second', async () => {
      await ST.reset();
      const SE = ST.SE;
      await importStills(6);
      SE.act.randomEdit({ target: 8, pace: 'medium', seed: 3, segments: [{ start: 0, layout: 'grid-1x1' }, { start: 4, layout: 'grid-1x3' }] });
      expect(SE.doc.segments.map((s) => [s.start, s.layout])).toEqual([[0, 'grid-1x1'], [4, 'grid-1x3']]);
      const vis = SE.doc.clips.filter((c) => c.kind !== 'audio');
      const first = vis.filter((c) => c.start < 4 - 1e-6), second = vis.filter((c) => c.start >= 4 - 1e-6);
      expect(first.length > 0 && second.length > 0).toBe(true);
      const countAt = (list) => { const m = new Map(); for (const c of list) m.set(c.start, (m.get(c.start) || 0) + 1); return [...m.values()]; };
      expect(countAt(first).every((n) => n === 1)).toBe(true);   // one clip per cut in the 1x1 span
      expect(countAt(second).every((n) => n === 3)).toBe(true);  // three per cut in the 1x3 span
      expect(new Set(second.map((c) => c.track)).size).toBe(3);  // V1, V2, V3
      expect(new Set(first.map((c) => c.track)).size).toBe(1);
    });
    it('switches are added, moved and removed as one undo step each, and the lane shows them', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.change('m', (p) => { ST.matte(p, 0, 0, 6, '#ff0000'); });
      SE.change('lane add', (p) => ST.SE.layout.setSwitches(p, [{ start: 0, layout: 'grid-1x1' }, { start: 3, layout: 'grid-1x2' }]));
      expect(SE.doc.segments.length).toBe(2);
      SE.change('lane move', (p) => ST.SE.layout.setSwitches(p, [{ start: 0, layout: 'grid-1x1' }, { start: 2, layout: 'grid-1x2' }]));
      expect(SE.doc.segments[1].start).toBe(2);
      SE.change('lane delete', (p) => ST.SE.layout.setSwitches(p, [{ start: 0, layout: 'grid-1x1' }]));
      expect(SE.doc.segments.length).toBe(1);
      const el = SE.laneUI.element();
      expect(el.querySelectorAll('.lv-band').length).toBe(1);
      expect(el.querySelectorAll('.lv-mark').length).toBe(1);
      SE.history.undo();
      expect(SE.doc.segments.length).toBe(2);
    });
  });

  describe('timeline middle-button pan', () => {
    it('a middle-button drag changes the timeline scroll position and does not move a clip', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      SE.change('m', (p) => { ST.matte(p, 0, 5, 4, '#ff0000'); });
      const clip = SE.doc.clips[0];
      SE.app.select([]);
      SE.timeline.pps = 60; SE.timeline.scrollX = 0; SE.timeline.scrollY = 0;
      const canvas = SE.app.els.tlCanvas, box = canvas.getBoundingClientRect();
      const r = SE.timeline.clipRect(clip);
      const x = box.left + r.x + r.w / 2, y = box.top + r.y + r.h / 2;
      const ev = (type, o) => new win.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: false }, o));
      canvas.dispatchEvent(ev('pointerdown', { button: 1, buttons: 4, clientX: x, clientY: y }));
      canvas.dispatchEvent(ev('pointermove', { buttons: 4, clientX: x - 120, clientY: y - 30 }));
      canvas.dispatchEvent(ev('pointermove', { buttons: 4, clientX: x - 180, clientY: y - 60 }));
      canvas.dispatchEvent(ev('pointerup', { button: 1, buttons: 0, clientX: x - 180, clientY: y - 60 }));
      expect(SE.timeline.scrollX).toBeCloseTo(3, 0.01);   // 180 px at 60 px per second
      expect(clip.start).toBe(5);
      expect(SE.doc.clips[0].start).toBe(5);
      expect(SE.app.sel.size).toBe(0);
    });
  });

  describe('export presets', () => {
    it('choosing a preset in the export dialog sets the size the export uses', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      SE.change('m', (p) => { ST.matte(p, 0, 0, 4, '#00ff00'); });
      expect(SE.exportDialog.size('phone').w).toBe(1080);
      expect(SE.exportDialog.size('phone').h).toBe(1920);
      expect(SE.exportDialog.size('custom', 1000, 700)).toEqual({ w: 1000, h: 700 });
      SE.act.exportVideo({});
      const dlg = win.document.querySelector('.exp-dlg');
      await waitFor(() => dlg);
      const sel = [...dlg.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'phone'));
      sel.value = 'phone';
      sel.dispatchEvent(new win.Event('change', { bubbles: true }));
      await waitFor(() => dlg.querySelector('.exp-note') && dlg.querySelector('.exp-note').textContent.includes('1080×1920'));
      const cancel = [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Cancel');
      if (cancel) cancel.click();
    });
  });
})();
