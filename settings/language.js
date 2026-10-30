/* Settings: the Language picker in the Appearance section. A choice is saved through SlopI18n and applies at once on this
 * page. Classic script. Needs shared/i18n/i18n.js (and its strings) loaded first. */
(function () {
  'use strict';
  var I = window.SlopI18n;
  var select = document.getElementById('lang-select');
  var note = document.getElementById('lang-note');
  if (!I || !select) return;
  var store = !!(window.SlopNative && window.SlopNative.isStoreApp && window.SlopNative.isStoreApp());

  function render() {
    select.textContent = '';
    I.langs().forEach(function (l) {
      var o = document.createElement('option');
      o.value = l.code;
      // each in its own name; a table without a native review yet says so (LANGS quality: 'beta'), except in the
      // iPhone/iPad app, which shows no beta labels (shared/native-app.js)
      o.textContent = l.quality === 'beta' && !store ? I.t('settings.lang.beta', { name: l.name }) : l.name;
      if (l.en) o.title = l.en;
      o.lang = l.code;
      select.appendChild(o);
    });
    select.value = I.get();
  }
  select.addEventListener('change', function () {
    var code = select.value;
    var r = I.set(code);
    select.value = I.get();
    var name = (I.langs().filter(function (l) { return l.code === code; })[0] || {}).name || code;
    note.textContent = r.ok ? I.t('settings.language_saved', { name: name }) : r.error;
  });
  render();
  I.on(render);   // the (beta) tag follows a language switch
  window.addEventListener('slop-lang', () => { select.value = I.get(); });   // chosen in the header's language menu
})();
