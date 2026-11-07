/* Slop Resize's headless operation, for Slop Workflows (registry: shared/ops/registry.js):
 *   resize.image   Slop Resize's own picture code (resize/js/core/size.js for the geometry, resize/js/image/image.js to
 *                  draw and encode: halving steps, fit / cover / stretch / fit inside with an anchor, a background colour,
 *                  a target file size searched over the quality). JPG, PNG, WebP or AVIF out, or the picture's own format.
 * specOf(options) turns these options into Slop Resize's spec (size.js normalize). */
import { register } from './registry.js';
import { scripts, stem, pictureKind, MIME, IMAGE_IN } from './load.js';
import { opt } from './i18n.js';

const g = globalThis;
const FILES = ['resize/js/core/size.js', 'resize/js/core/format.js', 'resize/js/image/image.js'];
const R = 'ui.ops.resize.';

export const RESIZE_OPTIONS = [
  opt(R + 'mode', { key: 'mode', type: 'select', value: 'size', options: ['size', 'long', 'scale'] }),
  opt(R + 'width', { key: 'width', type: 'number', min: 0, max: 16384, hint: true }),
  opt(R + 'height', { key: 'height', type: 'number', min: 0, max: 16384 }),
  opt(R + 'long', { key: 'long', type: 'number', min: 1, max: 16384, value: 1600 }),
  opt(R + 'scale', { key: 'scale', type: 'number', min: 1, max: 400, value: 50 }),
  opt(R + 'fit', { key: 'fit', type: 'select', value: 'fit', options: ['fit', 'cover', 'within', 'stretch'] }),
  opt(R + 'anchor', { key: 'anchor', type: 'select', value: 'center', options: ['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] }),
  opt(R + 'background', { key: 'background', type: 'select', value: 'transparent', options: ['transparent', 'color'] }),
  opt(R + 'bg_color', { key: 'bgColor', type: 'color', value: '#ffffff' }),
  opt(R + 'format', { key: 'format', type: 'select', value: 'keep', options: ['keep', ['jpg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP'], ['avif', 'AVIF']] }),
  opt(R + 'quality', { key: 'quality', type: 'range', min: 10, max: 100, value: 90 }),
  opt(R + 'max_kb', { key: 'maxKB', type: 'number', min: 0, max: 1e6, hint: true }),
];

export function specOf(o = {}) {
  const mode = ['size', 'long', 'scale'].includes(o.mode) ? o.mode : 'size';
  return { mode: mode === 'size' && Number(o.maxKB) > 0 ? 'bytes' : mode, w: Number(o.width) || 0, h: Number(o.height) || 0,
    long: Number(o.long) || 0, scale: Number(o.scale) || 50, keepRatio: o.fit !== 'stretch', fill: o.fit || 'fit', anchor: o.anchor || 'center',
    bg: o.background === 'color' ? o.bgColor || '#ffffff' : 'transparent', resample: 'best' };
}
const outKind = (k, o = {}) => (o.format && o.format !== 'keep' ? o.format : pictureKind(k));

async function resize(files, o) {
  await scripts(FILES, () => !!(g.SlopResize && g.SlopResize.image && g.SlopResize.size && g.SlopResize.format));
  const f = files[0], kind = outKind(f.kind, o);
  const r = await g.SlopResize.image.run(f.file, specOf(o), { mime: MIME[kind], quality: (Number(o.quality) || 90) / 100, maxBytes: Math.round((Number(o.maxKB) || 0) * 1024) });
  const out = [{ name: `${stem(f.name)}-${r.w}x${r.h}.${r.ext}`, blob: r.blob, kind: r.ext }];
  if (r.note) out.info = r.note;
  return out;
}

export const RESIZE_OPS = register([
  { id: 'resize.image', group: 'Pictures', from: IMAGE_IN, mode: 'each', out: outKind,   // i18n-ignore: a group id (search words), an app name
    keywords: ['resize', 'scale', 'square', 'thumbnail', 'smaller', 'compress image', 'dimensions'], options: RESIZE_OPTIONS, run: resize },
], { app: 'resize', label: 'Slop Resize' });   // i18n-ignore: a group id (search words), an app name
