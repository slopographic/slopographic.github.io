/* Slop Workflows: the words of the tool in the page's language (shared/i18n, keys workflows.*). The tool is also mounted
 * on other apps' pages ("Run a workflow…", shared/ops/dialog.js) and in Node tests, where the workflows tables are not
 * loaded: there a key reads its English text, given at the call. Plurals: en as [other, one].
 *   tr(key, en, vars) → text     onLang(fn) → fn on every language change (nothing without SlopI18n)
 *   mark(key, { attr: key }) → props for h(): data-i18n / data-i18n-attr, so shared/i18n apply() follows a change */
const g = globalThis;

export function tr(key, en, vars) {
  const I = g.SlopI18n;
  if (I && I.has(key)) return I.t(key, vars);
  let s = Array.isArray(en) ? (vars && vars.n === 1 ? en[1] : en[0]) : en;
  if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (x in vars ? String(vars[x]) : m));
  return s;
}

export function onLang(fn) {
  if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(fn);
}

/** Props for h(): data-i18n (text) and data-i18n-attr (title, aria-label…) so marked elements change language by themselves. */
export function mark(key, attrs) {
  const o = {};
  if (key) o['data-i18n'] = key;
  if (attrs) o['data-i18n-attr'] = Object.entries(attrs).map(([a, k]) => `${a}:${k}`).join(';');
  return o;
}
