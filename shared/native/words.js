/* The words of the iPhone and iPad app's files (shared/native/i18n: English and Swedish; other languages read English):
 * the shared tables through SlopI18n, or the English table alone on a page without it. Classic script; exposes
 * window.SlopNativeWords:
 *   ready()         resolves once the words are in (the chosen language's table registered and loaded)
 *   t(key, vars)    the word, {placeholders} filled; the key itself before ready()
 * Tests: tests/native/files.test.html. */
(function (g) {
  'use strict';
  if (g.SlopNativeWords) return;
  const base = ((g.document.currentScript || {}).src || '/shared/native/words.js').replace(/[^/]*$/, '');
  const own = {};
  let readyP = null;
  const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  function script(src) {
    return new Promise((res) => {
      const s = g.document.createElement('script');
      s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
      g.document.head.appendChild(s);
    });
  }
  function ready() {
    if (readyP) return readyP;
    const I = g.SlopI18n;
    if (I && I.source) readyP = (I.has && I.has('native.save_as') ? Promise.resolve() : script(base + 'i18n/index.js')).then(() => I.ready());
    else {
      // no SlopI18n on this page: the English table, read through a stand-in that keeps its words here
      readyP = (async () => {
        g.SlopI18n = { add: (code, table) => { if (code === 'en') Object.assign(own, table); } };
        try { await script(base + 'i18n/en/files.js'); } finally { delete g.SlopI18n; }
      })();
    }
    return readyP.catch(() => null);
  }
  function t(key, vars) {
    const I = g.SlopI18n;
    if (I && I.t && (!I.has || I.has(key))) return I.t(key, vars);
    return key in own ? fill(own[key], vars) : key;
  }
  g.SlopNativeWords = { ready, t };
})(window);
