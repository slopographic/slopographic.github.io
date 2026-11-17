// The Accounts tab: the chart of accounts. Add an account (four-digit code, name, type) and rename one.
// Codes and types do not change, and accounts are never deleted.
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const UI = g.SlopUI;
  const el = UI.el;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const TYPE = () => ({ asset: t('ledger.type.asset'), liability: t('ledger.type.liability'), equity: t('ledger.type.equity'), revenue: t('ledger.type.revenue'), expense: t('ledger.type.expense') });

  function rename(a) {
    UI.prompt(t('ledger.ac.rename_q'), t('ledger.ac.name_for', { code: a.code }), a.name, { ok: t('ledger.ac.rename') }).then(async (name) => {
      if (name === null) return;
      const r = await NS.accounts.rename(a.code, name);
      UI.toast(r.ok ? t('ledger.ac.renamed') : NS.util.refusal(r));
    });
  }

  async function render() {
    const r = await NS.util.accounts();
    if (!r.ok) { $('aRows').replaceChildren(el('tr', null, el('td', { colspan: 4, class: 'msg' }, NS.util.refusal(r)))); return; }
    $('aRows').replaceChildren(...r.value.map((a) => el('tr', { 'data-code': a.code, 'data-name': a.name },
      el('td', null, a.code), el('td', null, a.name), el('td', null, TYPE()[a.type] || a.type),
      el('td', null, el('button', { type: 'button', class: 'btn small', 'aria-label': t('ledger.ac.rename_code', { code: a.code }), onclick: () => rename(a) }, t('ledger.ac.rename'))))));   // i18n-ignore: CSS class names and the stored supplier fallback
  }

  function mount() {
    $('aType').replaceChildren(...NS.accounts.TYPES.map((x) => el('option', { value: x }, TYPE()[x] || x)));
    $('aAdd').addEventListener('click', async () => {
      const r = await NS.accounts.add({ code: $('aCode').value, name: $('aName').value, type: $('aType').value });
      $('aMsg').textContent = r.ok ? '' : NS.util.refusal(r);
      if (r.ok) { UI.toast(t('ledger.ac.added', { code: r.value.code })); $('aCode').value = ''; $('aName').value = ''; }
    });
    g.SlopCtx.bind($('aRows'), (target) => {
      const tr = target && target.closest && target.closest('tr[data-code]');
      return tr ? [{ label: t('ledger.ac.rename_dots'), act: () => rename({ code: tr.dataset.code, name: tr.dataset.name }) }] : null;
    });
  }

  NS.views = NS.views || {};
  NS.views.accounts = { mount, render };
})(typeof window !== 'undefined' ? window : globalThis);
