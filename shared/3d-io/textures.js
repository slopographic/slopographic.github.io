/* Texture pictures as files: a three.js texture's image (a picture, a canvas, an ImageBitmap or raw RGBA data) drawn to
 * a canvas and saved as PNG. Browser only; where there is no canvas (Node) the answer is null and the caller leaves the
 * picture out and says so. KTX2 textures transcoded to plain RGBA (decoders.js) become ordinary DataTextures here. */
import * as T from '../../vendor/three/three.module.min.js';

function canvasOf(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return null;
}

/** Raw RGBA pixels of a texture, when it has them (a DataTexture, or an uncompressed RGBA CompressedTexture). */
function rawPixels(tex) {
  const img = tex.image || {};
  if (img.data && img.width && img.height && img.data.length === img.width * img.height * 4) return { data: img.data, w: img.width, h: img.height };
  if (tex.isCompressedTexture && tex.format === T.RGBAFormat && tex.mipmaps && tex.mipmaps[0]) {
    const m = tex.mipmaps[0];
    if (m.data && m.data.length === m.width * m.height * 4) return { data: m.data, w: m.width, h: m.height };
  }
  return null;
}

/** A plain DataTexture in place of an uncompressed RGBA CompressedTexture (exporters cannot read compressed ones). */
export function plainTexture(tex) {
  if (!tex || !tex.isCompressedTexture) return tex;
  const raw = rawPixels(tex);
  if (!raw) return null;
  const out = new T.DataTexture(new Uint8Array(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), raw.w, raw.h, T.RGBAFormat);
  out.colorSpace = tex.colorSpace;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.flipY = false;
  out.name = tex.name;
  out.needsUpdate = true;
  return out;
}

/** The texture's picture as a canvas, or null. maxSize caps the longer side. */
export function textureCanvas(tex, maxSize = 4096) {
  if (!tex) return null;
  const raw = rawPixels(tex);
  const img = tex.image;
  const w0 = raw ? raw.w : img && (img.naturalWidth || img.width), h0 = raw ? raw.h : img && (img.naturalHeight || img.height);
  if (!w0 || !h0) return null;
  const k = Math.min(1, maxSize / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const c = canvasOf(w, h);
  if (!c) return null;
  const ctx = c.getContext('2d');
  if (raw) {
    const full = canvasOf(raw.w, raw.h);
    full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), raw.w, raw.h), 0, 0);
    if (tex.flipY) { ctx.translate(0, h); ctx.scale(1, -1); }
    ctx.drawImage(full, 0, 0, w, h);
  } else {
    try { ctx.drawImage(img, 0, 0, w, h); } catch (e) { return null; }
  }
  return c;
}

/** The texture's picture as a PNG Blob, or null when it cannot be drawn here. */
export async function textureBlob(tex, maxSize) {
  const c = textureCanvas(tex, maxSize);
  if (!c) return null;
  if (c.convertToBlob) return c.convertToBlob({ type: 'image/png' });
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

/** The picture as a data: URL (PNG), or null. */
export async function textureDataUrl(tex, maxSize) {
  const b = await textureBlob(tex, maxSize);
  if (!b) return null;
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(b); });
}
