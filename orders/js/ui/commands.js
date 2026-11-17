// Slop Orders commands, registered with SlopCmd (palette, remappable keys). Also wires [data-cmd] elements.
// Commands that act on the open order are only offered while the editor shows one (their `when`).
(function (g) {
  'use strict';
  const NS = (g.SlopOrders = g.SlopOrders || {});
  const E = () => NS.editor.state();
  const editing = () => E().open;

  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('orders.cmd.g_goto'), OS = t('orders.cmd.g_orders'), O = t('orders.cmd.g_order');
  const COMMANDS = [
    { id: 'view.list', title: t('orders.cmd.list'), group: GO, run: () => NS.app.go('list') },
    { id: 'view.data', title: t('orders.cmd.data'), group: GO, run: () => NS.app.go('data') },
    { id: 'orders.new', title: t('orders.cmd.new'), group: OS, keywords: ['add', 'create'], run: () => NS.app.go('new') },
    { id: 'orders.sample', title: t('orders.cmd.sample'), group: OS, keywords: ['test', 'demo', 'fake'], run: () => NS.sampleActions.quick() },
    { id: 'orders.samples', title: t('orders.cmd.samples'), group: OS, keywords: ['test', 'demo', 'batch'], run: () => NS.sampleActions.options() },
    { id: 'orders.deleteSamples', title: t('orders.cmd.del_samples'), group: OS, keywords: ['test', 'demo', 'clear'], run: () => NS.sampleActions.deleteAll() },
    { id: 'orders.save', title: t('orders.cmd.save'), group: O, when: () => editing() && E().status !== 'fulfilled' && E().status !== 'cancelled',
      run: () => NS.editor.save() },
    { id: 'orders.confirm', title: t('orders.cmd.confirm'), group: O, when: () => editing() && E().status === 'draft',
      run: () => NS.editor.confirm() },
    { id: 'orders.fulfil', title: t('orders.cmd.fulfil'), group: O, when: () => editing() && E().status === 'open',
      run: () => NS.editor.fulfil() },
    { id: 'orders.cancel', title: t('orders.cmd.cancel'), group: O, when: () => editing() && (E().status === 'draft' || E().status === 'open'),
      run: () => NS.editor.cancel() },
    { id: 'orders.convert', title: t('orders.cmd.convert'), group: O,
      when: () => editing() && ['open', 'fulfilled'].includes(E().status) && !E().invoiceId, run: () => NS.editor.convert() },
    { id: 'data.backup', title: t('orders.cmd.backup'), group: t('orders.cmd.g_data'), run: () => NS.dataActions.backup() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('orders', COMMANDS); }
  /** Runs a command by id (through SlopCmd when it is loaded). */
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
