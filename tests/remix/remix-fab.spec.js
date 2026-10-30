/* Reel Remix floating Remix button (in the app's iframe): it pulses only while clips wait for a remix or no remix
   exists yet, it stops pulsing after a remix runs, its pulse is a keyframe that reduced motion turns into a steady ring,
   and a click remixes. Auto remix is off here so that only the test's own remixes run. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const frame = () => document.getElementById('app');
  const win = () => frame().contentWindow;
  const doc = () => win().document;
  const RM = () => win().RM;
  const $ = (id) => doc().getElementById(id);
  const change = (el) => el.dispatchEvent(new (win().Event)('change', { bubbles: true }));
  const pulsing = () => $('rm-fab').classList.contains('pulse');
  const reduced = () => win().matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function ready() { await waitFor(() => win() && win().RM && win().RM.ready, { timeout: 20000 }); }
  async function still(tag, i) {
    const c = doc().createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + i * 90 + ' 55% 45%)'; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new (win().File)([blob], tag + '-' + i + '.png', { type: 'image/png' });
  }
  async function upload(tag, n) {
    const before = RM().state.items.length;
    const dt = new (win().DataTransfer)();
    for (let i = 1; i <= n; i++) dt.items.add(await still(tag, i));
    const input = win().document.querySelector('#rm-drop input[type=file]');
    input.files = dt.files;
    change(input);
    await waitFor(() => RM().state.items.length >= before + n && RM().pendingCount() >= n, { timeout: 20000 });
  }

  describe('reel remix: floating Remix button', () => {
    it('pulses before any remix exists, and stops once a remix runs', async () => {
      await ready();
      RM().auto.setEnabled(false);
      expect(RM().state.plan).toBeFalsy();
      expect(pulsing()).toBe(true);
      await upload('fab-a', 3);
      expect(pulsing()).toBe(true); // new clips are waiting
      $('rm-remix').click();
      expect(RM().state.plan).toBeTruthy();
      expect(RM().pendingCount()).toBe(0);
      expect(pulsing()).toBe(false);
    });

    it('pulses only while new uploads are not yet remixed', async () => {
      await ready();
      RM().auto.setEnabled(false);
      expect(pulsing()).toBe(false);
      await upload('fab-b', 2);
      expect(pulsing()).toBe(true);
      $('rm-fab').click(); // a click remixes
      expect(RM().pendingCount()).toBe(0);
      expect(pulsing()).toBe(false);
      await upload('fab-c', 1);
      expect(pulsing()).toBe(true);
      $('rm-reshuffle').click();
      expect(pulsing()).toBe(false);
    });

    it('the pulse is a keyframe, and reduced motion gives a steady ring instead', async () => {
      await ready();
      RM().auto.setEnabled(false);
      await upload('fab-d', 1);
      expect(pulsing()).toBe(true);
      const ring = win().getComputedStyle($('rm-fab'), '::after');
      if (reduced()) {
        expect(ring.animationName).toBe('none');
        expect(ring.opacity).toBe('1');
      } else {
        expect(ring.animationName).toBe('rm-fab-ring');
      }
      $('rm-remix').click();
      expect(win().getComputedStyle($('rm-fab'), '::after').animationName).toBe('none');
    });
  });
})();
