/* Slop Watermark's headless operation, for Slop Workflows (registry: shared/ops/registry.js):
 *   watermark.apply   a text and/or logo watermark on pictures, videos (every frame, sound kept) and PDFs (real text), through
 *                     the one watermark call, SlopWatermark.apply (shared/watermark/apply.js). Pictures keep their size and
 *                     format (JPG stays JPG; BMP, AVIF and SVG become PNG, HEIC becomes JPG), a video stays a video, a PDF a PDF.
 * The options are the watermark spec's own (shared/watermark/spec-convert.js OPTIONS, from the spec's one table of settings):
 * the flat settings of one mark, or a saved watermark from My watermarks (any number of layers) as the spec option.
 * fromApp(settings) maps an app's "Add to a workflow…" settings ({ spec }, or Slop Watermark's setup from before the spec,
 * { cfg, logo }) onto these options. */
import { register } from './registry.js';
import { scripts, stem } from './load.js';
import { t } from './i18n.js';
import '../watermark/spec.js';
import '../watermark/spec-layout.js';
import '../watermark/spec-convert.js';

const g = globalThis, S = g.SlopWatermarkSpec;
const PICTURES = ['png', 'jpg', 'webp', 'bmp', 'gif', 'avif', 'svg', 'heic'];
const VIDEOS = ['mp4', 'mov', 'webm'];
export const WATERMARK_IN = [...PICTURES, ...VIDEOS, 'pdf'];
const OUT = { jpg: 'jpg', webp: 'webp', heic: 'jpg', mp4: 'mp4', mov: 'mov', webm: 'webm', pdf: 'pdf' };
const KIND_OF = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf' };
const SCRIPTS = ['shared/watermark/spec.js', 'shared/watermark/spec-layout.js', 'shared/watermark/spec-convert.js', 'shared/watermark/core.js', 'shared/watermark/apply.js'];

export const WATERMARK_OPTIONS = S.OPTIONS;
/** The spec for a step's options (a saved watermark, or the flat settings of one mark). */
export const specOf = (o, ctx) => S.fromOptions(o, ctx);
/** The step's options for an app's settings: { spec } (any app), or Slop Watermark's setup from before the spec. */
export function fromApp(s = {}) {
  if (s.spec) return S.toOptions(s.spec);
  if (s.cfg) return S.toOptions(S.fromCfg(s.cfg, s.logo || ''));
  return {};
}

const logoAspects = new Map();
async function aspectOf(url) {
  if (!url) return 0;
  if (!logoAspects.has(url)) logoAspects.set(url, fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b)).then((b) => { const a = b.height / b.width; b.close(); return a; }).catch(() => { logoAspects.delete(url); throw new Error(t('ui.ops.watermark.no_logo')); }));
  return logoAspects.get(url);
}

async function apply(files, o, ctx = {}) {
  await scripts(SCRIPTS, () => !!(g.SlopWatermark && g.SlopWatermark.apply));
  const f = files[0], logoAspect = o.mark === 'both' && !o.spec ? await aspectOf(o.logo) : 0;
  const notes = [];
  const blob = await g.SlopWatermark.apply(f.file, specOf(o, { logoAspect }), { signal: ctx.signal, progress: ctx.progress, notice: (text) => notes.push(text) });
  const kind = KIND_OF[blob.type] || 'png';
  const out = [{ name: `${stem(f.name)}.${kind}`, blob, kind }];
  if (notes.length) out.info = notes.join(' ');
  return out;
}

export const WATERMARK_OPS = register([
  { id: 'watermark.apply', group: 'Pictures', from: WATERMARK_IN, mode: 'each', out: (k) => OUT[k] || 'png',   // i18n-ignore: a group id (search words), an app name
    keywords: ['watermark', 'logo', 'copyright', 'stamp', 'brand', 'video watermark', 'pdf watermark'], options: WATERMARK_OPTIONS, run: apply,
    fromApp,   // an app's "Add to a workflow…" (shared/ops/flowdoc.js)
    check: (o = {}) => S.check(specOf(o)) },
], { app: 'watermark', label: 'Slop Watermark' });   // i18n-ignore: a group id (search words), an app name
