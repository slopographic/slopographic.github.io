/* Make reel: the dialog's validation, the Slop Drive hand-off (records, order, manifest), Cut out subjects through
 * SlopIsolate's engine (alpha checked on generated discs), cancel with rollback, and SlopEdit opening the manifest. */
(function () {
  'use strict';
  const { describe, it, expect, waitFor, sleep } = SlopTest;
  const T = GT;
  let W = null, G = null, D = null, H = null;
  const shared = {}; // a cut-out reel made by one test and opened by a later one

  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await sleep(40);
    fr.src = '../../gallery/index.html?db=' + T.dbName;
    await waitFor(() => fr.contentWindow && fr.contentWindow.SlopGallery && fr.contentWindow.SlopGallery.ready, { timeout: 30000 });
    W = fr.contentWindow; G = W.SlopGallery; D = W.document; H = W.SlopHub;
    await G.db.destroy();
    G.library._reset();
    await G.library.load();
    return W;
  }
  /** A JPEG of a white page with a coloured disc in the middle. Each index gets its own colour, so the bytes differ. */
  async function discFile(name, lastModified, i) {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 180;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 240, 180);
    x.fillStyle = `hsl(${i * 70 + 200}, 75%, 35%)`; x.beginPath(); x.arc(120, 90, 55, 0, Math.PI * 2); x.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    return new File([blob], name, { type: 'image/jpeg', lastModified });
  }
  /** Imports n discs dated out of order (day 2, 0, 1, 3), and returns their library records in that import order. */
  async function importDiscs(n) {
    const base = Date.UTC(2021, 0, 1), days = [2, 0, 1, 3];
    const items = [];
    for (let i = 0; i < n; i++) items.push({ file: await discFile(`shot${i}.jpg`, base + days[i] * 864e5, i), name: `shot${i}.jpg` });
    const r = await G.importer.run(items);
    expect(r.added).toBe(n);
    return G.library.list().filter((p) => /^shot\d\.jpg$/.test(p.name)).sort((a, b) => a.name.localeCompare(b.name));
  }
  const spec = (o = {}) => Object.assign({ template: 'random', length: 30, pace: 'medium', aspect: '16:9', order: 'oldest', cutout: false }, o);
  const folderCount = async () => (await H.listFolders({ trashed: 'any' })).length;
  const reelRecords = async (folderId) => H.list({ folderId, trashed: 'any' });

  /** Opens SlopEdit on a manifest in an iframe, clears the "Replace the open project?" question, and waits for boot. */
  async function openEditor(manifestId) {
    const fr = document.getElementById('editor');
    fr.src = 'about:blank';
    await sleep(40);
    fr.src = '../../slopcut/index.html?drive=' + manifestId;
    const replace = () => {
      const d = fr.contentDocument;
      const b = d && [...d.querySelectorAll('.sui-dlg .sui-primary')].find((x) => /Replace/.test(x.textContent));
      return b;
    };
    await waitFor(() => {
      const b = replace();
      if (b) b.click();
      const d = fr.contentDocument;
      return !!(d && d.body && d.body.classList.contains('ready') && fr.contentWindow.SE && fr.contentWindow.SE.app);
    }, { timeout: 90000 });
    return fr.contentWindow;
  }
  const binCount = (E) => E.document.querySelectorAll('#bin .bi').length;
  async function decodeAlpha(blob) {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    const at = (px, py) => x.getImageData(px, py, 1, 1).data[3];
    return { w: bmp.width, h: bmp.height, corner: at(3, 3), centre: at(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2)) };
  }

  describe('the menus, toolbar and command', () => {
    it('the Make reel command, the photo menu item, the Actions item and the toolbar button exist', async () => {
      await boot();
      const [a, b] = await importDiscs(2);
      expect(G.commands.list().some((c) => c.id === 'gallery.reel' && c.title === 'Make reel from selection')).toBe(true);
      expect(D.getElementById('topReel').hidden).toBe(true);
      G.state.select([a.id, b.id]);
      expect(D.getElementById('topReel').hidden).toBe(false);
      G.timeline.render();
      const tile = await waitFor(() => D.querySelector(`.tile[data-id="${a.id}"]`), { timeout: 8000 });
      tile.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 90, button: 2 }));
      const menu = await waitFor(() => D.querySelector('.sui-menu'), { timeout: 4000 });
      expect([...menu.querySelectorAll('.sui-lbl')].map((x) => x.textContent)).toContain('Make reel…');
      W.SlopUI.closeMenu();
      G.menus.openActions(D.getElementById('btnActions'));
      const act = await waitFor(() => D.querySelector('.sui-menu'), { timeout: 4000 });
      expect([...act.querySelectorAll('.sui-lbl')].map((x) => x.textContent)).toContain('Make reel from selection…');
      W.SlopUI.closeMenu();
      G.state.clearSelection();
      expect(D.getElementById('topReel').hidden).toBe(true);
    });
  });

  describe('the dialog and the spec', () => {
    it('the spec rules: at least 2 photos, a length of at least 5 s, known template, pace, aspect and order', () => {
      const C = W.SlopGallery.reelCore;
      expect(C.validate(spec(), 2)).toEqual([]);
      expect(C.validate(spec({ length: 4 }), 2).length).toBe(1);
      expect(C.validate(spec({ length: 5 }), 2)).toEqual([]);
      expect(C.validate(spec({ length: '' }), 2).length).toBe(1);
      expect(C.validate(spec({ length: 601 }), 2).length).toBe(1);
      expect(C.validate(spec(), 1).length).toBe(1);
      expect(C.validate(spec({ aspect: '4:5' }), 2).length).toBe(1);
      expect(C.validate(spec({ template: 'nope' }), 2).length).toBe(1);
    });
    it('the dialog keeps itself open with the reason when the length is under 5 s', async () => {
      await boot();
      const [a, b] = await importDiscs(2);
      G.state.select([a.id, b.id]);
      G.reel.open(G.state.selected);
      const box = await waitFor(() => D.querySelector('.sui-dlg[aria-label="Make reel"]'), { timeout: 4000 });
      const len = box.querySelector('input[type=number]');
      len.value = '4';
      len.dispatchEvent(new W.Event('input', { bubbles: true }));
      expect(box.querySelector('.reel-err').textContent).toMatch(/at least 5 seconds/);
      box.querySelector('.sui-primary').click();
      await sleep(60);
      expect(D.querySelector('.sui-dlg[aria-label="Make reel"]')).toBeTruthy();
      len.value = '5';
      len.dispatchEvent(new W.Event('input', { bubbles: true }));
      expect(box.querySelector('.reel-err').textContent).toBe('');
      box.querySelector('.sui-foot button').click();
    });
    it('the dialog refuses a single photo', async () => {
      await boot();
      const [a] = await importDiscs(2);
      G.reel.open([a.id]);
      const box = await waitFor(() => D.querySelector('.sui-dlg[aria-label="Make reel"]'), { timeout: 4000 });
      expect(box.querySelector('.reel-err').textContent).toMatch(/at least 2 photos/);
      box.querySelector('.sui-foot button').click();
    });
  });

  describe('the hand-off to Slop Drive', () => {
    it('one file record per photo and one manifest, in the chosen order, in a "Reel <date>" folder', async () => {
      await boot();
      const photos = await importDiscs(3);
      const before = await folderCount();
      const r = await G.reel.run(photos, spec({ order: 'oldest' }), { open: false });
      expect(r.error).toBe('');
      expect(await folderCount()).toBe(before + 1);
      const folder = await H.getFolder(r.folderId);
      expect(folder.name).toMatch(/^Reel \d{4}-\d{2}-\d{2} \d{2}\.\d{2}$/);
      const recs = await reelRecords(r.folderId);
      expect(recs.length).toBe(4);
      const manifest = recs.find((x) => x.type === 'application/x-slop-reel+json');
      expect(manifest.name).toBe(folder.name + '.reel.json');
      const m = JSON.parse(await manifest.blob.text());
      expect(m.format).toBe('slop-reel');
      expect(m.template).toBe('random');
      expect(m.length).toBe(30);
      expect(m.pace).toBe('medium');
      expect(m.aspect).toBe('16:9');
      expect(m.order).toBe('oldest');
      expect(m.overlays).toEqual([]);
      expect(m.files.length).toBe(3);
      expect(m.files).toEqual(r.files);
      const names = [];
      for (const id of m.files) names.push((await H.get(id)).name);
      expect(names).toEqual(['shot1.jpg', 'shot2.jpg', 'shot0.jpg']);
      expect(m.files.every((id) => recs.some((x) => x.id === id && x.type === 'image/jpeg'))).toBe(true);
    });
    it('the order options: newest first, and selection order', async () => {
      await boot();
      const photos = await importDiscs(3);
      const C = G.reelCore;
      expect(C.orderPhotos(photos, 'newest').map((p) => p.name)).toEqual(['shot0.jpg', 'shot2.jpg', 'shot1.jpg']);
      expect(C.orderPhotos(photos, 'selection').map((p) => p.name)).toEqual(photos.map((p) => p.name));
      expect(C.folderName(new Date(2026, 9, 11, 14, 5))).toBe('Reel 2026-10-11 14.05');
    });
  });

  describe('Cut out subjects first', () => {
    it('one "(cutout).png" record per photo, with alpha: the corner is clear and the disc is solid', async () => {
      await boot();
      const photos = await importDiscs(2);
      const r = await G.reel.run(photos, spec({ cutout: true }), { open: false });
      expect(r.error).toBe('');
      expect(r.overlays.length).toBe(2);
      expect(r.failed).toEqual([]);
      const recs = await reelRecords(r.folderId);
      const cut = recs.filter((x) => x.type === 'image/png');
      expect(cut.length).toBe(2);
      expect(cut.map((x) => x.name).sort()).toEqual(['shot0 (cutout).png', 'shot1 (cutout).png']);
      for (const o of r.overlays) {
        const rec = await H.get(o.id);
        const px = await decodeAlpha(rec.blob);
        expect(px.w).toBe(240);
        expect(px.corner).toBeLessThan(64);
        expect(px.centre).toBeGreaterThan(192);
      }
      const m = JSON.parse((await recs.find((x) => x.name.endsWith('.reel.json')).blob.text()));
      expect(m.overlays.map((o) => o.of)).toEqual(r.files);
      shared.cut = { manifestId: r.manifestId, count: 4 };
    }, { timeout: 240000 });
    it('cancelling removes everything the reel wrote from Slop Drive', async () => {
      await boot();
      const photos = await importDiscs(2);
      const before = await folderCount(), filesBefore = (await H.list({ trashed: 'any' })).length;
      const ac = new AbortController();
      ac.abort();
      const r = await G.reel.run(photos, spec({ cutout: true }), { open: false, signal: ac.signal });
      expect(r.cancelled).toBe(true);
      expect(await folderCount()).toBe(before);
      expect((await H.list({ trashed: 'any' })).length).toBe(filesBefore);
    });
  });

  describe('SlopEdit opens the manifest', () => {
    it('the files are imported in order and the random edit lays them out (file count in the bin)', async () => {
      await boot();
      const photos = await importDiscs(3);
      const r = await G.reel.run(photos, spec(), { open: false });
      const E = await openEditor(r.manifestId);
      expect(E.SE.doc.media.length).toBe(3);
      await waitFor(() => binCount(E) === 3, { timeout: 8000 });
      expect(E.SE.doc.media.map((m) => m.name)).toEqual(['shot1.jpg', 'shot2.jpg', 'shot0.jpg']);
      expect(E.SE.doc.clips.length).toBeGreaterThan(0);
      expect(E.SE.doc.w).toBe(1920);
      expect(E.SE.doc.h).toBe(1080);
    }, { timeout: 240000 });
    it('the template and length are applied: a 9:16 reel with two slots runs for the target length', async () => {
      await boot();
      const photos = await importDiscs(3);
      const r = await G.reel.run(photos, spec({ template: 'reel', length: 12, pace: 'fast', aspect: '9:16' }), { open: false });
      const E = await openEditor(r.manifestId);
      expect(E.SE.doc.w).toBe(1080);
      expect(E.SE.doc.h).toBe(1920);
      const video = E.SE.doc.clips.filter((c) => c.kind !== 'audio');
      expect(new Set(video.map((c) => c.track)).size).toBe(2);
      const end = Math.max(...video.map((c) => c.start + c.dur));
      expect(Math.abs(end - 12)).toBeLessThan(0.05);
    }, { timeout: 240000 });
    it('a reel with cut-outs puts them in the bin too, and on the timeline', async () => {
      if (!shared.cut) throw new Error('the cut-out test did not run');
      const E = await openEditor(shared.cut.manifestId);
      await waitFor(() => binCount(E) === shared.cut.count, { timeout: 8000 });
      const names = E.SE.doc.media.map((m) => m.name);
      expect(names.filter((n) => /\(cutout\)\.png$/.test(n)).length).toBe(2);
      const overlayIds = E.SE.doc.media.filter((m) => /\(cutout\)\.png$/.test(m.name)).map((m) => m.id);
      expect(E.SE.doc.clips.some((c) => overlayIds.includes(c.media))).toBe(true);
    }, { timeout: 240000 });
  });
})();
