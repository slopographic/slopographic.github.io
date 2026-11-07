/* SlopCut tests: clip masks. A mask changes the frame the compositor draws (the monitor and the export share that
   path), each change is one undo step, the mask is saved with the project, and the monitor tools draw and reshape
   masks with pointer events. */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const SE = () => ST.SE;
  const win = () => ST.win;
  const RED = [255, 0, 0, 255], BLACK = [0, 0, 0, 255];

  /** A red colour matte on V1 covering the whole sequence, selected, with the playhead on it. */
  async function redClip() {
    await ST.reset();
    SE().change('Add matte', (p) => ST.matte(p, 0, 0, 4, '#ff0000'));
    const c = SE().doc.clips[0];
    SE().app.select([c.id]);
    SE().player.seek(1);
    return c;
  }
  /** Pixel of the frame the monitor shows at this time (frame space: project px from the frame centre). */
  async function pixelAt(fx, fy) {
    const p = SE().doc, canvas = await SE().preview.frameCanvas(SE().player.time);
    return ST.px(canvas, Math.round(p.w / 2 + fx), Math.round(p.h / 2 + fy));
  }
  const ptr = (type, el, x, y) => el.dispatchEvent(new (win().PointerEvent)(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    pointerId: 7, pointerType: 'mouse', isPrimary: true
  }));
  /** Client coordinates of a frame-space point on the monitor. */
  function clientOf(fx, fy) {
    const p = SE().doc, r = SE().app.els.overlay.getBoundingClientRect();
    return { x: r.left + (fx + p.w / 2) * (r.width / p.w), y: r.top + (fy + p.h / 2) * (r.height / p.h) };
  }
  const maskOf = (id) => SE().doc.clips.find((c) => c.id === id).mask;

  describe('clip masks', () => {
    it('a rectangle mask keeps the clip inside its shape and the frame outside it shows the background', async () => {
      const c = await redClip();
      const p = SE().doc;
      expect(await pixelAt(0, 0)).toEqual(RED);
      expect(await pixelAt(-p.w / 2 + 5, -p.h / 2 + 5)).toEqual(RED);
      SE().cmd.run('mask.add.rect');
      expect(maskOf(c.id).shape).toBe('rect');
      expect(await pixelAt(0, 0)).toEqual(RED);
      expect(await pixelAt(-p.w / 2 + 5, -p.h / 2 + 5)).toEqual(BLACK);
    });

    it('invert, remove and undo each take one step and change the output', async () => {
      const c = await redClip();
      const h = SE().history, before = h.undoStack.length;
      SE().cmd.run('mask.add.rect');
      expect(h.undoStack.length).toBe(before + 1);
      expect(h.undoLabel()).toBe('Add mask');
      SE().cmd.run('mask.invert');
      expect(maskOf(c.id).invert).toBe(true);
      expect(h.undoLabel()).toBe('Invert mask');
      expect(await pixelAt(0, 0)).toEqual(BLACK);
      SE().cmd.run('mask.remove');
      expect(maskOf(c.id)).toBe(null);
      expect(await pixelAt(0, 0)).toEqual(RED);
      expect(h.undoStack.length).toBe(before + 3);
      h.undo();
      expect(maskOf(c.id).invert).toBe(true);
      h.undo();
      h.undo();
      expect(maskOf(c.id)).toBe(null);
      expect(h.undoStack.length).toBe(before);
    });

    it('feather softens the edge and expansion grows the shape past its outline', async () => {
      const c = await redClip();
      const p = SE().doc, edge = -p.w / 4; // the left edge of the default rectangle (half the frame, centred)
      SE().cmd.run('mask.add.rect');
      expect(await pixelAt(edge - 6, 0)).toEqual(BLACK);
      SE().change('Mask feather', (d) => { clipIn(d, c.id).mask.feather = 24; });
      const soft = await pixelAt(edge, 0);
      expect(soft[0] > 40 && soft[0] < 215).toBe(true);
      SE().change('Mask feather', (d) => { clipIn(d, c.id).mask.feather = 0; });
      SE().change('Mask expansion', (d) => { clipIn(d, c.id).mask.expand = 30; });
      expect(await pixelAt(edge - 15, 0)).toEqual(RED);
      expect(await pixelAt(edge - 40, 0)).toEqual(BLACK);
    });

    it('the mask is saved with the project (it survives a snapshot and a reload of the model)', async () => {
      const c = await redClip();
      SE().cmd.run('mask.add.ellipse');
      SE().change('Mask feather', (d) => { clipIn(d, c.id).mask.feather = 12; });
      const saved = JSON.parse(JSON.stringify(SE().doc));
      const loaded = ST.M.normalize(saved);
      const m = loaded.clips.find((x) => x.id === c.id).mask;
      expect(m.shape).toBe('ellipse');
      expect(m.feather).toBe(12);
      expect(m.w).toBe(SE().doc.w / 2);
    });

    it('the inspector shows a Mask section for the clip, with its fields', async () => {
      await redClip();
      SE().cmd.run('mask.add.rrect');
      await ST.SE.inspector.render();
      const text = win().document.querySelector('#insp .insp-body').textContent;
      expect(text).toContain('Mask');
      expect(text).toContain('Feather');
      expect(text).toContain('Corner radius');
      expect(text).toContain('Keep outside');
    });

    it('the draw tool drags out an ellipse mask with pointer events', async () => {
      const c = await redClip();
      SE().maskInput.setTool('ellipse');
      const ov = SE().app.els.overlay;
      const a = clientOf(-300, -200), b = clientOf(300, 200);
      ptr('pointerdown', ov, a.x, a.y);
      ptr('pointermove', ov, (a.x + b.x) / 2, (a.y + b.y) / 2);
      ptr('pointermove', ov, b.x, b.y);
      ptr('pointerup', ov, b.x, b.y);
      const m = maskOf(c.id);
      expect(m.shape).toBe('ellipse');
      expect(Math.abs(m.w - 600) < 4).toBe(true);
      expect(Math.abs(m.h - 400) < 4).toBe(true);
      expect(SE().maskInput.tool).toBe(null);
      expect(await pixelAt(0, 0)).toEqual(RED);
      expect(await pixelAt(-290, -190)).toEqual(BLACK);
    });

    it('edit mode: dragging a corner handle reshapes the rectangle as one undo step', async () => {
      const c = await redClip();
      SE().cmd.run('mask.add.rect'); // a new mask opens in edit mode, so its handles are live
      expect(SE().maskInput.edit).toBe(c.id);
      const p = SE().doc, w0 = maskOf(c.id).w;
      const corner = clientOf(p.w / 4, p.h / 4), target = clientOf(p.w / 4 - 100, p.h / 4 - 100);
      const ov = SE().app.els.overlay;
      ptr('pointerdown', ov, corner.x, corner.y);
      for (let i = 1; i <= 4; i++) ptr('pointermove', ov, corner.x + ((target.x - corner.x) * i) / 4, corner.y + ((target.y - corner.y) * i) / 4);
      ptr('pointerup', ov, target.x, target.y);
      expect(Math.abs(maskOf(c.id).w - (w0 - 100)) < 4).toBe(true);
      expect(SE().history.undoLabel()).toBe('Reshape mask');
      SE().history.undo();
      expect(maskOf(c.id).w).toBe(w0);
    });
  });
  /** The clip with this id in the current project (for the mutators above). */
  function clipIn(doc, id) { return doc.clips.find((x) => x.id === id); }
})();
