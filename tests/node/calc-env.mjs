// Loads the classic pure scripts of shared/calc into a vm context, in order. Helper for calc-parser.test.mjs.
// Not a test file itself.
import vm from 'node:vm';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withI18n } from './ui-i18n-env.mjs';

const JS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'calc');
export const CALC_FILES = ['lexer.js', 'exact.js', 'units.js', 'dates.js', 'parser.js', 'evaluate.js', 'format.js', 'calc.js', 'graph.js'];

/** Returns window.SlopCalc from a fresh context, with SlopI18n in a language (its messages: shared/i18n/ui/<code>/calc.js). */
export async function loadCalc(lang = 'en') {
  const ctx = {};
  ctx.window = ctx;
  vm.createContext(ctx);
  withI18n(ctx, lang);
  for (const f of CALC_FILES) vm.runInContext(await readFile(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx.SlopCalc;
}
