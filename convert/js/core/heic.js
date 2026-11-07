/* HEIC and HEIF photos (iPhone and many Android phones) to JPG, PNG or WebP. A browser that reads HEIC itself (Safari)
 * decodes it with nothing downloaded; any other browser uses the HEIC decoder, libheif in WebAssembly
 * (shared/heic/engine.js), downloaded once after its first-use notice. The live preview (opts.heicPreview) never asks: it
 * shows the picture only when the browser or an installed decoder can, and otherwise says that Convert will.
 * The decoded picture goes through the same drawing as the other image conversions (image.js convertImage), so the size,
 * quality and background options behave the same. Browser only. Exports HEIC (catalog entries) and decodeHeic. */
import { convertImage, makeCanvas, canvasToBlob } from './image.js';
import { stemOf as base } from '../io/files.js';
import { tr } from './i18n.js';

let engineP = null;
/** The engine script, loaded on first use (a classic script: it is told where its worker is). */
function engine() {
  if (!engineP) {
    globalThis.SlopHeicBase = new URL('../../../shared/heic/', import.meta.url).href;
    engineP = import('../../../shared/heic/engine.js').then(() => globalThis.SlopHeicEngine);
    engineP.catch(() => { engineP = null; });
  }
  return engineP;
}

/** The photo as a PNG blob: the browser's own decoder first, else the engine. ask: false never shows the notice.
 *  Returns { png, width, height, count, via: 'browser' | 'engine' }. */
export async function decodeHeic(file, { ask = true } = {}) {
  try {
    const bmp = await createImageBitmap(file);
    const c = makeCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close();
    return { png: await canvasToBlob(c, 'image/png'), width: c.width, height: c.height, count: 1, via: 'browser' };
  } catch (e) { /* this browser cannot read HEIC: the engine does */ }
  const E = await engine();
  let r;
  try { r = await E.decode(new Uint8Array(await file.arrayBuffer()), { ask }); } catch (e) {
    if (e.code === 'declined' && !ask) throw new Error(tr('convert.heic.preview_needs'));
    if (e.code === 'declined') throw new Error(tr('convert.heic.declined'));
    throw e;
  }
  const c = makeCanvas(r.width, r.height);
  c.getContext('2d').putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  return { png: await canvasToBlob(c, 'image/png'), width: r.width, height: r.height, count: r.count, via: 'engine' };
}

function heicTo(to) {
  return async (files, o = {}) => {
    const f = files[0];
    const d = await decodeHeic(f.file, { ask: !o.heicPreview });
    const r = await convertImage(d.png, { kind: 'png', to, width: o.width, height: o.height, quality: (o.quality ?? 90) / 100, background: o.background });
    const out = [{ name: `${base(f.name)}.${r.ext}`, blob: r.blob }];
    if (d.count > 1) out.info = tr('convert.heic.many', { name: f.name, n: d.count });
    return out;
  };
}

const SIZE = [
  { key: 'width', type: 'number', get label() { return tr('convert.img.width'); }, min: 1, max: 10000, get hint() { return tr('convert.heic.width_hint'); } },
  { key: 'height', type: 'number', get label() { return tr('convert.img.height'); }, min: 1, max: 10000 },
];
const QUALITY = { key: 'quality', type: 'range', get label() { return tr('convert.img.quality'); }, min: 10, max: 100, value: 90 };
const KW = ['heic', 'heif', 'iphone', 'apple', 'photo'];

export const HEIC = [
  { id: 'heic-to-jpg', get label() { return tr('convert.heic.to_jpg'); }, group: 'Images', from: ['heic'], ext: 'jpg', mode: 'each', options: [...SIZE, QUALITY], keywords: [...KW, 'jpeg'], run: heicTo('jpg') }, // i18n-ignore: group id (shown through groupLabel)
  { id: 'heic-to-png', get label() { return tr('convert.heic.to_png'); }, group: 'Images', from: ['heic'], ext: 'png', mode: 'each', options: [...SIZE], keywords: KW, run: heicTo('png') }, // i18n-ignore: group id (shown through groupLabel)
  { id: 'heic-to-webp', get label() { return tr('convert.heic.to_webp'); }, group: 'Images', from: ['heic'], ext: 'webp', mode: 'each', options: [...SIZE, QUALITY], keywords: KW, run: heicTo('webp') }, // i18n-ignore: group id (shown through groupLabel)
];
