// Slop Expenses: Mark as paid… for a bill that is owed (SlopData.expenses.pay): the date it was paid and how. Used by the
// list's row menu and by the expense's own page. Exposes SlopExpenses.payDialog.open(expense, onDone).
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI, el = UI.el;
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  async function open(e, onDone) {
    const s = await B.settings();
    const date = el('input', { type: 'date', value: S.ledger.today(), min: e.date });
    const method = UI.select([['bank', t('expenses.m.bank')], ['card', t('expenses.m.card')], ['cash', t('expenses.m.cash')], ['other', t('expenses.m.other')]], 'bank');
    const msg = el('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: CSS class names
    UI.dialog({
      title: t('expenses.pay.title'),
      body: el('div', null, el('p', { class: 'note' }, `${e.supplier} · ${B.money(e.amount, e.currency || s.currency, s.locale)}` + (e.dueDate ? ' ' + t('expenses.li.due', { date: e.dueDate }) : '')),
        UI.field(t('expenses.pay.paid_on'), date), UI.field(t('expenses.pay.paid_by'), method), msg),
      buttons: [{ label: t('expenses.pay.cancel') }, { label: t('expenses.pay.title'), primary: true, act: async () => {
        const r = await S.expenses.pay(e.id, { date: date.value, method: method.value });
        if (!r.ok) { msg.textContent = B.refusal(r); return false; }
        UI.toast(t('expenses.pay.done', { name: e.supplier }));
        if (onDone) onDone(r.value);
        return undefined;
      } }],
    });
  }

  NS.payDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
