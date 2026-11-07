// Slop Expenses list: search, status and period filters, the count, and one row per expense (SlopList, shared/ui/list.js).
// A row opens the expense; its menu opens, copies (a new expense with the same details) or voids it.
(function (g) {
  'use strict';
  const S = g.SlopData, B = g.SlopBiz, UI = g.SlopUI;
  const NS = (g.SlopExpenses = g.SlopExpenses || {});
  const $ = (id) => document.getElementById(id);
  let list = null, all = [], settings = null, names = {};
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const METHOD = () => ({ bank: t('expenses.m.bank'), card: t('expenses.m.card'), cash: t('expenses.m.cash'), other: t('expenses.m.other') });

  /** The date range of a period choice, as YYYY-MM-DD ends (both included), counted from today. */
  function period(choice, today = new Date()) {
    const y = today.getFullYear(), m = today.getMonth(), iso = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
    if (choice === 'month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    if (choice === 'last') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    if (choice === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
    return {};
  }

  async function load() {
    const [r, s, accts] = await Promise.all([S.store.list('expenses'), B.settings(), B.expenseAccounts()]);
    all = r.ok ? r.value : [];
    settings = s;
    names = Object.fromEntries(accts.map((a) => [a.code, a.name]));
    if (!r.ok) $('xSummary').textContent = B.refusal(r);
  }

  function draw() {
    const shown = NS.core.filter(all, { search: $('xSearch').value, status: $('xStatus').value, ...period($('xPeriod').value) });
    list.set(shown);
    const live = shown.filter((e) => e.status === 'posted' || e.status === 'owed'), cur = settings.currency, m = (v) => B.money(v, cur, settings.locale);
    const same = live.every((e) => (e.currency || cur) === cur), owed = live.filter((e) => e.status === 'owed').reduce((sum, e) => sum + e.amount, 0);
    $('xTotal').textContent = live.length && same ? t('expenses.li.total', { amount: m(live.reduce((x, e) => x + e.amount, 0)) }) + (owed ? ' ' + t('expenses.li.to_pay', { amount: m(owed) }) : '') : '';
  }

  async function voidOne(e) {
    const yes = await UI.confirm(t('expenses.li.void_q'), t('expenses.li.void_body', { name: e.supplier, date: e.date }), t('expenses.li.void_q'), { danger: true });
    if (!yes) return;
    const r = await S.expenses.voidExpense(e.id);
    if (!r.ok) { UI.alert(t('expenses.li.not_voided'), B.refusal(r)); return; }
    UI.toast(t('expenses.li.voided', { name: e.supplier }));
    refresh();
  }

  /** A bill owed: To pay (due date), or Overdue once the due date has passed. */
  function owedChip(e) {
    if (e.status !== 'owed') return null;
    const late = S.expenses.overdue(e, S.ledger.today());
    return { chip: t(late ? 'expenses.li.overdue' : 'expenses.li.to_pay_chip') + (e.dueDate ? ' ' + t('expenses.li.due', { date: e.dueDate }) : ''), cls: late ? 'overdue' : 'draft' };
  }

  function menu(e) {
    const items = [{ label: t('expenses.li.open'), act: () => NS.app.go(`e/${e.id}`) }, { label: t('expenses.li.copy'), act: () => NS.app.go(`new/${e.id}`) }];
    if (e.status === 'owed') items.push({ label: t('expenses.li.pay'), act: () => NS.payDialog.open(e, refresh) });
    if (e.status === 'posted' || e.status === 'owed') items.push({ label: t('expenses.li.void'), act: () => voidOne(e) });
    return items;
  }

  function mount() {
    if (NS.mileageDialog) NS.mileageDialog.mount();   // Mileage… (ui/mileage.js)
    list = g.SlopList.mount($('xRows'), {
      label: 'expenses.li.label', count: 'expenses.li.count', summary: $('xSummary'),
      empty: 'expenses.li.empty',
      row: (e) => ({
        title: e.supplier + (e.description ? ` · ${e.description}` : ''),
        amount: B.money(e.amount, e.currency || settings.currency, settings.locale), cls: e.status === 'void' ? 'is-void' : '',
        meta: [e.date, names[e.account] || e.account, e.tax ? t('expenses.li.tax', { amount: B.money(e.tax, e.currency || settings.currency, settings.locale) }) : null,
          e.status === 'owed' ? null : METHOD()[e.method] || e.method, e.status === 'void' ? { chip: g.SlopBiz.statusText('void'), cls: 'void' } : null, owedChip(e), e.sample ? { chip: t('expenses.li.sample'), cls: 'warn' } : null],
      }),
      open: (e) => NS.app.go(`e/${e.id}`), menu,
    });
    for (const id of ['xSearch', 'xStatus', 'xPeriod']) $(id).addEventListener(id === 'xSearch' ? 'input' : 'change', draw);
    $('xNew').addEventListener('click', () => NS.app.go('new'));
  }

  async function refresh() { await load(); draw(); }

  NS.listView = { period, menu, voidOne };
  NS.views = NS.views || {};
  NS.views.list = { mount, show: refresh, refresh };
})(typeof window !== 'undefined' ? window : globalThis);
