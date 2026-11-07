/* SlopCut tests: keyframes (the Animation section adds a key, edits it and resets it; presets; the compositor draws
   keyed transforms) and the random effect layer (adds, draws below itself only, seeded, reset). The export test
   decodes the first frame of an MP4 that has both keys and an effect. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const RED = [255, 0, 0, 255], BLACK = [0, 0, 0, 255];
  const insp = () => ST.win.document.getElementById('insp');
  const btn = (label) => [...insp().querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  const field = (label) => insp().querySelector('[aria-label="' + label + '"]');
  const keyBtn = (name, idx = 0) => [...insp().querySelectorAll('.anim-key')].filter((b) => b.getAttribute('aria-label').startsWith(name + ' key'))[idx];
  const pointer = (win, type, el, o = {}) => el.dispatchEvent(new win.PointerEvent(type, Object.assign({ bubbles: true, button: 0, pointerId: 1, clientX: 0 }, o)));
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  describe('keyframes', () => {
    it('adds a key at the playhead, moves and edits it in the inspector, and resets it', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      SE.change('Matte', (p) => { ST.matte(p, 0, 0, 4, '#ff0000'); });
      const id = SE.doc.clips[0].id;
      SE.app.select([id]);
      SE.player.seek(1);
      await waitFor(() => btn('Key at playhead'));
      btn('Key at playhead').click();
      let c = ST.M.clip(SE.doc, id);
      expect(Object.keys(c.anim).sort()).toEqual(['opacity', 'rot', 'scale', 'x', 'y']);
      expect(c.anim.x[0].t).toBeCloseTo(1, 3);
      // drag the X key 0.5 s to the right on its track (the track is 4 s long)
      await waitFor(() => keyBtn('X'));
      const k = keyBtn('X'), lane = k.parentElement, r = lane.getBoundingClientRect();
      pointer(win, 'pointerdown', k, { clientX: r.left + r.width * 0.25 });
      pointer(win, 'pointermove', k, { clientX: r.left + r.width * 0.25 + r.width * 0.125 });
      pointer(win, 'pointerup', k, { clientX: r.left + r.width * 0.25 + r.width * 0.125 });
      c = ST.M.clip(SE.doc, id);
      expect(Math.abs(c.anim.x[0].t - 1.5)).toBeLessThan(0.02);
      // edit the value of the selected key: an X offset of 60 px from t = 1.5 s holds for the whole clip
      await waitFor(() => field('X key value'));
      const v = field('X key value');
      v.value = '60';
      v.dispatchEvent(new win.Event('change', { bubbles: true }));
      expect(ST.M.clip(SE.doc, id).anim.x[0].value).toBe(60);
      const f = ST.renderAt(SE.doc, 2);
      expect(ST.near(ST.px(f, 20, 540), BLACK)).toBe(true);
      expect(ST.near(ST.px(f, 80, 540), RED)).toBe(true);
      // Reset keyframes removes every key of the clip
      await waitFor(() => btn('Reset keyframes') && !btn('Reset keyframes').disabled);
      btn('Reset keyframes').click();
      expect(ST.M.clip(SE.doc, id).anim).toBe(null);
      expect(ST.near(ST.px(ST.renderAt(SE.doc, 2), 20, 540), RED)).toBe(true);
    }, { timeout: 30000 });

    it('animate-in presets write keys over the first 0.5 s; Fade in fades the picture', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.change('Matte', (p) => { ST.matte(p, 0, 0, 4, '#ff0000'); });
      const id = SE.doc.clips[0].id;
      SE.app.select([id]);
      await waitFor(() => btn('Fade in'));
      btn('Fade in').click();
      const o = ST.M.clip(SE.doc, id).anim.opacity;
      expect(o.map((k) => k.t)).toEqual([0, 0.5]);
      expect(o.map((k) => k.value)).toEqual([0, 1]);
      expect(ST.near(ST.px(ST.renderAt(SE.doc, 0.25), 960, 540), [128, 0, 0, 255], 8)).toBe(true);
      expect(ST.near(ST.px(ST.renderAt(SE.doc, 2), 960, 540), RED)).toBe(true);
    }, { timeout: 30000 });

    it('Reset all keeps the media and timing and restores the transform and keys', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.change('Matte', (p) => { ST.matte(p, 0, 1, 3, '#00ff00', { x: 90, opacity: 0.4, anim: { x: [{ t: 0, value: 5, ease: 'linear' }] } }); });
      const id = SE.doc.clips[0].id;
      SE.app.select([id]);
      await waitFor(() => btn('Reset all'));
      btn('Reset all').click();
      const c = ST.M.clip(SE.doc, id);
      expect([c.x, c.opacity, c.anim, c.start, c.dur, c.color, c.kind]).toEqual([0, 1, null, 1, 3, '#00ff00', 'color']);
    }, { timeout: 30000 });
  });

  describe('random effect layer', () => {
    it('adds a layer above the tracks, darkens only what is below it, and Reset gives back the defaults', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      SE.change('Matte', (p) => { ST.matte(p, 0, 0, 4, '#ff0000'); });
      SE.player.seek(1);
      SE.act.addEffect();
      const fxc = SE.doc.clips.find((c) => c.kind === 'effect');
      expect(!!fxc).toBe(true);
      expect(fxc.track).toBe(ST.M.videoTracks(SE.doc)[1].id);
      expect(fxc.start).toBe(1);
      expect(fxc.fx.types.length).toBe(5);
      SE.app.select([fxc.id]);
      await waitFor(() => btn('Reset effect'));
      // only the vignette: untick the other four in the inspector, then full intensity
      for (const label of ['Film grain', 'Colour shift', 'Glitch', 'Zoom pulse']) {
        const chip = [...insp().querySelectorAll('.chip')].find((b) => b.textContent.trim() === label);
        chip.click();
      }
      await waitFor(() => field('Intensity (%)'));
      const inten = field('Intensity (%)');
      inten.value = '100';
      inten.dispatchEvent(new win.Event('change', { bubbles: true }));
      expect(ST.M.clip(SE.doc, fxc.id).fx.types).toEqual(['vignette']);
      expect(ST.M.clip(SE.doc, fxc.id).fx.intensity).toBe(1);
      const before = ST.renderAt(SE.doc, 0.5), after = ST.renderAt(SE.doc, 2);
      expect(ST.near(ST.px(before, 2, 2), RED)).toBe(true); // before the layer starts: nothing changes
      const corner = ST.px(after, 2, 2), mid = ST.px(after, 960, 540); // 1920×1080 project: the vignette's clear middle
      expect(corner[0] < 200).toBe(true);
      expect(ST.near(mid, RED)).toBe(true);
      // Reset the layer: all five effects, intensity 60 %, a change every second, the default seed
      btn('Reset effect').click();
      const d = ST.M.clip(SE.doc, fxc.id).fx;
      expect([d.types.length, d.intensity, d.every, d.seed]).toEqual([5, 0.6, 1, 1]);
    }, { timeout: 30000 });

    it('the same seed gives the same frames and another seed gives other frames', async () => {
      const mk = (seed) => {
        const p = ST.project();
        ST.matte(p, 0, 0, 4, '#808080');
        ST.E.addGenerated(p, 'effect', ST.M.videoTracks(p)[1].id, 0, 4, { fx: { seed, every: 0.5, intensity: 0.8, types: ['grain', 'glitch', 'colour', 'zoom'] } });
        return p;
      };
      const frame = (p, t) => Array.from(ST.renderAt(p, t).getContext('2d').getImageData(0, 0, 160, 90).data);
      expect(same(frame(mk(77), 1.2), frame(mk(77), 1.2))).toBe(true);
      expect(same(frame(mk(77), 1.2), frame(mk(78), 1.2))).toBe(false);
    }, { timeout: 30000 });

    it('keys and the effect layer are in the export too (first frame decodes with both)', async () => {
      if (!(await ST.canEncode())) return;
      await ST.reset();
      const SE = ST.SE;
      SE.change('Matte', (p) => { p.w = 160; p.h = 90; p.fps = 10; ST.matte(p, 0, 0, 1, '#ff0000', { anim: { x: [{ t: 0, value: 40, ease: 'linear' }] } }); });
      SE.change('Vignette', (p) => { p.clips.push(ST.M.newClip({ kind: 'effect', track: ST.M.videoTracks(p)[1].id, start: 0, dur: 1, fx: { seed: 3, every: 0, intensity: 1, types: ['vignette'] } })); });
      const out = await SE.encode.run({ format: 'mp4', w: 160, h: 90, fps: 10, quality: 'high', audio: false, a: 0, b: 1 });
      const url = URL.createObjectURL(out.blob), v = document.createElement('video');
      v.muted = true; v.src = url;
      await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('decode failed')); });
      await new Promise((r) => { v.onseeked = r; v.currentTime = 0.01; });
      const c = document.createElement('canvas'); c.width = 160; c.height = 90;
      c.getContext('2d').drawImage(v, 0, 0);
      URL.revokeObjectURL(url);
      const px = (x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
      expect(px(5, 45)[0] < 60).toBe(true); // left of the matte, moved 40 px right: background
      expect(px(100, 45)[0] > 230).toBe(true); // the matte's centre, inside the vignette's clear middle
      expect(px(158, 88)[0] < 200).toBe(true); // corner darkened by the layer above it
    }, { timeout: 90000 });
  });
})();
