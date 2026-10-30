/* Slop Cutout: the real page boots and shows the empty state. Script errors fail the harness' console check. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;

  describe('boot', () => {
    let frame;
    it('loads slopisolate/index.html and builds the menus', async () => {
      frame = document.createElement('iframe');
      frame.style.cssText = 'width:1000px;height:700px;border:0';
      const loaded = new Promise((res) => frame.addEventListener('load', res, { once: true }));
      frame.src = '../../slopisolate/index.html';
      document.body.append(frame);
      await loaded;
      await waitFor(() => frame.contentDocument.getElementById('menus').children.length > 0, { timeout: 8000 });
      expect(frame.contentDocument.getElementById('menus').children.length > 0).toBe(true);
    });
    it('starts in the empty state with the drop card visible', () => {
      const doc = frame.contentDocument;
      expect(doc.getElementById('app').dataset.mode).toBe('empty');
      expect(!!doc.getElementById('emptyOpen')).toBe(true);
    });
  });
})();
