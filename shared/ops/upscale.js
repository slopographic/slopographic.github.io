/* Slop Upscale's headless operation, for Slop Workflows (registry: shared/ops/registry.js):
 *   upscale.image   2× or 4× with Slop Upscale's own pipeline (upscale/js/engine/pipeline.js: tile by tile through the
 *                   engine's worker, FSRCNN on luminance with Lanczos colour), its model registry (upscale/js/core/models.js)
 *                   and, for Quality at 4×, the Real-ESRGAN model when Get more has installed it (else Lanczos, and the
 *                   result says so). The picture keeps its format (BMP and GIF become PNG).
 * The first use asks Slop Upscale's own first-use notice (key 'upscale'), once. */
import { register } from './registry.js';
import { scripts, notice, abortable, decode, encode, stem, pictureKind, kindOfBlob, IMAGE_IN } from './load.js';
import { t, opt } from './i18n.js';

const g = globalThis;
const FILES = ['upscale/js/core/tiling.js', 'upscale/js/core/lanczos.js', 'upscale/js/core/models.js', 'upscale/js/engine/engine.js', 'upscale/js/engine/pipeline.js'];
const LIBRARY = ['shared/library/manifest.js', 'shared/library/store.js'];
const QUALITY_ID = 'realesrgan-x4plus';

async function qualityBytes() {
  try {
    await scripts(LIBRARY, () => !!g.SlopLibraryStore);
    const m = g.SlopUpscaleModels.get(QUALITY_ID), b = await g.SlopLibraryStore.getBlob(`${m.packId}/${m.packFile}`);
    return b ? b.arrayBuffer() : null;
  } catch (e) { return null; }
}

/** The model a run uses: { id, bytes, note }. id null is Lanczos only. */
async function choice(o) {
  const scale = Number(o.scale) === 4 ? 4 : 2;
  if (o.model === 'lanczos') return { id: null, scale, note: '' };
  if (o.model === 'quality' && scale === 4) {
    if (g.SlopUpscaleEngine.isLoaded(QUALITY_ID)) return { id: QUALITY_ID, scale, bytes: null, note: '' };
    const bytes = await qualityBytes();
    if (bytes) return { id: QUALITY_ID, scale, bytes, note: '' };
    return { id: null, scale, note: t('ui.ops.upscale.no_quality') };
  }
  return { id: `fsrcnn-x${scale}`, scale, note: o.model === 'quality' ? t('ui.ops.upscale.quality_4x') : '' };
}

async function upscale(files, o, ctx = {}) {
  await scripts(FILES, () => !!(g.SlopUpscalePipeline && g.SlopUpscaleModels));
  const M = g.SlopUpscaleModels;
  await notice('upscale', { title: t('ui.ops.upscale.notice_title'), lines: [t('ui.ops.upscale.notice_line')],
    downloads: [{ name: t('ui.ops.upscale.notice_model'), bytes: M.get(QUALITY_ID).bytes }] });
  abortable(ctx.signal);
  const f = files[0], c = await choice(o), src = (await decode(f.file)).canvas;
  const stop = { cancelled: false };
  if (ctx.signal) ctx.signal.addEventListener('abort', () => { stop.cancelled = true; }, { once: true });
  const out = await g.SlopUpscalePipeline.run(src, { scale: c.scale, model: c.id, bytes: c.bytes || null, signal: stop,
    onProgress: (d, total) => { if (ctx.progress) ctx.progress(d / total); } });
  const blob = await encode(out, pictureKind(f.kind), 0.92), kind = kindOfBlob(blob);
  const res = [{ name: `${stem(f.name)}-${c.scale}x.${kind}`, blob, kind }];
  if (c.note) res.info = c.note;
  return res;
}

export const UPSCALE_OPS = register([
  { id: 'upscale.image', group: 'Pictures', from: IMAGE_IN, mode: 'each', out: (k) => pictureKind(k), engine: 'upscale', notice: 'upscale',   // i18n-ignore: a group id (search words), an app name
    keywords: ['upscale', 'enlarge', 'super resolution', 'bigger', 'sharpen', 'enhance'],
    options: [
      opt('ui.ops.upscale.scale', { key: 'scale', type: 'select', value: 2, options: [[2, '2×'], [4, '4×']] }),
      opt('ui.ops.upscale.model', { key: 'model', type: 'select', value: 'fast', options: ['fast', 'quality', 'lanczos'] }),
    ], run: upscale },
], { app: 'upscale', label: 'Slop Upscale' });   // i18n-ignore: a group id (search words), an app name
