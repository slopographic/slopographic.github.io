// Slop Purchases commands, registered with SlopCmd (palette, remappable keys). Also wires [data-cmd] elements. Commands that
// act on the open purchase order are only offered while the editor shows one (their `when`).
(function (g) {
  'use strict';
  const NS = (g.SlopPurchases = g.SlopPurchases || {});
  const E = () => NS.editor.state();
  const editing = () => E().open && !E().isNew;

  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('purchases.cmd.g_goto'), PS = t('purchases.cmd.g_purchases'), PO = t('purchases.cmd.g_po');
  const COMMANDS = [
    { id: 'view.list', title: t('purchases.cmd.list'), group: GO, run: () => NS.app.go('list') },
    { id: 'view.data', title: t('purchases.cmd.data'), group: GO, run: () => NS.app.go('data') },
    { id: 'purchases.new', title: t('purchases.cmd.new'), group: PS, keywords: ['add', 'buy', 'supplier', 'po'], run: () => NS.app.go('new') },
    { id: 'purchases.save', title: t('purchases.cmd.save'), group: PO, when: () => E().open && (E().status === 'draft' || E().status === 'ordered'), run: () => NS.editor.save() },
    { id: 'purchases.place', title: t('purchases.cmd.place'), group: PO, when: () => editing() && E().status === 'draft', run: () => NS.editor.place() },
    { id: 'purchases.receive', title: t('purchases.cmd.receive'), group: PO, when: () => editing() && E().status === 'ordered', run: () => NS.editor.receive() },
    { id: 'purchases.bill', title: t('purchases.cmd.bill'), group: PO, keywords: ['expense', 'invoice'],
      when: () => editing() && (E().status === 'ordered' || E().status === 'received') && !E().billed, run: () => NS.editor.bill() },
    { id: 'purchases.pdf', title: t('purchases.cmd.pdf'), group: PO, when: editing, run: () => NS.editor.exportPdf() },
    { id: 'data.backup', title: t('purchases.cmd.backup'), group: t('purchases.cmd.g_data'), run: () => NS.dataActions.backup() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('purchases', COMMANDS); }
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
