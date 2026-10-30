// Loads SlopI18n (shared/i18n/i18n.js) with the shared components' part tables (shared/i18n/ui/<code>/<part>.js) into a
// vm context, so the shared modules read their words as a page does. The language can be switched (a stand-in profile),
// for the live-switch checks. Helper for the shared media list tests. Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PARTS = ['video', 'graphics', 'presets'];

/**
 * Puts SlopI18n into ctx (a vm context whose window is itself) in language `lang`, with the en and `lang` tables of
 * `parts` (and of more langs). Returns { I, set(code) }: set switches the language and fires the listeners of on().
 */
export function useLang(ctx, lang = 'en', { parts = PARTS, langs = [] } = {}) {
  const run = (f) => vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  run('shared/i18n/i18n.js');
  let cur = lang;
  const fns = [];
  const profile = { get: () => cur, set: (a, k, v) => { cur = v; return { ok: true }; } };
  const I = ctx.SlopI18n.create({ profile, document: null });
  ctx.SlopI18n = Object.assign({}, I, { on: (fn) => { fns.push(fn); return () => { const i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }; } });
  for (const code of [...new Set(['en', lang, ...langs])]) {
    for (const p of parts) { const f = `shared/i18n/ui/${code}/${p}.js`; if (existsSync(path.join(ROOT, f))) run(f); }
  }
  return { I: ctx.SlopI18n, set: (code) => { cur = code; for (const fn of fns.slice()) fn(code); } };
}

/** A fresh vm context with SlopI18n in `lang` and the given repo files run in order. */
export function context(files, lang = 'en', opts = {}) {
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  const env = useLang(ctx, lang, opts);
  for (const f of files) vm.runInContext(readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return Object.assign(ctx, { lang: env });
}

/** Plain copy, so values made inside the vm context compare equal to host objects. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
