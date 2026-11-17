// Slop Recorder's WebM writer (recorder/js/core/webm.js): the Duration a live MediaRecorder file lacks, measured from its
// blocks and written into Segment Info, on files built here as a browser writes them (unknown sizes) and as a muxer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../../recorder/js/core/webm.js');

const cat = (...parts) => { const out = []; for (const p of parts) out.push(...p); return out; };
const idBytes = (id) => { const b = []; let v = id; while (v) { b.unshift(v & 255); v = Math.floor(v / 256); } return b; };
const size = (n) => (n < 127 ? [0x80 | n] : n < 16383 ? [0x40 | (n >> 8), n & 255] : [0x10, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const UNKNOWN = [0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
const el = (id, body) => cat(idBytes(id), size(body.length), body);
const uint = (n, len) => { const b = []; for (let i = len - 1; i >= 0; i--) b.push(Math.floor(n / 256 ** i) % 256); return b; };
const block = (track, rel) => el(0xA3, [0x80 | track, (rel >> 8) & 255, rel & 255, 0x80, 1, 2, 3]);
/** A WebM: video blocks every 33 ms on track 1, sound every 20 ms on track 2, in two clusters of 1 s. */
function file({ known = false, seek = false, duration = null } = {}) {
  const info = el(0x1549A966, cat(el(0x2AD7B1, uint(1e6, 3)), el(0x4D80, [...Buffer.from('Chrome')]), duration == null ? [] : el(0x4489, [...new Uint8Array(new Float64Array([duration]).buffer)].reverse())));
  const tracks = el(0x1654AE6B, el(0xAE, el(0xD7, [1])));
  const clusters = [];
  for (let c = 0; c < 2; c++) {
    const blocks = [];
    for (let t = 0; t < 1000; t += 33) blocks.push(block(1, t));
    for (let t = 0; t < 1000; t += 20) blocks.push(block(2, t));
    clusters.push(cat(idBytes(0x1F43B675), UNKNOWN, el(0xE7, uint(c * 1000, 2)), ...blocks));
  }
  // a SeekHead before Info pointing at Tracks (its position counts from the Segment's data)
  let head = [];
  if (seek) {
    const mk = (pos) => el(0x114D9B74, el(0x4DBB, cat(el(0x53AB, idBytes(0x1654AE6B)), el(0x53AC, uint(pos, 4)))));
    head = mk(mk(0).length + info.length);
  }
  const body = cat(head, info, tracks, ...clusters);
  const segment = cat(idBytes(0x18538067), known ? [0x01, ...uint(body.length, 7)] : UNKNOWN, body);
  return new Uint8Array(cat(el(0x1A45DFA3, el(0x4282, [...Buffer.from('webm')])), segment));
}

test('measure: from the first block to the end of the last frame, over clusters of unknown size', () => {
  // the last video block is at 1000 + 990 ms; one frame (33 ms) more
  assert.equal(Math.round(W.measure(file())), 1990 + 33);
  assert.equal(W.measure(new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x80])), 0);
});

test('setDuration: a live file gets a Duration that reads back, the blocks unchanged', () => {
  const f = file();
  assert.equal(W.readDuration(f), null);
  const out = W.setDuration(f, 2023);
  assert.equal(out.length, f.length + 11);
  assert.equal(W.readDuration(out), 2023);
  assert.equal(Math.round(W.measure(out)), 2023, 'the clusters still read after the insert');
});

test('setDuration: a Duration already there is overwritten in place', () => {
  const f = file({ duration: 5 });
  assert.equal(W.readDuration(f), 5);
  const out = W.setDuration(f, 1234.5);
  assert.equal(out.length, f.length);
  assert.equal(W.readDuration(out), 1234.5);
});

test('setDuration: a known Segment size grows and SeekHead positions after Info move', () => {
  const f = file({ known: true, seek: true });
  const out = W.setDuration(f, 2000);
  assert.equal(W.readDuration(out), 2000);
  const find = (b, seq) => { for (let i = 0; i < b.length; i++) if (seq.every((v, k) => b[i + k] === v)) return i; return -1; };
  const segAt = find(f, [0x18, 0x53, 0x80, 0x67]), data = segAt + 12;
  const sz = (b) => { let v = 0; for (let i = 1; i < 8; i++) v = v * 256 + b[segAt + 4 + i]; return v; };
  assert.equal(sz(out), sz(f) + 11, 'the Segment size field (7 bytes after 0x01) is 11 more');
  // the SeekPosition still points at Tracks (0x16 0x54 0xAE 0x6B), counted from the Segment's data
  const at = find(out, [0x53, 0xAC, 0x84]) + 3, pos = out[at] * 2 ** 24 + (out[at + 1] << 16) + (out[at + 2] << 8) + out[at + 3];
  assert.deepEqual([...out.slice(data + pos, data + pos + 4)], [0x16, 0x54, 0xAE, 0x6B]);
});

test('setDuration: refuses a file with no Segment Info; sizes write in their length', () => {
  assert.throws(() => W.setDuration(new Uint8Array([1, 2, 3]), 10), /not a WebM/);
  assert.deepEqual([...W.writeSize(5, 1)], [0x85]);
  assert.deepEqual([...W.writeSize(300, 2)], [0x41, 0x2C]);
  assert.equal(W.writeSize(200, 1), null);
  assert.deepEqual(W.readSize(new Uint8Array(UNKNOWN), 0).unknown, true);
});
