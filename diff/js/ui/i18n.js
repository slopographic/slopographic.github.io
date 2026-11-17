/* Slop Compare: the page's words (shared/i18n SlopI18n; the tables are diff/i18n/<code>/*.js). ES module.
 *   t(key, vars)        the words in the page's language
 *   tr(key, en, vars)   the same, or the English given when the page has no tables (shared/ops/diff.js runs files.js on
 *                       other pages). core/render.js and core/kind.js take a tr: the page passes this one, the report none,
 *                       so the downloaded report stays in English
 *   onLang(fn)          fn after a language change */
const I = () => globalThis.SlopI18n;
export const t = (k, v) => (I() ? I().t(k, v) : k);
export const tr = (k, en, v) => (I() && I().has(k) ? I().t(k, v) : en);
export const onLang = (fn) => { if (I() && I().on) I().on(fn); };
/** Marks an element built by script with its key, so a language change rewrites it (SlopI18n.apply). */
export function mark(el, key, attr) {
  if (!el) return el;
  if (attr) el.dataset.i18nAttr = `${attr}:${key}`; else el.dataset.i18n = key;
  if (I()) { if (attr) el.setAttribute(attr, I().t(key)); else el.textContent = I().t(key); }
  return el;
}
