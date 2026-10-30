// Slop Inventory commands, registered with SlopCmd (palette, remappable keys). Every main action is here: scan mode,
// receive, sell, adjust, transfer, start and post a count, undo the last scan, products, data. Also wires [data-cmd].
(function (g) {
  'use strict';
  const NS = (g.SlopInv = g.SlopInv || {});

  const t = (k) => () => (g.SlopI18n ? g.SlopI18n.t(k) : k);   // read when the commands are registered
  const GO = t('inventory.cmd.g_goto'), SC = t('inventory.cmd.g_scan'), ST = t('inventory.cmd.g_stock'), CT = t('inventory.cmd.g_count'), PR = t('inventory.cmd.g_products');
  const COMMANDS = [
    { id: 'view.products', title: t('inventory.cmd.products'), group: GO, run: () => NS.app.show('products') },
    { id: 'view.scan', title: t('inventory.cmd.scan'), group: GO, run: () => NS.app.show('scan') },
    { id: 'view.stock', title: t('inventory.cmd.stock'), group: GO, run: () => NS.app.show('stock') },
    { id: 'view.count', title: t('inventory.cmd.count'), group: GO, run: () => NS.app.show('count') },
    { id: 'view.reports', title: t('inventory.cmd.reports'), group: GO, run: () => NS.app.show('reports') },
    { id: 'view.data', title: t('inventory.cmd.data'), group: GO, run: () => NS.app.show('data') },
    { id: 'scan.mode.keyboard', title: t('inventory.cmd.keyboard'), group: SC, keywords: ['wedge', 'usb', 'barcode'],
      run: () => { NS.app.show('scan'); NS.scanView.setMode('keyboard'); } },
    { id: 'scan.mode.camera', title: t('inventory.cmd.camera'), group: SC, keywords: ['webcam', 'barcode detector'],   // i18n-ignore: browser error names and search keywords, not shown
      run: () => { NS.app.show('scan'); NS.scanView.setMode('camera'); } },
    { id: 'scan.mode.toggle', title: t('inventory.cmd.toggle'), group: SC,
      run: () => { NS.app.show('scan'); NS.scanView.setMode(NS.scanView.mode() === 'camera' ? 'keyboard' : 'camera'); } },
    { id: 'scan.undo', title: t('inventory.cmd.undo'), group: SC, keywords: ['reverse', 'counter'],
      when: () => NS.scanView.log().some((e) => NS.scan.UNDOABLE.includes(e.status)), run: () => NS.scanView.undoLast() },
    { id: 'stock.receive', title: t('inventory.cmd.receive'), group: ST, run: () => NS.stockView.open('receive') },
    { id: 'stock.sell', title: t('inventory.cmd.sell'), group: ST, run: () => NS.stockView.open('sell') },
    { id: 'stock.adjust', title: t('inventory.cmd.adjust'), group: ST, run: () => NS.stockView.open('adjust') },
    { id: 'stock.transfer', title: t('inventory.cmd.transfer'), group: ST, run: () => NS.stockView.open('transfer') },
    { id: 'count.start', title: t('inventory.cmd.c_start'), group: CT, when: () => !NS.count.isOpen(),
      run: () => { NS.app.show('count'); setTimeout(() => document.getElementById('cLoc').focus(), 40); } },
    { id: 'count.review', title: t('inventory.cmd.c_review'), group: CT, when: () => NS.count.isOpen(),
      run: () => { NS.app.show('count'); NS.views.count.review(); } },
    { id: 'count.post', title: t('inventory.cmd.c_post'), group: CT, when: () => NS.count.isOpen(),
      run: () => { NS.app.show('count'); NS.views.count.review(); } },
    { id: 'count.cancel', title: t('inventory.cmd.c_cancel'), group: CT, when: () => NS.count.isOpen(),
      run: () => { NS.app.show('count'); document.getElementById('cCancel').click(); } },
    { id: 'products.new', title: t('inventory.cmd.p_new'), group: PR,
      run: () => NS.productForm.open({ onSaved: () => NS.app.refresh() }) },
    { id: 'products.import', title: t('inventory.cmd.p_import'), group: PR, run: () => NS.dataActions.openImport() },
    { id: 'products.export', title: t('inventory.cmd.p_export'), group: PR, run: () => NS.dataActions.exportCsv() },
    { id: 'products.low', title: t('inventory.cmd.low'), group: t('inventory.cmd.g_reports'), run: () => NS.app.show('reports') },
    { id: 'data.backup', title: t('inventory.cmd.backup'), group: t('biz.cmd.g_data'), run: () => NS.dataActions.backup() },
  ];
  let runner = null;
  /** Registers the commands with SlopCmd and wires [data-cmd] (SlopBiz.commands, shared/biz/biz.js). */
  function init() { runner = g.SlopBiz.commands('inventory', COMMANDS); }
  /** Runs a command by id (through SlopCmd when it is loaded). */
  const run = (id) => (runner ? runner(id) : false);

  NS.commands = { init, run, list: COMMANDS };
})(typeof window !== 'undefined' ? window : globalThis);
