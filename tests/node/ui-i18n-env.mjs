// SlopI18n with the shared tables (the chrome strings.js / <code>.js, ui/<code>.js and the ui parts ui/<code>/*.js) for node
// tests of shared code, in English or another language, as a page has them. Not a test file itself.
//   withI18n(ctx, lang = 'en')  runs shared/i18n/i18n.js in a vm context (ctx.window === ctx) and adds the tables; returns ctx.SlopI18n
//   globalI18n(lang = 'en')     the same on globalThis, for ES modules and UMD scripts that read globalThis.SlopI18n
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
/** The table files of one language, in the order a page loads them. */
function tables(code) {
  const parts = existsSync(path.join(ROOT, 'shared/i18n/ui', code)) ? readdirSync(path.join(ROOT, 'shared/i18n/ui', code)).filter((f) => f.endsWith('.js')).sort().map((f) => `shared/i18n/ui/${code}/${f}`) : [];
  return [code === 'en' ? 'shared/i18n/strings.js' : `shared/i18n/${code}.js`, `shared/i18n/ui/${code}.js`, ...parts];
}
const files = (lang) => (lang === 'en' ? tables('en') : [...tables('en'), ...tables(lang)]);

export function withI18n(ctx, lang = 'en') {
  vm.runInContext(read('shared/i18n/i18n.js'), ctx, { filename: 'shared/i18n/i18n.js' });
  vm.runInContext(`window.SlopI18n = window.SlopI18n.create({ defaultLang: ${JSON.stringify(lang)}, profile: null });`, ctx);
  for (const f of files(lang)) vm.runInContext(read(f), ctx, { filename: f });
  return ctx.SlopI18n;
}

export function globalI18n(lang = 'en') {
  const had = 'window' in globalThis;
  if (!had) globalThis.window = globalThis;
  vm.runInThisContext(read('shared/i18n/i18n.js'), { filename: 'shared/i18n/i18n.js' });
  globalThis.SlopI18n = globalThis.SlopI18n.create({ defaultLang: lang, profile: null });
  for (const f of files(lang)) vm.runInThisContext(read(f), { filename: f });
  if (!had) delete globalThis.window;
  return globalThis.SlopI18n;
}
