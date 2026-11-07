// The Rates tab: manual exchange rates, the stored rows, and the opt-in ECB update. A row reads
// "1 EUR = 1.0842 USD" (the foreign currency, then the base currency). Rows are never edited: a correction is a new row.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function render() {
    const s = await NS.util.settings();
    $('rBase').textContent = s.base;
    $('rRate').placeholder = S.money.typedPlain('1.0842');   // the example in the page language's decimal mark
    const r = await NS.rates.list();
    $('rRows').replaceChildren(...(r.ok ? r.value : []).map((x) => el('tr', null,
      el('td', null, S.locale.formatDate(x.date, s.locale)), el('td', null, `1 ${x.base} = ${(x.rate / 1e6).toFixed(6)} ${x.quote}`),
      el('td', null, x.source), el('td', null, x.note || ''))));
    $('rEmpty').hidden = r.ok && r.value.length > 0;
    $('rOnline').checked = NS.rates.onlineAllowed();
  }

  async function add() {
    const s = await NS.util.settings();
    const r = await NS.rates.addManual({ foreign: $('rForeign').value, base: s.base, rateText: $('rRate').value, date: $('rDate').value, note: $('rNote').value });
    $('rMsg').textContent = r.ok ? '' : NS.util.refusal(r);
    if (r.ok) { UI.toast(t('ledger.rt.added')); $('rRate').value = ''; $('rNote').value = ''; }
  }

  async function fetchOnline() {
    $('rMsg').textContent = '';
    const r = await NS.rates.updateOnline();
    if (!r.ok) { $('rMsg').textContent = NS.util.refusal(r); return; }
    UI.toast(t('ledger.rt.stored', { n: r.value.added.length, date: r.value.referenceDate }));
  }

  function mount() {
    $('rDate').value = NS.util.today();
    $('rAdd').addEventListener('click', add);
    $('rOnline').addEventListener('change', (e) => { NS.rates.setOnline(e.target.checked); });
    $('rFetch').addEventListener('click', fetchOnline);
    $('rCurList').replaceChildren(...S.locale.currencies().map((c) => el('option', { value: c })));
  }

  NS.views = NS.views || {};
  NS.views.rates = { mount, render };
})(typeof window !== 'undefined' ? window : globalThis);
