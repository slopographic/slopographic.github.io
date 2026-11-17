// QR SLOP: the module grid and the SVG (qr/js/matrix.js, render.js), run as the browser runs them, in one vm context with the
// vendored bwip-js encoder. Covers square and rounded modules, the quiet zone, the gradient, transparency, the logo plate and
// its width cap, and that colours and logo data are checked before they reach the markup.
// Run: node tests/run.mjs qr-render
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { console, atob: globalThis.atob, btoa: globalThis.btoa, TextEncoder: globalThis.TextEncoder };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(ROOT, 'vendor', 'bwip-js', 'bwip-js-min.js'), 'utf8'), ctx, { filename: 'bwip-js-min.js' });
for (const f of ['qr/js/matrix.js', 'qr/js/render.js']) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { QRMatrix: M, QRRender: R } = ctx;
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

test('encodes text into a module grid, a version 1 code is 21 modules wide, and too long text is refused', () => {
  const m = M.encode('hello', 'M');
  assert.equal(m.cols, 21);
  assert.equal(m.rows, 21);
  assert.equal(m.pixs.length, 21 * 21);
  assert.throws(() => M.encode('x'.repeat(3000), 'H'), /does not fit/);
  assert.equal(M.inFinder(0, 0, 21), true);
  assert.equal(M.inFinder(20, 0, 21), true);
  assert.equal(M.inFinder(10, 10, 21), false);
});

test('the square shape is one path of runs, with crisp edges, a white background and the quiet zone', () => {
  const m = M.encode('square', 'M');
  const svg = R.qrSvg(m, { size: 300, quiet: 4, fg: '#000000', bg: '#ffffff', shape: 'square' });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="300" height="300" viewBox="0 0 29 29"/);
  assert.match(svg, /<rect width="29" height="29" fill="#ffffff"\/>/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /<path fill="#000000" d="M\d+ \d+h\d+v1h-\d+z/);
});

test('transparent leaves out the background, and the quiet zone can be changed', () => {
  const m = M.encode('quiet', 'M');
  const svg = R.qrSvg(m, { transparent: true, quiet: 1 });
  assert.equal(svg.includes('<rect'), false);
  assert.match(svg, /viewBox="0 0 23 23"/);
  assert.match(R.qrSvg(m, { quiet: 99 }), /viewBox="0 0 37 37"/, 'quiet zone is capped at 8 modules each side');
});

test('rounded modules draw rounded corners, and finder patterns stay square', () => {
  const m = M.encode('round', 'M');
  const svg = R.qrSvg(m, { shape: 'round' });
  assert.match(svg, /a 0\.3 0\.3 0 0 1 /);
  assert.equal(svg.includes('crispEdges'), false);
  const d = M.roundPath(m, 4, 0.3);
  assert.match(d, /^M\d/);
  assert.ok(d.includes('h1v1h-1z'), 'finder modules are square');
});

test('a gradient fills the modules from the module colour to the second colour', () => {
  const m = M.encode('grad', 'M');
  const svg = R.qrSvg(m, { gradient: true, fg: '#ff0000', fg2: '#0000ff' });
  assert.match(svg, /<linearGradient id="qr-grad"[^>]*><stop offset="0" stop-color="#ff0000"\/><stop offset="1" stop-color="#0000ff"\/>/);
  assert.match(svg, /<path fill="url\(#qr-grad\)"/);
  assert.equal(R.qrSvg(m, { gradient: false, fg: '#ff0000' }).includes('linearGradient'), false);
});

test('a logo sits in the centre on a white plate, and is at most 22 percent of the code width', () => {
  const m = M.encode('logo', 'H');
  const svg = R.qrSvg(m, { logo: { href: LOGO, frac: 0.5 } });
  const plate = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" rx="[\d.]+" fill="#ffffff"\/>/);
  assert.ok(plate, 'a white plate');
  const img = svg.match(/<image x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" href="(data:[^"]+)"/);
  assert.ok(img, 'the logo image');
  assert.equal(img[3], LOGO);
  const side = m.cols + 8;
  assert.ok(Math.abs(+img[2] - 0.22 * m.cols) < 1e-9, 'the picture is 22% of the code width, not 50%');
  assert.ok(+img[2] / side <= 0.22, 'and within 22% of the whole SVG');
  assert.ok(Math.abs(+img[1] + +img[2] / 2 - side / 2) < 1e-9, 'centred');
  assert.ok(+plate[1] < +img[1], 'the plate is behind the picture');
});

test('the logo width has a floor of 10 percent', () => {
  const m = M.encode('logo', 'H');
  const img = R.qrSvg(m, { logo: { href: LOGO, frac: 0.01 } }).match(/<image x="[\d.]+" y="[\d.]+" width="([\d.]+)"/);
  assert.ok(Math.abs(+img[1] - 0.1 * m.cols) < 1e-9);
});

test('colours and logo data are checked, so nothing unsafe reaches the markup', () => {
  const m = M.encode('check', 'M');
  assert.match(R.qrSvg(m, { fg: '#FF0000' }), /fill="#ff0000"/);
  const bad = R.qrSvg(m, { fg: '"><script>alert(1)</script>', bg: 'red' });
  assert.equal(bad.includes('script'), false);
  assert.match(bad, /fill="#000000"/);
  assert.match(bad, /fill="#ffffff"/);
  assert.equal(R.qrSvg(m, { logo: { href: 'javascript:alert(1)' } }).includes('<image'), false);
  assert.equal(R.qrSvg(m, { logo: { href: 'data:text/html;base64,PGk+' } }).includes('<image'), false);
});

test('the size is whole pixels from 64 to 4096, and the frac and quiet helpers clamp', () => {
  assert.equal(R.clampSize(10), 64);
  assert.equal(R.clampSize(99999), 4096);
  assert.equal(R.clampSize(300.4), 300);
  assert.equal(R.clampQuiet(''), 4);
  assert.equal(R.clampQuiet(-3), 0);
  assert.equal(R.clampLogo(0.9), 0.22);
  assert.equal(R.clampLogo(0.05), 0.1);
  assert.equal(R.clampLogo(NaN), 0.2);
});
