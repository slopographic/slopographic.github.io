/* Slopculator side panels: the searchable history (kept per viewer) and the exchange rates (manual rates, and a note
 * about Slop Ledger's rates). Classic script. Exposes window.SlopCalcPanels: init({ pick, history, setHistory,
 * ratesChanged, status }), renderHistory(list), renderRates(). Rows are built with textContent, never innerHTML. */
(function () {
  'use strict';
  const R = window.SlopCalcRates;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  /* Looked up when used, because this script runs in the <head>, before the page's elements exist. */
  const els = () => ({ hist: $('sc-history'), none: $('sc-history-none'), q: $('sc-hq'), clear: $('sc-history-clear'),
    rateList: $('sc-rate-list'), rateForm: $('sc-rate-form'), ledger: $('sc-ledger-note') });
  let o = { pick() {}, history: () => [], setHistory() {}, ratesChanged() {}, status() {} };
  let shown = [];

  function renderHistory(list) {
    const el = els();
    const q = (el.q.value || '').trim().toLowerCase();
    shown = (list || []).filter((h) => !q || h.expr.toLowerCase().includes(q) || h.text.toLowerCase().includes(q));
    el.hist.replaceChildren(...shown.map((h) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sc-hist-item';
      const a = document.createElement('span'); a.className = 'sc-hist-expr'; a.textContent = h.expr;
      const v = document.createElement('span'); v.className = 'sc-hist-val'; v.textContent = '= ' + h.text;
      b.append(a, v);
      b.addEventListener('click', () => o.pick(h.expr));
      li.append(b);
      return li;
    }));
    el.none.hidden = shown.length > 0;
    el.none.textContent = t((o.history() || []).length ? 'calculator.hist.no_match' : 'calculator.hist.none');
    el.clear.disabled = !(o.history() || []).length;
  }

  function renderRates() {
    const el = els();
    el.ledger.textContent = R.ledgerReady()
      ? t('calculator.rates.ledger')
      : t('calculator.rates.no_ledger');
    const rows = R.manual();
    el.rateList.replaceChildren(...rows.map((r) => {
      const li = document.createElement('li');
      li.className = 'sc-rate-row';
      const s = document.createElement('span');
      s.textContent = `1 ${r.from} = ${Number(r.factor.toPrecision(10))} ${r.to}`;
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'sc-btn sc-small';
      d.textContent = t('calculator.rates.remove');
      d.setAttribute('aria-label', t('calculator.rates.remove_label', { from: r.from, to: r.to }));
      d.addEventListener('click', () => { R.removeManual(r.from, r.to); renderRates(); o.ratesChanged(); });
      li.append(s, d);
      return li;
    }));
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'sc-none';
      li.textContent = t('calculator.rates.none');
      el.rateList.append(li);
    }
  }

  function bindRateForm() {
    const el = els();
    el.rateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const from = $('sc-rate-from').value.trim().toUpperCase();
      const to = $('sc-rate-to').value.trim().toUpperCase();
      const f = Number($('sc-rate-factor').value);
      if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) { o.status(t('calculator.status.codes')); return; }
      if (!R.setManual(from, to, f)) { o.status(t('calculator.status.bad_rate')); return; }
      el.rateForm.reset();
      renderRates();
      o.status(t('calculator.status.rate_saved', { from, factor: String(f), to }));
      o.ratesChanged();
    });
  }

  function init(opts) {
    o = Object.assign(o, opts);
    const el = els();
    el.q.addEventListener('input', () => renderHistory(o.history()));
    el.clear.addEventListener('click', () => { o.setHistory([]); renderHistory([]); o.status(t('calculator.status.history_cleared')); });
    bindRateForm();
    renderRates();
  }

  window.SlopCalcPanels = { init, renderHistory: (list) => renderHistory(list), renderRates };
})();
