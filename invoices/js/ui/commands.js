// Slop Invoices commands, registered with SlopCmd (palette, remappable keys). Also wires [data-cmd] elements.
// Commands that act on the open invoice are only offered while the editor shows one (their `when`).
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const E = () => NS.editor.state();

  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('invoices.cmd.g_goto'), IS = t('invoices.cmd.g_invoices'), I = t('invoices.cmd.g_invoice'), DATA = t('biz.cmd.g_data');
  const COMMANDS = [
    { id: 'view.list', title: t('invoices.cmd.list'), group: GO, run: () => NS.app.go('list') },
    { id: 'view.data', title: t('invoices.cmd.data'), group: GO, run: () => NS.app.go('data') },
    { id: 'invoices.new', title: t('invoices.cmd.new'), group: IS, keywords: ['add', 'create'], run: () => NS.app.go('new') },
    { id: 'invoices.fromOrder', title: t('invoices.cmd.from_order'), group: IS, keywords: ['convert'], run: () => NS.listView.fromOrder() },
    { id: 'invoices.sample', title: t('invoices.cmd.sample'), group: IS, keywords: ['test', 'demo', 'fake'], run: () => NS.sampleActions.quick() },
    { id: 'invoices.samples', title: t('invoices.cmd.samples'), group: IS, keywords: ['test', 'demo', 'batch'], run: () => NS.sampleActions.options() },
    { id: 'invoices.deleteSamples', title: t('invoices.cmd.del_samples'), group: IS, keywords: ['test', 'demo', 'clear'], run: () => NS.sampleActions.deleteAll() },
    { id: 'invoice.save', title: t('invoices.cmd.save'), group: I, when: () => E().open && E().status === 'draft', run: () => NS.editor.save() },
    { id: 'invoice.issue', title: t('invoices.cmd.issue'), group: I,
      when: () => E().open && E().status === 'draft', run: () => NS.editor.issue() },
    { id: 'invoice.payment', title: t('invoices.cmd.payment'), group: I,
      when: () => E().open && E().status === 'issued', run: () => NS.editor.state().open && NS.paymentDialog.open(NS.editor.id(), () => NS.editor.open(NS.editor.id())) },
    { id: 'invoice.void', title: t('invoices.cmd.void'), group: I,
      when: () => E().open && E().status === "issued" && E().payments === 0, run: () => NS.editor.voidInvoice() },
    { id: 'invoice.preview', title: t('invoices.cmd.preview'), group: I, when: () => E().open && !E().isNew, run: () => NS.editor.preview() },
    { id: 'invoice.pdf', title: t('invoices.cmd.pdf'), group: I, when: () => E().open && !E().isNew, run: () => NS.preview.pdf(NS.editor.id()) },
    { id: 'data.backup', title: t('invoices.cmd.backup'), group: DATA, run: () => NS.dataActions.backup() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('invoices', COMMANDS); }
  /** Runs a command by id (through SlopCmd when it is loaded). */
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
