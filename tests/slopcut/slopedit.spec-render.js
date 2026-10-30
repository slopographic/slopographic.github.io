/* SlopCut tests: the compositor draws the expected pixels at a given time (layers, transform, crop,
   opacity, fades, transitions, colour grade, titles) and the live preview shows the timeline. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const RED = [255, 0, 0, 255], BLUE = [0, 0, 255, 255], BLACK = [0, 0, 0, 255];
  const at = (p, t, x, y) => ST.px(ST.renderAt(p, t), x, y);

  describe('compositor', () => {
    it('stacks tracks with scale, position and opacity', () => {
      const p = ST.project();
      ST.matte(p, 0, 0, 5, '#ff0000');
      const b = ST.matte(p, 1, 0, 5, '#0000ff', { scale: 0.5 });
      expect(ST.near(at(p, 1, 80, 45), BLUE)).toBe(true);
      expect(ST.near(at(p, 1, 5, 5), RED)).toBe(true);
      Object.assign(ST.M.clip(p, b), { x: 40 });
      expect(ST.near(at(p, 1, 120, 45), BLUE)).toBe(true);
      expect(ST.near(at(p, 1, 60, 45), RED)).toBe(true);
      Object.assign(ST.M.clip(p, b), { x: 0, scale: 1, opacity: 0.5 });
      expect(ST.near(at(p, 1, 80, 45), [128, 0, 127, 255], 3)).toBe(true);
      ST.M.videoTracks(p)[1].hide = true;
      expect(ST.near(at(p, 1, 80, 45), RED)).toBe(true);
      expect(ST.near(at(p, 6, 80, 45), BLACK)).toBe(true); // past the end: background
    });
    it('crops and rotates a layer', () => {
      const p = ST.project();
      ST.matte(p, 0, 0, 5, '#ff0000');
      const b = ST.matte(p, 1, 0, 5, '#0000ff', { cropL: 0.5 });
      expect(ST.near(at(p, 1, 30, 45), RED)).toBe(true);
      expect(ST.near(at(p, 1, 130, 45), BLUE)).toBe(true);
      Object.assign(ST.M.clip(p, b), { cropL: 0, scale: 0.4, rot: 90 }); // 64×36 turned to 36×64
      expect(ST.near(at(p, 1, 80, 20), BLUE)).toBe(true);
      expect(ST.near(at(p, 1, 105, 45), RED)).toBe(true);
    });
    it('fades a clip in from the background', () => {
      const p = ST.project();
      ST.matte(p, 0, 0, 5, '#ffffff', { fadeIn: 1, fadeOut: 1 });
      expect(ST.near(at(p, 0.5, 80, 45), [128, 128, 128, 255], 3)).toBe(true);
      expect(ST.near(at(p, 2, 80, 45), [255, 255, 255, 255])).toBe(true);
      expect(ST.near(at(p, 4.75, 80, 45), [64, 64, 64, 255], 3)).toBe(true);
    });
    it('renders cross dissolve, dip to black, wipe and push', () => {
      const p = ST.project();
      ST.matte(p, 0, 0, 4, '#ff0000');
      const b = ST.matte(p, 0, 4, 4, '#0000ff');
      ST.E.setTransition(p, b, 'cross', 2);
      expect(ST.near(at(p, 2.9, 80, 45), RED)).toBe(true);
      expect(ST.near(at(p, 4, 80, 45), [128, 0, 127, 255], 3)).toBe(true);
      expect(ST.near(at(p, 5.1, 80, 45), BLUE)).toBe(true);
      ST.E.setTransition(p, b, 'black', 2);
      expect(ST.near(at(p, 3.5, 80, 45), [128, 0, 0, 255], 3)).toBe(true);
      expect(ST.near(at(p, 4, 80, 45), BLACK, 3)).toBe(true);
      expect(ST.near(at(p, 4.5, 80, 45), [0, 0, 128, 255], 3)).toBe(true);
      ST.E.setTransition(p, b, 'wipe', 2);
      expect(ST.near(at(p, 4, 40, 45), BLUE)).toBe(true);
      expect(ST.near(at(p, 4, 120, 45), RED)).toBe(true);
      ST.E.setTransition(p, b, 'push', 2);
      expect(ST.near(at(p, 4, 40, 45), RED)).toBe(true);
      expect(ST.near(at(p, 4, 120, 45), BLUE)).toBe(true);
    });
    it('grades colour on the GPU like the CPU reference', () => {
      const p = ST.project();
      p.media.push({ id: 'img', name: 'i.png', kind: 'image', w: 160, h: 90 });
      const src = ST.win.document.createElement('canvas'); src.width = 160; src.height = 90;
      const g = src.getContext('2d'); g.fillStyle = 'rgb(200,100,50)'; g.fillRect(0, 0, 160, 90);
      const id = ST.E.addGenerated(p, 'image', ST.M.videoTracks(p)[0].id, 0, 5, { media: 'img' });
      const look = { bright: 10, contrast: 20, sat: -40, temp: 30 };
      Object.assign(ST.M.clip(p, id), look);
      const got = ST.px(ST.renderAt(p, 1, { source: () => src }), 80, 45).slice(0, 3);
      const want = ST.SE.grade.cpu([200, 100, 50], look);
      expect(got.every((v, i) => Math.abs(v - want[i]) <= 4)).toBe(true);
      Object.assign(ST.M.clip(p, id), { bright: 0, contrast: 0, sat: -100, temp: 0 });
      const grey = ST.px(ST.renderAt(p, 1, { source: () => src }), 80, 45);
      expect(Math.abs(grey[0] - grey[1]) <= 2 && Math.abs(grey[1] - grey[2]) <= 2).toBe(true);
    });
    it('draws title text with an animation', () => {
      const p = ST.project({ w: 320, h: 180 });
      const id = ST.E.addGenerated(p, 'title', ST.M.videoTracks(p)[0].id, 0, 4, { text: { str: 'HELLO', size: 60, color: '#ffffff', anim: 'fade', shadow: false } });
      const count = (t) => { const c = ST.renderAt(p, t), d = c.getContext('2d').getImageData(0, 60, 320, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200) n++; return n; };
      expect(count(2)).toBeGreaterThan(500);
      expect(count(0)).toBe(0); // fade starts transparent
      expect(ST.SE.text.animAt(ST.M.clip(p, id), 2).alpha).toBe(1);
    });
  });

  describe('live preview', () => {
    it('shows the timeline at the playhead', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.change('test', (p) => { p.w = 320; p.h = 180; ST.matte(p, 0, 0, 3, '#00ff00'); ST.matte(p, 0, 3, 3, '#ff00ff'); });
      SE.emit('settings', {});
      SE.player.seek(1);
      const cv = ST.win.document.getElementById('preview');
      await waitFor(() => { const d = ST.px(cv, cv.width >> 1, cv.height >> 1); return d[1] > 200 && d[0] < 40; });
      SE.player.seek(4);
      await waitFor(() => { const d = ST.px(cv, cv.width >> 1, cv.height >> 1); return d[0] > 200 && d[2] > 200 && d[1] < 40; });
      expect(cv.width / cv.height).toBeCloseTo(16 / 9, 0.05);
    });
  });
})();
