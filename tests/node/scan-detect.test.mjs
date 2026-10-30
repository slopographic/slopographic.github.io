// Slop Scan, the picture work on photos drawn in memory: finding the page (tilted, with a shadow, cut by the frame, or
// not there), the flat warp, the paper light, Sauvola and Bradley thresholds, the styles and the quarter turns.
// Run: node --test tests/node/scan-detect.test.mjs
// Covers: scan/js/core/detect.js, scan/js/core/warp.js, scan/js/core/filters.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, D, W, F, photo, cornerError, rnd } from './scan-env.mjs';

const TILTED = [{ x: 62, y: 40 }, { x: 300, y: 58 }, { x: 318, y: 372 }, { x: 40, y: 350 }];

test('finds a tilted page with text and a shadow on a grainy desk, each corner within 4 px', () => {
  const img = photo(360, 420, TILTED);
  const r = D.find(img);
  assert.ok(r.found, 'found');
  assert.ok(cornerError(r.quad, TILTED) <= 4, `corners off by ${cornerError(r.quad, TILTED).toFixed(1)} px: ${JSON.stringify(r.quad)}`);
});
test('finds a page seen in strong perspective (a phone held low)', () => {
  const q = [{ x: 120, y: 60 }, { x: 260, y: 62 }, { x: 345, y: 300 }, { x: 25, y: 296 }];
  const r = D.find(photo(370, 330, q, { seed: 11 }));
  assert.ok(r.found);
  assert.ok(cornerError(r.quad, q) <= 5, `off by ${cornerError(r.quad, q).toFixed(1)} px`);
});
test('a blank page (no text) on a light desk: the edges alone find it', () => {
  const q = [{ x: 50, y: 30 }, { x: 250, y: 40 }, { x: 240, y: 300 }, { x: 45, y: 290 }];
  const r = D.find(photo(300, 330, q, { text: false, desk: 150, paper: 240, shadow: 0, seed: 5 }));
  assert.ok(r.found);
  assert.ok(cornerError(r.quad, q) <= 4);
});
test('a page cut off by the bottom of the photo: the side along the frame counts', () => {
  const q = [{ x: 60, y: 50 }, { x: 260, y: 45 }, { x: 266, y: 299 }, { x: 54, y: 299 }];
  const r = D.find(photo(320, 300, q, { seed: 9 }));
  assert.ok(r.found);
  assert.ok(cornerError(r.quad, q) <= 5, `off by ${cornerError(r.quad, q).toFixed(1)} px`);
});
test('no page (only desk): not found, and the whole photo less a margin is offered', () => {
  const w = 200, h = 150, d = new Uint8ClampedArray(w * h * 4), r0 = rnd(4);
  for (let i = 0; i < d.length; i += 4) { const v = 90 + r0() * 30; d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255; }
  const r = D.find({ data: d, width: w, height: h });
  assert.equal(r.found, false);
  assert.deepEqual(r.quad, G.inset(w, h));
});
test('otsu splits two groups; sobel is zero on a flat picture', () => {
  const v = new Float32Array(200);
  for (let i = 0; i < 200; i++) v[i] = i < 100 ? 40 + (i % 5) : 200 + (i % 5);
  const t = D.otsu(v, 255);
  assert.ok(t >= 44 && t < 200, `threshold ${t}`);
  assert.ok(D.sobel(new Float32Array(100).fill(9), 10, 10).every((x) => x === 0));
});

test('the warp makes the page flat: a drawn grid comes back square', () => {
  // a 4 × 4 checkerboard drawn in perspective, warped back to 200 × 200: each cell's centre has its own colour again
  const q = [{ x: 40, y: 30 }, { x: 230, y: 50 }, { x: 250, y: 260 }, { x: 20, y: 240 }];
  const H = G.homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], q), Hi = G.invert(H);
  const w = 280, h = 290, d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = G.apply(Hi, x + 0.5, y + 0.5), p = (y * w + x) * 4;
    const on = u.x >= 0 && u.x <= 1 && u.y >= 0 && u.y <= 1 && (Math.floor(u.x * 4) + Math.floor(u.y * 4)) % 2 === 0;
    d[p] = d[p + 1] = d[p + 2] = on ? 0 : 255; d[p + 3] = 255;
  }
  const out = W.warp({ data: d, width: w, height: h }, q, 200, 200);
  assert.equal(out.width, 200);
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    const v = out.data[((cy * 50 + 25) * 200 + cx * 50 + 25) * 4];
    assert.equal(v < 128, (cx + cy) % 2 === 0, `cell ${cx},${cy} is ${v}`);
  }
});
test('the warp reads white outside the photo and refuses corners that make no page', () => {
  const src = { data: new Uint8ClampedArray(4 * 4 * 4).fill(0), width: 4, height: 4 };
  const out = W.warp(src, [{ x: -4, y: -4 }, { x: 8, y: -4 }, { x: 8, y: 8 }, { x: -4, y: 8 }], 12, 12);
  assert.equal(out.data[0], 255);
  assert.throws(() => W.warp(src, [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }], 4, 4));
});

/** The page of a drawn photo, flat, 240 × 320, through the real warp. */
const flatPage = (o) => W.warp(photo(360, 420, TILTED, o), TILTED, 240, 320);
const lum = (img, x, y) => { const p = (y * img.width + x) * 4; return 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2]; };

test('the paper light follows the shadow, and flatten makes the paper white across it', () => {
  const page = flatPage({ shadow: 0.5 });
  const bg = F.paper(page);
  assert.ok(bg[1][30 * 240 + 10] < bg[1][30 * 240 + 230] - 40, 'darker paper on the shaded left');
  const flat = F.flatten(page);
  assert.ok(Math.abs(lum(flat, 8, 20) - lum(flat, 232, 20)) < 14, `left ${lum(flat, 8, 20)} right ${lum(flat, 232, 20)}`);
  assert.ok(lum(flat, 232, 20) > 235);
});
test('Sauvola and Bradley on integral images: ink in the text, none in the margins, also in the shadow', () => {
  const page = F.flatten(flatPage({ shadow: 0.5 })), g = F.luma(page), w = 240, h = 320;
  for (const ink of [F.sauvola(g, w, h, { k: 0.25 }), F.bradley(g, w, h)]) {
    let margin = 0;
    for (let y = 4; y < 25; y++) for (let x = 4; x < w - 4; x++) margin += ink[y * w + x];   // (the outermost pixels blend in the desk)
    assert.ok(margin < w * 21 * 0.01, `ink in the top margin: ${margin}`);
    // the first line of text: 12%..15% down, 10%..90% across
    const ly = Math.round(h * 0.135);
    let line = 0;
    for (let x = 30; x < 210; x++) line += ink[ly * w + x];
    assert.ok(line > 100, `ink on the first line: ${line}`);
  }
});
test('the integral image sums any window', () => {
  const v = Float32Array.from({ length: 12 }, (_, i) => i + 1), T = F.integral(v, 4, 3, true);
  assert.equal(T.s[3 * 5 + 4], 78);
  assert.equal(T.q[3 * 5 + 4], 650);
});
test('each style: B&W is only black and white, grey has no colour, enhanced colour has white paper', () => {
  const page = flatPage({});
  const bw = F.style(page, 'bw');
  assert.ok([...bw.data].every((v, i) => i % 4 === 3 || v === 0 || v === 255));
  const gray = F.style(page, 'gray');
  for (let i = 0; i < gray.data.length; i += 400) assert.ok(gray.data[i] === gray.data[i + 1] && gray.data[i + 1] === gray.data[i + 2]);
  assert.ok(lum(F.style(page, 'color'), 230, 10) > 240);
  const orig = F.style(page, 'original');
  assert.deepEqual(orig.data, page.data);
  assert.notEqual(orig.data, page.data, 'a copy, never the page itself');
  assert.equal(F.STYLES.length, 5);
  for (const s of F.STYLES) assert.equal(F.style(page, s).width, 240);
});
test('brightness and contrast: lighter and darker, a no-op at zero; B&W turns lighter with less ink', () => {
  const one = () => ({ data: new Uint8ClampedArray([100, 100, 100, 255, 200, 200, 200, 255]), width: 2, height: 1 });
  assert.ok(F.adjust(one(), 30, 0).data[0] > 100);
  const c = F.adjust(one(), 0, 50).data;
  assert.ok(c[0] < 100 && c[4] > 200);
  assert.deepEqual([...F.adjust(one(), 0, 0).data], [...one().data]);
  const page = flatPage({}), ink = (img) => [...img.data].filter((v, i) => i % 4 === 0 && v === 0).length;
  assert.ok(ink(F.style(page, 'bw', { brightness: 60 })) < ink(F.style(page, 'bw')));
});
test('rotate by quarter turns; four turns give the picture back', () => {
  const img = { data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255, 5, 0, 0, 255, 6, 0, 0, 255]), width: 3, height: 2 };
  const r = F.rotate(img, 1);
  assert.deepEqual([r.width, r.height], [2, 3]);
  assert.deepEqual([...r.data].filter((_, i) => i % 4 === 0), [4, 1, 5, 2, 6, 3]);
  let back = img;
  for (let i = 0; i < 4; i++) back = F.rotate(back, 1);
  assert.deepEqual([...back.data], [...img.data]);
  assert.deepEqual([...F.rotate(img, 2).data].filter((_, i) => i % 4 === 0), [6, 5, 4, 3, 2, 1]);
});
test('orient: lines of text across need no turn, lines running down need a quarter turn', () => {
  const page = F.flatten(flatPage({})), g = F.luma(page), ink = F.sauvola(g, 240, 320, { k: 0.25 });
  assert.equal(F.orient(ink, 240, 320), 0);
  const turned = F.rotate(page, 1), g2 = F.luma(turned);
  assert.equal(F.orient(F.sauvola(g2, 320, 240, { k: 0.25 }), 320, 240), 1);
  assert.equal(F.orient(new Uint8Array(100), 10, 10), 0, 'no ink: no turn');
});
