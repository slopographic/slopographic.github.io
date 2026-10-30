// Slop Expenses boot: the business router (shared/biz/router.js) with the expense routes: list, new, new/<id> (a copy of
// one), e/<id> (one expense) and summary.
(function (g) {
  'use strict';
  const NS = (g.SlopExpenses = g.SlopExpenses || {});

  /** The route for a hash. */
  function parse(h) {
    if (h === 'summary') return { view: 'summary' };
    if (h === 'new' || h.startsWith('new/')) return { view: 'edit', arg: null, copyOf: h.slice(4) || null };
    if (h.startsWith('e/') && h.length > 2) return { view: 'edit', arg: h.slice(2) };
    return { view: 'list' };
  }

  // An open expense is the panel on the right of the list, Record expense (or Mark as paid…) at its foot (shared/biz/panel.js)
  g.SlopBiz.panel.records({ app: 'expenses', ns: NS, list: '#view-list', record: '#view-edit', view: 'edit', foot: ['#eRecord', '#eCopy', '#ePay', '#eVoid'] });
  g.SlopBiz.router.start({ ns: NS, app: 'expenses', parse, editLabel: (x) => (g.SlopI18n ? g.SlopI18n.t(x.arg ? 'expenses.page.expense' : 'expenses.ed.new') : '') });
})(typeof window !== 'undefined' ? window : globalThis);
