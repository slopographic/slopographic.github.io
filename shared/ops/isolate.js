/* SlopIsolate's headless operations, for Slop Workflows (registry: shared/ops/registry.js):
 *   slopisolate.remove-bg    Remove background: the on-device model (shared/cutout, SlopCutout.removeBackground), then
 *                            SlopIsolate's own compositor (slopisolate/js/render/compose.js) for the background (see-through,
 *                            a colour or the blurred photo), the drop shadow and the crop to the subject. PNG out.
 *   slopisolate.background   Background colour: puts a see-through picture (a cut-out) on a colour, with the same compositor.
 * The first use asks SlopIsolate's own first-use notice (key 'slopisolate', with the chosen model's size), once.
 * toLook(options) and fromLook(item) map between these options and SlopIsolate's per-image look, so the app's "Add to a
 * workflow…" sends its current settings (slopisolate/js/ui/commands.js). */
import { register } from './registry.js';
import { scripts, notice, abortable, decode, encode, stem, IMAGE_IN } from './load.js';
import { t, opt, like } from './i18n.js';

const CUTOUT = ['shared/cutout/pipeline.js', 'shared/cutout/models.js', 'shared/cutout/cutout.js'];
const LOOK = ['slopisolate/js/core/util.js', 'slopisolate/js/render/compose.js'];
const g = globalThis;

async function ready(withModel) {
  if (withModel) await scripts(CUTOUT, () => !!g.SlopCutout);
  await scripts(LOOK, () => !!(g.CO && g.CO.compose && g.CO.util));
  return g.CO.compose;
}

/** SlopIsolate's first-use notice for the chosen model (the same key as the app, so it is asked once in all). */
function gate(model) {
  const M = g.SlopCutoutModels, m = M && M.get(model);
  return notice('slopisolate', {
    title: t('ui.ops.isolate.notice_title'),
    lines: [t('ui.ops.isolate.notice_line')],
    downloads: m ? [{ name: t('ui.ops.isolate.notice_model', { name: m.name, arch: m.arch.split(' (')[0] }), bytes: m.bytes }] : [],
  });
}

const B = 'ui.ops.isolate.';
const MODEL = opt(B + 'model', { key: 'model', type: 'select', value: 'fast', options: ['fast', 'quality', 'portrait'] });
const BACKGROUND = opt(B + 'background', { key: 'background', type: 'select', value: 'transparent', options: ['transparent', 'color', 'blur'] });
const COLOR = opt(B + 'color', { key: 'color', type: 'color', value: '#ffffff', hint: true });
const BLUR = opt(B + 'blur', { key: 'blur', type: 'number', min: 0, max: 200, value: 24, hint: true });
const SHADOW = opt(B + 'shadow', { key: 'shadow', type: 'checkbox', value: false });
const CROP = opt(B + 'crop', { key: 'crop', type: 'checkbox', value: false });
const PAD = opt(B + 'pad', { key: 'pad', type: 'number', min: 0, max: 2000, value: 8, hint: true });

/** SlopIsolate's look (state.js DEFAULT_LOOK shape) from these options. */
export function toLook(o = {}) {
  return {
    bg: { mode: ['color', 'blur'].includes(o.background) ? o.background : 'transparent', color: o.color || '#ffffff', blur: Number(o.blur ?? 24), gradA: '#ffffff', gradB: '#ffffff', angle: 0 },
    shadow: { on: !!o.shadow, opacity: 0.45, blur: 3, x: 0, y: 2, color: '#000000' },
    crop: { mode: o.crop ? 'subject' : 'original', pad: Number(o.pad ?? 8) },
  };
}
/** These options from an item of SlopIsolate (its model and look); a gradient or picture background becomes a colour. */
export function fromLook(it = {}, model = 'fast') {
  const bg = it.bg || {}, mode = bg.mode === 'blur' ? 'blur' : bg.mode === 'transparent' || !bg.mode ? 'transparent' : 'color';
  return { model: it.model || model, background: mode, color: bg.mode === 'gradient' ? bg.gradA : bg.color || '#ffffff', blur: bg.blur ?? 24,
    shadow: !!(it.shadow && it.shadow.on), crop: !!(it.crop && it.crop.mode === 'subject'), pad: (it.crop && it.crop.pad) ?? 8 };
}

/** The compositor's record for a cut-out: its pixels, its alpha as the mask, the original for a blurred background. */
function record(C, cutout, mask, w, h, bitmap) {
  return { w, h, cutout, mask, bitmap, cut: null, bbox: C.bbox(mask, w, h) };
}
const alphaOf = (data) => { const m = new Uint8ClampedArray(data.length / 4); for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3]; return m; };

async function removeBg(files, o, ctx = {}) {
  const f = files[0], C = await ready(true);
  await gate(o.model || 'fast');
  abortable(ctx.signal);
  const r = await g.SlopCutout.removeBackground(f.file, { model: o.model || 'fast', signal: ctx.signal,
    onProgress: (p) => { if (p && p.total && ctx.progress) ctx.progress(p.loaded / p.total); } });
  const look = toLook(o);
  const bitmap = look.bg.mode === 'blur' ? (await decode(f.file)).canvas : null;
  const out = C.render(look, record(C, r.cutout, r.mask, r.width, r.height, bitmap));
  return [{ name: `${stem(f.name)}.png`, blob: await encode(out, 'png'), kind: 'png' }];
}

async function background(files, o) {
  const f = files[0], C = await ready(false);
  const { canvas, w, h } = await decode(f.file);
  const cutout = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const look = toLook({ ...o, background: 'color' });
  const out = C.render(look, record(C, cutout, alphaOf(cutout.data), w, h, null));
  return [{ name: `${stem(f.name)}.png`, blob: await encode(out, 'png'), kind: 'png' }];
}

export const ISOLATE_OPS = register([
  { id: 'slopisolate.remove-bg', group: 'Pictures', from: IMAGE_IN, ext: 'png', mode: 'each', engine: 'cutout',   // i18n-ignore: a group id (search words), an app name
    keywords: ['background remover', 'cut out', 'transparent', 'isolate', 'product photo'], notice: 'slopisolate',
    options: [MODEL, BACKGROUND, COLOR, BLUR, SHADOW, CROP, PAD], run: removeBg,
    fromApp: (s = {}) => fromLook(s.look || {}, s.model) },   // SlopIsolate's "Add to a workflow…" (shared/ops/flowdoc.js)
  { id: 'slopisolate.background', group: 'Pictures', from: ['png', 'webp', 'avif', 'gif'], ext: 'png', mode: 'each',   // i18n-ignore: a group id (search words), an app name
    keywords: ['white background', 'fill transparency', 'flatten', 'backdrop'],
    options: [like(COLOR, { hint: '' }), SHADOW, CROP, PAD], run: background },
], { app: 'slopisolate', label: 'SlopIsolate' });   // i18n-ignore: a group id (search words), an app name
