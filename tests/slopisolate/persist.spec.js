/* Slop Isolate: the work survives leaving the page and coming back. Processes the sample, goes to another page of the
 * app and back, and expects the same mask (no model run on the way back). Then clears the saved work.
 * Covers: slopisolate/js/ui/view-state.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const f = document.getElementById('app');

  /** Load a page in the test frame and wait until it has finished loading. */
  function goto(src) {
    return new Promise((res) => { f.addEventListener('load', function on() { f.removeEventListener('load', on); res(); }); f.src = src; });
  }
  const ready = (w) => w && w.CO && w.CO.state && w.CO.viewState && w.document.readyState === 'complete';
  async function openApp() {
    await goto('../../slopisolate/index.html');
    await waitFor(() => ready(f.contentWindow), { timeout: 30000 });
    return f.contentWindow;
  }
  /** A fingerprint of the mask on screen: pixel count above half and a weighted sum. */
  function fingerprint(act) {
    let n = 0, s = 0;
    for (let i = 0; i < act.mask.length; i++) { if (act.mask[i] > 128) n++; s = (s + act.mask[i] * ((i % 97) + 1)) % 1000000007; }
    return { n, s, w: act.w, h: act.h };
  }

  describe('saved work survives leaving the page', () => {
    it('processes an image, goes to another page and back, and sees the same mask', async () => {
      let w = await openApp();
      w.CO.viewState.clear();
      await sleep(1200);
      w = await openApp();
      w.document.getElementById('emptySample').click();
      await waitFor(() => w.CO.state.items.length === 1 && w.CO.state.items[0].status === 'done', { timeout: 200000, polling: 300 });
      await waitFor(() => !!w.CO.process.active, { timeout: 60000, polling: 100 });
      const before = fingerprint(w.CO.process.active);
      expect(before.n > 0).toBe(true);
      await sleep(1500); // the autosave waits 600 ms, then writes to IndexedDB

      await goto('../../slopisolate/about/index.html');
      await sleep(300);
      w = await openApp();
      await waitFor(() => w.CO.state.items.length === 1 && w.CO.state.items[0].status === 'done' && w.CO.process.active && w.CO.process.active.mask, { timeout: 60000, polling: 100 });
      expect(w.CO.state.items[0].name).toBe('sloppo-sample.png');
      expect(fingerprint(w.CO.process.active)).toEqual(before);
      expect(w.CO.state.items[0].timings).toBe(null); // restored, not segmented again
    }, { timeout: 300000 });

    it('clearing the saved work empties the queue, and it stays empty on the next visit', async () => {
      let w = await openApp();
      // the saved work comes back from IndexedDB after the page is ready: wait for it rather than read it at once
      await waitFor(() => w.CO.state.items.length >= 1, { timeout: 30000, polling: 100 });
      w.CO.viewState.clear();
      await waitFor(() => w.CO.state.items.length === 0, { timeout: 10000 });
      await sleep(1200);
      await goto('../../slopisolate/about/index.html');
      await sleep(200);
      w = await openApp();
      await sleep(800);
      expect(w.CO.state.items.length).toBe(0);
    }, { timeout: 120000 });
  });
})();
