/* Reel Remix auto remix (in the app's iframe): a finished upload batch is remixed once by itself, the clips of that
   batch are not remixed again, Cancel stops the wait (the Remix button then has the work), and the switch in the
   settings turns it off. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const frame = () => document.getElementById('app');
  const win = () => frame().contentWindow;
  const doc = () => win().document;
  const RM = () => win().RM;
  const $ = (id) => doc().getElementById(id);
  const change = (el) => el.dispatchEvent(new (win().Event)('change', { bubbles: true }));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function ready() { await waitFor(() => win() && win().RM && win().RM.ready, { timeout: 20000 }); }
  /** A PNG still made in the page. */
  async function still(tag, i) {
    const c = doc().createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + i * 70 + ' 60% 40%)'; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new (win().File)([blob], tag + '-' + i + '.png', { type: 'image/png' });
  }
  /** One upload batch through the page's file input (the same path as Add files). */
  async function upload(tag, n) {
    const before = RM().state.items.length;
    const dt = new (win().DataTransfer)();
    for (let i = 1; i <= n; i++) dt.items.add(await still(tag, i));
    const input = win().document.querySelector('#rm-drop input[type=file]');
    input.files = dt.files;
    change(input);
    await waitFor(() => RM().state.items.length >= before + n, { timeout: 20000 });
    await waitFor(() => RM().pendingCount() >= n, { timeout: 20000 });
  }
  /** Count the plans the page makes (every Remix, Reshuffle, Randomise and auto remix). */
  function counter() {
    const c = { n: 0 };
    RM().onPlan(() => { c.n++; });
    return c;
  }

  describe('reel remix: auto remix', () => {
    it('a finished upload batch is remixed once by itself, and not again for the same clips', async () => {
      await ready();
      RM().auto.setEnabled(true);
      const plans = counter();
      await upload('batch-a', 4);
      await waitFor(() => plans.n === 1, { timeout: 8000 });
      expect(plans.n).toBe(1);
      expect(RM().state.plan).toBeTruthy();
      expect(RM().state.plan.cuts.length).toBeGreaterThan(0);
      expect(RM().pendingCount()).toBe(0);
      await sleep(2200);
      expect(plans.n).toBe(1);
    });

    it('the banner shows the count while the wait runs', async () => {
      await ready();
      RM().auto.setEnabled(true);
      const plans = counter();
      const before = plans.n;
      await upload('batch-b', 3);
      await waitFor(() => !$('rm-auto').hidden, { timeout: 5000 });
      expect($('rm-auto-text').textContent).toBe('Remixing ' + RM().media().length + ' clips…');
      await waitFor(() => plans.n === before + 1, { timeout: 8000 });
      expect($('rm-auto').hidden).toBe(true);
    });

    it('Cancel stops the wait: the clips stay pending and Remix makes the edit', async () => {
      await ready();
      RM().auto.setEnabled(true);
      const plans = counter();
      const before = plans.n;
      await upload('batch-c', 2);
      await waitFor(() => !$('rm-auto').hidden, { timeout: 5000 });
      $('rm-auto-cancel').click();
      expect($('rm-auto').hidden).toBe(true);
      await sleep(2000);
      expect(plans.n).toBe(before);
      expect(RM().pendingCount()).toBe(2);
      $('rm-remix').click();
      expect(plans.n).toBe(before + 1);
      expect(RM().pendingCount()).toBe(0);
    });

    it('the switch in the settings turns auto remix off, and back on', async () => {
      await ready();
      RM().auto.setEnabled(false);
      const plans = counter();
      const before = plans.n;
      await upload('batch-d', 2);
      await sleep(2200);
      expect(plans.n).toBe(before);
      expect($('rm-auto').hidden).toBe(true);
      expect(RM().pendingCount()).toBe(2);
      RM().auto.setEnabled(true);
      expect(RM().auto.enabled()).toBe(true);
      expect(win().localStorage.getItem('slop.remix.prefs')).toContain('"auto":true');
    });
  });
})();
