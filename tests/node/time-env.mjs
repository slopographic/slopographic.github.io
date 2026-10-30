// Loads the classic pure scripts of time/js into a vm context, in order. Helper for time-zones.test.mjs.
// Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'time', 'js');
export const TIME_FILES = ['zones.js', 'work.js', 'convert.js', 'sync.js', 'timers.js'];

/** Returns window.SlopTime from a fresh context. */
export async function loadTime() {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  // SlopI18n with the English tables (time/i18n/en), so the sentences read as on the page
  const ROOT = path.join(JS, '..', '..');
  for (const f of ['shared/i18n/i18n.js', 'time/i18n/en/page.js', 'time/i18n/en/panels.js']) { vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); if (f === 'shared/i18n/i18n.js') vm.runInContext(PIN, ctx); }
  for (const f of TIME_FILES) vm.runInContext(await readFile(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopTime;
}
