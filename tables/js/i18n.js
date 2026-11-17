/* Slop Tables: the app's words. The text lives in tables/i18n/<code>/<part>.js (shared/i18n/APPS-HOWTO.md); English is
 * the source of truth. t(key, vars) reads the chosen language, then English. onLang(fn) re-runs fn after a language
 * change, once the new tables are in (for UI built once). The modules without a DOM use t too: in Node, where there is
 * no SlopI18n, t returns the key (tests/node/tables-objects.test.mjs installs the English tables). */
const I = () => globalThis.SlopI18n;
export const t = (key, vars) => { const i = I(); return i ? i.t(key, vars) : key; };
export const onLang = (fn) => { const i = I(); return i && i.on ? i.on(fn) : () => {}; };
