/* SlopIsolate: a batch gets exactly what one image at a time gets.
 * The bug: the Model panel changed only the image on screen. Dropping several images and then choosing another model
 * (what a person does after seeing the first result) left every other image of the batch on the old model, while
 * images uploaded one at a time after the choice all got the new one (measured: alpha mean difference 1.7 to 4.8 of
 * 255, twice to three times as many soft edge pixels, edges a third less sharp). Now every image follows the app's model.
 * Covers: slopisolate/js/io/process.js, slopisolate/js/core/state.js, slopisolate/js/ui/panel.js, shared/cutout/cutout.js */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('batch versus one at a time', () => {
    const shapes = [[11, 480, 360, 'circle'], [23, 360, 480, 'tri'], [37, 520, 390, 'circle']];
    let files, batch = [];
    it('a batch dropped together, then a model chosen: every image of the batch runs with that model', async () => {
      const W = await BT.open({ model: 'fast', workers: 2 });
      files = [];
      for (const s of shapes) files.push(await BT.photo(...s));
      BT.drop(files);
      const S = W.CO.state;
      await waitFor(() => S.items.some((it) => it.status === 'done'), { timeout: 120000 });
      BT.pick('portrait');
      expect(S.model).toBe('portrait');
      await BT.settled(files.length);
      for (const it of S.items) {
        expect(it.status).toBe('done');
        expect(it.modelUsed).toBe('portrait');
        batch.push({ name: it.name, w: it.w, h: it.h, mask: await BT.mask(it) });
      }
    }, { timeout: 300000 });
    it('the same images uploaded one at a time with that model give the same masks (within 0.1 of 255 on average)', async () => {
      const W = BT.W(), S = W.CO.state;
      BT.clear();
      for (const f of files) {
        BT.drop([f]);
        await BT.settled(1);
        const it = S.items[0], ref = batch.find((b) => b.name === it.name);
        expect(it.modelUsed).toBe('portrait');
        expect(it.w + 'x' + it.h).toBe(ref.w + 'x' + ref.h); // full resolution both ways
        const d = BT.diff(await BT.mask(it), ref.mask);
        expect(d.mean).toBeLessThanOrEqual(0.1);
        expect(d.max).toBeLessThanOrEqual(8);
        BT.clear();
      }
    }, { timeout: 300000 });
    it('an image the bulk bar re-ran with its own model keeps it when the panel changes; the others follow', async () => {
      const W = BT.W(), S = W.CO.state;
      BT.drop([files[0], files[1]]);
      await BT.settled(2);
      const [a, b] = S.items;
      a.model = 'fast'; W.CO.process.rerun(a); // what Re-run model… in the bulk bar does
      await BT.settled(2);
      expect(a.modelUsed).toBe('fast');
      W.CO.queue.open(b);
      BT.pick('fast');
      await BT.settled(2);
      expect(b.modelUsed).toBe('fast');
      BT.pick('portrait');
      await waitFor(() => b.status !== 'done', { timeout: 2000 }).catch(() => {});
      await BT.settled(2);
      expect(b.modelUsed).toBe('portrait');
      expect(a.modelUsed).toBe('fast');
      expect(S.modelOf(a)).toBe('fast');
      BT.clear();
    }, { timeout: 300000 });
  });
})();
