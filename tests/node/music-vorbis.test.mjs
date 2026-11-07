// Slop Music's FLAC and Ogg tags (music/js/core/vorbis.js, through music/js/core/id3.js readTags): Vorbis comments,
// FLAC picture blocks, Ogg Vorbis and Opus comment packets over several pages. Files are hand-built byte buffers
// (tests/music/fixtures.js); the real scripts run in a vm. Run: node --test tests/node/music-vorbis.test.mjs
// Covers: music/js/core/vorbis.js, music/js/core/id3.js, tests/music/fixtures.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = { Blob, TextDecoder, TextEncoder, atob, btoa, Uint8Array, console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['music/js/core/id3.js', 'music/js/core/vorbis.js', 'tests/music/fixtures.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const F = ctx.MusicFixtures, V = ctx.SlopMusic.vorbis, read = (b) => ctx.SlopMusic.id3.readTags(b);
const ALL = [['TITLE', 'Ünïcode Song'], ['ARTIST', 'Café Band'], ['ALBUM', 'Lossless'], ['TRACKNUMBER', '3/12'], ['DATE', '2019-05-01'], ['GENRE', 'Jazz']];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4];
const b64 = (arr) => Buffer.from(arr).toString('base64');

test('a Vorbis comment block gives title, artist, album, track, year and genre; keys are any case; first wins', () => {
  const t = V.comments(new Uint8Array(F.vorbisComments([...ALL, ['title', 'Second'], ['genre', ''], ['NOEQUALS', 'x']])));
  assert.deepEqual([t.title, t.artist, t.album, t.track, t.year, t.genre], ['Ünïcode Song', 'Café Band', 'Lossless', 3, '2019', 'Jazz']);
  const lower = V.comments(new Uint8Array(F.vorbisComments([['artist', 'low'], ['tracknumber', '07']])));
  assert.deepEqual([lower.artist, lower.track, lower.title], ['low', 7, '']);
});

test('a truncated comment block keeps what it read and does not throw', () => {
  const b = F.vorbisComments(ALL);
  const t = V.comments(new Uint8Array(b.slice(0, b.length - 6)));
  assert.equal(t.title, 'Ünïcode Song');
  assert.equal(t.genre, '');
});

test('FLAC: reads the comment block and prefers the front cover (type 3) picture', async () => {
  const t = await read(F.flac({ comments: ALL, pictures: [[0, 'image/jpeg', JPEG], [3, 'image/png', F.PNG]] }));
  assert.deepEqual([t.title, t.artist, t.album, t.track, t.year, t.genre, t.format, t.version], ['Ünïcode Song', 'Café Band', 'Lossless', 3, '2019', 'Jazz', 'flac', 0]);
  assert.equal(t.cover.type, 'image/png');
  assert.equal(t.cover.size, F.PNG.length);
});

test('FLAC: a picture with a bad MIME is typed from its bytes; a file with no comments has empty fields', async () => {
  const t = await read(F.flac({ pictures: [[3, 'image/x-weird', JPEG]] }));
  assert.equal(t.cover.type, 'image/jpeg');
  assert.equal(t.title, '');
  const none = await read(new Blob([new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 0, 0, 0, 0, 0])]));
  assert.equal(none.title, '');
  assert.equal(none.cover, null);
});

test('FLAC after an ID3 tag: ID3 fields win, Vorbis comments fill the rest', async () => {
  const id3 = F.tag(3, [F.frame(3, 'TIT2', F.text(0, 'From ID3'))]);
  const t = await read(F.flac({ id3, comments: ALL }));
  assert.deepEqual([t.title, t.artist, t.version, t.format], ['From ID3', 'Café Band', 3, 'flac']);
});

test('Ogg Vorbis: the comment packet is read across several pages, with a METADATA_BLOCK_PICTURE cover', async () => {
  const pic = b64(F.pictureBlock(3, 'image/png', F.PNG));
  const long = 'x'.repeat(3000);   // makes the packet span four pages of at most 1020 bytes
  const t = await read(F.ogg({ comments: [['COMMENT', long], ...ALL, ['METADATA_BLOCK_PICTURE', pic]] }));
  assert.deepEqual([t.title, t.artist, t.album, t.track, t.year, t.genre, t.format], ['Ünïcode Song', 'Café Band', 'Lossless', 3, '2019', 'Jazz', 'ogg']);
  assert.equal(t.cover.type, 'image/png');
  assert.equal(t.cover.size, F.PNG.length);
});

test('Ogg Opus: OpusTags comments are read', async () => {
  const t = await read(F.ogg({ codec: 'opus', comments: [['TITLE', 'Opus track'], ['ARTIST', 'Voice']] }));
  assert.deepEqual([t.title, t.artist, t.format], ['Opus track', 'Voice', 'ogg']);
});

test('neither FLAC nor Ogg: vorbis.read gives null and readTags leaves the fields empty', async () => {
  assert.equal(await V.read(new Blob([new Uint8Array(64)])), null);
  const t = await read(F.mp3({ title: 'Only ID3' }));
  assert.deepEqual([t.title, t.format, t.track], ['Only ID3', '', 0]);
});
