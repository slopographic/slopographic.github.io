/* The apps' macros as Slop Workflows steps: the app host adapters (registry provide(), shared/ops/registry.js). Each app
 * that records macros (shared/macros) is listed here once; its saved macros (SlopMacroStore, IndexedDB, the same store
 * the app writes) become operations of kind 'macro' under that app in + Add step, and run on the one runner like any step.
 * A macro step's run() replays the macro (the one replay, shared/macros/core.js) in one of two ways:
 *   url   in a hidden copy of the app (shared/macros/frame.js runInHost) on each file: PhotoSlop, whose commands need it
 *   op    folded: the app's steps only set options (SlopIsolate's co.look is Remove background's own options), so the
 *         replay gathers them and that one headless operation runs; a step that needs the app's window says so
 *   HOSTS                    { app: { label, url | op + fold, from } }   the apps with macros
 *   macroOp(app, macro)      the operation for one macro
 *   macrosReady              resolves once the saved macros are read (a saved workflow with a macro step needs them)
 *   onMacros(fn)             fn() whenever an app saves, renames or deletes a macro (in any open page of the site)
 *   loadMacros(store?)       reads them again (store: a SlopMacroStore-like object, for tests) */
import { provide, byId, validateOptions } from './registry.js';
import './isolate.js';
import { IMAGE_IN, pictureKind, stem } from './load.js';
import { t, opt } from './i18n.js';
import '../macros/core.js';
import '../macros/store.js';

const g = globalThis;
const M = g.SlopMacrosCore;
export const HOSTS = {
  photoslop: { label: 'PhotoSlop', url: 'photoslop/?macro-host=1', from: IMAGE_IN.concat(['psd']) },   // i18n-ignore: a group id (search words), an app name
  slopisolate: { label: 'SlopIsolate', op: 'slopisolate.remove-bg', fold: ['co.look'], from: IMAGE_IN },   // i18n-ignore: a group id (search words), an app name
  // SlopCut's hidden copy opens the video, replays the macro and renders it (slopcut/js/ai/host.js)
  slopedit: { label: 'SlopCut', url: 'slopcut/?macro-host=1', from: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'webp'], video: true },   // i18n-ignore: a group id (search words), an app name
};
const VFORMAT = opt('ui.ops.macro.format', { key: 'format', type: 'select', value: 'mp4', options: [['mp4', 'MP4'], ['webm', 'WebM']] });

const FORMAT = opt('ui.ops.macro.format', { key: 'format', type: 'select', value: 'same', options: ['same', ['png', 'PNG'], ['jpg', 'JPG'], ['webp', 'WebP']] });
const QUALITY = opt('ui.ops.retouch.quality', { key: 'quality', type: 'range', min: 40, max: 100, step: 1, value: 90 });
/** A macro step's description: the app and its steps' titles, in the chosen language. */
const describe = (op, H, titles) => Object.defineProperty(op, 'description', { get: () => t('ui.ops.macro.desc', { app: H.label, steps: titles.join(' → ') }), enumerable: true, configurable: true });
const outKind = (inKind, o = {}) => (!o.format || o.format === 'same' ? pictureKind(inKind) : o.format);

let runInHost = null;
const hostRunner = async () => (runInHost = runInHost || (await import('../macros/frame.js')).runInHost);

/** A folded macro: its steps' args, in order, as the operation's options. */
export async function foldOptions(app, steps) {
  const H = HOSTS[app], op = byId(H.op), acc = {};
  await M.replay(steps, { exec: async (cmd, args) => (H.fold.includes(cmd) ? (Object.assign(acc, args), { ok: true })
    : { ok: false, error: t('ui.ops.macro.app_only', { app: H.label }) }) });
  return { op, options: validateOptions(op, acc).options };
}

export function macroOp(app, macro) {
  const H = HOSTS[app], titles = macro.steps.map((s) => s.title);
  if (H.op) {
    const base = byId(H.op);
    return describe({ id: M.opId(app, macro.id), macroId: macro.id, kind: 'macro', app, label: macro.name, group: 'Macros', mode: 'each',   // i18n-ignore: a group id (search words), an app name
      from: H.from, ext: base.ext, options: [], engine: base.engine, notice: base.notice,
      keywords: ['macro', 'recorded', H.label, ...titles],
      async run(files, o, ctx) { const f = await foldOptions(app, macro.steps); return f.op.run(files, f.options, ctx); } }, H, titles);
  }
  if (H.video) return describe({
    id: M.opId(app, macro.id), macroId: macro.id, kind: 'macro', app, label: macro.name, group: 'Macros', mode: 'each',   // i18n-ignore: a group id (search words), an app name
    from: H.from, ext: 'mp4', out: (k, o = {}) => o.format || 'mp4', options: [VFORMAT],
    keywords: ['macro', 'recorded', H.label, ...titles],
    async run(files, o, ctx = {}) {
      const f = files[0], run = await hostRunner();
      const r = await run({ app, url: H.url }, f.file, macro.steps, { format: o.format || 'mp4' }, { signal: ctx.signal, progress: ctx.progress, timeout: 60 * 60 * 1000 });
      return [{ name: `${stem(f.name)}-${macro.name}.${r.kind}`.replace(/[\\/:*?"<>|]+/g, '-'), blob: r.blob, kind: r.kind }];
    },
  }, H, titles);
  return describe({
    id: M.opId(app, macro.id), macroId: macro.id, kind: 'macro', app, label: macro.name, group: 'Macros', mode: 'each',   // i18n-ignore: a group id (search words), an app name
    from: H.from, ext: 'png', out: outKind, options: [FORMAT, QUALITY],
    keywords: ['macro', 'recorded', H.label, ...titles],
    async run(files, o, ctx = {}) {
      const f = files[0], kind = outKind(f.kind, o);
      const run = await hostRunner();
      const r = await run({ app, url: H.url }, f.file, macro.steps, { format: kind, quality: Number(o.quality ?? 90) / 100 }, { signal: ctx.signal });
      if (ctx.progress) ctx.progress(1);
      const ext = r.kind === 'jpg' ? 'jpg' : r.kind;
      return [{ name: `${stem(f.name)}.${ext}`, blob: r.blob, kind: r.kind }];
    },
  }, H, titles);
}

const cache = new Map(Object.keys(HOSTS).map((a) => [a, []]));
const listeners = new Set();
for (const [app, h] of Object.entries(HOSTS)) provide(app, { label: h.label, list: () => cache.get(app).map((m) => macroOp(app, m)) });

export async function loadMacros(store = g.SlopMacroStore) {
  if (!store) return;
  for (const app of Object.keys(HOSTS)) cache.set(app, await store.list(app).catch(() => []));
  for (const fn of [...listeners]) try { fn(); } catch (e) { console.error(e); }
}
export const onMacros = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const ST = g.SlopMacroStore;
if (ST) { ST.setBase(new URL('../macros/', import.meta.url).href); ST.onChange((app) => { if (!app || HOSTS[app]) loadMacros(); }); }
export const macrosReady = typeof document === 'undefined' ? Promise.resolve() : loadMacros();
