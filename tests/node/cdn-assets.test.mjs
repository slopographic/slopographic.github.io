// Slopographic's file host (shared/cdn/assets.js): every cdn file the apps use goes to jsDelivr at the pinned release tag,
// unless it is on the list of files over jsDelivr's limit; GitHub at the same tag is the fallback; no app file writes a cdn
// URL of its own. The download helper (fetchVerified): places tried in order, progress from 0 again on a fallback, a
// cancel never falls through. The network check itself is tools/check-cdn.mjs (CI).
// Covers: shared/cdn/assets.js, tools/cdn-assets.mjs, tools/check-cdn.mjs, aitools/download.js, shared/library/manifest.js
// Covers: shared/heic/engine.js, shared/raw/engine.js, shared/3d-io/decoders.js, convert/js/core/ffmpeg-engine.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { allAssets, C, ROOT } from '../../tools/cdn-assets.mjs';

// the file host's repository (here slopographic/cdn; a build's own account): shared/cdn/assets.js REPO
const REPO = C.REPO.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const JSD = new RegExp(`^https://cdn\\.jsdelivr\\.net/gh/${REPO}@(v\\d{4}\\.\\d{1,2}\\.\\d{1,2})/`);
const RAW = new RegExp(`^https://raw\\.githubusercontent\\.com/${REPO}/(v\\d{4}\\.\\d{1,2}\\.\\d{1,2})/`);

test('the release tag is a fixed version (never latest, a branch or a range)', () => {
  assert.match(C.TAG, /^v\d{4}\.\d{1,2}\.\d{1,2}$/);
  assert.equal(C.JSDELIVR_MAX, 20 * 1024 * 1024);
});

test('every asset: jsDelivr at the tag first, then GitHub at the tag; the files over the limit are listed with their sizes', async () => {
  const assets = await allAssets();
  assert.ok(assets.length > 300, `${assets.length} assets found`);
  for (const a of assets) {
    const u = C.urls(a.path);
    if (a.size > C.JSDELIVR_MAX) assert.ok(C.over(a.path), `${a.path} (${a.size} bytes, ${a.from}) is over jsDelivr's limit: list it in OVER`);
    if (C.over(a.path)) {
      assert.equal(C.OVER[a.path], a.size, `${a.path}: OVER says ${C.OVER[a.path]}, ${a.from} says ${a.size}`);
      assert.equal(u.length, C.HF ? 2 : 1);
      assert.equal(u.at(-1).match(RAW)?.[1], C.TAG, a.path);
    } else {
      assert.equal(u.length, 2, a.path);
      assert.equal(u[0].match(JSD)?.[1], C.TAG, `${a.path} on jsDelivr at the tag`);
      assert.equal(u[1].match(RAW)?.[1], C.TAG, `${a.path} on GitHub at the tag`);
    }
    for (const x of u) assert.equal(C.pathOf(x), a.path);
  }
  // the list holds no stale entries: every file on it is one the apps use
  for (const p of Object.keys(C.OVER)) assert.ok(assets.some((a) => a.path === p), `OVER lists ${p}, which no app uses`);
});

test('a Hugging Face copy (HF) is not set yet; the hosts are jsDelivr and GitHub', () => {
  assert.equal(C.HF, null);
  assert.deepEqual(C.HOSTS, ['cdn.jsdelivr.net', 'raw.githubusercontent.com']);
});

test('paths and URLs: plain paths only; other URLs are left alone; the repository check is exact', () => {
  for (const bad of ['', '/x', '../x', 'a/../b', 'a//b', 'a?b', 'https://x/y']) assert.throws(() => C.urls(bad), bad);
  assert.deepEqual(C.candidates('https://huggingface.co/x/resolve/main/a.onnx'), ['https://huggingface.co/x/resolve/main/a.onnx']);
  const other = 'https://raw.githubusercontent.com/slopographic/cdn/test/packs/a.ttf';   // a made-up ref (tests): one place
  assert.deepEqual(C.candidates(other), [other]);
  assert.equal(C.isCdnUrl(other), true);
  assert.equal(C.isCdnUrl('https://cdn.jsdelivr.net/gh/slopographic/cdn@v1/x'), true);
  assert.equal(C.isCdnUrl('https://cdn.jsdelivr.net/gh/slopographic/cdnx@v1/x'), false);
  assert.equal(C.isCdnUrl('https://cdn.jsdelivr.net/npm/x@1/y'), false);
  assert.equal(C.isCdnUrl('https://raw.githubusercontent.com/other/cdn/v1/x'), false);
  assert.equal(C.isCdnUrl('http://raw.githubusercontent.com/slopographic/cdn/v1/x'), false);
});

/** The app's files (not tests, vendored code, generated precache lists or the module itself). */
function appFiles(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name), rel = path.relative(ROOT, p);
    if (/^(\.|node_modules$)/.test(name) || /^(tests|vendor)$/.test(rel)) continue;
    if (statSync(p).isDirectory()) appFiles(p, out);
    else if (/\.(m?js|html|json|css)$/.test(name) && !/^sw-precache/.test(name) && rel !== 'shared/cdn/assets.js') out.push(rel);
  }
  return out;
}

test('no app file writes a cdn URL of its own: they all come from shared/cdn/assets.js', () => {
  const hits = [];
  for (const f of appFiles()) {
    const t = readFileSync(path.join(ROOT, f), 'utf8');
    if (new RegExp(`raw\\.githubusercontent\\.com/${REPO}|jsdelivr\\.net/gh/${REPO}|${REPO}/[0-9a-f]{40}`).test(t)) hits.push(f);
  }
  assert.deepEqual(hits, []);
});

const bytes = (n, seed) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255);
/** A fake network: url -> bytes, or an Error to throw, or a status number. Records the requests. */
function net(map) {
  const asked = [];
  const fetch = async (url) => {
    asked.push(url);
    const v = map[url];
    if (v instanceof Error) throw v;
    if (typeof v === 'number' || v === undefined) return { ok: false, status: v || 404 };
    return { ok: true, status: 200, url, arrayBuffer: async () => v.slice().buffer };
  };
  return { fetch, asked };
}

test('fetchVerified: jsDelivr down, GitHub used, progress counted again from 0', async () => {
  const path = 'models/ocr/ppocr-det-v4/ch_PP-OCRv4_det_infer.onnx', [jsd, raw] = C.urls(path), b = bytes(64, 1);
  const want = { label: 'det', size: 64, sha256: await C.sha256Hex(b) };
  const n = net({ [jsd]: new Error('Failed to fetch'), [raw]: b }), seen = [], fell = [];
  const out = await C.fetchVerified(C.url(path), want, { fetch: n.fetch, onBytes: (x) => seen.push(x), onFallback: (e, next) => fell.push([e.message, next]) });
  assert.deepEqual([...out], [...b]);
  assert.deepEqual(n.asked, [jsd, raw]);
  assert.deepEqual(seen, [0, 64]);
  assert.deepEqual(fell, [['det: Failed to fetch', raw]]);
  // wrong bytes from jsDelivr also fall through; a 404 from both rejects with the last reason
  const w = net({ [jsd]: bytes(64, 2), [raw]: b });
  assert.equal((await C.fetchVerified(jsd, want, { fetch: w.fetch })).byteLength, 64);
  assert.deepEqual(w.asked, [jsd, raw]);
  await assert.rejects(C.fetchVerified(jsd, want, { fetch: net({ [jsd]: 503 }).fetch }), /det: HTTP 404/);
  await assert.rejects(C.fetchVerified(jsd, { ...want, size: 65 }, { fetch: net({ [jsd]: b, [raw]: b }).fetch }), /64 bytes, expected 65/);
});

test('fetchVerified: a cancel stops at once, and a redirect off the allowed hosts is refused', async () => {
  const [jsd, raw] = C.urls('packs/barlow/v1/Barlow-Regular.ttf'), b = bytes(8, 3);
  const ctrl = new AbortController(); ctrl.abort();
  const n = net({ [jsd]: b, [raw]: b });
  await assert.rejects(C.fetchVerified(jsd, {}, { fetch: n.fetch, signal: ctrl.signal }), (e) => e.name === 'AbortError');
  assert.deepEqual(n.asked, []);
  const away = { fetch: async (u) => ({ ok: true, status: 200, url: 'https://evil.example/x', arrayBuffer: async () => b.slice().buffer }) };
  await assert.rejects(C.fetchVerified(jsd, { label: 'x' }, { ...away, allowedUrl: C.isCdnUrl }), /x: redirected to a host that is not allowed/);
  const ok = await C.fetchVerified(jsd, {}, { fetch: n.fetch, verify: async (got) => ({ ok: got.byteLength === 8 }) });
  assert.equal(ok.byteLength, 8);
});
