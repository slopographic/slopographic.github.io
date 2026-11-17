// "Repeat…": makes a repeating schedule from a saved invoice (SlopData.recurring.fromInvoice): every N weeks or months,
// from a first date (default: one period after the invoice), with an optional end date and the payment terms for due dates.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const h = U.h;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** Opens the dialog for an invoice id. onDone(schedule) runs after the schedule is stored. */
  async function open(invoiceId, onDone) {
    const got = await S.store.get('invoices', invoiceId);
    if (!got.ok || !got.value) { UI.alert(t('invoices.li.not_available'), got.ok ? t('invoices.rd.gone') : U.refusal(got)); return; }
    const inv = got.value, s = await U.settings();
    const every = h('input', { type: 'number', min: 1, max: 36, value: 1, inputmode: 'numeric' });
    const unit = UI.select([['month', t('invoices.rd.months')], ['week', t('invoices.rd.weeks')]], 'month');
    const start = h('input', { type: 'date', value: S.recurring.step(inv.date, 1, 'month') });
    const end = h('input', { type: 'date' });
    const msg = h('p', { class: 'msg bad', role: 'status' });   // i18n-ignore: CSS class names
    unit.addEventListener('change', () => { start.value = S.recurring.step(inv.date, Number(every.value) || 1, unit.value); });
    const body = h('div', null,
      h('p', { class: 'note', text: t('invoices.rd.note', { number: inv.number || t('invoices.rd.this_draft') }) }),
      h('div', { class: 'inline' }, UI.field(t('invoices.rd.every'), every), UI.field(t('invoices.rd.period'), unit)),
      UI.field(t('invoices.rd.first'), start), UI.field(t('invoices.rd.last'), end), msg);
    UI.dialog({
      title: t('invoices.rd.title'),
      body,
      buttons: [{ label: t('invoices.li.cancel') }, {
        label: t('invoices.rd.repeat'), primary: true,
        act: async () => {
          const n = Number(every.value);
          if (!Number.isInteger(n) || n < 1 || n > 36) { msg.textContent = t('invoices.rd.bad_every'); return false; }
          if (!start.value) { msg.textContent = t('invoices.rd.no_start'); return false; }
          const r = await S.recurring.fromInvoice(invoiceId, { every: n, unit: unit.value, start: start.value, endDate: end.value || undefined, dueDays: s.paymentTermsDays });
          if (!r.ok) { msg.textContent = U.refusal(r); return false; }
          UI.toast(t('invoices.rd.done', { how: S.recurring.describe(r.value), date: r.value.nextDate }));
          if (onDone) onDone(r.value);
          return undefined;
        },
      }],
    });
  }

  NS.repeatDialog = { open };
})(typeof window !== 'undefined' ? window : globalThis);
