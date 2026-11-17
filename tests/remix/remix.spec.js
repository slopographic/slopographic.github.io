/* Reel Remix tests (in the app's iframe): clips added through the real file input, Remix makes a timeline near the
   target length, Reshuffle changes the order, the export preset sets the sequence size, and the Layout lane:
   a 1x1 then 1x3 switch, and add and delete of switches. */
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
  /** Adds n stills through the file input (as a person picking files would). */
  async function addStills(n) {
    const dt = new (win().DataTransfer)();
    for (let i = 1; i <= n; i++) dt.items.add(await still(i));
    const input = win().document.querySelector('#rm-drop input[type=file]');
    input.files = dt.files;
    change(input);
    await waitFor(() => RM().state.items.length >= n, { timeout: 20000 });
  }
  const remixBtn = () => $('rm-remix').click();
  const cutsJson = () => JSON.stringify(RM().state.plan.cuts);

  describe('reel remix: the edit', () => {
    it('adding clips and pressing Remix makes a timeline whose total length is near the target', async () => {
      await ready();
      await addStills(6);
      $('rm-target').value = '12';
      $('rm-random').checked = false;
      remixBtn();
      const plan = RM().state.plan;
      expect(!!plan).toBe(true);
      expect(Math.abs(plan.total - 12) <= 0.011).toBe(true);
      expect($('rm-cuts').children.length > 0).toBe(true);
      expect($('rm-total').textContent).toContain('Total');
    });
    it('reshuffle changes the seed and the order of the cuts', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-target').value = '20';
      remixBtn();
      const before = cutsJson(), seedBefore = RM().state.seed;
      $('rm-reshuffle').click();
      expect(RM().state.seed === seedBefore).toBe(false);
      expect(cutsJson() === before).toBe(false);
      expect(Math.abs(RM().state.plan.total - 20) <= 0.011).toBe(true);
    });
    it('the same seed gives the same edit', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-target').value = '15';
      $('rm-seed').value = '00c0ffee';
      change($('rm-seed'));
      remixBtn();
      const a = cutsJson();
      $('rm-seed').value = '00c0ffee';
      remixBtn();
      expect(cutsJson()).toBe(a);
      expect(RM().state.plan.seedHex).toBe('00c0ffee');
    });
  });

  describe('reel remix: export presets and layouts', () => {
    it('the export preset sets the sequence size used for the layout', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-preset').value = '4k';
      change($('rm-preset'));
      expect(RM().size().w).toBe(3840);
      expect(RM().size().h).toBe(2160);
      remixBtn();
      expect(RM().state.plan.size.w).toBe(3840);
      $('rm-preset').value = 'phone';
      change($('rm-preset'));
      expect(RM().size().h).toBe(1920);
      expect(RM().aspect(RM().size())).toBe('9:16');
    });
    it('a 1x1 then 1x3 switch in the lane puts one clip in the first span and three in the second', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-random').checked = false;
      $('rm-target').value = '8';
      RM().state.lane = [{ start: 0, layout: 'grid-1x1' }, { start: 4, layout: 'grid-1x3' }];
      remixBtn();
      const cuts = RM().state.plan.cuts;
      const first = cuts.filter((b) => b[0].start < 4 - 1e-6), second = cuts.filter((b) => b[0].start >= 4 - 1e-6);
      expect(first.length > 0 && second.length > 0).toBe(true);
      expect(first.every((b) => b.length === 1)).toBe(true);
      expect(second.every((b) => b.length === 3)).toBe(true);
    });
    it('the lane adds a switch at the playhead and deletes the selected one', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-random').checked = false;
      RM().state.lane = [];
      $('rm-target').value = '10';
      remixBtn();
      RM().preview.seek(2.5);
      const lane = $('rm-lanehost');
      lane.querySelector('.lv-btn').click();                       // Switch at playhead
      expect(RM().state.lane.length).toBe(1);
      expect(RM().state.lane[0].start).toBe(2.5);
      const mark = lane.querySelector('.lv-mark');
      mark.dispatchEvent(new (win().PointerEvent)('pointerdown', { button: 0, buttons: 1, bubbles: true, pointerId: 4, clientX: 0, clientY: 0 }));
      mark.dispatchEvent(new (win().PointerEvent)('pointerup', { button: 0, buttons: 0, bubbles: true, pointerId: 4, clientX: 0, clientY: 0 }));
      lane.querySelectorAll('.lv-btn')[1].click();                 // Delete switch
      expect(RM().state.lane.length).toBe(0);
    });
    it('with Random on, Remix draws switch points over the layout list', async () => {
      await ready();
      if (RM().state.items.length < 4) await addStills(6);
      $('rm-random').checked = true;
      $('rm-target').value = '40';
      remixBtn();
      expect(RM().state.plan.segments.length >= 3).toBe(true);
      expect(RM().state.lane.length).toBe(RM().state.plan.segments.length);
      expect(doc().querySelectorAll('#rm-lanehost .lv-mark').length).toBe(RM().state.lane.length);
    });
  });
})();
