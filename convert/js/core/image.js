/* Raster conversions on the canvas. Browser only (uses createImageBitmap, Image and canvas).
 * Every public function takes a Blob plus its detected kind ('png', 'jpg', 'svg', ...). */
import { encodeBmp } from './bmp.js';
import { encodeIco } from './ico.js';
import { tr } from './i18n.js';

const MAX_SIDE = 10000;
const MAX_PIXELS = 40e6;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' };

/** Whether this browser's canvas can write a picture type (toDataURL falls back to PNG when it cannot). Sync, cached. */
const encodes = new Map();
export function canEncode(mime) {
  if (!encodes.has(mime)) {
    let ok = false;
    try { const c = document.createElement('canvas'); c.width = c.height = 2; ok = c.toDataURL(mime).startsWith(`data:${mime}`); } catch (e) { /* no canvas */ }
    encodes.set(mime, ok);
  }
  return encodes.get(mime);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(tr('convert.img.cannot_write_mime', { type: mime })))), mime, quality);
  });
}

/** Decode a source image. Returns { w, h, source, close() }. SVG is kept as an Image so it can be drawn at any size. */
export async function decodeSource(blob, kind) {
  if (kind === 'svg') return decodeSvg(blob);
  let bmp;
  try { bmp = await createImageBitmap(blob); } catch (e) { throw new Error(tr('convert.img.unreadable')); }
  return { w: bmp.width, h: bmp.height, source: bmp, close: () => bmp.close() };
}

async function decodeSvg(blob) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'image/svg+xml' }));
  const img = new Image();
  try {
    img.src = url;
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw new Error(tr('convert.img.bad_svg'));
  }
  let w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) {
    // No width and height on the root element: take the viewBox, scaled so the long side is 1024 px.
    const m = /viewBox\s*=\s*["']\s*[\d.+-]+[\s,]+[\d.+-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(await blob.text());
    const vw = m ? Number(m[1]) : 1024, vh = m ? Number(m[2]) : 1024;
    const k = 1024 / Math.max(vw, vh, 1);
    w = Math.max(1, Math.round(vw * k)); h = Math.max(1, Math.round(vh * k));
  }
  return { w, h, source: img, close: () => URL.revokeObjectURL(url) };
}

/** Output size from the source size and optional width or height (aspect ratio kept). */
export function sizeFor(src, { width, height } = {}) {
  let W = Number(width) || 0, H = Number(height) || 0;
  if (!W && !H) { W = src.w; H = src.h; }
  else if (!W) W = Math.round((src.w * H) / src.h);
  else if (!H) H = Math.round((src.h * W) / src.w);
  W = Math.min(MAX_SIDE, Math.max(1, Math.round(W)));
  H = Math.min(MAX_SIDE, Math.max(1, Math.round(H)));
  if (W * H > MAX_PIXELS) throw new Error(tr('convert.img.too_large'));
  return { W, H };
}

/**
 * Convert one image. to: 'png' | 'jpg' | 'webp' | 'avif' (where the browser writes it) | 'bmp' | 'ico'.
 * JPG and BMP have no transparency, so the background colour fills it first.
 * Returns { blob, ext, width, height }.
 */
export async function convertImage(blob, { kind, to, width, height, quality = 0.9, background = '#ffffff', icoSize = 256 }) {
  const src = await decodeSource(blob, kind);
  try {
    if (to === 'ico') {
      const S = Math.min(256, Math.max(16, Math.round(Number(icoSize) || 256)));
      const canvas = makeCanvas(S, S);
      const ctx = canvas.getContext('2d');
      const k = Math.min(S / src.w, S / src.h);
      const dw = src.w * k, dh = src.h * k;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src.source, (S - dw) / 2, (S - dh) / 2, dw, dh);
      const png = new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
      return { blob: new Blob([encodeIco(png, S, S)], { type: 'image/x-icon' }), ext: 'ico', width: S, height: S };
    }
    const { W, H } = sizeFor(src, { width, height });
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    if (to === 'jpg' || to === 'bmp') { ctx.fillStyle = background || '#ffffff'; ctx.fillRect(0, 0, W, H); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.source, 0, 0, W, H);
    if (to === 'bmp') {
      const px = ctx.getImageData(0, 0, W, H);
      return { blob: new Blob([encodeBmp({ width: W, height: H, data: px.data })], { type: 'image/bmp' }), ext: 'bmp', width: W, height: H };
    }
    const mime = MIME[to];
    if (!mime) throw new Error(`Unknown image type: ${to}`);
    const out = await canvasToBlob(canvas, mime, quality);
    if (out.type !== mime) throw new Error(tr('convert.img.cannot_write', { format: to.toUpperCase() }));
    canvas.width = canvas.height = 0;
    return { blob: out, ext: to, width: W, height: H };
  } finally {
    src.close();
  }
}

/** EXIF orientation of a JPEG (1 when upright or absent). Reads only the APP1 Exif IFD0 tag 0x0112. */
export function jpegOrientation(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || dv.getUint16(0) !== 0xffd8) return 1;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return 1;
    const marker = bytes[p + 1], len = dv.getUint16(p + 2);
    if (marker === 0xe1 && bytes.length > p + 10 && String.fromCharCode(...bytes.subarray(p + 4, p + 8)) === 'Exif') { // i18n-ignore: an EXIF tag
      const t = p + 10;                       // TIFF header
      const le = dv.getUint16(t) === 0x4949;
      const ifd = t + dv.getUint32(t + 4, le);
      const n = dv.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (dv.getUint16(e, le) === 0x0112) return dv.getUint16(e + 8, le);
      }
      return 1;
    }
    if (marker === 0xda) return 1;            // start of scan: no more headers
    p += 2 + len;
  }
  return 1;
}

/**
 * Bytes for embedding in a PDF. Upright JPEG passes through unchanged. A JPEG with an EXIF rotation is
 * drawn upright and re-encoded at high quality. Anything else is flattened onto white as an opaque PNG
 * (transparency cannot be shown on paper). Returns { bytes, mime, width, height }.
 */
export async function imageForPdf(blob, kind) {
  const jpegBytes = kind === 'jpg' ? new Uint8Array(await blob.arrayBuffer()) : null;
  if (jpegBytes && jpegOrientation(jpegBytes) === 1) {
    const bmp = await createImageBitmap(blob);
    const r = { bytes: jpegBytes, mime: 'image/jpeg', width: bmp.width, height: bmp.height };
    bmp.close();
    return r;
  }
  const src = await decodeSource(blob, kind);
  try {
    const canvas = makeCanvas(src.w, src.h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, src.w, src.h);
    ctx.drawImage(src.source, 0, 0, src.w, src.h);
    const isJpeg = !!jpegBytes;
    const out = await canvasToBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', 0.92);
    canvas.width = canvas.height = 0;
    return { bytes: new Uint8Array(await out.arrayBuffer()), mime: isJpeg ? 'image/jpeg' : 'image/png', width: src.w, height: src.h };
  } finally {
    src.close();
  }
}
