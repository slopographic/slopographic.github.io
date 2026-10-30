/* Slop Gallery tests: import, albums, tags, Sort mode, backup round trip, grouping, and the virtual list. */
(function () {
  'use strict';
  const { describe, it, expect, beforeEach } = SlopTest;
  const G = SlopGallery, T = GT;
  const item = (file, extra = {}) => Object.assign({ file, name: file.name }, extra);
  const ms = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

  describe('import', () => {
    beforeEach(async () => { await T.freshLibrary(); });

    it('reads the date from EXIF, plus size and camera', async () => {
      const f = await T.jpegFile('exif.jpg', 800, 600, { exif: { date: '2018:05:06 07:08:09', make: 'Nikon', model: 'Z6', orientation: 1 } });
      await G.importer.run([item(f)]);
      const m = G.library.list()[0];
      expect(m.dateFrom).toBe('exif');
      expect(m.takenAt).toBe(new Date(2018, 4, 6, 7, 8, 9).getTime());
      expect(m.make).toBe('Nikon');
      expect(m.model).toBe('Z6');
      expect(m.w).toBe(800);
      expect(m.h).toBe(600);
      expect(m.size).toBe(f.size);
    });
    it('falls back to the file date when there is no EXIF', async () => {
      const f = await T.jpegFile('plain.jpg', 64, 48, { modified: ms(2021, 3, 14) });
      await G.importer.run([item(f)]);
      const m = G.library.list()[0];
      expect(m.dateFrom).toBe('file');
      expect(m.takenAt).toBe(ms(2021, 3, 14));
    });
    it('stores a thumbnail with its long edge at most 320 px', async () => {
      const f = await T.jpegFile('big.jpg', 2000, 1000);
      await G.importer.run([item(f)]);
      const row = await G.db.get('thumbs', G.library.list()[0].id);
      const bmp = await createImageBitmap(row.blob);
      expect(Math.max(bmp.width, bmp.height)).toBeLessThanOrEqual(320);
    });
    it('importing the same bytes twice does not duplicate them', async () => {
      const bytes = await T.jpegBytes(120, 90, { exif: { date: '2019:01:01 10:00:00', orientation: 1 } });
      const a = new File([bytes], 'a.jpg', { type: 'image/jpeg' });
      const r1 = await G.importer.run([item(a)]);
      const r2 = await G.importer.run([item(new File([bytes], 'again.jpg', { type: 'image/jpeg' }))]);
      expect(r1.added).toBe(1);
      expect(r2.added).toBe(0);
      expect(r2.skipped).toBe(1);
      expect(G.library.list().length).toBe(1);
      expect((await G.db.all('originals')).length).toBe(1);
    });
    it('keeps duplicates when asked, and the groups show them', async () => {
      const bytes = await T.jpegBytes(64, 64, { colour: '#aa3366' });
      const other = await T.jpegBytes(64, 64, { colour: '#22aa66' });
      await G.importer.run([item(new File([bytes], 'x1.jpg')), item(new File([other], 'other.jpg'))]);
      const r = await G.importer.run([item(new File([bytes], 'x2.jpg'))], { keepDuplicates: true });
      expect(r.added).toBe(1);
      const groups = G.query.dupeGroups(G.library.list());
      expect(groups.length).toBe(1);
      expect(groups[0].items.length).toBe(2);
      expect(groups[0].items[0].name).toBe('x1.jpg');
    });
    it('a photo that cannot be decoded is reported, not stored', async () => {
      const r = await G.importer.run([item(new File([new Uint8Array([1, 2, 3, 4])], 'broken.jpg', { type: 'image/jpeg' }))]);
      expect(r.added).toBe(0);
      expect(r.failed).toEqual(['broken.jpg']);
      expect(G.library.list().length).toBe(0);
    });
  });

  describe('albums', () => {
    beforeEach(async () => { await T.freshLibrary(); });

    it('adding a photo to an album does not copy its bytes', async () => {
      await G.importer.run([item(await T.jpegFile('one.jpg', 80, 60))]);
      const id = G.library.list()[0].id;
      const before = await G.db.get('originals', id);
      const countBefore = (await G.db.all('originals')).length;
      const a = await G.library.createAlbum('Trip');
      expect(await G.library.addToAlbum(a.id, [id])).toBe(1);
      const after = await G.db.get('originals', id);
      expect((await G.db.all('originals')).length).toBe(countBefore);
      expect(after.blob.size).toBe(before.blob.size);
      expect(G.library.album(a.id).photoIds).toEqual([id]);
      expect(Object.prototype.hasOwnProperty.call(G.library.album(a.id), 'blob')).toBe(false);
    });
    it('renaming and deleting an album keeps its photos', async () => {
      await G.importer.run([item(await T.jpegFile('k.jpg', 80, 60))]);
      const id = G.library.list()[0].id;
      const a = await G.library.createAlbum('Old');
      await G.library.addToAlbum(a.id, [id]);
      await G.library.renameAlbum(a.id, 'New');
      expect(G.library.album(a.id).name).toBe('New');
      await G.library.deleteAlbum(a.id);
      expect(G.library.album(a.id)).toBe(null);
      expect(G.library.photo(id) !== null).toBe(true);
    });
    it('removing a photo also unlinks it from albums', async () => {
      await G.importer.run([item(await T.jpegFile('r.jpg', 80, 60))]);
      const id = G.library.list()[0].id;
      const a = await G.library.createAlbum('Gone');
      await G.library.addToAlbum(a.id, [id]);
      await G.library.remove([id]);
      expect(G.library.album(a.id).photoIds).toEqual([]);
    });
  });

  describe('tags, favourites and filters', () => {
    beforeEach(async () => { await T.freshLibrary(); });

    it('liked, disliked and free-text tags are stored on the photo', async () => {
      await G.importer.run([item(await T.jpegFile('t.jpg', 80, 60))]);
      const id = G.library.list()[0].id;
      await G.library.setLiked([id], 'liked');
      await G.library.addTag([id], 'Beach');
      const m = G.library.photo(id);
      expect(m.liked).toBe('liked');
      expect(m.tags).toEqual(['beach']);
      const row = await G.db.get('photos', id);
      expect(row.liked).toBe('liked');
    });
    it('the tag filter shows liked, disliked or untagged photos only', async () => {
      await G.importer.run([item(await T.jpegFile('a.jpg', 80, 60, { colour: '#111111' })), item(await T.jpegFile('b.jpg', 80, 60, { colour: '#222222' })), item(await T.jpegFile('c.jpg', 80, 60, { colour: '#333333' }))]);
      const [a, b] = G.library.list().sort((x, y) => (x.name < y.name ? -1 : 1));
      await G.library.setLiked([a.id], 'liked');
      await G.library.setLiked([b.id], 'disliked');
      const all = G.library.list();
      const names = (st) => G.query.filter(all, Object.assign({ text: '', year: '', month: '', camera: '', fav: false, album: '', tag: '' }, st)).map((m) => m.name).sort();
      expect(names({ tag: 'liked' })).toEqual(['a.jpg']);
      expect(names({ tag: 'disliked' })).toEqual(['b.jpg']);
      expect(names({ tag: 'untagged' })).toEqual(['c.jpg']);
    });
    it('a tag on a Slop Drive photo is also written to its Drive record', async () => {
      const rec = await SlopHub.put(await T.jpegFile('drive.jpg', 80, 60), { name: 'drive.jpg', from: 'test' });
      const file = await SlopHub.get(rec);
      await G.importer.run([{ file: file.blob, name: file.name, driveId: rec }]);
      const id = G.library.list()[0].id;
      await G.library.setLiked([id], 'liked');
      await G.library.addTag([id], 'holiday');
      const back = await SlopHub.get(rec);
      expect(back.meta.gallery.liked).toBe('liked');
      expect(back.meta.gallery.tags).toEqual(['holiday']);
    });
  });

  describe('Sort mode key mapping and queue', () => {
    it('maps the four arrows to tag and move', () => {
      expect(G.sort.decide('ArrowUp', 0, 3)).toEqual({ tag: 'liked', pos: 1, moved: true, atEnd: false });
      expect(G.sort.decide('ArrowDown', 0, 3)).toEqual({ tag: 'disliked', pos: 1, moved: true, atEnd: false });
      expect(G.sort.decide('ArrowLeft', 2, 3)).toEqual({ tag: null, pos: 1, moved: true, atEnd: false });
      expect(G.sort.decide('ArrowRight', 0, 3)).toEqual({ tag: null, pos: 1, moved: true, atEnd: false });
      expect(G.sort.decide('Enter', 0, 3)).toBe(null);
      expect(G.sort.decide('ArrowUp', 0, 0)).toBe(null);
    });
    it('the queue position after each key', () => {
      let pos = 0;
      const seq = [];
      for (const k of ['ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'ArrowRight']) {
        const d = G.sort.decide(k, pos, 3);
        pos = d.pos;
        seq.push([k, pos, d.tag]);
      }
      expect(seq).toEqual([
        ['ArrowUp', 1, 'liked'], ['ArrowDown', 2, 'disliked'], ['ArrowDown', 2, 'disliked'], ['ArrowDown', 2, 'disliked'],
        ['ArrowLeft', 1, null], ['ArrowLeft', 0, null], ['ArrowLeft', 0, null], ['ArrowRight', 1, null],
      ]);
    });
    it('the deck tags the current photo, moves, and the tag survives a backup and restore round trip', async () => {
      await T.freshLibrary();
      await G.importer.run([item(await T.jpegFile('p1.jpg', 80, 60, { colour: '#101010' })), item(await T.jpegFile('p2.jpg', 80, 60, { colour: '#202020' })), item(await T.jpegFile('p3.jpg', 80, 60, { colour: '#303030' }))]);
      const ids = G.library.list().sort((x, y) => (x.name < y.name ? -1 : 1)).map((m) => m.id);
      G.sortmode.open(ids);
      expect(G.sortmode.state().pos).toBe(0);
      await G.sortmode.press('ArrowUp');
      expect(G.sortmode.state().pos).toBe(1);
      expect(G.library.photo(ids[0]).liked).toBe('liked');
      await G.sortmode.press('ArrowDown');
      expect(G.sortmode.state().pos).toBe(2);
      expect(G.library.photo(ids[1]).liked).toBe('disliked');
      await G.sortmode.press('ArrowRight');
      expect(G.sortmode.state().pos).toBe(2);
      expect(G.library.photo(ids[2]).liked).toBe(null);
      expect(G.sortmode.state().end).toBe(true);   // past the last photo: the end card
      await G.sortmode.press('ArrowLeft');         // back to the last photo
      expect([G.sortmode.state().end, G.sortmode.state().pos]).toEqual([false, 2]);
      await G.sortmode.press('ArrowLeft');
      expect(G.sortmode.state().pos).toBe(1);
      G.sortmode.close();

      const file = new File([await (await G.backup.exportLibrary()).arrayBuffer()], 'lib.zip');
      await T.freshLibrary();
      expect(G.library.list().length).toBe(0);
      await G.backup.restore(file);
      const back = G.library.list().sort((x, y) => (x.name < y.name ? -1 : 1));
      expect(back.map((m) => m.liked)).toEqual(['liked', 'disliked', null]);
    });
  });

  describe('backup round trip', () => {
    beforeEach(async () => { await T.freshLibrary(); });

    it('restores photos, bytes, tags, favourites and albums, and a second restore merges', async () => {
      await G.importer.run([item(await T.jpegFile('one.jpg', 90, 60, { exif: { date: '2017:02:03 04:05:06', make: 'Sony', model: 'A7', orientation: 1 } })), item(await T.jpegFile('two.jpg', 70, 70))]);
      const [p1, p2] = G.library.list();
      await G.library.setLiked([p1.id], 'liked');
      await G.library.addTag([p1.id], 'family');
      await G.library.toggleFav([p2.id]);
      const a = await G.library.createAlbum('Keep');
      await G.library.addToAlbum(a.id, [p1.id, p2.id]);
      const blob = await G.backup.exportLibrary();
      const file = new File([await blob.arrayBuffer()], 'backup.zip');

      await T.freshLibrary();
      const r = await G.backup.restore(file);
      expect(r.added).toBe(2);
      const got = G.library.list().sort((x, y) => (x.name < y.name ? -1 : 1));
      expect(got.map((m) => m.name)).toEqual(['one.jpg', 'two.jpg']);
      expect(got[0].liked).toBe('liked');
      expect(got[0].tags).toEqual(['family']);
      expect(got[0].make).toBe('Sony');
      expect(got[1].fav).toBe(true);
      expect(G.library.albums()[0].photoIds.length).toBe(2);
      const bytes = await G.db.get('originals', got[0].id);
      expect(bytes.blob.size).toBe(got[0].size);

      const again = await G.backup.restore(file);
      expect(again.added).toBe(0);
      expect(again.merged).toBe(2);
      expect(G.library.list().length).toBe(2);
    });
    it('a damaged backup is refused and the library stays as it was', async () => {
      await G.importer.run([item(await T.jpegFile('keep.jpg', 60, 60))]);
      const bytes = new Uint8Array(await (await G.backup.exportLibrary()).arrayBuffer());
      let at = -1; // the first JPEG start marker is the original's bytes (the manifest is text, the zip headers have no FF D8 FF)
      for (let i = 0; i + 2 < bytes.length && at < 0; i++) if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) at = i;
      bytes[at + 100] ^= 0x55; // inside the original's data: the CRC check refuses it
      const before = G.library.list().map((m) => m.id);
      let failed = false;
      try { await G.backup.restore(new File([bytes], 'bad.zip')); } catch (e) { failed = true; }
      expect(failed).toBe(true);
      expect(G.library.list().map((m) => m.id)).toEqual(before);
    });
    it('a file that is not a backup is refused before anything is written', async () => {
      const notZip = new File([new TextEncoder().encode('not a backup at all, just text padding padding')], 'x.zip');
      let msg = '';
      try { await G.backup.restore(notZip); } catch (e) { msg = e.message; }
      expect(msg.length > 0).toBe(true);
      expect(G.library.list().length).toBe(0);
    });
  });

  describe('grouping and facets', () => {
    beforeEach(async () => { await T.freshLibrary(); });
    it('groups by month, newest first, with a readable label', async () => {
      const f = (n, t) => ({ id: n, name: n + '.jpg', takenAt: t, sha: T.shaOf(n.charCodeAt(0)) });
      const list = [f('a', ms(2019, 7, 4)), f('b', ms(2019, 7, 20)), f('c', ms(2018, 1, 2))];
      const groups = G.query.groupMonths(G.query.sortNewest(list));
      expect(groups.map((g) => g.key)).toEqual(['2019-07', '2018-01']);
      expect(groups[0].label).toBe('July 2019');
      expect(groups[0].items.length).toBe(2);
    });
  });

  describe('virtual list', () => {
    it('renders only the visible rows for 5,000 items', () => {
      const scroller = document.getElementById('scroller'), content = document.getElementById('content');
      const rows = [];
      for (let i = 0; i < 5000; i++) rows.push({ key: 'r' + i, top: i * 44, h: 44 });
      const v = G.createVlist({ scroller, content, render: (row) => { const d = document.createElement('div'); d.textContent = row.key; return d; } });
      v.setRows(rows);
      const first = v.rendered();
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(60);
      expect(content.children.length).toBe(first);
      v.scrollToIndex(4500);
      expect(content.querySelector('[data-row-key="r4500"]') !== null).toBe(true);
      expect(v.rendered()).toBeLessThan(60);
      expect(content.querySelector('[data-row-key="r10"]')).toBe(null);
      v.destroy();
    });
  });
})();
