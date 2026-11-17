// The Repeating view: every repeating schedule (SlopList: customer and amount, how often, the next date, how many made),
// a row menu (make now, pause or resume, open the last invoice, delete), and Make due drafts. The Invoices list shows a
// notice when drafts are due (dueNotice). Drafts are made by SlopData.recurring.makeDue, in one transaction.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const R = () => S.recurring;
  const $ = (id) => document.getElementById(id);
  let list = null, names = new Map(), settings = null;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** The schedules, with the customers' names for the rows. */
  async function load() {
    const [s, c] = await Promise.all([S.store.list('schedules'), S.store.list('customers')]);
    names = new Map((c.ok ? c.value : []).map((x) => [x.id, x.name]));
    return s.ok ? s.value.sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1)) : [];
  }

  function row(x) {
    const due = R().dueDates(x, S.ledger.today()).dates.length;
    return { title: names.get(x.customerId) || t('invoices.rp.no_customer'), amount: U.money(x.total, x.currency, settings.locale), cls: x.active ? '' : 'is-void',
      meta: [x.active ? (due ? { chip: t('invoices.rp.due_n', { n: due }), cls: 'warn' } : { chip: t('invoices.rp.active'), cls: 'good' }) : { chip: t('invoices.rp.stopped'), cls: 'void' },
        R().describe(x), x.active ? t('invoices.rp.next', { date: x.nextDate }) : null, x.endDate ? t('invoices.rp.until', { date: x.endDate }) : null, t('invoices.rp.made', { n: x.made || 0 })] };
  }

  /** Makes the due drafts (all, or one schedule's), says how many, and redraws. */
  async function make(scheduleId) {
    const r = await R().makeDue(S.ledger.today(), { scheduleId });
    if (!r.ok) { UI.alert(t('invoices.rp.not_made'), U.refusal(r)); return; }
    const n = r.value.made.length;
    UI.toast(n ? t('invoices.rp.made_n', { n }) : t('invoices.rp.none_due'));
    await draw();
    await dueNotice();
    if (NS.views.list) NS.views.list.refresh();
  }

  async function setActive(x, on) {
    const r = await S.store.put('schedules', { ...x, active: on });
    if (!r.ok) UI.alert(t('invoices.rp.not_changed'), U.refusal(r)); else draw();
  }

  async function remove(x) {
    if (!(await UI.confirm(t('invoices.rp.stop_q'), t('invoices.rp.stop_body', { name: names.get(x.customerId) || t('invoices.rp.the_customer') }), t('invoices.rp.delete'), { danger: true }))) return;
    const r = await S.store.remove('schedules', x.id);
    if (!r.ok) UI.alert(t('invoices.rp.not_deleted'), U.refusal(r)); else draw();
  }

  function menuFor(x) {
    const items = [];
    if (x.active && R().dueDates(x, S.ledger.today()).dates.length) items.push({ label: t('invoices.rp.make'), act: () => make(x.id) });
    items.push(x.active ? { label: t('invoices.rp.pause'), act: () => setActive(x, false) } : { label: t('invoices.rp.resume'), act: () => setActive(x, true) });
    if (x.lastInvoiceId) items.push({ label: t('invoices.rp.open_last'), act: () => NS.app.go(`i/${x.lastInvoiceId}`) });
    if (x.sourceInvoiceId) items.push({ label: t('invoices.rp.open_source'), act: () => NS.app.go(`i/${x.sourceInvoiceId}`) });
    items.push({ label: t('invoices.rp.delete_dots'), act: () => remove(x) });
    return items;
  }

  async function draw() {
    if ($('view-repeat').hidden) return;
    settings = await U.settings();
    const all = await load();
    list.set(all);
    const due = R().due(all, S.ledger.today()).length;
    $('rMake').disabled = !due;
    $('rMake').textContent = due ? t('invoices.rp.make_n', { n: due }) : t('invoices.rp.nothing');
  }

  /** The Invoices list's notice when repeating invoices are due, with a button that makes them. */
  async function dueNotice() {
    const box = $('iDue');
    const due = R().due(await load(), S.ledger.today());
    box.hidden = !due.length;
    if (due.length) box.querySelector('span').textContent = t('invoices.rp.notice', { n: due.length });
  }

  function mount() {
    $('rMake').addEventListener('click', () => make());
    $('iDueMake').addEventListener('click', () => make());
    list = g.SlopList.mount($('rRows'), { label: 'invoices.rp.label', count: 'invoices.rp.count', summary: $('rSummary'),
      empty: 'invoices.rp.empty', row, menu: menuFor,
      open: (x) => NS.app.go(`i/${x.lastInvoiceId || x.sourceInvoiceId}`) });
  }

  NS.repeat = { make, draw, dueNotice, menuFor };
  NS.views = NS.views || {};
  NS.views.repeat = { mount, refresh: draw, onShow: draw };
})(typeof window !== 'undefined' ? window : globalThis);
