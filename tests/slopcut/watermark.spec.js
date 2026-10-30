/* SlopCut: the watermark module (js/watermark). Off by default; a text watermark turned on shows in the monitor and
   in an export (the exported frame has its pixels, and without it the frame has none); the logo path; the settings
   are saved with the project and load back (an old flat one too); a time range; the device default; the Watermark tab (the
   site's one watermark panel); the module can be absent.
   Covers: slopcut/js/watermark/state.js, slopcut/js/watermark/panel.js, slopcut/js/render/compositor.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const W = 640, H = 360;

  /** A flat blue 640×360 clip imported as the project's footage (the first import sets the sequence size). */
  async function importSource() {
    const SE = ST.SE;
    const blob = await SE.synth.video({ w: W, h: H, fps: 5, dur: 1, draw: (g) => { g.fillStyle = 'rgb(60,120,200)'; g.fillRect(0, 0, W, H); } });
    const file = new ST.win.File([blob], 'src.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'), { type: blob.type });
    await SE.app.importFiles([file]);
    await waitFor(() => SE.doc.clips.length > 0, { timeout: 30000 });
  }
  /** Export the first frame of the timeline and return it as a canvas. */
  async function exportFrame() {
    const out = await ST.SE.encode.run({ format: 'mp4', w: W, h: H, fps: 5, quality: 'high', audio: false, a: 0, b: 0.2 });
    return ST.firstFrame(out.blob);
  }
  /** A white text watermark, centred, fully opaque, no shadow (a watermark spec: shared/watermark/spec.js). */
  const layer = (o) => Object.assign({ kind: 'text', text: 'SLOP', size: 0.2, position: 'mc', opacity: 1, colour: '#ffffff', shadow: false, tile: false, rotate: 0, margin: 0.03 }, o);
  const TEXT = { on: true, spec: { layers: [layer()] } };
  const first = () => ST.SE.watermark.settings().spec.layers[0];

  describe('watermark', () => {
    it('boots the app with the watermark module', async () => {
      await ST.boot('app');
      expect(!!ST.SE.watermark).toBe(true);
      expect(ST.SE.watermark.settings().on).toBe(false);
    });

    it('is off by default: an export of a plain clip has no bright watermark pixels', async () => {
      await ST.reset();
      await importSource();
      expect(ST.SE.watermark.settings().on).toBe(false);
      if (!(await ST.canEncode())) return;
      const frame = await exportFrame();
      const px = frame.getContext('2d').getImageData(8, 8, 1, 1).data;
      expect(px[2] > 150 && px[0] < 120).toBe(true); // the blue picture is there, so "no watermark" is not a blank frame
      expect(ST.countBright(frame)).toBeLessThan(20);
    }, { timeout: 90000 });

    it('a text watermark turned on shows in the monitor and in the export; turned off it is gone again', async () => {
      await ST.reset();
      await importSource();
      const SE = ST.SE, WM = SE.watermark;
      WM.set(TEXT, 'Test watermark', 'test');
      expect(WM.settings().on).toBe(true);
      // the monitor: the same compositor pass that draws every frame
      const monitor = ST.win.document.getElementById('preview');
      SE.emit('frame', {});
      await waitFor(() => ST.countBright(monitor) > 100, { timeout: 5000 });
      if (!(await ST.canEncode())) { // no encoder here: the preview and the settings are still checked
        expect(first().position).toBe('mc');
        return;
      }
      expect(ST.countBright(await exportFrame())).toBeGreaterThan(300);
      WM.set({ on: false }, 'Watermark off', 'on');
      expect(ST.countBright(await exportFrame())).toBeLessThan(20);
    }, { timeout: 90000 });

    it('a logo watermark is drawn from the uploaded image', async () => {
      await ST.reset();
      await importSource();
      const SE = ST.SE, WM = SE.watermark, logo = document.createElement('canvas');
      logo.width = 120; logo.height = 60; logo.getContext('2d').fillStyle = '#fff'; logo.getContext('2d').fillRect(0, 0, 120, 60);
      WM.set({ on: true, spec: { layers: [{ kind: 'logo', logo: logo.toDataURL('image/png'), logoW: 120, logoH: 60, size: 0.4, position: 'tl', opacity: 1, margin: 0.03 }] } }, 'Test logo', 'logo');
      await WM.ready(SE.doc);
      if (!(await ST.canEncode())) { expect(first().kind).toBe('logo'); return; }
      expect(ST.countBright(await exportFrame())).toBeGreaterThan(2000);
    }, { timeout: 90000 });

    it('the settings are saved with the project and load back with it', async () => {
      await ST.reset();
      const SE = ST.SE, WM = SE.watermark;
      WM.set({ on: true, spec: { layers: [layer({ text: 'KEEP', colour: '#ff0000' })] } }, 'Test watermark', 'test');
      const blob = await SE.project.toBlob();
      WM.set({ on: false, spec: { layers: [layer({ text: 'OTHER' })] } }, 'Watermark off', 'test');
      await SE.project.load(blob);
      expect(WM.settings().on).toBe(true);
      expect(first().text).toBe('KEEP');
      expect(first().colour).toBe('#ff0000');
    });

    it('a project saved before the watermark spec (one flat mark) still opens with its watermark', async () => {
      await ST.reset();
      const SE = ST.SE, WM = SE.watermark;
      SE.change('Old project', (p) => { p.watermark = { on: true, kind: 'text', text: 'FLAT', size: 0.1, position: 'bl', opacity: 0.6, colour: '#00ffff' }; });
      expect(WM.settings().on).toBe(true);
      expect([first().text, first().position, first().size, first().colour]).toEqual(['FLAT', 'bl', 0.1, '#00ffff']);
    });

    it('a layer with a time range shows in the frames of that time only', async () => {
      await ST.reset();
      await importSource();
      const SE = ST.SE, WM = SE.watermark;
      WM.set({ on: true, spec: { layers: [layer({ from: 0.5 })] } }, 'Timed watermark', 'test');
      expect(ST.countBright(ST.renderAt(SE.doc, 0))).toBeLessThan(20);
      expect(ST.countBright(ST.renderAt(SE.doc, 0.6))).toBeGreaterThan(100);
    });

    it('a new project takes this device’s default style, and its watermark stays off', async () => {
      const SE = ST.SE, WM = SE.watermark;
      ST.win.localStorage.removeItem('slopedit.watermark');
      await ST.reset();
      WM.set({ spec: { layers: [layer({ colour: '#00ff00', text: 'DEFAULT', position: 'tl' })] } }, 'Test style', 'style');
      WM.saveDefaults();
      await ST.reset();
      expect(WM.settings().on).toBe(false);
      expect(first().colour).toBe('#00ff00');
      expect(first().text).toBe('DEFAULT');
      ST.win.localStorage.removeItem('slopedit.watermark');
    });

    it('the Watermark tab shows the panel, and its switch and position cells change the project', async () => {
      await ST.reset();
      const SE = ST.SE, doc = ST.win.document;
      SE.act.openWatermark();
      const list = doc.querySelector('.bin-list');
      expect(!!doc.querySelector('.bin-tab[data-tab="watermark"]')).toBe(true);
      expect(!!list.querySelector('.wm-panel')).toBe(true);
      const sw = list.querySelector('.swp-switch input');
      sw.checked = true; sw.dispatchEvent(new ST.win.Event('change'));
      expect(SE.watermark.settings().on).toBe(true);
      const cells = list.querySelectorAll('.swp-cell');
      expect(cells.length).toBe(9);
      cells[0].click();
      expect(first().position).toBe('tl');
      expect(!!list.querySelector('.swp-time')).toBe(true);   // the time range of a layer, for video
    });

    it('with the module absent, the monitor and the compositor still draw', async () => {
      await ST.reset();
      const SE = ST.SE, wm = SE.watermark;
      SE.watermark = undefined;
      try {
        const c = ST.renderAt(SE.doc, 0);
        expect(ST.countBright(c)).toBe(0);
      } finally { SE.watermark = wm; }
    });
  });
})();
