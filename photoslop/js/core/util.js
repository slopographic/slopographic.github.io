/* PhotoSlop: shared helpers (DOM, colour, canvas, pixel maths). Classic script: top-level names are shared by the other files. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const uid = (() => { let n = 1; return () => n++; })();
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const isTyping = (t) => !!(t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
/** Words (shared/i18n/APPS-HOWTO.md): tr(key, vars) is the text of photoslop/i18n/<code>/*.js in the chosen language;
 * onLang(fn) re-runs fn after a language change, once the new tables are in (for UI built once). */
function tr(key, vars) { const I = window.SlopI18n; return I ? I.t(key, vars) : key; }
function onLang(fn) { window.addEventListener('slopi18n', () => fn()); }
/** [value, label] rows whose label (index 1) is read from the key prefix + value (- as _), in the language of the moment. */
function trPairs(rows, prefix) { for (const r of rows) Object.defineProperty(r, 1, { get: () => tr(prefix + String(r[0]).replace(/-/g, '_')), enumerable: true, configurable: true }); return rows; }

/* ---------- canvas ---------- */
function mkCanvas(w, hh) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(hh)); return c; }
function cx(c) { return c.getContext('2d', { willReadFrequently: false }); }
function cxr(c) { return c.getContext('2d', { willReadFrequently: true }); }
function copyCanvas(src) { const c = mkCanvas(src.width, src.height); cx(c).drawImage(src, 0, 0); return c; }
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(tr('photoslop.core.cant_read_image'))); i.src = src; }); }
function canvasToBlob(c, type = 'image/png', q) { return new Promise((res) => c.toBlob(res, type, q)); }
/** Saves a file: SlopUI.download (shared/slopui.js), the one copy. */
function download(blob, name) { window.SlopUI.download(blob, name); }
/** Bounding box of non-transparent pixels, or null if empty. */
function alphaBounds(c) {
  const { width: w, height: hh } = c;
  const d = cxr(c).getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) {
    let row = y * w * 4 + 3;
    for (let x = 0; x < w; x++, row += 4) if (d[row]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/* ---------- colour ---------- */
const hexToRgb = (hx) => { hx = hx.replace('#', ''); if (hx.length === 3) hx = hx.split('').map((c) => c + c).join(''); const n = parseInt(hx.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
  return [hh, mx ? d / mx : 0, mx];
}
function hsvToRgb(hh, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0]; else if (hh < 120) [r, g, b] = [x, c, 0]; else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c]; else if (hh < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let hh;
  if (mx === r) hh = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
  return [hh * 60, s, l];
}
function hslToRgb(hh, s, l) {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, hk = hh / 360;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(hk + 1 / 3) * 255, f(hk) * 255, f(hk - 1 / 3) * 255];
}
const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* ---------- blur (separable box blur ×3 ≈ gaussian), works on any channel layout ---------- */
function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const wu = wl + 2, mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4), m = Math.round(mIdeal);
  return Array.from({ length: n }, (_, i) => (i < m ? wl : wu));
}
/** Blur premultiplied RGBA ImageData in place (premultiplying avoids dark fringes). */
function blurImageData(img, radius) {
  if (radius < 0.5) return img;
  const { width: w, height: hh, data } = img, n = w * hh;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0, j = 0; i < n; i++, j += 4) { const a = data[j + 3] / 255; ch[0][i] = data[j] * a; ch[1][i] = data[j + 1] * a; ch[2][i] = data[j + 2] * a; ch[3][i] = data[j + 3]; }
  const tmp = new Float32Array(n);
  for (const b of boxesForGauss(radius / 2 + 0.01)) { const r = (b - 1) / 2; for (const c of ch) { boxH(c, tmp, w, hh, r); boxV(tmp, c, w, hh, r); } }
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = ch[3][i];
    data[j + 3] = a;
    if (a > 0.01) { const k = 255 / a; data[j] = ch[0][i] * k; data[j + 1] = ch[1][i] * k; data[j + 2] = ch[2][i] * k; }
  }
  return img;
}
function boxH(src, dst, w, hh, r) {
  const iarr = 1 / (r + r + 1);
  for (let y = 0; y < hh; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r - 1; x < r; x++) acc += src[o + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { acc += src[o + Math.min(x + r, w - 1)] - src[o + Math.max(x - r - 1, 0)]; dst[o + x] = acc * iarr; }
  }
}
function boxV(src, dst, w, hh, r) {
  const iarr = 1 / (r + r + 1);
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r - 1; y < r; y++) acc += src[clamp(y, 0, hh - 1) * w + x];
    for (let y = 0; y < hh; y++) { acc += src[Math.min(y + r, hh - 1) * w + x] - src[Math.max(y - r - 1, 0) * w + x]; dst[y * w + x] = acc * iarr; }
  }
}
/** Blur only the alpha channel of a canvas (used for feathering selections). */
function blurAlphaCanvas(c, radius) {
  const g = cxr(c), img = g.getImageData(0, 0, c.width, c.height), { data } = img, n = c.width * c.height;
  const a = new Float32Array(n), tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = data[i * 4 + 3];
  for (const b of boxesForGauss(radius / 2 + 0.01)) { const r = (b - 1) / 2; boxH(a, tmp, c.width, c.height, r); boxV(tmp, a, c.width, c.height, r); }
  for (let i = 0; i < n; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 0; data[i * 4 + 3] = a[i]; }
  g.putImageData(img, 0, 0);
}

/* ---------- binary helpers (PSD) ---------- */
class Writer {
  constructor(size = 1 << 20) { this.buf = new Uint8Array(size); this.view = new DataView(this.buf.buffer); this.p = 0; }
  ensure(n) { if (this.p + n <= this.buf.length) return; let s = this.buf.length * 2; while (s < this.p + n) s *= 2; const nb = new Uint8Array(s); nb.set(this.buf); this.buf = nb; this.view = new DataView(nb.buffer); }
  u8(v) { this.ensure(1); this.buf[this.p++] = v; }
  u16(v) { this.ensure(2); this.view.setUint16(this.p, v); this.p += 2; }
  i16(v) { this.ensure(2); this.view.setInt16(this.p, v); this.p += 2; }
  u32(v) { this.ensure(4); this.view.setUint32(this.p, v); this.p += 4; }
  i32(v) { this.ensure(4); this.view.setInt32(this.p, v); this.p += 4; }
  ascii(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 255); }
  bytes(b) { this.ensure(b.length); this.buf.set(b, this.p); this.p += b.length; }
  zeros(n) { this.ensure(n); this.buf.fill(0, this.p, this.p + n); this.p += n; }
  /** Reserve a u32 length and return a function that writes it once the block is done. */
  lenMark() { const at = this.p; this.u32(0); return (pad = 1) => { while ((this.p - at - 4) % pad) this.u8(0); this.view.setUint32(at, this.p - at - 4); }; }
  out() { return this.buf.slice(0, this.p); }
}
class Reader {
  constructor(buf) { this.buf = buf instanceof Uint8Array ? buf : new Uint8Array(buf); this.view = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength); this.p = 0; }
  u8() { return this.buf[this.p++]; }
  i8() { const v = this.view.getInt8(this.p); this.p += 1; return v; }
  u16() { const v = this.view.getUint16(this.p); this.p += 2; return v; }
  i16() { const v = this.view.getInt16(this.p); this.p += 2; return v; }
  u32() { const v = this.view.getUint32(this.p); this.p += 4; return v; }
  i32() { const v = this.view.getInt32(this.p); this.p += 4; return v; }
  ascii(n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.buf[this.p++]); return s; }
  bytes(n) { const b = this.buf.subarray(this.p, this.p + n); this.p += n; return b; }
  skip(n) { this.p += n; }
}
/** PackBits-encode one row. */
function packBits(src, start, len, out) {
  let i = 0;
  while (i < len) {
    let run = 1;
    while (i + run < len && run < 128 && src[start + i + run] === src[start + i]) run++;
    if (run > 1) { out.push(257 - run, src[start + i]); i += run; continue; }
    let lit = 1;
    while (i + lit < len && lit < 128 && !(i + lit + 1 < len && src[start + i + lit] === src[start + i + lit + 1])) lit++;
    out.push(lit - 1);
    for (let k = 0; k < lit; k++) out.push(src[start + i + k]);
    i += lit;
  }
}
function unpackBits(src, p, end, dst, dp, dlen) {
  const dEnd = dp + dlen;
  while (p < end && dp < dEnd) {
    let n = src[p++];
    if (n > 127) n -= 256;
    if (n >= 0) { for (let k = 0; k <= n && dp < dEnd; k++) dst[dp++] = src[p++]; }
    else if (n !== -128) { const v = src[p++]; for (let k = 0; k < 1 - n && dp < dEnd; k++) dst[dp++] = v; }
  }
  return p;
}

/* ---------- small UI helpers ---------- */
function toast(msg, ms = 2400, action = null) { if (window.SlopUI) SlopUI.toast(msg, ms, action); }
const store = {
  get(k, d) { try { const v = localStorage.getItem('slopshop.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('slopshop.' + k, JSON.stringify(v)); } catch (e) { /* private mode / quota */ } },
};
