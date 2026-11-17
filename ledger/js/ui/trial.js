// The Trial balance tab: base-currency totals per account with the check that debits equal credits, the foreign
// totals in their own currencies (not added to the base), and the CSV export.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  let last = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function render() {
    const s = await NS.util.settings();
    const money = (m, c) => NS.util.money(m, c, s.locale);
    const r = await S.ledger.trialBalance();
    const tb = r.ok ? r.value : r.summary || null;
    last = tb ? { tb, base: s.base } : null;
    if (!tb) {
      $('tCheck').textContent = t('ledger.tb.unread', { why: NS.util.refusal(r) });
      $('tRows').replaceChildren();
      return;
    }
    $('tRows').replaceChildren(...tb.rows.map((x) => el('tr', null,
      el('td', null, x.code), el('td', null, x.name), el('td', { class: 'num' }, x.debit ? money(x.debit, s.base) : ''),
      el('td', { class: 'num' }, x.credit ? money(x.credit, s.base) : ''), el('td', { class: 'num' }, money(x.balance, s.base)))));
    $('tDr').textContent = money(tb.debit, s.base);
    $('tCr').textContent = money(tb.credit, s.base);
    $('tCheck').textContent = r.ok
      ? t('ledger.tb.ok', { amount: money(tb.debit, s.base) })
      : t('ledger.tb.bad', { why: tb.errors.join(' ') });
    $('tCheck').className = r.ok ? 'note ok' : 'note msg';   // i18n-ignore: CSS class names and the stored supplier fallback
    const fx = tb.foreign || [];
    $('tForeign').hidden = fx.length === 0;
    $('tForeignRows').replaceChildren(...fx.map((f) => el('li', null,
      t('ledger.tb.foreign', { cur: f.currency, dr: NS.util.money(f.debit, f.currency, s.locale), cr: NS.util.money(f.credit, f.currency, s.locale), state: t(f.balanced ? 'ledger.tb.balanced' : 'ledger.tb.not_balanced') }))));
  }

  function mount() {
    $('tExport').addEventListener('click', () => {
      if (!last) { UI.toast(t('ledger.tb.nothing')); return; }
      const f = NS.csv.trialCsv(last.tb, last.base, NS.util.today());
      UI.download(f.blob, f.name);
    });
  }

  NS.views = NS.views || {};
  NS.views.trial = { mount, render };
})(typeof window !== 'undefined' ? window : globalThis);
