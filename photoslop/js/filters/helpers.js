/* PhotoSlop: adjustments, filters and layer styles. Helpers and the FILTERS list.
 * Each entry: { id, name, menu, params, fn(canvas, params, env) → canvas | Promise<canvas> }.
 * fn must not mutate its input. env = { fg, bg } colours. */
'use strict';

function withPixels(src, fn) {
  const c = copyCanvas(src), g = cxr(c), img = g.getImageData(0, 0, c.width, c.height);
  fn(img.data, c.width, c.height, img);
  g.putImageData(img, 0, 0);
  return c;
}
function lutMap(src, lr, lg = lr, lb = lr) {
  return withPixels(src, (d) => { for (let i = 0; i < d.length; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; } });
}
const makeLut = (f) => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = f(i); return l; };
/** Bilinear sample of RGBA data into out[0..3]. */
function sample(d, w, hh, x, y, out) {
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, hh - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
  for (let k = 0; k < 4; k++) out[k] = (d[i00 + k] * (1 - fx) + d[i10 + k] * fx) * (1 - fy) + (d[i01 + k] * (1 - fx) + d[i11 + k] * fx) * fy;
}
/** Remap: for each output pixel, fn(x, y) returns source coords in p (p[0], p[1]); return false to keep. */
function displace(src, fn) {
  const w = src.width, hh = src.height;
  const sd = cxr(src).getImageData(0, 0, w, hh).data;
  const c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data, p = [0, 0], o = [0, 0, 0, 0];
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (fn(x, y, p) === false) { d[i] = sd[i]; d[i + 1] = sd[i + 1]; d[i + 2] = sd[i + 2]; d[i + 3] = sd[i + 3]; continue; }
    sample(sd, w, hh, p[0], p[1], o);
    d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; d[i + 3] = o[3];
  }
  g.putImageData(img, 0, 0);
  return c;
}
function convolve(src, k, opts = {}) {
  const w = src.width, hh = src.height, sd = cxr(src).getImageData(0, 0, w, hh).data;
  const c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data;
  const bias = opts.bias || 0, kd = 3;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let r = 0, gg = 0, b = 0;
    for (let ky = 0; ky < kd; ky++) for (let kx = 0; kx < kd; kx++) {
      const sx = clamp(x + kx - 1, 0, w - 1), sy = clamp(y + ky - 1, 0, hh - 1), j = (sy * w + sx) * 4, kv = k[ky * kd + kx];
      r += sd[j] * kv; gg += sd[j + 1] * kv; b += sd[j + 2] * kv;
    }
    const i = (y * w + x) * 4;
    d[i] = r + bias; d[i + 1] = gg + bias; d[i + 2] = b + bias; d[i + 3] = sd[i + 3];
  }
  g.putImageData(img, 0, 0);
  return c;
}
function gaussian(src, r) {
  const c = copyCanvas(src), g = cxr(c), img = g.getImageData(0, 0, c.width, c.height);
  blurImageData(img, r); g.putImageData(img, 0, 0); return c;
}
/** Seeded PRNG so previews and the final apply match. */
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
function valueNoise2D(seed) {
  const R = rng(seed), P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = R();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
    const v = (a, b) => P[((b & 255) << 8) | (a & 255)];
    return lerp(lerp(v(x0, y0), v(x0 + 1, y0), fx), lerp(v(x0, y0 + 1), v(x0 + 1, y0 + 1), fx), fy);
  };
}
/** Monotone cubic through points [[x,y]...] (0..255) → LUT. */
function curveLut(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0]);
  const n = pts.length;
  if (n < 2) return makeLut((i) => i);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), dx = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(xs[i + 1] - xs[i] || 1e-6); m.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1e-6)); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  return makeLut((x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const hh = dx[i], s = (x - xs[i]) / hh, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * hh * t[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * hh * t[i + 1];
  });
}
function histogram(src) {
  const d = cxr(src).getImageData(0, 0, src.width, src.height).data, H = { l: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  const step = Math.max(1, Math.floor(d.length / 4 / 400000)) * 4;
  for (let i = 0; i < d.length; i += step) { if (!d[i + 3]) continue; H.r[d[i]]++; H.g[d[i + 1]]++; H.b[d[i + 2]]++; H.l[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++; }
  return H;
}
function percentile(hist, p) {
  let tot = 0; for (const v of hist) tot += v;
  let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= tot * p) return i; }
  return 255;
}
/** Sliding min/max over alpha+rgb (erode/dilate). */
function rankFilter(src, r, isMax, alphaOnly) {
  const w = src.width, hh = src.height, sd = cxr(src).getImageData(0, 0, w, hh).data;
  const tmp = new Uint8ClampedArray(sd.length), out = new Uint8ClampedArray(sd.length);
  const pick = isMax ? Math.max : Math.min, chans = alphaOnly ? [3] : [0, 1, 2, 3];
  for (const k of chans) {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255;
      for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) v = pick(v, sd[(y * w + xx) * 4 + k]); }
      tmp[(y * w + x) * 4 + k] = v;
    }
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let v = isMax ? 0 : 255;
      for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < hh) v = pick(v, tmp[(yy * w + x) * 4 + k]); }
      out[(y * w + x) * 4 + k] = v;
    }
  }
  if (alphaOnly) for (let i = 0; i < out.length; i += 4) { out[i] = sd[i]; out[i + 1] = sd[i + 1]; out[i + 2] = sd[i + 2]; }
  const c = mkCanvas(w, hh); cxr(c).putImageData(new ImageData(out, w, hh), 0, 0);
  return c;
}
/** Solid-colour silhouette of src's alpha. */
function silhouette(src, color, opacity = 1) {
  const c = mkCanvas(src.width, src.height), g = cx(c);
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.globalAlpha = opacity; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function under(src, below) { const c = copyCanvas(below), g = cx(c); g.drawImage(src, 0, 0); return c; }
function blobToCanvas(blob) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob), i = new Image(); i.onload = () => { const c = mkCanvas(i.width, i.height); cx(c).drawImage(i, 0, 0); URL.revokeObjectURL(u); res(c); }; i.onerror = rej; i.src = u; });
}
async function jpegCrunch(src, q, times = 1) {
  let c = src;
  for (let k = 0; k < times; k++) {
    const flat = mkCanvas(c.width, c.height), g = cx(flat); g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0);
    const blob = await canvasToBlob(flat, 'image/jpeg', q);
    c = await blobToCanvas(blob);
  }
  const out = copyCanvas(c), g = cx(out); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  return out;
}

/* Words (photoslop/i18n/<code>/filters*.js): a filter's name is photoslop.filter.<id>, a parameter's label
 * photoslop.filter.p_<lk>, a choice photoslop.filter.o_<value>, a blend mode photoslop.core.blend_<id> (core/model.js BLENDS). They are getters,
 * so the menus and dialogs show the language of the moment. */
const fKey = (s) => String(s).replace(/-/g, '_');
const lazy = (o, prop, get) => Object.defineProperty(o, prop, { get, enumerable: true, configurable: true });
/** A parameter whose label is photoslop.filter.p_<lk>. */
function P(o, extra) { const p = Object.assign(o, extra); if (p.lk) lazy(p, 'label', () => tr('photoslop.filter.p_' + p.lk)); return p; }
const R = (k, lk, min, max, v, extra = {}) => P({ k, lk, type: 'range', min, max, v, step: 1 }, extra);
/** Select choices [[value, label]], the label photoslop.filter.o_<value>. */
const FO = (...vals) => vals.map((v) => lazy([v], 1, () => tr('photoslop.filter.o_' + fKey(v))));
function blendName(id) { return tr('photoslop.core.blend_' + fKey(id)); }
/** The blend modes as select choices, labels in the current language. */
const blendOptions = () => BLENDS.map((b) => lazy([b[0]], 1, () => blendName(b[0])));
const FILTERS = []; // filled by the filters/*.js files that follow
FILTERS.push = function (...fs) {
  for (const f of fs) {
    if (f.id && !('name' in f)) lazy(f, 'name', () => tr('photoslop.filter.' + fKey(f.id)));
    for (const p of f.params || []) if (p.lk && !Object.getOwnPropertyDescriptor(p, 'label')) P(p);
  }
  return Array.prototype.push.apply(this, fs);
};
