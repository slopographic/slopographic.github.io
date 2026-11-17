/* Slop Isolate: the Keep and Remove brushes change the picture while you paint (every stroke step, before the
 * release), and right-button drag resizes the brush. Drives the real app in an iframe with pointer events. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const f = document.getElementById('app');

  /** Open the app and wait until the sample image is cut out and on screen. */
  let session = null; // one app session for the whole page: the model runs once per page, not per test
  async function open() {
    if (session && session.CO.process.active && session.document.body) { session.CO.state.setTool('pan'); return session; }
    f.src = '../../slopisolate/index.html';
    await waitFor(() => f.contentWindow && f.contentWindow.CO && f.contentWindow.CO.state && f.contentWindow.document.readyState === 'complete', { timeout: 30000 });
    const w = f.contentWindow, CO = w.CO;
    // synthetic pointer ids cannot be captured; the capture is not what is under test
    w.Element.prototype.setPointerCapture = function () {};
    w.Element.prototype.releasePointerCapture = function () {};
    await CO.files.sample();
    await waitFor(() => CO.process && CO.process.active && CO.process.active.mask, { timeout: 200000, polling: 300 });
    await sleep(120);
    session = w;
    return w;
  }
  const at = (w, sx, sy, type, extra = {}) => w.document.getElementById('stage').dispatchEvent(new w.PointerEvent(type, Object.assign({ clientX: sx, clientY: sy, bubbles: true, pointerId: 7, pointerType: 'mouse', isPrimary: true }, extra)));
  /** Stage-relative screen point → client point. */
  const clientOf = (w, x, y) => { const r = w.document.getElementById('stage').getBoundingClientRect(); return [r.left + x, r.top + y]; };
  const pixel = (w, x, y) => { const c = w.document.getElementById('view'), g = c.getContext('2d'); const k = c.width / c.clientWidth; return Array.from(g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data); };
  /** Screen point at the middle of the cut-out subject (image px → stage px). */
  const subjectPoint = (w) => {
    const CO = w.CO, act = CO.process.active, g = CO.view.geom();
    const best = { x: 0, y: 0, v: -1 };
    for (let y = 0; y < act.h; y += Math.max(1, act.h >> 5)) for (let x = 0; x < act.w; x += Math.max(1, act.w >> 5)) {
      const v = act.mask[y * act.w + x]; if (v > best.v) Object.assign(best, { x, y, v });
    }
    return { ix: best.x, iy: best.y, sx: best.x * g.scale + g.ox, sy: best.y * g.scale + g.oy, idx: best.y * act.w + best.x };
  };

  describe('live brush (Remove and Keep)', () => {
    it('a Remove stroke changes the mask and the picture before the mouse is released', async () => {
      const w = await open(), CO = w.CO, act = CO.process.active;
      CO.state.setTool('remove');
      const p = subjectPoint(w), before = act.mask[p.idx], [cx, cy] = clientOf(w, p.sx, p.sy);
      const px0 = pixel(w, p.sx, p.sy);
      at(w, cx, cy, 'pointerdown', { button: 0 });
      let mid = null;
      for (let k = 1; k <= 6; k++) at(w, cx + k * 2, cy, 'pointermove', { buttons: 1 });
      await sleep(60);
      mid = { mask: CO.process.active.mask[p.idx], px: pixel(w, p.sx, p.sy) };
      expect(mid.mask < before).toBe(true);
      expect(mid.px.join() !== px0.join()).toBe(true);
      at(w, cx + 12, cy, 'pointerup', { button: 0 });
      expect(CO.history.can(CO.state.current(), 'undo')).toBe(true);
    }, { timeout: 260000 });

    it('a Keep stroke raises the mask where it paints', async () => {
      const w = await open(), CO = w.CO, act = CO.process.active;
      CO.state.setTool('keep');
      const p = subjectPoint(w), [cx, cy] = clientOf(w, p.sx, p.sy);
      // find an uncut (background) pixel to paint over
      let bg = null;
      for (let y = 0; y < act.h && !bg; y += 8) for (let x = 0; x < act.w && !bg; x += 8) if (act.mask[y * act.w + x] < 20) bg = { x, y };
      expect(!!bg).toBe(true);
      const g = CO.view.geom(), sx = bg.x * g.scale + g.ox, sy = bg.y * g.scale + g.oy, [kx, ky] = clientOf(w, sx, sy);
      const v0 = act.mask[bg.y * act.w + bg.x];
      at(w, kx, ky, 'pointerdown', { button: 0 });
      for (let k = 1; k <= 4; k++) at(w, kx + k * 2, ky, 'pointermove', { buttons: 1 });
      await sleep(60);
      expect(CO.process.active.mask[bg.y * act.w + bg.x] > v0).toBe(true);
      at(w, kx + 8, ky, 'pointerup', { button: 0 });
    }, { timeout: 260000 });
  });

  describe('memory while painting (an iPhone ended the page within seconds of dragging Remove)', () => {
    it('a long stroke makes no new canvases: the cut-out, its levels and the tint are drawn again in place', async () => {
      const w = await open(), CO = w.CO;
      CO.state.setTool('remove');
      const p = subjectPoint(w), [cx, cy] = clientOf(w, p.sx, p.sy);
      const stroke = async (n) => {
        at(w, cx, cy, 'pointerdown', { button: 0 });
        for (let k = 1; k <= n; k++) { at(w, cx + k, cy + (k % 7), 'pointermove', { buttons: 1 }); if (k % 4 === 0) await sleep(20); }
        at(w, cx + n, cy, 'pointerup', { button: 0 });
      };
      await stroke(8);   // the first stroke makes what painting needs (the tint's screen-size canvas)
      await sleep(400);
      const make = w.document.createElement, made = [];
      w.document.createElement = function (tag, o) { const st = new Error().stack; if (String(tag).toLowerCase() === 'canvas' && !/thumbs\.js/.test(st)) made.push(st); return make.call(this, tag, o); };
      try {
        const cut = CO.process.active.cut;
        await stroke(60);
        expect(made.length ? made[0] : '').toBe('');   // the queue tiles' small pictures (thumbs.js) are not counted
        expect(CO.process.active.cut).toBe(cut);
        expect(CO.history.can(CO.state.current(), 'undo')).toBe(true);
      } finally { w.document.createElement = make; }
    }, { timeout: 260000 });
  });

  describe('right-button brush resize', () => {
    it('right-drag right increases the brush size; a small move keeps it', async () => {
      const w = await open(), CO = w.CO;
      CO.state.setTool('keep');
      const [cx, cy] = clientOf(w, 200, 200), size0 = CO.state.brush.size;
      at(w, cx, cy, 'pointerdown', { button: 2 });
      at(w, cx + 2, cy, 'pointermove', { buttons: 2 });
      expect(CO.state.brush.size).toBe(size0);
      at(w, cx + 60, cy, 'pointermove', { buttons: 2 });
      expect(CO.state.brush.size > size0).toBe(true);
      const readout = w.document.querySelector('.brush-readout');
      expect(!!readout && !readout.hidden && /Size \d+ px/.test(readout.textContent)).toBe(true);
      at(w, cx + 60, cy, 'pointerup', { button: 2 });
      expect(w.document.querySelector('.brush-readout').hidden).toBe(true);
    }, { timeout: 260000 });
  });
})();
