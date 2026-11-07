/* SlopLabel — render/canvas: draws a scene on a 2D canvas (design view, previews, PNG, 1-bit printer
 * bitmaps for ZPL ^GFA and bitmap printing). The context is expected to be scaled to mm. */
'use strict';

const IMG_CACHE = new Map();
let onImageReady = null;
/** HTMLImageElement for an asset data URL (async load; triggers onImageReady when done). */
function assetImage(doc, id) {
  const src = doc.assets && doc.assets[id];
  if (!src) return null;
  let e = IMG_CACHE.get(src);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; if (onImageReady) onImageReady(); };
    img.onerror = () => { e.bad = true; };
    img.src = src;
    IMG_CACHE.set(src, e);
  }
  return e.ok ? e.img : null;
}
async function preloadImages(doc) {
  const ids = Object.keys(doc.assets || {});
  await Promise.all(ids.map((id) => new Promise((res) => {
    assetImage(doc, id);
    const e = IMG_CACHE.get(doc.assets[id]);
    if (!e || e.ok || e.bad) return res();
    const done = () => res();
    e.img.addEventListener('load', done, { once: true }); e.img.addEventListener('error', done, { once: true });
    setTimeout(done, 5000);
  })));
}

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  if (r > 0 && g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}
/** Draw text prim with exact advance width (stretch to the laid-out width so every backend agrees). */
function drawTextPrim(g, p) {
  g.save();
  g.translate(p.x, p.y);
  const k = p.size / 100;
  g.scale(k, k);
  g.font = cssFont(p.font, p.bold, p.italic, 100);
  const nat = g.measureText(p.text).width;
  const want = p.w / k;
  if (nat > 0 && Math.abs(nat - want) > 0.5) g.scale(want / nat, 1);
  g.fillStyle = p.color || '#000';
  g.textBaseline = 'alphabetic';
  g.fillText(p.text, 0, 0);
  g.restore();
}
/** opts: { doc, design (show placeholders/errors), monoImages } */
function drawItems(g, items, opts = {}) {
  for (const it of items) {
    g.save();
    const m = itemMatrix(it);
    g.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    for (const p of it.prims) {
      switch (p.t) {
        case 'bars': g.fillStyle = '#000'; g.beginPath(); for (const r of p.rects) g.rect(r.x, r.y, r.w, r.h); g.fill(); break;
        case 'text': drawTextPrim(g, p); break;
        case 'rect':
          if (p.fill) { g.fillStyle = p.fill; roundRectPath(g, p.x, p.y, p.w, p.h, p.r); g.fill(); }
          if (p.sw > 0) { g.strokeStyle = '#000'; g.lineWidth = p.sw; roundRectPath(g, p.x + p.sw / 2, p.y + p.sw / 2, p.w - p.sw, p.h - p.sw, Math.max(0, p.r - p.sw / 2)); g.stroke(); }
          break;
        case 'ellipse':
          g.beginPath(); g.ellipse(p.x + p.w / 2, p.y + p.h / 2, Math.max(0.01, p.w / 2 - p.sw / 2), Math.max(0.01, p.h / 2 - p.sw / 2), 0, 0, Math.PI * 2);
          if (p.fill) { g.fillStyle = p.fill; g.fill(); }
          if (p.sw > 0) { g.strokeStyle = '#000'; g.lineWidth = p.sw; g.stroke(); }
          break;
        case 'line': g.strokeStyle = '#000'; g.lineWidth = p.sw; g.lineCap = 'butt'; g.beginPath(); g.moveTo(p.x1, p.y1); g.lineTo(p.x2, p.y2); g.stroke(); break;
        case 'invert': g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(p.x, p.y, p.w, p.h); g.globalCompositeOperation = 'source-over'; break;
        case 'image': {
          const img = opts.doc && assetImage(opts.doc, p.asset);
          if (img) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(img, p.x, p.y, p.w, p.h); }
          else if (opts.design) { g.fillStyle = 'rgba(128,128,128,.25)'; g.fillRect(p.x, p.y, p.w, p.h); }
          break;
        }
        case 'error':
          if (opts.design) {
            g.fillStyle = 'rgba(229,72,77,.12)'; g.fillRect(p.x, p.y, p.w, p.h);
            g.strokeStyle = '#e5484d'; g.lineWidth = 0.3; g.setLineDash([1, 0.6]); g.strokeRect(p.x, p.y, p.w, p.h); g.setLineDash([]);
            drawTextPrim(g, { x: 1, y: Math.min(p.h - 1, 3.2), w: measureMM('Invalid barcode', 'sans', true, false, 2.6), text: 'Invalid barcode', size: 2.6, font: 'sans', bold: true, color: '#e5484d' });
          }
          break;
      }
    }
    g.restore();
  }
}
/** Render one label to a new canvas at `dpi` (white background). mono → 1-bit threshold like a thermal head. */
function renderLabelCanvas(doc, items, dpi, { mono = false, threshold = 128, scale = 1 } = {}) {
  const pxmm = (dpi / 25.4) * scale;
  const W = Math.max(1, Math.round(doc.label.w * pxmm)), H = Math.max(1, Math.round(doc.label.h * pxmm));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: mono });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.scale(pxmm, pxmm);
  drawItems(g, items, { doc });
  if (mono) toMono(c, threshold);
  return c;
}
/** Threshold a canvas to pure black/white in place; returns the packed 1-bit rows (1 = black). */
function toMono(c, threshold = 128, dither = false) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, W = c.width, H = c.height;
  const lum = new Float32Array(W * H);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const a = d[i + 3] / 255; lum[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * a + 255 * (1 - a); }
  const bpr = Math.ceil(W / 8), bits = new Uint8Array(bpr * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = y * W + x, old = lum[j], black = old < threshold, err = old - (black ? 0 : 255);
    if (black) bits[y * bpr + (x >> 3)] |= 0x80 >> (x & 7);
    const v = black ? 0 : 255; d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v; d[j * 4 + 3] = 255;
    if (dither) {
      if (x + 1 < W) lum[j + 1] += (err * 7) / 16;
      if (y + 1 < H) { if (x > 0) lum[j + W - 1] += (err * 3) / 16; lum[j + W] += (err * 5) / 16; if (x + 1 < W) lum[j + W + 1] += err / 16; }
    }
  }
  g.putImageData(im, 0, 0);
  return { bits, bpr, w: W, h: H };
}
/** Rasterise a single item to a 1-bit bitmap aligned to printer dots (for ZPL ^GFA, EPL GW, TSPL BITMAP). */
function rasterizeItem(doc, it, dpi, { dither = false, threshold = 128 } = {}) {
  const pxmm = dpi / 25.4;
  const x0 = Math.floor(it.box.x * pxmm), y0 = Math.floor(it.box.y * pxmm);
  const W = Math.max(1, Math.ceil((it.box.x + it.box.w) * pxmm) - x0), H = Math.max(1, Math.ceil((it.box.y + it.box.h) * pxmm) - y0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.setTransform(pxmm, 0, 0, pxmm, -x0, -y0);
  drawItems(g, [it], { doc });
  return Object.assign(toMono(c, threshold, dither), { x: x0, y: y0 });
}
