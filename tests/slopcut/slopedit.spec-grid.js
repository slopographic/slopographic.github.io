/* SlopCut tests: the layout grid by dragging. A 3×1 template gives three slots on three tracks; a bin item dropped on
   the middle slot lands in the middle column; a bin item dropped on a monitor cell fills that cell; slots swap and clear
   by dragging; the picker offers the layouts the spec asks for. Also a wipe transition and a graphic, seen in pixels. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor } = SlopTest;
  const MIME_MEDIA = 'application/x-slopedit-media', MIME_SLOT = 'application/x-slopedit-slot';

  /** A solid still made in the page and imported through the real bin path. */
  async function importStill(colour, name) {
    const win = ST.win, c = win.document.createElement('canvas');
    c.width = 320; c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = colour; g.fillRect(0, 0, 320, 180);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const metas = await ST.SE.media.importFiles([new win.File([blob], name + '.png', { type: 'image/png' })]);
    await waitFor(() => metas.every((m) => ST.SE.media.ready(m.id)), { timeout: 20000 });
    return metas[0];
  }
  /** A fresh DataTransfer carrying one payload (a new one per event: the data is protected after dispatch). */
  const dt = (type, value) => { const d = new ST.win.DataTransfer(); d.setData(type, value); return d; };
  const drop = (el, type, value, x, y) => el.dispatchEvent(new ST.win.DragEvent('drop', { dataTransfer: dt(type, value), bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const videoTracks = () => ST.M.videoTracks(ST.SE.doc);
  /** Pixels of the frame at time t, with the bin's still bitmaps as the sources. */
  const frameAt = (t) => ST.renderAt(ST.SE.doc, t, { source: (c) => { const it = ST.SE.media.get(c.media); return it ? it.bmp : null; } });
  const showTemplates = () => { ST.SE.bin.picked = new Set(); ST.SE.bin.tab = 'templates'; ST.SE.bin.render(); };

  describe('layout grid by dragging', () => {
    it('a 3×1 template gives three empty slots and a track each; a bin item dropped on slot 2 lands in the middle column', async () => {
      await ST.reset();
      const SE = ST.SE, doc = ST.win.document;
      showTemplates();
      SE.act.applyTemplate('three-up');
      expect(SE.doc.layout.tpl).toBe('three-up');
      expect(JSON.stringify(SE.doc.layout.slots)).toBe('[null,null,null]');
      expect(videoTracks().length >= 3).toBe(true);
      const red = await importStill('rgb(230,40,40)', 'red');
      await waitFor(() => doc.querySelector('.tp-slot[data-slot="1"]'));
      const card = doc.querySelector('.tp-slot[data-slot="1"]');
      card.dispatchEvent(new ST.win.DragEvent('dragover', { dataTransfer: dt(MIME_MEDIA, red.id), bubbles: true, cancelable: true }));
      drop(card, MIME_MEDIA, red.id);
      const id = SE.doc.layout.slots[1];
      expect(!!id).toBe(true);
      const c = ST.M.clip(SE.doc, id);
      expect(c.track).toBe(videoTracks()[1].id);
      expect(Math.abs(c.x) < 1).toBe(true);
      const cv = frameAt(c.start + 0.05), W = SE.doc.w, H = SE.doc.h;
      expect(ST.near(ST.px(cv, Math.round(W / 2), Math.round(H / 2)), [230, 40, 40, 255], 30)).toBe(true);
      expect(ST.near(ST.px(cv, Math.round(W / 6), Math.round(H / 2)), [0, 0, 0, 255], 8)).toBe(true);
    });

    it('a bin item dropped on a monitor cell fills that cell (the right-hand column of a 3×1)', async () => {
      await ST.reset();
      const SE = ST.SE;
      showTemplates();
      SE.act.applyTemplate('three-up');
      const green = await importStill('rgb(40,200,60)', 'green');
      const ov = SE.app.els.overlay, r = ov.getBoundingClientRect();
      drop(ov, MIME_MEDIA, green.id, r.left + r.width * (5 / 6), r.top + r.height / 2);
      const id = SE.doc.layout.slots[2];
      expect(!!id).toBe(true);
      expect(ST.M.clip(SE.doc, id).track).toBe(videoTracks()[2].id);
      const cv = frameAt(ST.M.clip(SE.doc, id).start + 0.05), W = SE.doc.w, H = SE.doc.h;
      expect(ST.near(ST.px(cv, Math.round(W * 5 / 6), Math.round(H / 2)), [40, 200, 60, 255], 30)).toBe(true);
      expect(ST.near(ST.px(cv, Math.round(W / 2), Math.round(H / 2)), [0, 0, 0, 255], 8)).toBe(true);
    });

    it('a slot dropped on another slot swaps with it; a slot dropped on the clip list is cleared and its clip stays', async () => {
      await ST.reset();
      const SE = ST.SE, doc = ST.win.document;
      showTemplates();
      SE.act.applyTemplate('three-up');
      const a = await importStill('rgb(200,200,40)', 'yellow'), b = await importStill('rgb(40,40,220)', 'blue');
      const ov = SE.app.els.overlay, r = ov.getBoundingClientRect();
      drop(ov, MIME_MEDIA, a.id, r.left + r.width / 6, r.top + r.height / 2);
      drop(ov, MIME_MEDIA, b.id, r.left + r.width / 2, r.top + r.height / 2);
      const [s0, s1] = SE.doc.layout.slots;
      expect(!!s0 && !!s1).toBe(true);
      await waitFor(() => doc.querySelector('.tp-slot[data-slot="0"]'));
      drop(doc.querySelector('.tp-slot[data-slot="1"]'), MIME_SLOT, '0');
      expect(SE.doc.layout.slots[0]).toBe(s1);
      expect(SE.doc.layout.slots[1]).toBe(s0);
      expect(SE.doc.layout.slots[2]).toBe(null);
      drop(doc.querySelector('.tp-drop'), MIME_SLOT, '1');
      expect(SE.doc.layout.slots[1]).toBe(null);
      expect(!!ST.M.clip(SE.doc, s0)).toBe(true);
    });

    it('the picker offers the layouts the spec asks for, labelled columns × rows', async () => {
      await ST.reset();
      showTemplates();
      const doc = ST.win.document;
      await waitFor(() => doc.querySelector('.tp-panel'));
      const labels = [...doc.querySelectorAll('.tp-tile:not(.tp-custom) > b')].map((b) => b.textContent);
      expect(JSON.stringify(labels)).toBe(JSON.stringify(['1×2', '2×1', '3×1', '1×3', '2×2', '3×3', 'PIP', 'Title + 2', '1×1', '9:16']));
    });

    it('Title + 2: a title preset dropped on the title band becomes a title clip in slot 1', async () => {
      await ST.reset();
      const SE = ST.SE, doc = ST.win.document;
      showTemplates();
      SE.act.applyTemplate('title-two');
      await waitFor(() => doc.querySelector('.tp-slot[data-slot="0"]'));
      drop(doc.querySelector('.tp-slot[data-slot="0"]'), 'application/x-slopedit-fx', JSON.stringify({ kind: 'title', preset: { text: { str: 'Hello', size: 80, anim: 'fade' }, y: 0, x: 0 } }));
      const id = SE.doc.layout.slots[0], c = ST.M.clip(SE.doc, id);
      expect(c.kind).toBe('title');
      expect(c.text.str).toBe('Hello');
      expect(c.track).toBe(videoTracks()[0].id);
    });

    it('a 1×3 layout (three rows) gives three tracks and an empty slot on each', async () => {
      await ST.reset();
      showTemplates();
      ST.SE.act.applyTemplate('grid-3x1');
      expect(ST.SE.doc.layout.slots.length).toBe(3);
      expect(videoTracks().length >= 3).toBe(true);
    });

    it('a wipe-left transition reveals the arriving clip from the right edge at the middle of the cut', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.change('Wipe test', (p) => {
        const v1 = ST.M.videoTracks(p)[0];
        const a = ST.matte(p, 0, 0, 2, '#000000'), b = ST.matte(p, 0, 2, 2, '#ffffff');
        ST.E.setTransition(p, b, 'wipe-left', 1);
        return [a, b, v1 && 1];
      });
      const cv = frameAt(2.0), W = SE.doc.w, H = SE.doc.h;
      expect(ST.near(ST.px(cv, Math.round(W * 0.25), Math.round(H / 2)), [0, 0, 0, 255], 8)).toBe(true);
      expect(ST.near(ST.px(cv, Math.round(W * 0.75), Math.round(H / 2)), [255, 255, 255, 255], 8)).toBe(true);
    });

    it('the Effects tab shows the transition library (with a duration and a preview), the graphics library and a Caption title', async () => {
      await ST.reset();
      const SE = ST.SE, doc = ST.win.document;
      SE.bin.tab = 'effects'; SE.bin.render();
      await waitFor(() => doc.querySelector('.tr-prev'));
      const tr = [...doc.querySelectorAll('.fx.tr span:last-child')].map((x) => x.textContent);
      expect(tr.length).toBe(14);
      expect(tr.includes('Glitch') && tr.includes('Blur dissolve') && tr.includes('Wipe left')).toBe(true);
      expect(doc.querySelectorAll('.gfx-grid .fx').length).toBe(8);
      expect(!!doc.querySelector('.tr-prev') && doc.querySelector('.tr-prev').width > 0).toBe(true);
      expect([...doc.querySelectorAll('.fx span')].some((x) => x.textContent === 'Caption')).toBe(true);
      SE.trPanel.play('zoom-in');
      expect(SE.transitions.dur).toBe(1);
    });

    it('a graphic from the library renders on the monitor in its colour', async () => {
      await ST.reset();
      const SE = ST.SE;
      SE.act.addGraphic({ id: 'box', color: '#ff0000', size: 0.6, anim: 'none' });
      const id = SE.app.selectedIds()[0], c = ST.M.clip(SE.doc, id);
      expect(c.kind).toBe('graphic');
      expect(c.gfx.id).toBe('box');
      const cv = frameAt(c.start + 0.5), data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++;
      expect(red > 200).toBe(true);
    });
  });
})();
