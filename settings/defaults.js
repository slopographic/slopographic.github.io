/* Settings page: the defaults the data layer uses (base currency and locale), kept in the settings record of
 * shared/data. Classic script. Needs the shared/data scripts, shared/i18n/i18n.js and settings/say.js loaded first. Changes save
 * at once. */
(function () {
  'use strict';
  var D = window.SlopData;
  var cur = document.getElementById('set-currency');
  var loc = document.getElementById('set-locale');
  var note = document.getElementById('defaults-note');
  var rec = null;
  var I = window.SlopI18n, Say = window.SlopSettingsSay;
  var LOCALES = ['en-US', 'en-GB', 'en-CA', 'en-AU', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'nl-NL', 'pt-BR', 'sv-SE', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-CN', 'hi-IN'];

  function names(locale) {
    try { return new Intl.DisplayNames([locale], { type: 'currency' }); } catch (e) { return null; }
  }
  function fill(select, values, current, label) {
    select.textContent = '';
    var list = values.slice();
    if (current && list.indexOf(current) < 0) list.unshift(current);
    list.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      o.textContent = label ? label(v) : v;
      select.appendChild(o);
    });
    select.value = current || '';
  }
  function render() {
    var locale = (rec && rec.locale) || 'en-US';
    var dn = names(locale);
    fill(cur, D.locale.currencies(), rec && rec.defaultCurrency, function (c) {
      var n = dn ? dn.of(c) : '';
      return n && n !== c ? c + ' · ' + n : c;
    });
    fill(loc, LOCALES, locale);
    cur.disabled = loc.disabled = !rec;
  }
  /** Saves one field of the settings record. On a refusal (for example, base currency locked) the select goes back. */
  function save(patch, okKey) {
    if (!rec) return;
    D.store.put('settings', Object.assign({}, rec, patch)).then(function (r) {
      if (!r.ok) {
        Say.text(note, r.message);
        render();
        return;
      }
      rec = r.value;
      var ok = okKey(rec);
      Say.key(note, ok[0], ok[1]);
      render();
    });
  }

  function load() {
    return D.store.ready().then(function () { return D.store.get('settings', 'main'); }).then(function (r) {
      rec = r.ok ? r.value : null;
      render();
      if (!rec) Say.key(note, 'settings.defaults.unreadable');
      return rec;
    });
  }

  cur.addEventListener('change', function () {
    save({ defaultCurrency: cur.value }, function (r) {
      return ['settings.defaults.currency_saved', { code: r.defaultCurrency }];
    });
  });
  loc.addEventListener('change', function () {
    save({ locale: loc.value }, function (r) {
      return ['settings.defaults.locale_saved', { locale: r.locale }];
    });
  });

  load().catch(function () { Say.key(note, 'settings.defaults.unreadable'); });
  window.SlopDefaults = { load: load, get: function () { return rec; } };
})();
