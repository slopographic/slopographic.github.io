/* Slop Gallery tests: EXIF, thumbnails and the zip writer (no storage needed). */
(function () {
  'use strict';
  const { describe, it, expect } = SlopTest;
  const G = SlopGallery, T = GT;

  describe('EXIF from a JPEG with an APP1 block', () => {
    it('parses DateTimeOriginal as local time', async () => {
      const bytes = await T.jpegBytes(64, 48, { exif: { date: '2019:07:04 12:34:56', make: 'Canon', model: 'EOS R5', orientation: 1 } });
      const r = G.exif.read(bytes.buffer);
      expect(r.takenAt).toBe(new Date(2019, 6, 4, 12, 34, 56).getTime());
    });
    it('reads the orientation tag', async () => {
      const bytes = await T.jpegBytes(64, 48, { exif: { date: '2020:01:02 03:04:05', orientation: 6 } });
      expect(G.exif.read(bytes.buffer).orientation).toBe(6);
    });
    it('reads camera make and model', async () => {
      const bytes = await T.jpegBytes(64, 48, { exif: { make: 'Canon', model: 'EOS R5', orientation: 1 } });
      const r = G.exif.read(bytes.buffer);
      expect(r.make).toBe('Canon');
      expect(r.model).toBe('EOS R5');
    });
    it('a JPEG without EXIF gives no date (the caller falls back to the file date)', async () => {
      const bytes = await T.jpegBytes(64, 48);
      expect(G.exif.read(bytes.buffer).takenAt).toBeFalsy();
    });
    it('a damaged segment gives partial data and never throws', () => {
      const junk = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3]).buffer;
      expect(G.exif.read(junk)).toEqual({});
    });
    it('rejects impossible dates', () => {
      expect(G.exif.parseExifDate('2019:13:40 99:00:00')).toBe(null);
      expect(G.exif.parseExifDate('2019:07:04 12:34:56')).toBe(new Date(2019, 6, 4, 12, 34, 56).getTime());
    });
  });

  describe('thumbnails', () => {
    it('long edge is at most 320 px', async () => {
      const file = await T.jpegFile('wide.jpg', 1600, 900);
      const out = await G.thumb.make(file, 1);
      const bmp = await createImageBitmap(out.blob);
      expect(Math.max(bmp.width, bmp.height)).toBeLessThanOrEqual(320);
      expect(bmp.width).toBe(320);
      expect(out.blob.type).toBe('image/jpeg');
      expect(out.w).toBe(1600);
      expect(out.h).toBe(900);
    });
    it('applies EXIF orientation 6 by hand: upright size is swapped and the thumbnail is portrait', async () => {
      const file = await T.jpegFile('rot.jpg', 1600, 900);
      const out = await G.thumb.make(file, 6);
      expect(out.w).toBe(900);
      expect(out.h).toBe(1600);
      const bmp = await createImageBitmap(out.blob);
      expect(bmp.width).toBe(180);
      expect(bmp.height).toBe(320);
    });
    it('small images are not enlarged', async () => {
      const out = await G.thumb.make(await T.jpegFile('tiny.jpg', 40, 30), 1);
      const bmp = await createImageBitmap(out.blob);
      expect(bmp.width).toBe(40);
      expect(bmp.height).toBe(30);
    });
  });

  describe('zip writer and reader', () => {
    it('writes a valid local header with the right CRC and an end record', async () => {
      const a = new Uint8Array(await (await T.jpegFile('a.jpg', 32, 32)).arrayBuffer());
      const b = new TextEncoder().encode('hello zip');
      const blob = await G.zip.write([{ name: 'a.jpg', data: a }, { name: 'dir/b.txt', data: b }]);
      const u8 = new Uint8Array(await blob.arrayBuffer());
      const dv = new DataView(u8.buffer);
      expect(dv.getUint32(0, true)).toBe(0x04034b50);
      expect(dv.getUint16(8, true)).toBe(0);
      expect(dv.getUint32(14, true)).toBe(T.crc32Ref(a));
      expect(dv.getUint32(18, true)).toBe(a.length);
      expect(dv.getUint32(u8.length - 22, true)).toBe(0x06054b50);
      expect(dv.getUint16(u8.length - 22 + 10, true)).toBe(2);
    });
    it('round trips names and bytes, and the reader checks every CRC', async () => {
      const b = new TextEncoder().encode('round trip');
      const blob = await G.zip.write([{ name: 'x/one.txt', data: b }]);
      const back = G.zip.read(await blob.arrayBuffer());
      expect(back.length).toBe(1);
      expect(back[0].name).toBe('x/one.txt');
      expect(Array.from(back[0].bytes)).toEqual(Array.from(b));
    });
    it('a flipped byte is caught by the CRC', async () => {
      const blob = await G.zip.write([{ name: 'f.txt', data: new TextEncoder().encode('abcdef') }]);
      const u8 = new Uint8Array(await blob.arrayBuffer());
      u8[30 + 5 + 2] ^= 0xff; // a data byte: local header 30 + name 5
      expect(() => G.zip.read(u8.buffer)).toThrow(/CRC mismatch/);
    });
    it('the CRC-32 matches the reference implementation', () => {
      const s = new TextEncoder().encode('The quick brown fox');
      expect(G.zip.crc32(s)).toBe(T.crc32Ref(s));
      expect(G.zip.crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    });
  });
})();
