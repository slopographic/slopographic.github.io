/* Reel Remix keyframe tests (in the app's iframe): a key is added at the playhead through the keyframe row, the
   row shows it, and Reset slot keys removes it. Clips are added through the real file input, as a person would. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const frame = () => document.getElementById('app');
  const win = () => frame().contentWindow;
  const doc = () => win().document;
  const RM = () => win().RM;
  const $ = (id) => doc().getElementById(id);
  const change = (el) => el.dispatchEvent(new (win().Event)('change', { bubbles: true }));

  async function ready() { await waitFor(() => win() && win().RM && win().RM.ready, { timeout: 20000 }); }
  /** A PNG still made in the page. */
  async function still(i) {
    const c = doc().createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = 'hsl(' + i * 50 + ' 70% 45%)'; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    return new (win().File)([blob], 'photo-' + i + '.png', { type: 'image/png' });
  }
  async function addStills(n) {
    const dt = new (win().DataTransfer)();
    for (let i = 1; i <= n; i++) dt.items.add(await still(i));
    const input = win().document.querySelector('#rm-drop input[type=file]');
    input.files = dt.files;
    change(input);
    await waitFor(() => RM().state.items.length >= n, { timeout: 20000 });
  }
  /** Keys of the slot at the playhead, as the state stores them. */
  const keysNow = () => {
    const cur = RM().keys.current();
    return cur ? win().SlopVideo.keys.get(RM().state.keys, cur.ci, cur.item.slot) : null;
  };

  describe('reel remix: keyframes', () => {
    it('adding a key at the playhead shows in the keyframe row, and Reset slot keys removes it', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-target').value = '12';
      $('rm-remix').click();
      RM().preview.seek(0.2);
      expect(keysNow().length).toBe(0);
      expect($('rm-kadd').disabled).toBe(false);
      $('rm-kadd').click();
      expect(keysNow().length).toBe(1);
      expect(keysNow()[0].t).toBeCloseTo(0.2, 0.01);
      expect($('rm-kinfo').textContent).toContain('1 key');
      expect(doc().querySelectorAll('#rm-ktrack .rm-kkey').length).toBe(1);
      $('rm-kreset').click();
      expect(keysNow().length).toBe(0);
      expect($('rm-kinfo').textContent).toContain('0 keys');
    });
  });
})();
