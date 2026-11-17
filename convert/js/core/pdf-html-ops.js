/* PDF to HTML, part 1: walks a page's drawing commands (pdf.js operator list) and finds where each image is painted.
 * Returns the images as JPEG data URLs with the matrix that places them on the page, and whether the page's text is drawn
 * invisibly (a scanned page with an OCR layer), so the HTML can keep that text selectable without showing it twice.
 * Browser only: uses canvas. Classic conventions, ES module. */
const MAX_SIDE = 2400;      // images are scaled down past this, to keep the HTML a sane size
const WAIT_MS = 5000;       // an image that never arrives is skipped

/** Matrix product m × n (apply m, then n), PDF order: [a b c d e f]. */
export const mul = (m, n) => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];

/** Pixels of one decoded image as RGBA on a white page, from whatever pdf.js hands back (a bitmap, or raw bytes). */
function toCanvas(img) {
  const w = img.width, h = img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
  const cx = cv.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height);
  if (img.bitmap) { cx.drawImage(img.bitmap, 0, 0, cv.width, cv.height); return cv; }
  const src = img.data;
  if (!src || !w || !h) return null;
  const n = w * h, kind = img.kind;
  const rgba = new Uint8ClampedArray(n * 4);
  const isRgba = kind === 3 || (kind == null && src.length === n * 4);
  const isRgb = kind === 2 || (kind == null && src.length === n * 3);
  if (isRgba || isRgb) {
    const step = isRgba ? 4 : 3;
    for (let i = 0, j = 0; i < n; i++, j += 4) { rgba[j] = src[i * step]; rgba[j + 1] = src[i * step + 1]; rgba[j + 2] = src[i * step + 2]; rgba[j + 3] = isRgba ? src[i * 4 + 3] : 255; }
  } else if (kind === 1) {                       // one bit per pixel, rows padded to whole bytes
    const row = (w + 7) >> 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = (src[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0, j = (y * w + x) * 4;
      rgba[j] = rgba[j + 1] = rgba[j + 2] = v; rgba[j + 3] = 255;
    }
  } else {                                       // one byte per pixel: grey
    for (let i = 0, j = 0; i < n; i++, j += 4) { const v = src[i]; rgba[j] = rgba[j + 1] = rgba[j + 2] = v; rgba[j + 3] = 255; }
  }
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  cx.drawImage(tmp, 0, 0, cv.width, cv.height);
  return cv;
}

/** The decoded image object for an id, or null if pdf.js does not deliver it in time. */
function fetchObj(page, id) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), WAIT_MS);
    try { page.objs.get(id, (o) => { clearTimeout(timer); resolve(o || null); }); } catch (e) { clearTimeout(timer); resolve(null); }
  });
}

/**
 * page: a pdf.js page. vp: its viewport at scale 1 (vp.transform maps PDF space to top-down page points).
 * Returns { images: [{ src, m }], hiddenText }. m is the CSS matrix for a 1 px box that covers the image's unit square.
 */
export async function pageDrawing(page, lib, vp) {
  const OPS = lib.OPS;
  const { fnArray, argsArray } = await page.getOperatorList();
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const placed = [];
  let mode = 0, shown = 0, invisible = 0;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i] || [];
    switch (fn) {
      case OPS.save: stack.push(ctm); break;
      case OPS.restore: if (stack.length) ctm = stack.pop(); break;
      case OPS.transform: ctm = mul(args, ctm); break;
      case OPS.paintFormXObjectBegin: stack.push(ctm); if (Array.isArray(args[0])) ctm = mul(args[0], ctm); break;
      case OPS.paintFormXObjectEnd: if (stack.length) ctm = stack.pop(); break;
      case OPS.setTextRenderingMode: mode = args[0]; break;
      case OPS.showText: case OPS.showSpacedText: case OPS.nextLineShowText: case OPS.nextLineSetSpacingShowText:
        shown++; if (mode === 3) invisible++; break;
      case OPS.paintImageXObject: case OPS.paintInlineImageXObject: {
        const a = args[0];
        placed.push({ ref: fn === OPS.paintImageXObject ? a : null, inline: fn === OPS.paintInlineImageXObject ? a : null, ctm });
        break;
      }
      default: break;
    }
  }
  const images = [];
  for (const p of placed) {
    const obj = p.ref != null ? await fetchObj(page, p.ref) : p.inline;
    if (!obj) continue;
    const cv = toCanvas(obj);
    if (!cv) continue;
    // the image's top row is the unit square's top (v = 0 maps to PDF y = 1), then the page's CTM, then the viewport
    const m = mul(mul([1, 0, 0, -1, 0, 1], p.ctm), vp.transform);
    images.push({ src: cv.toDataURL('image/jpeg', 0.92), m: m.map((v) => +v.toFixed(4)) });
  }
  return { images, hiddenText: shown > 0 && invisible * 2 > shown };
}
