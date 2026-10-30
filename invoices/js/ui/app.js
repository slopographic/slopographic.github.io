// Slop Invoices boot: the shared document routes (shared/docs/doc-app.js: list, new, i/<id>, data) plus p/<id>, the print
// view, s/<customer id> (a customer statement), c/<credit note id> (a credit note to print) and repeat (the repeating schedules). An open invoice, its print view and a
// statement show the record bar (SlopBiz.docbar: back, number, status and Print; Save is in the record panel's footer); the tabs stay Invoices, Repeating and
// Data. The list beside an open invoice marks its row; the menu bar has New invoice.
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const $ = (id) => document.getElementById(id);

  /** The print view's route, p/<id>. */
  const more = (h) => (h === 'repeat' ? { view: 'repeat' } : h.startsWith('p/') && h.length > 2 ? { view: 'print', arg: h.slice(2) }
    : h.startsWith('s/') && h.length > 2 ? { view: 'statement', arg: h.slice(2) } : h.startsWith('c/') && h.length > 2 ? { view: 'credit', arg: h.slice(2) } : null);

  /** After a view shows: on the list, the repeating invoices that are due (the list beside an open invoice is redrawn by
   *  shared/docs/doc-app.js). */
  function after(t) {
    if (t.view === 'list') NS.repeat.dueNotice();
  }

  /** The menu bar's New invoice, and the record bar's Save (a draft open) and Print (an invoice open or its print view). */
  function mount() {
    // The open invoice's bar (shared/biz/docbar.js): back to the list, its number and status, and Print. Save is the record
    // panel's (shared/biz/panel.js: its footer, with Issue…); #tbSave stays for File › Save.
    g.SlopBiz.docbar.mount({ views: ['edit', 'print'], actions: ['#tbPrint'] });
    $('tbNew').addEventListener('click', () => NS.app.go('new'));
    $('tbSave').addEventListener('click', () => NS.editor.save());
    $('tbPrint').addEventListener('click', () => (NS.state.view === 'edit' ? NS.editor.preview() : window.print()));
  }

  // a tab click or the tab keys route through the #hash; the print tab stays on its invoice
  const tabRoute = (n) => (n === 'edit' ? NS.editor.route() : n === 'print' || n === 'statement' || n === 'credit' ? location.hash.slice(1) : n);

  g.SlopDocs.docApp.start({ ns: NS, app: 'invoices', route: 'i', noun: 'invoice', more, after, mount, tabRoute });
})(typeof window !== 'undefined' ? window : globalThis);
