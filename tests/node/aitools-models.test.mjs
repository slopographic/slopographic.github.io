// Slop AI Tools: the model index. Every model needs a licence on the list, every file a SHA-256 and a byte length,
// and every remote file an https URL on an allowed host. Run with: node tests/run.mjs aitools
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../../aitools/model-registry.js');

test('the index has no problems', () => {
  assert.deepEqual(R.problems(), []);
});

test('every model has a licence from the list, with a link to its upstream project', () => {
  assert.ok(R.MODELS.length >= 4, 'expected the OCR, speech, tags and portrait models');
  for (const m of R.MODELS) {
    assert.ok(Object.prototype.hasOwnProperty.call(R.LICENCES, m.licence), `${m.id} licence ${m.licence}`);
    assert.match(m.upstream, /^https:\/\//, `${m.id} upstream`);
    assert.ok(m.sourceNote && m.source, `${m.id} source`);
  }
});

test('every file has a lowercase SHA-256 of 64 hex digits and a positive size', () => {
  for (const m of R.MODELS) for (const f of m.files) {
    assert.match(f.sha256, /^[0-9a-f]{64}$/, `${m.id} ${f.name}`);
    assert.ok(Number.isInteger(f.size) && f.size > 0, `${m.id} ${f.name} size`);
  }
});

test('remote files come only from https on allowed hosts; bundled files stay in vendor/models', () => {
  for (const m of R.MODELS) for (const f of m.files) {
    if (f.url || f.parts) for (const u of R.urlsOf(f)) assert.ok(R.allowedUrl(u), `${m.id} ${f.name} ${u}`);
    else assert.match(f.path, /^vendor\/models\/[A-Za-z0-9._-]+$/, `${m.id} ${f.name}`);
  }
  assert.equal(R.allowedUrl('http://huggingface.co/x.onnx'), false);
  assert.equal(R.allowedUrl('https://example.com/x.onnx'), false);
  assert.equal(R.allowedUrl('https://transfer.xethub.hf.co/x.onnx'), true);
  assert.equal(R.allowedUrl('https://cdn-lfs-us-1.hf.co/x.onnx'), true);
  assert.equal(R.allowedUrl('https://huggingface.co.evil.com/x.onnx'), false);
  assert.equal(R.allowedUrl('https://evilhf.co/x.onnx'), false);
  // Slopographic's file host: the slopographic/cdn repository only, not the rest of raw.githubusercontent.com
  assert.equal(R.allowedUrl('https://raw.githubusercontent.com/slopographic/cdn/abc/models/whisper/x.onnx'), true);
  assert.equal(R.allowedUrl('https://raw.githubusercontent.com/someone/cdn/abc/x.onnx'), false);
  assert.equal(R.allowedUrl('https://raw.githubusercontent.com.evil.com/slopographic/cdn/x.onnx'), false);
  // and on jsDelivr (shared/cdn/assets.js): that repository only, not every package jsDelivr serves
  assert.equal(R.allowedUrl('https://cdn.jsdelivr.net/gh/slopographic/cdn@v2026.10.24/models/whisper/x.onnx'), true);
  assert.equal(R.allowedUrl('https://cdn.jsdelivr.net/gh/someone/cdn@v1/x.onnx'), false);
  assert.equal(R.allowedUrl('https://cdn.jsdelivr.net/npm/evil@1/x.onnx'), false);
  assert.equal(R.allowedUrl('http://cdn.jsdelivr.net/gh/slopographic/cdn@v1/x.onnx'), false);
});

test('every tool points at models that exist, and the denoise tool needs none', () => {
  const ids = new Set(R.MODELS.map((m) => m.id));
  for (const t of R.TOOLS) for (const id of t.models) assert.ok(ids.has(id), `${t.id} -> ${id}`);
  assert.deepEqual(R.TOOLS.find((t) => t.id === 'denoise').models, []);
  assert.equal(R.TOOLS.length, 5);
});

test('a broken entry is reported', () => {
  const bad = [{ id: 'x', licence: 'Proprietary', upstream: 'http://a', source: 's', sourceNote: 'n', files: [{ name: 'a.onnx', size: 0, sha256: 'ABC', url: 'https://evil.example/a' }] }];
  const p = R.problems(bad).join('\n');
  assert.match(p, /licence/);
  assert.match(p, /upstream/);
  assert.match(p, /sha256/);
  assert.match(p, /size/);
  assert.match(p, /allowed host/);
});
