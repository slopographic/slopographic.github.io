// Covers: gallery/js/io/drive-source.js
/* Slop Gallery tests: the Drive source, in the real app (a same-origin iframe with its own library database). Slop Drive
 * is stubbed where the gallery reads it (SlopHub.list, get, touch, sendTo), so no Drive database is read or written.
 * The thumbnail cache is a test database too (window.SLOP_THUMB_DB, set on the iframe). */
(function () {
  'use strict';
  const { describe, expect, waitFor, sleep } = SlopTest;
  // Each test boots a fresh gallery in the iframe, so it gets more time than the harness default.
  const it = (name, fn) => SlopTest.it(name, fn, { timeout: 45000 });
  const NOW = Date.UTC(2026, 9, 1);
  const rec = (id, name, type, size, time) => ({ id, name, type, size, time, modified: time, blob: new Blob(['x'], { type }) });
  const LIST = [
    rec('img1', 'holiday.png', 'image/png', 1200, NOW - 3000),
    rec('vid1', 'clip.mp4', 'video/mp4', 4000, NOW - 2000),
    rec('doc1', 'invoice.pdf', 'application/pdf', 900, NOW - 1000),
    rec('js1', 'app.js', 'text/javascript', 300, NOW),
  ];
  const AUDIO = [rec('aud1', 'song.mp3', 'audio/mpeg', 500, NOW)];
  const MODEL = [rec('3d1', 'room.glb', 'model/gltf-binary', 700, NOW)];
  let W = null, D = null, G = null, current = LIST, sent = [];
  const rand = () => Math.random().toString(36).slice(2, 10);

  /** A fresh gallery in the iframe, with Slop Drive stubbed to the list in `current`. */
  async function boot() {
    const fr = document.getElementById('app');
    fr.src = 'about:blank';
    await sleep(40);
    fr.src = '../../gallery/index.html?db=drive-src-' + rand();
    await waitFor(() => fr.contentWindow && fr.contentWindow.SlopGallery && fr.contentWindow.SlopGallery.ready, { timeout: 30000 });
    W = fr.contentWindow; D = W.document; G = W.SlopGallery;
    current = LIST; sent = [];
    W.SlopHub.list = async () => current.slice();
    W.SlopHub.get = async (id) => LIST.concat(AUDIO, MODEL).find((r) => r.id === id) || null;
    W.SlopHub.touch = async () => null;
    W.SlopHub.sendTo = async (appId, blob, name, opts = {}) => { sent.push({ appId, name, id: opts.id }); return opts.id; };
    return W;
  }
  /** Shows the Drive source with a list (switching to it if needed) and waits for the grid. */
  async function useDrive(list = LIST) {
    current = list;
    const b = D.getElementById('srcDrive');
    if (b.getAttribute('aria-pressed') !== 'true') b.click();
    await G.driveView.refresh();
    return tiles();
  }
  const tiles = () => [...D.querySelectorAll('#dtiles .dtile')];
  const names = () => tiles().map((t) => t.querySelector('.dname').textContent).sort();
  const inOrder = () => tiles().map((t) => t.querySelector('.dname').textContent);
  const chip = (id) => D.querySelector(`#dchips [data-chip="${id}"]`);
  const counts = () => Object.fromEntries([...D.querySelectorAll('#dchips [data-chip]')].map((b) => [b.dataset.chip, Number(b.querySelector('.chip-n').textContent)]));
  function typeSearch(text) { const s = D.getElementById('dSearch'); s.value = text; s.dispatchEvent(new Event('input')); }
  function sortBy(v) { const s = D.getElementById('dSort'); s.value = v; s.dispatchEvent(new Event('change')); }

  /** Writes one thumbnail record into the thumbnail database the way Slop Drive does. */
  function seedThumb(dbName, id, modified, blob) {
    return new Promise((res, rej) => {
      const r = indexedDB.open(dbName, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('thumbs', { keyPath: 'id' });
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const d = r.result, t = d.transaction('thumbs', 'readwrite');
        t.objectStore('thumbs').put({ id, modified, ver: 3, blob, info: {} });
        t.oncomplete = () => { d.close(); res(); };
        t.onerror = () => rej(t.error);
      };
    });
  }

  describe('the source switch', () => {
    it('Library is the source at first, and the Drive grid is hidden', async () => {
      await boot();
      expect(D.getElementById('grid').hidden).toBe(false);
      expect(D.getElementById('dgrid').hidden).toBe(true);
      expect(D.getElementById('srcLibrary').getAttribute('aria-pressed')).toBe('true');
    });
    it('Drive lists its four files as tiles', async () => {
      await useDrive(LIST);
      expect(tiles().length).toBe(4);
      expect(names()).toEqual(['app.js', 'clip.mp4', 'holiday.png', 'invoice.pdf']);
    });
    it('switching back to Library hides the Drive grid again', async () => {
      D.getElementById('srcLibrary').click();
      expect(D.getElementById('dgrid').hidden).toBe(true);
      expect(D.getElementById('grid').hidden).toBe(false);
    });
  });

  describe('kind chips', () => {
    it('each chip shows how many files it holds', async () => {
      await useDrive(LIST);
      expect(counts()).toEqual({ media: 2, photos: 1, videos: 1, audio: 0, documents: 1, code: 1, '3d': 0, archives: 0, other: 0 });
    });
    it('the Code filter shows only the .js file', async () => {
      await useDrive(LIST);
      chip('code').click();
      expect(names()).toEqual(['app.js']);
      chip('code').click();
      expect(tiles().length).toBe(4);
    });
    it('Media shows the image and the video', async () => {
      await useDrive(LIST);
      chip('media').click();
      expect(names()).toEqual(['clip.mp4', 'holiday.png']);
      chip('media').click();
    });
    it('chips combine: two kinds on at once show both', async () => {
      await useDrive(LIST);
      chip('photos').click();
      chip('documents').click();
      expect(names()).toEqual(['holiday.png', 'invoice.pdf']);
      D.getElementById('dClear').click();
      expect(tiles().length).toBe(4);
      expect(chip('photos').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('search and sort', () => {
    it('search narrows the list by name, and clearing it restores it', async () => {
      await useDrive(LIST);
      typeSearch('PDF');
      expect(names()).toEqual(['invoice.pdf']);
      typeSearch('');
      expect(tiles().length).toBe(4);
    });
    it('sort by name is A to Z; by date added is newest first', async () => {
      await useDrive(LIST);
      sortBy('name');
      expect(inOrder()).toEqual(['app.js', 'clip.mp4', 'holiday.png', 'invoice.pdf']);
      sortBy('added');
      expect(inOrder()).toEqual(['app.js', 'invoice.pdf', 'clip.mp4', 'holiday.png']);
    });
  });

  describe('the kind helper (shared/kinds/kinds.js)', () => {
    it('maps .glb and .s3d to 3D', async () => {
      await boot();
      expect(W.SlopKinds.kindOf('model.glb', '')).toBe('model3d');
      expect(W.SlopKinds.kindOf('scene.s3d', 'application/octet-stream')).toBe('model3d');
      expect(W.SlopKinds.chipMatch('model3d', '3d')).toBe(true);
      expect(W.SlopKinds.label('model3d')).toBe('3D');
    });
    it('maps the other kinds from the extension, then the MIME type', async () => {
      expect(W.SlopKinds.kindOf('a.pdf', '')).toBe('document');
      expect(W.SlopKinds.kindOf('x', 'video/webm')).toBe('video');
      expect(W.SlopKinds.kindOf('notes.md', 'text/markdown')).toBe('code');
      expect(W.SlopKinds.kindOf('a.zip', '')).toBe('archive');
      expect(W.SlopKinds.kindOf('weird.bin', 'application/octet-stream')).toBe('other');
      expect(W.SlopKinds.kindOf('plan.sdoc', 'application/x-slop-doc')).toBe('document');
    });
  });

  describe('thumbnails and opening', () => {
    it('a cached Drive thumbnail shows on its tile; a file without one shows its kind card', async () => {
      await boot();
      const thumbDb = 'drive-src-thumbs-' + rand();
      await seedThumb(thumbDb, 'img1', NOW - 3000, new Blob(['png'], { type: 'image/png' }));
      W.SLOP_THUMB_DB = thumbDb;
      await useDrive(LIST);
      await waitFor(() => D.querySelector('.dtile[data-id="img1"] img'), { timeout: 15000 });
      expect(D.querySelector('.dtile[data-id="img1"] img').getAttribute('src').startsWith('blob:')).toBe(true);
      expect(D.querySelector('.dtile[data-id="doc1"] .dcard')).toBeTruthy();
      expect(D.querySelector('.dtile[data-id="doc1"] img')).toBe(null);
    });
    it('an image opens in the Gallery viewer on SlopPreview, and steps through the viewable files', async () => {
      await boot();
      await useDrive(LIST);
      D.querySelector('.dtile[data-id="img1"]').click();
      await waitFor(() => !D.querySelector('.dviewer').hidden && D.querySelector('.dviewer .spv'), { timeout: 15000 });
      expect(D.querySelector('.dviewer .v-count').textContent).toMatch(/^2 \/ 2 · holiday\.png$/);
      D.querySelector('.dviewer [data-act="next"]').click();
      await waitFor(() => D.querySelector('.dviewer video'), { timeout: 15000 });
      expect(D.querySelector('.dviewer .v-count').textContent).toMatch(/^1 \/ 2 · clip\.mp4$/);
      D.querySelector('.dviewer [data-act="close"]').click();
      expect(D.querySelector('.dviewer').hidden).toBe(true);
    });
    it('audio plays in the audio strip under the grid', async () => {
      await boot();
      await useDrive(AUDIO);
      D.querySelector('.dtile').click();
      await waitFor(() => !D.getElementById('astrip').hidden, { timeout: 15000 });
      expect(D.getElementById('astripName').textContent).toBe('song.mp3');
      expect(D.getElementById('astripAudio').getAttribute('src').startsWith('blob:')).toBe(true);
      D.getElementById('astripClose').click();
      expect(D.getElementById('astrip').hidden).toBe(true);
    });
    it('a PDF opens in its app through the open-with rule (SlopHub)', async () => {
      await boot();
      await useDrive(LIST);
      D.querySelector('.dtile[data-id="doc1"]').click();
      expect(sent).toEqual([{ appId: 'pdf', name: 'invoice.pdf', id: 'doc1' }]);
    });
    it('a .js file opens in the code editor, which takes text/javascript, not Slop AI (text/*)', async () => {
      await boot();
      await useDrive(LIST);
      D.querySelector('.dtile[data-id="js1"]').click();
      expect(sent).toEqual([{ appId: 'code', name: 'app.js', id: 'js1' }]);
    });
    it('a .glb opens in Slop 3D', async () => {
      await boot();
      await useDrive(MODEL);
      D.querySelector('.dtile').click();
      expect(sent).toEqual([{ appId: '3d', name: 'room.glb', id: '3d1' }]);
    });
  });

  describe('layout', () => {
    it('the Drive view fits 390 px wide: no sideways scroll, and the bar and chips stay inside', async () => {
      await boot();
      await useDrive(LIST);
      const fr = document.getElementById('app');
      fr.style.width = '390px';
      await sleep(250);
      try {
        const root = D.documentElement;
        expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
        expect(D.getElementById('dbar').getBoundingClientRect().right).toBeLessThanOrEqual(391);
        for (const c of D.querySelectorAll('#dchips .chip')) expect(c.getBoundingClientRect().right).toBeLessThanOrEqual(391);
      } finally {
        fr.style.width = '1280px';
      }
    });
  });
})();
