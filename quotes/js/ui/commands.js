// Slop Quotes commands, registered with SlopCmd (palette, remappable keys). Also wires [data-cmd] elements. Commands that
// act on the open quote are only offered while the editor shows one (their `when`).
(function (g) {
  'use strict';
  const NS = (g.SlopQuotes = g.SlopQuotes || {});
  const E = () => NS.editor.state();
  const editing = () => E().open && !E().isNew;
  const open = () => editing() && (E().status === 'draft' || E().status === 'sent');

  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('quotes.cmd.g_goto'), QS = t('quotes.cmd.g_quotes'), Q = t('quotes.cmd.g_quote');
  const COMMANDS = [
    { id: 'view.list', title: t('quotes.cmd.list'), group: GO, run: () => NS.app.go('list') },
    { id: 'view.data', title: t('quotes.cmd.data'), group: GO, run: () => NS.app.go('data') },
    { id: 'quotes.new', title: t('quotes.cmd.new'), group: QS, keywords: ['add', 'create', 'estimate'], run: () => NS.app.go('new') },
    { id: 'quotes.save', title: t('quotes.cmd.save'), group: Q, when: () => E().open && (E().status === 'draft' || E().status === 'sent'), run: () => NS.editor.save() },
    { id: 'quotes.send', title: t('quotes.cmd.send'), group: Q, when: () => editing() && E().status === 'draft', run: () => NS.editor.send() },
    { id: 'quotes.order', title: t('quotes.cmd.order'), group: Q, keywords: ['accept', 'convert'],
      when: () => editing() && E().status !== 'declined' && !E().converted, run: () => NS.editor.toOrder() },
    { id: 'quotes.invoice', title: t('quotes.cmd.invoice'), group: Q, keywords: ['accept', 'convert', 'bill'],
      when: () => editing() && E().status !== 'declined' && !E().converted, run: () => NS.editor.toInvoice() },
    { id: 'quotes.decline', title: t('quotes.cmd.decline'), group: Q, when: open, run: () => NS.editor.decline() },
    { id: 'quotes.pdf', title: t('quotes.cmd.pdf'), group: Q, when: editing, run: () => NS.editor.exportPdf() },
    { id: 'data.backup', title: t('quotes.cmd.backup'), group: t('quotes.cmd.g_data'), run: () => NS.dataActions.backup() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('quotes', COMMANDS); }
  /** Runs a command by id (through SlopCmd when it is loaded). */
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
