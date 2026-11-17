// Slop Effects in the browser: the real store and actions add a layer and a keyframe, and the real renderer draws one frame
// whose pixels are checked. Also the seeded motion and the copy and paste of keys, through the same actions the UI calls.
(function () {
  'use strict';
  const { describe, it, expect, pixel } = window.SlopTest;
  const E = window.SlopEffects;

  /** A fresh store, actions and key actions for a 320 x 180 composition at 10 fps, 2 s long. */
  function fresh() {
    const doc = E.core.newDoc({ name: 'Test', comp: { width: 320, height: 180, fps: 10, duration: 2, background: '#000000' } });
    const S = E.state.create(doc);
    const toasts = [];
    const act = E.actions.create(S, { toast: (m) => toasts.push(m) });
    const ka = E.actionsKeys.create(S, act);
    return { S, act, ka, toasts };
  }

  /** A canvas of the composition size, drawn at time t. */
  function render(doc, t) {
    const c = document.createElement('canvas');
    c.width = doc.comp.width; c.height = doc.comp.height;
    const ctx = c.getContext('2d');
    E.draw.drawFrame(ctx, doc, t, { media: E.media });
    return c;
  }

  describe('adds a layer', () => {
    it('adds a solid layer on top, selects it, and undo removes it', () => {
      const { S, act } = fresh();
      const id = act.addLayer('solid', { color: '#ff0000' });
      expect(S.doc.layers.length).toBe(1);
      expect(S.doc.layers[0].id).toBe(id);
      expect(S.sel.layer).toBe(id);
      S.undo();
      expect(S.doc.layers.length).toBe(0);
      S.redo();
      expect(S.doc.layers.length).toBe(1);
    });
  });

  describe('adds a keyframe and renders one frame', () => {
    it('keys the position at the playhead, and the frame shows the layer where the key puts it', () => {
      const { S, act } = fresh();
      const id = act.addLayer('solid', { color: '#ff0000' });
      S.edit('Size', (d) => E.layers.setSource(d, id, { w: 40, h: 40 }));
      S.edit('Centre', (d) => E.layers.setBase(d, id, 'anchor', [20, 20]));
      S.edit('Place', (d) => E.layers.setBase(d, id, 'position', [60, 90]));
      act.toggleKeyed('position', id);
      S.seek(1);
      act.setValue('position', [260, 90], id);
      expect(E.keys.keysOf(S.doc, id, 'position').length).toBe(2);
      const start = render(S.doc, 0).getContext('2d');
      expect(pixel(render(S.doc, 0), 60, 90)).toEqual([255, 0, 0, 255]);
      expect(pixel(render(S.doc, 0), 260, 90)).toEqual([0, 0, 0, 255]);
      expect(pixel(render(S.doc, 1), 260, 90)).toEqual([255, 0, 0, 255]);
      expect(pixel(render(S.doc, 1), 60, 90)).toEqual([0, 0, 0, 255]);
      void start;
    });

    it('a half-way frame sits between the two keys (linear, so the midpoint)', () => {
      const { S, act } = fresh();
      const id = act.addLayer('solid', { color: '#00ff00' });
      S.edit('Size', (d) => E.layers.setSource(d, id, { w: 20, h: 20 }));
      S.edit('Centre', (d) => E.layers.setBase(d, id, 'anchor', [10, 10]));
      act.toggleKeyed('position', id);
      S.seek(1);
      act.setValue('position', [200, 90], id);
      S.seek(0);
      act.setValue('position', [100, 90], id);
      const mid = render(S.doc, 0.5);
      expect(pixel(mid, 150, 90)).toEqual([0, 255, 0, 255]);
    });

    it('a colour correction with saturation 0 draws the frame in grey', () => {
      const { S, act } = fresh();
      const id = act.addLayer('solid', { color: '#ff0000' });
      const fx = E.layers.addEffect(S.doc, id, 'colour');
      S.edit('Colour', () => E.layers.setEffectParam(fx.doc, id, fx.id, 'saturation', 0));
      const px = pixel(render(S.doc, 0), 160, 90);
      expect(Math.abs(px[0] - px[1]) <= 2 && Math.abs(px[1] - px[2]) <= 2).toBeTruthy();
    });
  });

  describe('seeded motion and key copy and paste through the actions', () => {
    it('random motion with the same seed gives the same keys', () => {
      const { S, act, ka } = fresh();
      const id = act.addLayer('solid', { color: '#fff' });
      const opts = { seed: 42, props: ['position'], every: 0.5 };
      ka.randomMotion(opts, id);
      const first = JSON.stringify(S.doc.tl.tracks[id].position);
      S.undo();
      ka.randomMotion(opts, id);
      expect(JSON.stringify(S.doc.tl.tracks[id].position)).toBe(first);
    });

    it('copies keys and pastes them at the playhead on another layer', () => {
      const { S, act, ka } = fresh();
      const a = act.addLayer('solid', { color: '#fff' });
      act.toggleKeyed('opacity', a);
      S.seek(1);
      act.setValue('opacity', 40, a);
      S.select({ keys: [{ layer: a, prop: 'opacity', t: 0 }, { layer: a, prop: 'opacity', t: 1 }] });
      ka.copy();
      const b = act.addLayer('solid', { color: '#000' });
      S.seek(0.5);
      S.select({ layer: b, keys: [] });
      ka.paste();
      expect(S.doc.tl.tracks[b].opacity.map((k) => k.t)).toEqual([0.5, 1.5]);
    });
  });

  describe('the project format', () => {
    it('round-trips a composition through the Drive file text', () => {
      const { S, act } = fresh();
      act.addLayer('text', { text: 'Hello', size: 80 });
      const text = E.project.toFile(S.doc);
      const back = E.project.fromFile(text);
      expect(back.name).toBe('Test');
      expect(E.project.problems(back.data)).toEqual([]);
    });
  });
})();
