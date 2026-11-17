// Slop CRM commands, registered with SlopCmd (palette, remappable keys). Also wires every [data-cmd] button.
(function (g) {
  'use strict';
  const NS = (g.SlopCrm = g.SlopCrm || {});
  const $ = (id) => document.getElementById(id);
  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('crm.cmd.g_goto'), CU = t('crm.cmd.g_customers');
  const COMMANDS = [
    { id: 'view.pipeline', title: t('crm.cmd.pipeline'), group: GO, run: () => NS.app.show('pipeline') },
    { id: 'view.customers', title: t('crm.cmd.customers'), group: GO, run: () => NS.app.show('customers') },
    { id: 'view.followups', title: t('crm.cmd.followups'), group: GO, run: () => NS.app.show('followups') },
    { id: 'customers.new', title: t('crm.cmd.new'), group: CU, run: () => NS.form.open(null) },
    { id: 'customers.search', title: t('crm.cmd.search'), group: CU, keywords: ['find', 'filter'],
      run: () => { NS.app.show('customers'); setTimeout(() => $('cSearch').focus(), 40); } },
    { id: 'customers.import', title: t('crm.cmd.import'), group: CU, run: () => NS.importUi.open() },
    { id: 'labels.tags', title: t('crm.cmd.tags'), group: CU, keywords: ['colour', 'color', 'merge'], run: () => NS.tagManager.open() },
    { id: 'labels.groups', title: t('crm.cmd.groups'), group: CU, keywords: ['filter', 'segment'], run: () => NS.groupsPanel.open() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('crm', COMMANDS); }
  /** Runs a command by id (through SlopCmd when it is loaded). */
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
