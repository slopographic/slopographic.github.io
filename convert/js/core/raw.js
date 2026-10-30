/* Camera RAW conversions of File convert: CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2, PEF, SRW and the rest that SlopRaw
 * (shared/raw/) opens, to JPG, PNG or WebP. The RAW file is developed by LibRaw in WebAssembly (shared/raw/engine.js,
 * downloaded once after its first-use notice): white balance, exposure, highlights, sRGB, the camera's orientation.
 * When the engine cannot run or the person declines it, the camera's embedded JPEG preview is used and the status line
 * says so. The live preview (opts.rawPreview) uses the embedded preview only, so dropping a file downloads nothing.
 * Browser only. Exports RAW_KINDS, RAW (catalog entries) and rawPreviewBlob. */
import '../../../shared/raw/tiff.js';
import '../../../shared/raw/detect.js';
import '../../../shared/raw/preview.js';
import '../../../shared/raw/raw.js';
import { makeCanvas, canvasToBlob, sizeFor } from './image.js';
import { stemOf as base } from '../io/files.js';
import { tr } from './i18n.js';
/** A select choice [value, label] whose label is read in the current language. */
const ch = (v, label) => Object.defineProperty([v], 1, { get: label, enumerable: true });

const R = globalThis.SlopRaw;
// a module has no currentScript: tell SlopRaw where the engine script is
globalThis.SlopRawBase = new URL('../../../shared/raw/', import.meta.url).href;

export const RAW_KINDS = globalThis.SlopRawDetect.EXTS.slice();
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SIZE = [
  { key: 'width', type: 'number', get label() { return tr('convert.raw.width_px'); }, min: 1, max: 10000, get hint() { return tr('convert.raw.leave_blank_to_keep_the_full'); } },
  { key: 'height', type: 'number', get label() { return tr('convert.raw.height_px'); }, min: 1, max: 10000 },
];
const WB = { key: 'wb', type: 'select', get label() { return tr('convert.raw.white_balance'); }, value: 'camera', options: [ch('camera', () => tr('convert.raw.as_shot_camera')), ch('auto', () => tr('convert.raw.auto')), ch('daylight', () => tr('convert.raw.daylight'))] };
const EXPOSURE = { key: 'exposure', type: 'select', get label() { return tr('convert.raw.exposure'); }, value: '0',
  options: ['-2', '-1.5', '-1', '-0.5', '0', '0.5', '1', '1.5', '2'].map((v) => [v, (Number(v) > 0 ? '+' : '') + v + ' EV']) };
const HIGHLIGHTS = { key: 'highlights', type: 'select', get label() { return tr('convert.raw.highlights'); }, value: 'clip', options: [ch('clip', () => tr('convert.raw.clip')), ch('blend', () => tr('convert.raw.blend')), ch('rebuild', () => tr('convert.raw.rebuild'))] };
const QUALITY = { key: 'quality', type: 'range', get label() { return tr('convert.raw.quality'); }, min: 10, max: 100, value: 92 };
const DEVELOP = [WB, EXPOSURE, HIGHLIGHTS];

/** The camera's embedded JPEG preview of a RAW file, or null (for the before panel of the live preview). */
export async function rawPreviewBlob(file) {
  const p = await R.previewCanvas(file, 1200).catch(() => null);
  return p ? canvasToBlob(p.canvas, 'image/jpeg', 0.9) : null;
}

function rawTo(to) {
  return async (files, o = {}) => {
    const f = files[0];
    const r = await R.image(f.file, { mode: o.rawPreview ? 'preview' : 'full', wb: o.wb || 'camera', exposure: Number(o.exposure) || 0, highlights: o.highlights || 'clip' });
    const src = { w: r.canvas.width, h: r.canvas.height };
    const { W, H } = sizeFor(src, { width: o.width, height: o.height });
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(r.canvas, 0, 0, W, H);
    const blob = await canvasToBlob(c, MIME[to], (o.quality ?? 92) / 100);
    if (blob.type !== MIME[to]) throw new Error(tr('convert.raw.cannot_write', { format: to.toUpperCase() }));
    const out = [{ name: `${base(f.name)}.${to}`, blob }];
    if (r.note) out.info = r.note;
    else if (r.from === 'preview' && o.rawPreview) out.info = tr('convert.raw.preview_note');
    return out;
  };
}

export const RAW = [
  { id: 'raw-to-jpg', get label() { return tr('convert.raw.raw_to_jpg'); }, group: 'Camera RAW', from: RAW_KINDS, ext: 'jpg', mode: 'each', options: [...DEVELOP, ...SIZE, QUALITY], run: rawTo('jpg') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'raw-to-png', get label() { return tr('convert.raw.raw_to_png'); }, group: 'Camera RAW', from: RAW_KINDS, ext: 'png', mode: 'each', options: [...DEVELOP, ...SIZE], run: rawTo('png') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'raw-to-webp', get label() { return tr('convert.raw.raw_to_webp'); }, group: 'Camera RAW', from: RAW_KINDS, ext: 'webp', mode: 'each', options: [...DEVELOP, ...SIZE, QUALITY], run: rawTo('webp') }, // i18n-ignore: group is an id (groupLabel)
];
