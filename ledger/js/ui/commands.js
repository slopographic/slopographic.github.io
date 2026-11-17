// Slop Ledger commands, registered with SlopCmd (palette, remappable keys). Also wires every [data-cmd] button.
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const $ = (id) => document.getElementById(id);
  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered (again when the language changes)
  const GO = t('ledger.cmd.g_goto'), J = t('ledger.cmd.g_journal');
  const COMMANDS = [
    { id: 'view.journal', title: t('ledger.cmd.journal'), group: GO, run: () => NS.app.show('journal') },
    { id: 'view.gl', title: t('ledger.cmd.gl'), group: GO, run: () => NS.app.show('gl') },
    { id: 'view.trial', title: t('ledger.cmd.trial'), group: GO, run: () => NS.app.show('trial') },
    { id: 'view.accounts', title: t('ledger.cmd.accounts'), group: GO, run: () => NS.app.show('accounts') },
    { id: 'view.rates', title: t('ledger.cmd.rates'), group: GO, run: () => NS.app.show('rates') },
    { id: 'journal.new', title: t('ledger.cmd.new_entry'), group: J, run: () => { NS.app.show('journal'); setTimeout(() => $('jMemo').focus(), 40); } },
    { id: 'journal.export', title: t('ledger.cmd.export'), group: J, run: () => $('jExport').click() },
    { id: 'journal.importSie', title: t('ledger.cmd.sie'), group: J, run: () => { NS.app.show('journal'); NS.sieView.pick(); } },
    { id: 'trial.export', title: t('ledger.cmd.trial_export'), group: t('ledger.cmd.g_trial'), run: () => { NS.app.show('trial'); $('tExport').click(); } },
    { id: 'accounts.new', title: t('ledger.cmd.new_account'), group: t('ledger.cmd.g_accounts'), run: () => { NS.app.show('accounts'); setTimeout(() => $('aCode').focus(), 40); } },
    { id: 'rates.new', title: t('ledger.cmd.new_rate'), group: t('ledger.cmd.g_rates'), run: () => { NS.app.show('rates'); setTimeout(() => $('rForeign').focus(), 40); } },
    { id: 'view.bank', title: t('ledger.cmd.bank'), group: GO, run: () => NS.app.show('bank') },
    { id: 'view.fin', title: t('ledger.cmd.fin'), group: GO, run: () => NS.app.show('fin') },
    { id: 'bank.import', title: t('ledger.cmd.bank_import'), group: t('ledger.cmd.g_bank'), run: () => { NS.app.show('bank'); NS.bankPick(); } },
  ];
  const byId = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

  /** Runs a command through SlopCmd when it is loaded (recents and remapped keys apply), else directly. */
  function run(id) {
    if (g.SlopCmd && g.SlopCmd.get(id)) return g.SlopCmd.run(id);
    const c = byId[id];
    if (!c) return false;
    c.run();
    return true;
  }

  function init() {
    if (g.SlopCmd) {
      g.SlopCmd.init({ app: 'ledger' });
      const reg = () => g.SlopCmd.register(COMMANDS.map((c) => ({ id: c.id, title: c.title(), group: c.group(), keywords: [], keys: [], run: () => c.run() })));
      reg();
      if (g.SlopI18n) g.SlopI18n.on(reg);
      // the assistant's commands (shared/data/ai-records.js through shared/biz/biz.js), loaded when the AI panel first asks
      if (g.SlopCmd.provide) g.SlopCmd.provide({ prepare: () => g.SlopBiz.assistant('ledger') });
    }
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-cmd]');
      if (!el || el.disabled) return;
      e.preventDefault();
      run(el.dataset.cmd);
    });
  }

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
