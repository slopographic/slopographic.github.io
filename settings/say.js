/* Settings: the status lines under each section. A line said from a key is marked data-i18n (and data-i18n-vars), so
 * SlopI18n.apply() puts it in the new language on a switch; text from elsewhere (an error from the data layer or the
 * browser) is shown as given and unmarked. Classic script; needs shared/i18n/i18n.js. */
(function () {
  'use strict';
  var I = window.SlopI18n;
  /** Shows the text of key (with vars) in node and keeps it following the language. */
  function key(node, k, vars) {
    if (!node) return;
    node.setAttribute('data-i18n', k);
    if (vars) node.setAttribute('data-i18n-vars', JSON.stringify(vars)); else node.removeAttribute('data-i18n-vars');
    node.textContent = I.t(k, vars);
  }
  /** Shows plain text in node (no key: it stays as it is on a switch). */
  function text(node, s) {
    if (!node) return;
    node.removeAttribute('data-i18n');
    node.removeAttribute('data-i18n-vars');
    node.textContent = s || '';
  }
  window.SlopSettingsSay = { key: key, text: text };
})();
