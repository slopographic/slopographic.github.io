/* SlopLabel — ui/menus: the menus (File, Edit, Insert, Object, Data, View, Help). The shared menu bar (SlopMenuBar) opens them. */
'use strict';

/** Add an object centred on the label (menu inserts). */
function insertCentered(type, props = {}) {
  const L = App.doc.label, o = makeObject(type, Object.assign(styleProps(App.doc, type), props));
  syncAutoSize(App.doc, o, previewGet());
  o.x = round(Math.max(0, (L.w - o.w) / 2), 2); o.y = round(Math.max(0, (L.h - o.h) / 2), 2);
  addObject(o);
  if (type === 'text' || type === 'para' || type === 'barcode') focusContent();
}
function menuFile() {
  const hub = hubAvailable(), send = sendToItems();
  return [
    { label: LT('label.menu.new'), act: templatesDialog }, { label: LT('label.cmd.new_tab'), act: newBlankTab }, { label: LT('label.cmd.close_tab'), act: closeCurrentTab },
    { label: LT('label.cmd.open'), key: K('open'), act: openFilesDialog }, { label: LT('label.cmd.import_zpl'), act: importZPLDialog },
    { label: LT('label.menu.config'), sub: window.SlopConfigDialog ? SlopConfigDialog.menuItems({ app: 'label' }) : [] },
    { label: LT('label.menu.save'), key: K('save'), act: saveProject }, { label: LT('label.menu.download_project_sloplabel'), act: downloadProject }, '-',
    hub ? { label: LT('label.menu.open_project_from_slop_drive'), act: openProjectDrive } : null,
    hub ? { label: LT('label.cmd.insert_image_from_slop_drive'), act: imageFromDrive } : null, hub ? { label: LT('label.cmd.data_from_slop_drive'), act: dataFromDrive } : null, hub ? '-' : null,
    { label: LT('label.cmd.print'), key: K('print'), act: openPrintDialog },
    { label: LT('label.menu.export'), sub: [{ label: 'PDF', act: exportPDFQuick }, { label: LT('label.menu.png_current_label'), act: exportPNG }, { label: LT('label.menu.svg_current_label'), act: exportSVG }, { label: 'ZPL (Zebra)', act: exportZPLQuick }, '-', { label: LT('label.menu.more_formats_and_options'), act: openPrintDialog }] },
    send.length ? { label: LT('label.menu.send_to'), sub: send } : null,
    { label: LT('label.cmd.share_print_form_link'), act: shareFormLink }, '-',
    { label: LT('label.cmd.presets'), act: presetsDialog }, { label: LT('label.cmd.save_as_config'), act: saveConfigDialog }, { label: LT('label.cmd.configs'), act: configsDialog }, '-',
    { label: LT('label.cmd.label_setup'), act: () => labelSetupDialog() },
    { label: LT('label.cmd.download_app_offline_html'), act: async () => { try { const n = await downloadOfflineApp(); SlopUI.toast(LT('label.cmd.offline_saved', { kb: Math.round(n / 1024) })); } catch (e) { SlopUI.alert(LT('label.cmd.could_not_build_the_offline'), e.message); } } },
  ];
}
function menuEdit() {
  const has = App.sel.length > 0;
  return [
    { label: App.hist.canUndo ? LT('ui.undo_what', { what: App.hist.undoLabel }) : LT('label.cmd.undo'), key: K('undo'), disabled: !App.hist.canUndo, act: undo },
    { label: App.hist.canRedo ? LT('ui.redo_what', { what: App.hist.redoLabel }) : LT('label.cmd.redo'), key: K('redo'), disabled: !App.hist.canRedo, act: redo }, '-',
    { label: LT('label.cmd.cut'), key: K('cut'), disabled: !has, act: cutSel }, { label: LT('label.cmd.copy'), key: K('copy'), disabled: !has, act: copySel }, { label: LT('label.cmd.paste'), key: 'Ctrl+V', act: () => pasteClip() || SlopUI.toast(LT('label.cmd.nothing_to_paste')) },
    { label: LT('label.cmd.duplicate'), key: K('duplicate'), disabled: !has, act: () => duplicateSel() }, { label: 'Delete', key: K('delete'), disabled: !has, act: deleteSel }, '-',
    { label: LT('label.cmd.select_all'), key: K('selectAll'), act: selectAll }, { label: LT('label.cmd.deselect'), key: K('deselect'), disabled: !has, act: deselect },
  ];
}
function menuInsert() {
  return [
    { label: LT('label.menu.text'), key: K('tool.text'), act: () => insertCentered('text') }, { label: LT('label.menu.paragraph'), key: K('tool.para'), act: () => insertCentered('para') },
    { label: LT('label.menu.barcode_code_128'), key: K('tool.barcode'), act: () => insertCentered('barcode', defaultsFor('barcode')) },
    { label: 'EAN-13', act: () => insertCentered('barcode', { symbology: 'ean13', content: '590123412345', module: 0.33, hr: 'below', name: 'EAN-13' }) },
    { label: 'GS1-128', act: () => insertCentered('barcode', { symbology: 'gs1-128', content: '(01)09501101530003(10)LOT42', module: 0.33, name: 'GS1-128' }) },
    { label: LT('label.menu.qr_code'), key: K('tool.qr'), act: () => insertCentered('barcode', defaultsFor('qr')) },
    { label: LT('label.cmd.data_matrix'), act: () => insertCentered('barcode', { symbology: 'datamatrix', content: 'SLOP-12345', module: 0.5, hr: 'none', name: 'Data Matrix' }) },
    { label: LT('label.menu.image'), key: K('tool.image'), act: () => insertImageFile() }, '-',
    { label: LT('label.menu.box'), key: K('tool.rect'), act: () => insertCentered('rect') }, { label: LT('label.menu.line'), key: K('tool.line'), act: () => insertCentered('line', { h: 0.5 }) }, { label: LT('label.menu.ellipse'), key: K('tool.ellipse'), act: () => insertCentered('ellipse') }, { label: LT('label.menu.inverse_box'), key: K('tool.inverse'), act: () => insertCentered('inverse') }, '-',
    { label: LT('label.menu.variable'), sub: Object.entries(VAR_TYPES).map(([t, l]) => ({ label: LW('var', t, l) + '…', act: () => varDialog(null, t) })) },
  ];
}
function menuObject() {
  const has = App.sel.length > 0, objs = selObjs();
  return [
    { label: LT('label.menu.align'), disabled: !has, sub: alignItems() },
    { label: LT('label.menu.arrange'), disabled: !has, sub: [{ label: LT('label.cmd.bring_to_front'), key: K('front'), act: () => orderSel('front') }, { label: LT('label.cmd.bring_forward'), key: K('forward'), act: () => orderSel('forward') }, { label: LT('label.cmd.send_backward'), key: K('backward'), act: () => orderSel('backward') }, { label: LT('label.cmd.send_to_back'), key: K('back'), act: () => orderSel('back') }] },
    { label: LT('label.cmd.rotate_90_clockwise'), disabled: !has, act: () => rotateSel(90) }, { label: LT('label.cmd.rotate_90_counter_clockwise'), disabled: !has, act: () => rotateSel(270) }, '-',
    { label: LT('label.cmd.group'), key: K('group'), disabled: App.sel.length < 2, act: groupSel }, { label: LT('label.cmd.ungroup'), key: K('ungroup'), disabled: !objs.some((o) => o.group), act: ungroupSel },
    { label: objs.length && objs.every((o) => o.locked) ? LT('label.menu.unlock') : LT('label.menu.lock'), key: K('lock'), disabled: !has, act: toggleLock },
    { label: objs.length && objs.every((o) => o.hidden) ? LT('label.menu.show') : LT('label.menu.hide'), disabled: !has, act: toggleHide }, '-',
    { label: LT('label.menu.properties'), act: () => showDock('props') }, { label: LT('label.menu.object_list'), act: () => showDock('objects') },
  ];
}
function menuData() {
  const D = App.doc.data, n = recordCount(App.doc);
  return [
    { label: LT('label.cmd.import_csv_excel_json'), act: () => importDataDialog() }, { label: LT('label.cmd.paste_data'), act: pasteDataDialog },
    hubAvailable() ? { label: LT('label.menu.from_slop_drive'), act: dataFromDrive } : null,
    { label: LT('label.cmd.map_columns'), disabled: !D, act: () => mapColumnsDialog(D) }, { label: LT('label.cmd.remove_data'), disabled: !D, act: () => editDoc((d) => { d.data = null; }, LT('label.cmd.remove_data')) }, '-',
    { label: LT('label.cmd.previous_record'), key: K('prevRecord'), disabled: n < 2, act: () => setRecord(App.rec - 1) }, { label: LT('label.cmd.next_record'), key: K('nextRecord'), disabled: n < 2, act: () => setRecord(App.rec + 1) }, '-',
    { label: LT('label.menu.variables'), act: () => showDock('vars') }, { label: LT('label.menu.data_table'), act: () => showDock('data') },
  ];
}
function menuView() {
  const d = App.doc, rulers = !$('workspace').classList.contains('no-rulers');
  return [
    { label: LT('label.cmd.zoom_in'), key: K('zoomIn'), act: () => zoomTo(App.zoom * 1.25) }, { label: LT('label.cmd.zoom_out'), key: K('zoomOut'), act: () => zoomTo(App.zoom / 1.25) },
    { label: LT('label.cmd.fit_label'), key: K('fit'), act: fitView }, { label: LT('label.cmd.actual_size'), key: K('actual'), act: zoomActual }, '-',
    { label: LT('label.cmd.rulers'), check: rulers, act: () => { $('workspace').classList.toggle('no-rulers'); lsSet('sloplabel-rulers', rulers ? '0' : '1'); } },
    { label: LT('label.cmd.grid'), check: d.grid.show, act: () => editDoc((x) => { x.grid.show = !x.grid.show; }, LT('label.cmd.grid')) },
    { label: LT('label.cmd.snap_to_grid'), check: d.grid.snap, act: () => editDoc((x) => { x.grid.snap = !x.grid.snap; }, LT('label.cmd.snap')) }, '-',
    { label: LT('label.menu.theme'), sub: THEMES.map(([id, l]) => ({ label: LT(l), check: document.documentElement.dataset.theme === id, act: () => setTheme(id) })) },
  ];
}
function menuHelp() {
  const C = window.SlopCmd;
  return [
    C ? { label: LT('label.menu.search_commands'), key: C.keyFor('cmd.palette'), act: () => C.open() } : null, C ? { label: LT('label.menu.keyboard_shortcuts'), key: C.keyFor('cmd.keymap'), act: () => C.openKeymap() } : null, C ? '-' : null,
    { label: LT('label.cmd.about_sloplabel'), act: aboutDialog }, { label: LT('label.menu.start_from_a_template'), act: templatesDialog }, '-', { label: LT('label.cmd.slopographic_home'), act: () => { location.href = '../'; } },
  ];
}
