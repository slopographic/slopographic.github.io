/* Slop Watermark: the one DOM lookup and the words (watermark/i18n, shared/i18n) the page's scripts share. Classic
 * script. Exposes window.WMUtil: $(id), t(key, vars) (English when the tables are missing), onLang(fn). */
(function () {
  'use strict';
  const I = () => window.SlopI18n;
  window.WMUtil = {
    $: (id) => document.getElementById(id),
    t: (k, v) => (I() ? I().t(k, v) : k),
    onLang: (fn) => { if (I() && I().on) I().on(fn); },
  };
})();
