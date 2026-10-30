/* Slop Gallery tests for the viewer: its picture is SlopPreview (shared/preview/), driven through real pointer, wheel
 * and key events in the app's iframe. Each test boots the gallery afresh on its own database. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const T = GT;
  let W = null, G = null, D = null;

  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await sleep(40);
    fr.src = '../../gallery/index.html?db=' + T.dbName;
    await waitFor(() => fr.contentWindow && fr.contentWindow.SlopGallery && fr.contentWindow.SlopGallery.ready, { timeout: 30000 });
    W = fr.contentWindow; G = W.SlopGallery; D = W.document;
    await G.library.load();
    await G.db.destroy();
    G.library._reset();
    await G.library.load();
    // Two photos: a large one (so it can be zoomed and panned) and a small one (the next photo).
    await G.importer.run([
      { file: await T.jpegFile('wide.jpg', 1200, 900, { colour: '#2b6cb0' }), name: 'wide.jpg' },
      { file: await T.jpegFile('next.jpg', 640, 480, { colour: '#c05621' }), name: 'next.jpg' },
    ]);
    return G.library.list();
  }
  const idOf = (name) => G.library.list().find((m) => m.name === name).id;
  /** The picture is on screen once its content has been laid out for this photo. */
  const waitPicture = (name) => waitFor(() => {
    const img = D.querySelector('.v-pic .spv-img');
    return img && img.alt === name && img.naturalWidth > 0 && D.querySelector('.v-pic .spv-content').style.width !== '';
  }, { timeout: 8000 });
  const pct = () => parseInt(D.querySelector('.v-pic .spv-pct').textContent, 10);
  const stage = () => D.querySelector('.v-pic .spv-stage');
  const contentXY = () => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(D.querySelector('.v-pic .spv-content').style.transform);
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  };
  const key = (k, target) => target.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  describe('opening a photo shows the shared preview', () => {
    it('the viewer holds one SlopPreview picture of the photo, fitted to the window', async () => {
      await boot();
      G.viewer.open([idOf('wide.jpg'), idOf('next.jpg')], 0);
      await waitPicture('wide.jpg');
      expect(D.querySelector('.viewer').hidden).toBe(false);
      expect(D.querySelectorAll('.viewer .spv').length).toBe(1);
      expect(D.querySelector('.v-pic .spv-img').getAttribute('src').startsWith('blob:')).toBe(true);
      expect(D.querySelector('.v-count').textContent).toBe('1 / 2');
      expect(pct()).toBeLessThan(100); // 1200 × 900 does not fit at 100%
      G.viewer.close();
    });
  });

  describe('the wheel and the drag', () => {
    it('the mouse wheel zooms the picture in around the pointer', async () => {
      await boot();
      G.viewer.open([idOf('wide.jpg'), idOf('next.jpg')], 0);
      await waitPicture('wide.jpg');
      const before = pct();
      const r = stage().getBoundingClientRect();
      stage().dispatchEvent(new W.WheelEvent('wheel', { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
      expect(pct()).toBeGreaterThan(before);
      G.viewer.close();
    });
    it('dragging with the mouse held pans the zoomed picture', async () => {
      await boot();
      G.viewer.open([idOf('wide.jpg'), idOf('next.jpg')], 0);
      await waitPicture('wide.jpg');
      const r = stage().getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      stage().dispatchEvent(new W.WheelEvent('wheel', { deltaY: -600, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
      const from = contentXY();
      const pointer = (type, x, y) => stage().dispatchEvent(new W.PointerEvent(type, { pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      pointer('pointerdown', cx, cy);
      pointer('pointermove', cx + 60, cy + 40);
      pointer('pointerup', cx + 60, cy + 40);
      const to = contentXY();
      expect(to.x - from.x).toBe(60);
      expect(to.y - from.y).toBe(40);
      G.viewer.close();
    });
  });

  describe('moving between photos', () => {
    it('the arrow keys move to the next and previous photo, and the old picture is revoked', async () => {
      await boot();
      G.viewer.open([idOf('wide.jpg'), idOf('next.jpg')], 0);
      await waitPicture('wide.jpg');
      const revoked = [];
      const realRevoke = W.URL.revokeObjectURL;
      W.URL.revokeObjectURL = (u) => { revoked.push(u); return realRevoke.call(W.URL, u); };
      const firstUrl = D.querySelector('.v-pic .spv-img').getAttribute('src');
      const picture = D.querySelector('.v-pic .spv');
      key('ArrowRight', picture);
      await waitPicture('next.jpg');
      expect(D.querySelector('.v-count').textContent).toBe('2 / 2');
      expect(G.viewer.current().id).toBe(idOf('next.jpg'));
      expect(revoked).toContain(firstUrl);
      key('ArrowLeft', D.querySelector('.v-pic .spv'));
      await waitPicture('wide.jpg');
      expect(D.querySelector('.v-count').textContent).toBe('1 / 2');
      W.URL.revokeObjectURL = realRevoke;
      G.viewer.close();
    });
    it('Escape closes the viewer and frees the picture and its blob URL', async () => {
      await boot();
      G.viewer.open([idOf('wide.jpg'), idOf('next.jpg')], 0);
      await waitPicture('wide.jpg');
      const url = D.querySelector('.v-pic .spv-img').getAttribute('src');
      const revoked = [];
      const realRevoke = W.URL.revokeObjectURL;
      W.URL.revokeObjectURL = (u) => { revoked.push(u); return realRevoke.call(W.URL, u); };
      key('Escape', D.querySelector('.v-pic .spv'));
      expect(D.querySelector('.viewer').hidden).toBe(true);
      expect(D.querySelector('.v-pic .spv')).toBe(null);
      expect(revoked).toContain(url);
      W.URL.revokeObjectURL = realRevoke;
    });
  });
})();
