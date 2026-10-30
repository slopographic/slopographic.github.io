/* SlopCut tests: templates (region data, apply, re-flow, swap, drop into a slot) and the random edit
   (seeded plan, build as ordinary clips, reshuffle, one undo step, dialog and menu/keyboard entry). */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const key = (win, k, o = {}) => win.document.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  const closeDialogs = (win) => win.document.querySelectorAll('.sui-back').forEach((b) => b.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  const still = (id, extra = {}) => Object.assign({ id, name: id, kind: 'image', dur: Infinity, hasAudio: false }, extra);
  const video = (id, dur) => ({ id, name: id, kind: 'video', dur, hasAudio: true });
  const sum = (list) => list.reduce((s, c) => s + c.dur, 0);

  /** Still images made in the page and imported through the real bin path. */
  async function importStills(n) {
    const win = ST.win, files = [];
    for (let i = 0; i < n; i++) {
      const c = win.document.createElement('canvas');
      c.width = 320; c.height = 180;
      const g = c.getContext('2d');
      g.fillStyle = 'hsl(' + i * 70 + ' 70% 45%)'; g.fillRect(0, 0, 320, 180);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      files.push(new win.File([blob], 'still-' + (i + 1) + '.png', { type: 'image/png' }));
    }
    const metas = await ST.SE.media.importFiles(files);
    await waitFor(() => metas.every((m) => ST.SE.media.ready(m.id)), { timeout: 20000 });
    return metas;
  }
  const v1Clips = () => ST.SE.doc.clips.filter((c) => c.track === ST.M.videoTracks(ST.SE.doc)[0].id).sort((a, b) => a.start - b.start);

  describe('templates: data', () => {
    it('tiling templates cover the frame exactly once; picture-in-picture stays inside the frame', () => {
      const T = ST.SE.templates;
      for (const t of T.list) {
        if (t.layered) t.slots.forEach((r) => expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1).toBe(true));
        else expect(T.tiles(t)).toBe(true);
      }
      expect(T.list.map((t) => t.id)).toEqual(['single', 'split-h', 'split-v', 'pip', 'grid2', 'grid3', 'three-up', 'reel', 'title-two']);
      expect(T.get('grid3').slots.length).toBe(9);
      expect(T.get('reel').aspect).toBe('9:16');
    });
    it('a broken region set is rejected by the coverage check', () => {
      const T = ST.SE.templates;
      expect(T.tiles({ slots: [{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] })).toBe(false);
      expect(T.tiles({ slots: [{ x: 0, y: 0, w: 0.5, h: 1 }] })).toBe(false);
    });
  });

  describe('random edit: pure plan', () => {
    it('seed: same seed gives the same stream; text seeds hash; hex round trips', () => {
      const S = ST.SE.seed;
      const a = S.rng(42), b = S.rng(42), c = S.rng(43);
      const va = [a(), a(), a()], vb = [b(), b(), b()];
      expect(va).toEqual(vb);
      expect(c()).not.toBe(va[0]);
      expect(va.every((v) => v >= 0 && v < 1)).toBe(true);
      expect(S.hex(S.parse('3fa2c1'))).toBe('003fa2c1');
      expect(S.parse('summer cut')).toBe(S.parse('summer cut'));
      expect(S.hex(S.parse(' '))).toMatch(/^[0-9a-f]{8}$/);
    });
    it('same seed gives the same plan; another seed another order', () => {
      const R = ST.SE.random, media = [still('a'), still('b'), still('c'), still('d'), still('e')];
      const p1 = R.plan({ seed: 7, target: 20, pace: 'medium' }, media), p2 = R.plan({ seed: 7, target: 20, pace: 'medium' }, media);
      expect(JSON.stringify(p1.cuts)).toBe(JSON.stringify(p2.cuts));
      const p3 = R.plan({ seed: 8, target: 20, pace: 'medium' }, media);
      expect(JSON.stringify(p3.cuts)).not.toBe(JSON.stringify(p1.cuts));
      expect(p1.seedHex).toBe('00000007');
    });
    it('the plan length is the target (within one clip) and cuts follow the pace', () => {
      const R = ST.SE.random, media = [still('a'), still('b'), video('v', 40)];
      for (const [target, pace, seed] of [[3, 'fast', 1], [7.5, 'slow', 2], [20, 'medium', 3], [45, 'fast', 4], [61.3, 'medium', 5]]) {
        const p = R.plan({ seed, target, pace }, media);
        expect(Math.abs(p.total - target) <= R.PACE[pace][1] + 1e-9).toBe(true);
        expect(Math.abs(p.total - target) < 0.011).toBe(true); // stills and long sources: exact
        for (const beat of p.cuts) expect(beat[0].dur <= R.PACE[pace][1] + 1e-9).toBe(true);
      }
    });
    it('a template gives one clip per slot in every cut, and no clip twice in one cut', () => {
      const R = ST.SE.random, media = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => still(id));
      const p = R.plan({ seed: 9, target: 12, pace: 'medium', tpl: 'grid2' }, media);
      expect(p.slots).toBe(4);
      for (const beat of p.cuts) {
        expect(beat.map((x) => x.slot)).toEqual([0, 1, 2, 3]);
        expect(new Set(beat.map((x) => x.media)).size).toBe(4);
        expect(new Set(beat.map((x) => x.start)).size).toBe(1);
      }
    });
    it('no clip repeats while there are enough clips', () => {
      const R = ST.SE.random, media = ['a', 'b', 'c', 'd', 'e'].map((id) => still(id));
      for (let seed = 1; seed <= 20; seed++) {
        const p = R.plan({ seed, target: 10, pace: 'slow' }, media);
        const ids = p.cuts.flat().map((x) => x.media);
        expect(p.cuts.length <= media.length).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
      }
    });
    it('nothing usable gives no plan; sources too short for a cut are skipped', () => {
      const R = ST.SE.random;
      expect(R.plan({ seed: 1, target: 5 }, [])).toBe(null);
      expect(R.plan({ seed: 1, target: 5 }, [video('tiny', 0.1)])).toBe(null);
      expect(R.plan({ seed: 1, target: 5 }, [still('ok'), video('tiny', 0.1)]).clips).toBe(1);
    });
  });

  describe('templates: apply and slots', () => {
    it('Split horizontal places two selected clips in the two slots (monitor and timeline)', async () => {
      await ST.reset();
      const SE = ST.SE, win = ST.win;
      let a, b;
      SE.change('m', (p) => { a = ST.matte(p, 0, 0, 4, '#ff0000'); b = ST.matte(p, 1, 0, 4, '#0000ff'); });
      SE.app.select([a, b]);
      SE.act.applyTemplate('split-h');
      const lay = SE.doc.layout;
      expect(lay.tpl).toBe('split-h');
      expect(lay.slots).toEqual([a, b]);
      expect(ST.M.clip(SE.doc, a).track).toBe(ST.M.videoTracks(SE.doc)[0].id);
      expect(ST.M.clip(SE.doc, b).track).toBe(ST.M.videoTracks(SE.doc)[1].id);
      const W = SE.doc.w, H = SE.doc.h;
      const c = ST.renderAt(SE.doc, 1);
      expect(ST.near(ST.px(c, Math.round(W * 0.25), Math.round(H / 2)), [255, 0, 0, 255])).toBe(true);
      expect(ST.near(ST.px(c, Math.round(W * 0.75), Math.round(H / 2)), [0, 0, 255, 255])).toBe(true);
      SE.bin.show('templates');
      await waitFor(() => win.document.querySelectorAll('.tp-slot').length === 2);
      expect(win.document.querySelectorAll('.tp-slot')[1].textContent).toContain('Colour matte');
    });
    it('changing the template re-flows the same clips; swapping slots and dropping a clip into a slot', async () => {
      await ST.reset();
      const SE = ST.SE;
      let a, b, c3;
      SE.change('m', (p) => { ST.M.addTrack(p, 'video'); a = ST.matte(p, 0, 0, 4, '#ff0000'); b = ST.matte(p, 1, 0, 4, '#0000ff'); c3 = ST.matte(p, 2, 10, 4, '#00ff00'); });
      SE.app.select([a, b]);
      SE.act.applyTemplate('split-h');
      const before = SE.doc.clips.length;
      SE.act.applyTemplate('grid2');
      expect(SE.doc.layout.tpl).toBe('grid2');
      expect(SE.doc.layout.slots).toEqual([a, b, null, null]);
      expect(SE.doc.clips.length).toBe(before);
      expect(ST.M.clip(SE.doc, b).track).toBe(ST.M.videoTracks(SE.doc)[1].id);
      expect(ST.M.clip(SE.doc, b).scale).toBeCloseTo(0.5, 1e-6);
      SE.change('swap', (p) => ST.SE.layout.swap(p, 0, 1));
      expect(SE.doc.layout.slots.slice(0, 2)).toEqual([b, a]);
      const W = SE.doc.w, H = SE.doc.h;
      expect(ST.near(ST.px(ST.renderAt(SE.doc, 1), Math.round(W * 0.25), Math.round(H * 0.25)), [0, 0, 255, 255])).toBe(true);
      SE.change('drop', (p) => ST.SE.layout.put(p, 2, c3));
      expect(SE.doc.layout.slots[2]).toBe(c3);
      expect(ST.M.clip(SE.doc, c3).track).toBe(ST.M.videoTracks(SE.doc)[2].id);
      SE.change('drop', (p) => ST.SE.layout.put(p, 0, c3));
      expect(SE.doc.layout.slots[0]).toBe(c3);
      expect(SE.doc.layout.slots.includes(b)).toBe(true);
      expect(SE.doc.clips.some((c) => c.id === b)).toBe(true);
      SE.act.applyTemplate('single');
      expect(SE.doc.layout.slots).toEqual([c3]);
      expect(SE.doc.clips.some((c) => c.id === a)).toBe(true);
    });
  });

  describe('random edit: build', () => {
    it('five stills and a 20 s target give clips on the timeline totalling 20 s, with the seed shown', async () => {
      await ST.reset();
      const SE = ST.SE;
      const metas = await importStills(5);
      const plan = SE.act.randomEdit({ target: 20, pace: 'medium', seed: 11 });
      expect(plan.cuts.length >= 4).toBe(true);
      const clips = v1Clips();
      expect(clips.length).toBe(plan.cuts.length);
      expect(Math.abs(sum(clips) - 20) < 0.011).toBe(true);
      expect(clips.every((c) => c.kind === 'image' && c.start >= 0)).toBe(true);
      expect(new Set(clips.map((c) => c.media)).size).toBe(Math.min(5, clips.length));
      expect(SE.doc.random.seed).toBe(11);
      expect(SE.doc.random.seedHex).toBe('0000000b');
      expect(metas.every((m) => SE.doc.media.some((x) => x.id === m.id))).toBe(true);
    });
    it('reshuffle with another seed changes the order; each Undo is one step; Redo brings it back', async () => {
      await ST.reset();
      const SE = ST.SE;
      await importStills(5);
      SE.act.randomEdit({ target: 20, pace: 'medium', seed: 11 });
      const order = () => v1Clips().map((c) => c.media).join(',');
      const first = order();
      SE.act.reshuffleRandom(12345);
      expect(SE.doc.random.seed).toBe(12345);
      expect(order()).not.toBe(first);
      expect(SE.history.undoLabel()).toBe('Random edit');
      expect(SE.history.undo()).toBe(true);
      expect(order()).toBe(first);
      expect(SE.doc.random.seed).toBe(11);
      expect(SE.history.undo()).toBe(true);
      expect(SE.doc.clips.length).toBe(0);
      expect(SE.doc.random).toBe(null);
      expect(SE.history.redo()).toBe(true);
      expect(order()).toBe(first);
    });
    it('the random dialog opens from the keyboard and the menu, and Build edit runs it', async () => {
      await ST.reset();
      const win = ST.win, doc = win.document, SE = ST.SE;
      await importStills(2);
      key(win, 'R', { shiftKey: true });
      await waitFor(() => doc.querySelector('.rd'));
      expect(doc.querySelector('.rd-list').children.length > 0).toBe(true);
      key(win, 'Escape'); closeDialogs(win);
      await waitFor(() => !win.SlopUI.openDialogs || !win.SlopUI.openDialogs.length);
      doc.querySelectorAll('.menu-b')[3].click();
      await waitFor(() => doc.querySelector('.sui-menu'));
      expect(doc.querySelector('.sui-menu').textContent).toContain('Random edit');
      expect(doc.querySelector('.sui-menu').textContent).toContain('Templates panel');
      const row = [...doc.querySelectorAll('.sui-menu .sui-row')].find((r) => r.textContent.includes('Random edit'));
      row.click();
      await waitFor(() => doc.querySelector('.rd'));
      const build = [...doc.querySelectorAll('.sui-dlg .sui-btn, .sui-dlg button')].find((b) => /Build/.test(b.textContent));
      build.click();
      await waitFor(() => SE.doc.clips.length > 0);
      expect(SE.doc.random.tpl).toBe(null);
      expect(SE.doc.clips.every((c) => c.kind === 'image')).toBe(true);
    });
    it('the same seed rebuilds the same edit; a template lays cuts across its slots', async () => {
      await ST.reset();
      const SE = ST.SE, W = SE.doc.w;
      await importStills(4);
      const cuts = () => SE.doc.clips.map((c) => [c.track, c.media, c.start, c.dur, c.in].join('|')).join(';');
      SE.act.randomEdit({ target: 12, pace: 'fast', seed: 5 });
      const first = cuts();
      SE.act.randomEdit({ target: 12, pace: 'fast', seed: 5 });
      expect(cuts()).toBe(first);
      SE.act.randomEdit({ target: 12, pace: 'medium', seed: 6, tpl: 'split-h' });
      const v1 = SE.doc.clips.filter((c) => c.track === ST.M.videoTracks(SE.doc)[0].id);
      const v2 = SE.doc.clips.filter((c) => c.track === ST.M.videoTracks(SE.doc)[1].id);
      expect(v1.length).toBe(v2.length);
      expect(v1.every((c) => Math.abs(c.x + W / 4) < 1)).toBe(true);
      expect(v2.every((c) => Math.abs(c.x - W / 4) < 1 && Math.abs(c.scale - 0.5) < 1e-3)).toBe(true);
      expect(SE.doc.random.tpl).toBe('split-h');
      expect(SE.doc.layout).toBe(null);
    });
    it('the templates panel opens from the keyboard and the menu', async () => {
      await ST.reset();
      const win = ST.win, doc = win.document, SE = ST.SE;
      key(win, 'G', { shiftKey: true });
      expect(SE.bin.tab).toBe('templates');
      await waitFor(() => doc.querySelector('.tp-panel'));
      expect(doc.querySelectorAll('.tp-tile:not(.tp-custom)').length).toBe(10);
      expect(doc.querySelectorAll('.tp-custom').length).toBe(1);
      SE.bin.tab = 'media'; SE.bin.render();
      doc.querySelectorAll('.menu-b')[3].click();
      await waitFor(() => doc.querySelector('.sui-menu'));
      const row = [...doc.querySelectorAll('.sui-menu .sui-row')].find((r) => r.textContent.includes('Templates panel'));
      row.click();
      expect(SE.bin.tab).toBe('templates');
      await waitFor(() => doc.querySelector('.tp-panel'));
      win.SlopUI.closeMenu();
    });
  });
})();
