/* Slop Compare: the page's state, one object for the page, its panel, its commands and the tests.
 *   S.sides.a / S.sides.b   { name, type, file, text, drive }: a file (PDF, picture) or a text (typed, pasted or read from a
 *                           text file, then editable); drive: the Slop Drive id it came from
 *   S.opts                  the settings (core/compare.js OPTIONS), kept in this browser between visits
 *   S.result, S.error       the last comparison, or why it could not run; S.cur: the change shown (-1: none)
 *   S.open                  the folded runs opened by a click (their first row)
 *   filled(side), firstEmpty(), setSide(side, patch), clearSide(side), swap(), saveOpts(), on(fn) → off, changed() */
import { DEFAULTS, options } from '../core/compare.js';

const KEY = 'slop-diff:opts';
const blank = () => ({ name: '', type: '', file: null, text: '', drive: null });
function load() {
  try { return options(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { ...DEFAULTS }; }
}

export const S = { sides: { a: blank(), b: blank() }, opts: load(), result: null, error: '', cur: -1, open: new Set(), busy: false };
const fns = new Set();

export const on = (fn) => { fns.add(fn); return () => fns.delete(fn); };
export function changed(what = 'all') { for (const f of fns) { try { f(what); } catch (e) { console.error(e); } } }

export const filled = (k) => !!(S.sides[k].file || S.sides[k].text);
export const firstEmpty = () => (!filled('a') ? 'a' : !filled('b') ? 'b' : null);

export function setSide(k, patch) {
  S.sides[k] = Object.assign(blank(), patch);
  S.result = null; S.error = ''; S.cur = -1; S.open = new Set();
  changed('sides');
}
export const clearSide = (k) => setSide(k, {});
export function swap() {
  const a = S.sides.a;
  S.sides.a = S.sides.b; S.sides.b = a;
  S.result = null; S.cur = -1; S.open = new Set();
  changed('swap');
}
export function setOpts(patch) {
  S.opts = options({ ...S.opts, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(S.opts)); } catch (e) { /* private mode: kept for this visit */ }
  changed('opts');
}
export const isFile = (k) => !!S.sides[k].file;
