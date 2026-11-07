/* Slop Cutout: sample → segmentation → result on screen → PNG export has alpha. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('sample image end to end', () => {
    let frame, CO;
    it('segments the sample with the real model and shows the result', async () => {
      frame = document.createElement('iframe');
      frame.style.cssText = 'width:1100px;height:760px;border:0';
      const loaded = new Promise((res) => frame.addEventListener('load', res, { once: true }));
      frame.src = '../../slopisolate/index.html';
      document.body.append(frame);
      await loaded;
      CO = frame.contentWindow.CO;
      await waitFor(() => !!CO.process, { timeout: 8000 });
      frame.contentDocument.getElementById('emptySample').click();
      await waitFor(() => CO.state.items.length === 1 && CO.state.items[0].status === 'done', { timeout: 120000 });
      await waitFor(() => !!CO.process.active, { timeout: 30000 });
      expect(frame.contentDocument.getElementById('app').dataset.mode).toBe('work');
      expect(CO.process.active.mask.some((v) => v > 128)).toBe(true);
      expect(CO.process.active.mask.some((v) => v < 16)).toBe(true);
    }, { timeout: 180000 }); // the model run plus the first full-size result can take well over the default 15 s
    it('renders the output with transparent corners and an opaque subject', () => {
      const act = CO.process.active, it = act.item;
      const c = CO.compose.render(it, act), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const alpha = (x, y) => d[(y * c.width + x) * 4 + 3];
      // The soft matte leaves a faint residue (≤ 8/255) in empty areas; that is invisible.
      expect(alpha(0, 0) <= 8).toBe(true);
      expect(alpha(c.width - 1, c.height - 1) <= 8).toBe(true);
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 255) opaque++;
      expect(opaque > (c.width * c.height) * 0.05).toBe(true);
    });
  });
})();
