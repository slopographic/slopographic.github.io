// Loads Slop Projects' pure scripts (and SlopTime, shared/calendar/tz.js) into one vm context. Helper for the
// projects-*.test.mjs files; not a test itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const PIN = "window.SlopI18n = window.SlopI18n.create({ defaultLang: 'en', profile: null });";   // English in any build (a white-label build may choose another language first)

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FILES = ['shared/calendar/tz.js', 'projects/js/core/board.js', 'projects/js/core/deps.js', 'projects/js/core/bars.js', 'projects/js/core/io.js', 'projects/js/core/sample.js'];

/** window.SlopProjects (with board, deps, bars, io, sample) and SlopTime from a fresh context. */
export async function load() {
  const ctx = { TextEncoder };
  ctx.window = ctx;
  vm.createContext(ctx);
  // SlopI18n with the English tables (projects/i18n/en), so messages read as on the page
  const en = (await readdir(path.join(ROOT, 'projects/i18n/en'))).map((f) => `projects/i18n/en/${f}`);
  for (const f of ['shared/i18n/i18n.js', ...en, ...FILES]) { vm.runInContext(await readFile(path.join(ROOT, f), 'utf8'), ctx, { filename: f }); if (f === 'shared/i18n/i18n.js') vm.runInContext(PIN, ctx); }
  return { P: ctx.SlopProjects, T: ctx.SlopTime };
}

/** Plain copy, so values made in the vm context compare equal to host values. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
