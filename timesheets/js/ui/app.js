// Slop Timesheets boot: the business router (shared/biz/router.js) with the routes list, new, new/<id> (log the same work
// again today), t/<id> (one entry), bill and bill/<customer id>.
(function (g) {
  'use strict';
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});

  /** The route for a hash. */
  function parse(h) {
    if (h === 'bill' || h.startsWith('bill/')) return { view: 'bill', arg: h.slice(5) || null };
    if (h === 'new' || h.startsWith('new/')) return { view: 'edit', arg: null, copyOf: h.slice(4) || null };
    if (h.startsWith('t/') && h.length > 2) return { view: 'edit', arg: h.slice(2) };
    return { view: 'list' };
  }

  NS.state = { prefill: null };
  // An open entry is the panel on the right of the list, Save at its foot (shared/biz/panel.js)
  g.SlopBiz.panel.records({ app: 'timesheets', ns: NS, list: '#view-list', record: '#view-edit', view: 'edit', foot: ['#eSave', '#eCopy', '#eDelete'] });
  g.SlopBiz.router.start({ ns: NS, app: 'timesheets', parse, editLabel: (x) => (g.SlopI18n ? g.SlopI18n.t(x.arg ? 'timesheets.ed.entry' : 'timesheets.ed.log') : '') });
})(typeof window !== 'undefined' ? window : globalThis);
