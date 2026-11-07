/* SlopIsolate: images added together are cut out at once (a bounded pool of workers), the page stays responsive,
 * finished images can be edited while the rest run, a failed image does not stop the others, and removing an image
 * mid-run cancels it.
 * Covers: slopisolate/js/io/process.js, slopisolate/js/io/files.js, slopisolate/js/ui/queue.js, shared/cutout/cutout.js, shared/cutout/worker.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;

  describe('batch pool', () => {
    it('four images dropped at once run two at a time, all finish, and a click handler runs meanwhile', async () => {
      const W = await BT.open({ model: 'fast', workers: 2 }), CO = W.CO, S = CO.state;
      await W.SlopCutout.load('fast');
      const files = [];
      for (let i = 0; i < 4; i++) files.push(await BT.photo(100 + i, 900, 680, i % 2 ? 'tri' : 'circle'));
      let most = 0, lag = 0, last = performance.now();
      const watch = setInterval(() => { most = Math.max(most, CO.process.running()); const t = performance.now(); lag = Math.max(lag, t - last - 30); last = t; }, 30);
      const order = [];
      const off = CO.on('item', (it) => { if (it.status === 'done' && !order.includes(it.name)) order.push(it.name); });
      BT.drop(files);
      await waitFor(() => CO.process.running() === 2, { timeout: 20000 });
      // a click while the batch runs is handled at once (the model runs in workers, not on the page)
      const btn = W.document.getElementById('btnPanel');
      let clicked = -1;
      const t0 = performance.now();
      btn.addEventListener('click', () => { clicked = performance.now() - t0; }, { once: true });
      setTimeout(() => btn.click(), 0); // queued behind whatever the page is doing: it must get its turn quickly
      await waitFor(() => clicked >= 0, { timeout: 5000 });
      btn.click(); // and back: the panel stays as it was
      expect(clicked < 500).toBe(true);
      await BT.settled(4);
      clearInterval(watch); off();
      expect(S.items.every((it) => it.status === 'done')).toBe(true);
      expect(most).toBe(2); // never more than the pool
      expect(order.length).toBe(4); // (the order they finish in may differ from the order they were dropped in)
      expect(S.items.every((it) => it.base && it.base.length === it.w * it.h)).toBe(true);
      expect(lag < 1500).toBe(true);
      expect(W.SlopCutout.workers <= 3).toBe(true); // two model workers and the edit worker
    }, { timeout: 300000 });

    it('the image on screen can be edited while the others are still being cut out', async () => {
      const W = BT.W(), CO = W.CO, S = CO.state;
      BT.clear();
      const files = [];
      for (let i = 0; i < 4; i++) files.push(await BT.photo(200 + i, 1000, 760));
      BT.drop(files);
      await waitFor(() => S.items.length === 4, { timeout: 10000 });
      const first = S.items[0];
      await waitFor(() => CO.process.active && CO.process.active.item === first, { timeout: 120000 });
      const busy = S.items.filter((it) => it.status !== 'done').length;
      const before = CO.process.active.mask.slice();
      first.s.threshold = 0.9; first.s.softness = 0;
      await CO.process.refresh(first);
      const after = CO.process.active.mask;
      expect(BT.diff(before, after).mean > 0).toBe(true);
      expect(after.every((v) => v === 0 || v === 255)).toBe(true);
      expect(busy > 0).toBe(true); // others were still running when the edit was made
      await BT.settled(4);
    }, { timeout: 300000 });

    it('a file that cannot be read fails alone; the rest of the batch finishes', async () => {
      const W = BT.W(), S = W.CO.state;
      BT.clear();
      BT.drop([await BT.photo(301), BT.broken(), await BT.photo(302)]);
      await BT.settled(3);
      const bad = S.items.find((it) => it.name === 'broken.png');
      expect(bad.status).toBe('error');
      expect(bad.error.length > 0).toBe(true);
      expect(S.items.filter((it) => it.status === 'done').length).toBe(2);
      expect(W.CO.process.pending()).toBe(0);
    }, { timeout: 300000 });

    it('removing images mid-batch (one running, one queued) cancels them; the others finish and nothing errors', async () => {
      const W = await BT.open({ model: 'fast', workers: 1 }), CO = W.CO, S = CO.state;
      const files = [];
      for (let i = 0; i < 4; i++) files.push(await BT.photo(400 + i, 900, 680));
      BT.drop(files);
      await waitFor(() => S.items.length === 4 && S.items[0].status === 'working', { timeout: 30000 });
      const [run, , queued] = S.items;
      expect(queued.status).toBe('queued');
      CO.process.remove(queued);
      CO.process.remove(run);
      expect(S.items.length).toBe(2);
      await BT.settled(2);
      await sleep(300);
      expect(S.items.map((it) => it.status)).toEqual(['done', 'done']);
      expect(S.get(run.id)).toBe(null);
      expect(run.status).not.toBe('done'); // the cancelled run's result was dropped
      expect(CO.process.pending()).toBe(0);
    }, { timeout: 300000 });
  });
})();
