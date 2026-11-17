/* SlopCut: exporting at a chosen size (1080×1920) from a 1920×1080 source, and the export dialog keeping the
   settings the person chose. The output must have that size and the picture must be drawn fitted and centred. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  /** Decode the first frame of a blob with a <video> element and return its size and canvas. */
  async function decodeFirst(blob) {
    const url = URL.createObjectURL(blob), v = document.createElement('video');
    v.muted = true; v.src = url;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('decode failed')); });
    await new Promise((r) => { v.onseeked = r; v.currentTime = 0.01; });
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    URL.revokeObjectURL(url);
    return { w: v.videoWidth, h: v.videoHeight, c };
  }
  /** Bounding box of the red picture in a canvas. */
  function redBox(c) {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4;
      if (d[i] > 120 && d[i + 1] < 120) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0, y0, x1, y1 };
  }

  describe('export size', () => {
    it('boots the app', async () => { await ST.boot('app'); expect(ST.SE.doc.tracks.length).toBe(4); });

    it('an export to 1080×1920 from a 1920×1080 source has that size and the picture fitted and centred', async () => {
      await ST.reset();
      const SE = ST.SE;
      const blob = await SE.synth.video({ w: 1920, h: 1080, fps: 5, dur: 1, draw: (g) => { g.fillStyle = 'rgb(200,50,50)'; g.fillRect(0, 0, 1920, 1080); } });
      const file = new ST.win.File([blob], 'src.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type });
      await SE.app.importFiles([file]);
      await waitFor(() => SE.doc.clips.length > 0, { timeout: 30000 });
      expect(SE.doc.w).toBe(1920);
      // what the export dialog does: preset size, sequence size applied, then encode
      const size = SE.exportDialog.size('phone', 0, 0);
      if (size.w !== SE.doc.w || size.h !== SE.doc.h) SE.settings.apply({ w: size.w, h: size.h });
      const out = await SE.encode.run({ format: 'mp4', w: size.w, h: size.h, fps: 5, quality: 'high', audio: false, a: 0, b: 1 });
      const dec = await decodeFirst(out.blob);
      expect([dec.w, dec.h]).toEqual([1080, 1920]);
      const b = redBox(dec.c);
      // landscape into portrait: full width, about 607 px tall, centred vertically
      expect(b.x1 - b.x0).toBeGreaterThanOrEqual(1000);
      expect(Math.abs(b.y0 - (1920 - 608) / 2)).toBeLessThanOrEqual(6);
    }, { timeout: 90000 });

    it('the export dialog reopens with the size and options last chosen, even after the sequence size changes', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      win.localStorage.removeItem('slopedit.export');
      SE.change('m', (p) => { ST.matte(p, 0, 0, 4, '#00ff00'); });
      const open = async () => { SE.act.exportVideo({}); const d = win.document.querySelector('.exp-dlg'); await waitFor(() => d); return d; };
      const pick = (d, value) => {
        const s = [...d.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === value));
        return s;
      };
      let dlg = await open();
      const res = pick(dlg, 'square');
      res.value = 'square'; res.dispatchEvent(new win.Event('change', { bubbles: true }));
      const q = pick(dlg, 'max');
      q.value = 'max'; q.dispatchEvent(new win.Event('change', { bubbles: true }));
      [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
      await waitFor(() => !win.document.querySelector('.exp-dlg'));
      // the project size changes (what Export does); the dialog must still show the choice
      SE.settings.apply({ w: 1080, h: 1920 });
      dlg = await open();
      expect(pick(dlg, 'square').value).toBe('square');
      expect(pick(dlg, 'max').value).toBe('max');
      await waitFor(() => dlg.querySelector('.exp-note') && dlg.querySelector('.exp-note').textContent.includes('1080×1080'), { timeout: 15000 });
      [...dlg.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
    }, { timeout: 30000 });
  });
})();
