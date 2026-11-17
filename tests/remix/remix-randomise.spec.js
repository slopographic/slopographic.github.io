/* Reel Remix Randomise (in the app's iframe): a typed seed gives the same order each time it is randomised, the seed
   is in the URL, the choices stay within their options, and Undo puts the previous result back. Auto remix is off so
   that only the test's own plans run. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const frame = () => document.getElementById('app');
  const win = () => frame().contentWindow;
  const doc = () => win().document;
  const RM = () => win().RM;
  const $ = (id) => doc().getElementById(id);
  const change = (el) => el.dispatchEvent(new (win().Event)('change', { bubbles: true }));
  const typeSeed = (text) => { const el = $('rm-seed'); el.value = text; el.dispatchEvent(new (win().Event)('input', { bubbles: true })); };
  /** The media ids of the plan in play order. */
  const order = () => RM().state.plan.cuts.map((beat) => beat.map((x) => x.media).join(',')).join('|');

  async function ready() { await waitFor(() => win() && win().RM && win().RM.ready, { timeout: 20000 }); }
  async function still(i) {
    const c = doc().createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + i * 45 + ' 65% 42%)'; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new (win().File)([blob], 'shot-' + i + '.png', { type: 'image/png' });
  }
  async function addStills(n) {
    const dt = new (win().DataTransfer)();
    for (let i = 1; i <= n; i++) dt.items.add(await still(i));
    const input = win().document.querySelector('#rm-drop input[type=file]');
    input.files = dt.files;
    change(input);
    await waitFor(() => RM().state.items.length >= n && RM().pendingCount() >= n, { timeout: 20000 });
  }

  describe('reel remix: randomise', () => {
    it('the same typed seed gives the same order', async () => {
      await ready();
      RM().auto.setEnabled(false);
      if (RM().state.items.length < 6) await addStills(6);
      $('rm-target').value = '12';
      typeSeed('c0ffee42');
      $('rm-randomise').click();
      const first = order();
      expect(RM().state.plan).toBeTruthy();
      expect(RM().state.seed >>> 0).toBe(0xc0ffee42);
      expect($('rm-seed').value).toBe('c0ffee42');
      typeSeed('c0ffee42');
      $('rm-randomise').click();
      expect(order()).toBe(first);
    });

    it('the seed is in the URL, and a different seed gives a different order', async () => {
      await ready();
      typeSeed('c0ffee42');
      $('rm-randomise').click();
      expect(win().location.search).toContain('rm.seed=c0ffee42');
      const a = order();
      typeSeed('0badf00d');
      $('rm-randomise').click();
      expect(win().location.search).toContain('rm.seed=0badf00d');
      expect(order()).not.toBe(a);
    });

    it('randomise draws lengths within the limits, and transitions and effects from their choices', async () => {
      await ready();
      $('rm-seed').value = ''; // nothing typed: a new seed
      $('rm-randomise').click();
      const st = RM().state;
      expect(st.timing).toBe('random');
      expect(['none', 'fade', 'slide']).toContain(st.photo.enter);
      expect(['none', 'fade', 'slide']).toContain(st.photo.exit);
      expect(['grain', 'colour', 'glitch', 'zoom', 'vignette']).toContain(st.effect.kind);
      for (const beat of st.plan.cuts) for (const x of beat) {
        expect(x.dur).toBeGreaterThanOrEqual(st.min - 1e-6);
        expect(x.dur).toBeLessThanOrEqual(st.max + 1e-6);
      }
    });

    it('Undo puts back the result from before the last Randomise', async () => {
      await ready();
      typeSeed('5eed5eed');
      $('rm-randomise').click();
      const before = { seed: RM().state.seed >>> 0, order: order() };
      expect($('rm-undo').disabled).toBe(false);
      $('rm-seed').value = '';
      $('rm-randomise').click();
      expect((RM().state.seed >>> 0) !== before.seed).toBe(true);
      $('rm-undo').click();
      expect(RM().state.seed >>> 0).toBe(before.seed);
      expect(order()).toBe(before.order);
      expect($('rm-seed').value).toBe('5eed5eed');
      expect($('rm-undo').disabled).toBe(true);
    });
  });
})();
