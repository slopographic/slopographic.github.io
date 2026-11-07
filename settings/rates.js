/* Settings page: the exchange rates section. The 'rates' consent switch, the opt-in ECB update, the add-a-rate form
 * and the table of recent rows. Classic script. Needs config.js, state.js and consent-mode.js first (the switch
 * writes the same record as the other switches), the shared/data scripts, shared/i18n/i18n.js and settings/say.js. Nothing is fetched except by the
 * Update button, or by "Update on open" when both it and the switch are on. */
(function () {
  'use strict';
  var D = window.SlopData;
  var C = window.SlopConsent;
  var S = window.SlopConsentState;
  var sw = document.getElementById('set-rates');
  var openSw = document.getElementById('set-rates-open');
  var btn = document.getElementById('rates-update');
  var status = document.getElementById('rates-status');
  var form = document.getElementById('rate-form');
  var base = document.getElementById('rate-base');
  var quote = document.getElementById('rate-quote');
  var date = document.getElementById('rate-date');
  var value = document.getElementById('rate-value');
  var noteIn = document.getElementById('rate-note');
  var msg = document.getElementById('rate-msg');
  var list = document.getElementById('rate-list');
  var settings = null;
  var I = window.SlopI18n, Say = window.SlopSettingsSay;

  function locale() { return (settings && settings.locale) || 'en-US'; }
  function rateText(scaled) {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(scaled / D.fx.ONE);
  }
  function setSelect(sel, values, current) {
    sel.textContent = '';
    values.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
    sel.value = current;
  }

  /** Switch, button and "Update on open" follow the consent record. */
  function syncSwitch() {
    var on = !!(C && C.state().rates);
    var avail = !!(S && S.available());
    sw.checked = on;
    sw.disabled = !avail;
    openSw.disabled = !on || !settings;
    openSw.checked = !!(settings && settings.ratesUpdateOnOpen);
    btn.disabled = !on;
    if (!avail) Say.key(status, 'settings.rates.no_storage');
    else if (!on) Say.key(status, 'settings.rates.off');
    else Say.text(status, '');
  }

  function renderTable() {
    return D.store.list('exchangeRates').then(function (r) {
      list.textContent = '';
      if (!r.ok) return;
      var rows = r.value.slice().sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return (b.createdAt || 0) - (a.createdAt || 0);
      }).slice(0, 20);
      if (!rows.length) {
        var empty = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = I.t('settings.rates.none');
        empty.appendChild(td);
        list.appendChild(empty);
        return;
      }
      rows.forEach(function (x) {
        var tr = document.createElement('tr');
        [x.base + '/' + x.quote, D.locale.formatDate(x.date, locale()), rateText(x.rate), x.source, x.note || ''].forEach(function (cell) {
          var td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        });
        list.appendChild(tr);
      });
    });
  }

  function describe(out) {
    var parts = [];
    if (out.added.length) {
      parts.push(out.added.map(function (a) {
        var v = { pair: 'EUR/' + a.quote, rate: rateText(a.rate) };
        if (a.previous) v.old = rateText(a.previous);
        return I.t(a.previous ? 'settings.rates.row_was' : 'settings.rates.row_new', v);
      }).join('; '));
    }
    if (out.unchanged.length) parts.push(I.t('settings.rates.unchanged', { n: out.unchanged.length }));
    return I.t('settings.rates.stored', { date: D.locale.formatDate(out.date, locale()), ref: D.locale.formatDate(out.referenceDate, locale()) }) + (parts.length ? ' ' + parts.join('. ') + '.' : '');
  }

  function update() {
    btn.disabled = true;
    Say.key(status, 'settings.rates.downloading');
    return D.rates.updateRates().then(function (r) {
      Say.text(status, r.ok ? describe(r.value) : r.message);
      return renderTable();
    }).then(function () { btn.disabled = !(C && C.state().rates); });
  }

  function saveSetting(patch) {
    if (!settings) return;
    D.store.put('settings', Object.assign({}, settings, patch)).then(function (r) {
      if (r.ok) settings = r.value; else Say.text(status, r.message);
      syncSwitch();
    });
  }

  sw.addEventListener('change', function () {
    if (!C) return;
    if (sw.checked) C.grant('rates'); else C.revoke('rates');
    syncSwitch(); // a refused save (storage blocked) puts the switch back
  });
  openSw.addEventListener('change', function () { saveSetting({ ratesUpdateOnOpen: openSw.checked }); });
  btn.addEventListener('click', update);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var rate = D.locale.parseRate(value.value);
    if (rate === null) { Say.key(msg, 'settings.rates.bad_rate'); return; }
    if (base.value === quote.value) { Say.key(msg, 'settings.rates.same_pair'); return; }
    D.fx.addRate({ base: base.value, quote: quote.value, date: date.value, rate: rate, source: 'manual', note: noteIn.value }).then(function (r) {
      if (!r.ok) { Say.text(msg, r.message); return; }
      Say.key(msg, 'settings.rates.saved', { pair: r.value.base + '/' + r.value.quote, rate: rateText(r.value.rate), date: D.locale.formatDate(r.value.date, locale()) });
      value.value = '';
      noteIn.value = '';
      renderTable();
    });
  });

  function start() {
    var codes = D.locale.currencies();
    setSelect(base, codes, 'EUR');
    setSelect(quote, codes, 'USD');
    date.value = D.ledger.today();
    return D.store.ready().then(function () { return D.store.get('settings', 'main'); }).then(function (r) {
      settings = r.ok ? r.value : null;
      syncSwitch();
      return renderTable();
    }).then(function () {
      if (!settings || !settings.ratesUpdateOnOpen) return null;
      Say.key(status, 'settings.rates.checking');
      return D.rates.updateOnOpen().then(function (r) {
        if (r.ok && r.value && r.value.date) { Say.text(status, describe(r.value)); return renderTable(); }
        Say.text(status, r.ok ? '' : r.message);
        return null;
      });
    });
  }

  start().catch(function () { Say.key(status, 'settings.rates.unreadable'); });
  I.on(function () { renderTable(); });   // the empty row's words (the status lines follow by their data-i18n mark)
  window.SlopRates = { sync: syncSwitch, refresh: renderTable };
})();
