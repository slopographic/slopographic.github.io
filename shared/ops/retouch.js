/* PhotoSlop's Auto retouch as headless operations, for Slop Workflows (registry: shared/ops/registry.js):
 *   photoslop.auto-enhance   "Auto enhance photos": levels, white balance, exposure, shadows and highlights, vibrance,
 *                            gentle sharpening, optional denoise and straighten
 *   photoslop.portrait       "Portrait retouch": skin smoothing, blemish healing, red-eye and optional whitening
 * Both run PhotoSlop itself in its hidden copy (shared/macros/frame.js runInHost, the one PhotoSlop macros use): open the
 * picture, run the command (ps.retouch.auto-enhance or ps.retouch.portrait, photoslop/js/retouch/boot.js) with these
 * options, write the result. So a workflow, the menus, Ctrl+K and the AI panel share one implementation. On this device;
 * face detection is used only when the person has turned it on in Profile. toArgs(id, options) maps these options to the
 * command's arguments. */
import { register } from './registry.js';
import { IMAGE_IN, pictureKind, stem } from './load.js';
import { t, opt, stepKey } from './i18n.js';

const HOST = { app: 'photoslop', url: 'photoslop/?macro-host=1' };
let runInHost = null;
const runner = async () => (runInHost = runInHost || (await import('../macros/frame.js')).runInHost);

const FORMAT = opt('ui.ops.retouch.format', { key: 'format', type: 'select', value: 'same', options: ['same', ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']] });
const QUALITY = opt('ui.ops.retouch.quality', { key: 'quality', type: 'range', min: 40, max: 100, step: 1, value: 92 });
const outKind = (k, o = {}) => (!o.format || o.format === 'same' ? pictureKind(k) : o.format);
const bool = (v, d) => (v === undefined ? d : !!v);

/** The command and its arguments for an operation's options. */
export function toArgs(id, o = {}) {
  if (id === 'photoslop.auto-enhance') {
    return ['ps.retouch.auto-enhance', { strength: Number(o.strength ?? 100), white_balance: bool(o.white_balance, true), sharpen: Number(o.sharpen ?? 25),
      denoise: o.denoise || 'none', straighten: bool(o.straighten, false) }];
  }
  return ['ps.retouch.portrait', { smoothing: Number(o.smoothing ?? 45), blemishes: bool(o.blemishes, true), red_eye: bool(o.red_eye, true),
    teeth: Number(o.teeth ?? 0), eyes: Number(o.eyes ?? 0), faces: 'auto', subject: false }];
}

/** A step (its label and description come from its id, shared/ops/i18n.js); its label names the command in the replay's messages. */
function op(id, options, keywords) {
  return {
    id, group: 'Pictures', from: IMAGE_IN, ext: 'png', mode: 'each', out: outKind, engine: 'photoslop', keywords,   // i18n-ignore: a group id (search words), an app name
    options: options.concat([FORMAT, QUALITY]),
    async run(files, o = {}, ctx = {}) {
      const f = files[0], kind = outKind(f.kind, o), [cmd, args] = toArgs(id, o), run = await runner();
      const r = await run(HOST, f.file, [{ cmd, args, title: t(stepKey(id)) }], { format: kind, quality: Number(o.quality ?? 92) / 100 }, { signal: ctx.signal, timeout: 5 * 60 * 1000 });
      if (ctx.progress) ctx.progress(1);
      return [{ name: `${stem(f.name)}.${r.kind}`, blob: r.blob, kind: r.kind }];
    },
  };
}

const P = 'ui.ops.retouch.';
export const RETOUCH_OPS = register([
  op('photoslop.auto-enhance', [
    opt(P + 'strength', { key: 'strength', type: 'range', min: 0, max: 100, step: 1, value: 100 }),
    opt(P + 'white_balance', { key: 'white_balance', type: 'checkbox', value: true }),
    opt(P + 'sharpen', { key: 'sharpen', type: 'range', min: 0, max: 100, step: 1, value: 25 }),
    opt(P + 'denoise', { key: 'denoise', type: 'select', value: 'none', options: ['none', 'light', 'medium', 'strong'] }),
    opt(P + 'straighten', { key: 'straighten', type: 'checkbox', value: false }),
  ], ['auto enhance', 'auto fix', 'white balance', 'colour cast', 'levels', 'exposure', 'brighten', 'photo fix', 'retouch']),
  op('photoslop.portrait', [
    opt(P + 'smoothing', { key: 'smoothing', type: 'range', min: 0, max: 100, step: 1, value: 45 }),
    opt(P + 'blemishes', { key: 'blemishes', type: 'checkbox', value: true }),
    opt(P + 'red_eye', { key: 'red_eye', type: 'checkbox', value: true }),
    opt(P + 'teeth', { key: 'teeth', type: 'range', min: 0, max: 100, step: 1, value: 0 }),
    opt(P + 'eyes', { key: 'eyes', type: 'range', min: 0, max: 100, step: 1, value: 0 }),
  ], ['portrait', 'skin', 'smooth skin', 'blemish', 'acne', 'red eye', 'teeth whitening', 'retouch', 'beauty']),
], { app: 'photoslop', label: 'PhotoSlop' });   // i18n-ignore: a group id (search words), an app name
