/* Slop Transcribe: the app's words from its tables (transcribe/i18n, shared/i18n/APPS-HOWTO.md). tr(key, english, vars)
 * reads the key in the current language, or fills the English given when the tables are absent (a test that imports a
 * module alone), so a key never shows. */
export function tr(key, en, vars) {
  const I = globalThis.SlopI18n;
  if (I && I.has && I.has(key)) return I.t(key, vars);
  return vars ? String(en).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : en;
}
/** Calls fn after each language change (once the new tables are in); nothing without SlopI18n. */
export const onLang = (fn) => (globalThis.SlopI18n && globalThis.SlopI18n.on ? globalThis.SlopI18n.on(fn) : () => {});
