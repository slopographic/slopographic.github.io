/* SlopLabel — ui/commands: every tool and menu action registered with the shared command palette
 * (shared/commands, window.SlopCmd). SlopCmd owns the keyboard: people can search any action with
 * Ctrl/⌘+K and rebind every shortcut (Help ▸ Keyboard shortcuts…). K(id) gives a menu's key label. */
'use strict';

const K = (id) => (window.SlopCmd ? SlopCmd.keyFor('label.' + id) : '') || undefined;
const runCmd = (id) => window.SlopCmd && SlopCmd.run('label.' + id, { source: 'menu' });
const inFormMode = () => document.body.classList.contains('form-mode');
const hasSel = () => App.sel.length > 0;
const ICO = (svg) => `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
function nudgeStep(big) { const base = App.doc.grid.snap && +App.doc.grid.size ? +App.doc.grid.size : U() === 'in' ? 0.254 : 0.1; return base * (big ? 10 : 1); }
const toggleRulers = () => { const on = !$('workspace').classList.contains('no-rulers'); $('workspace').classList.toggle('no-rulers'); lsSet('sloplabel-rulers', on ? '0' : '1'); };

function labelCommands() {
  const C = [];
  const add = (group, id, title, run, o = {}) => C.push(Object.assign({ id: 'label.' + id, title, group, run }, o));
  /* File */
  add(LT('label.cmd.file'), 'new', LT('label.cmd.new_from_template'), templatesDialog, { keywords: ['template', 'start', 'gallery'] });
  add(LT('label.cmd.file'), 'open', LT('label.cmd.open'), openFilesDialog, { keys: ['Mod+O'], keywords: ['load', 'project', 'zpl', 'csv'] });
  add(LT('label.cmd.file'), 'importZPL', LT('label.cmd.import_zpl'), importZPLDialog, { keywords: ['zebra', 'zpl'] });
  add(LT('label.cmd.file'), 'save', LT('label.cmd.save_project'), saveProject, { keys: ['Mod+S'], keywords: ['download', '.sloplabel'] });
  add(LT('label.cmd.file'), 'print', LT('label.cmd.print'), openPrintDialog, { keys: ['Mod+P'], keywords: ['pdf', 'zpl', 'epl', 'tspl', 'output'] });
  add(LT('label.cmd.file'), 'exportPDF', LT('label.cmd.export_pdf'), exportPDFQuick, { keywords: ['save as'] });
  add(LT('label.cmd.file'), 'exportPNG', LT('label.cmd.export_png_current_label'), exportPNG, { keywords: ['image', 'picture'] });
  add(LT('label.cmd.file'), 'exportSVG', LT('label.cmd.export_svg_current_label'), exportSVG, { keywords: ['vector'] });
  add(LT('label.cmd.file'), 'exportZPL', LT('label.cmd.export_zpl_zebra'), exportZPLQuick, { keywords: ['zebra', 'printer'] });
  add(LT('label.cmd.file'), 'shareForm', LT('label.cmd.share_print_form_link'), shareFormLink, { keywords: ['link', 'url', 'form'] });
  add(LT('label.cmd.file'), 'setup', LT('label.cmd.label_setup'), () => labelSetupDialog(), { keywords: ['size', 'stock', 'avery', 'roll', 'printer', 'dpi'] });
  add(LT('label.cmd.file'), 'tab.new', LT('label.cmd.new_tab'), newBlankTab, { keywords: ['tab', 'blank', 'document', 'label'] });
  add(LT('label.cmd.file'), 'tab.close', LT('label.cmd.close_tab'), closeCurrentTab, { keywords: ['tab', 'close', 'document'] });
  add(LT('label.cmd.file'), 'presets', LT('label.cmd.presets'), presetsDialog, { keywords: ['preset', 'avery', 'sheet', 'size', 'gallery', 'template'] });
  add(LT('label.cmd.file'), 'saveConfig', LT('label.cmd.save_as_config'), saveConfigDialog, { keywords: ['config', 'save', 'setup', 'reuse'] });
  add(LT('label.cmd.file'), 'configs', LT('label.cmd.configs'), configsDialog, { keywords: ['config', 'list', 'apply', 'rename', 'export', 'import'] });
  add(LT('label.cmd.file'), 'imageFromDrive', LT('label.cmd.insert_image_from_slop_drive'), imageFromDrive, { when: hubAvailable, keywords: ['hub'] });
  add(LT('label.cmd.file'), 'dataFromDrive', LT('label.cmd.data_from_slop_drive'), dataFromDrive, { when: hubAvailable, keywords: ['hub', 'csv'] });
  add(LT('label.cmd.file'), 'offline', LT('label.cmd.download_app_offline_html'), async () => { try { const n = await downloadOfflineApp(); SlopUI.toast(LT('label.cmd.offline_saved', { kb: Math.round(n / 1024) })); } catch (e) { SlopUI.alert(LT('label.cmd.could_not_build_the_offline'), e.message); } }, { keywords: ['offline', 'single file'] });
  /* Edit */
  add(LT('label.cmd.edit'), 'undo', LT('label.cmd.undo'), undo, { keys: ['Mod+Z'], when: () => App.hist.canUndo });
  add(LT('label.cmd.edit'), 'redo', LT('label.cmd.redo'), redo, { keys: ['Mod+Y', 'Shift+Mod+Z'], when: () => App.hist.canRedo });
  add(LT('label.cmd.edit'), 'cut', LT('label.cmd.cut'), cutSel, { keys: ['Mod+X'], when: hasSel });
  add(LT('label.cmd.edit'), 'copy', LT('label.cmd.copy'), copySel, { keys: ['Mod+C'], when: hasSel });
  add(LT('label.cmd.edit'), 'paste', LT('label.cmd.paste'), () => pasteClip() || SlopUI.toast(LT('label.cmd.nothing_to_paste')), { keywords: ['clipboard'] });
  add(LT('label.cmd.edit'), 'duplicate', LT('label.cmd.duplicate'), () => duplicateSel(), { keys: ['Mod+D'], when: hasSel });
  add(LT('label.cmd.edit'), 'delete', 'Delete', deleteSel, { keys: ['Delete', 'Backspace'], when: hasSel, keywords: ['remove'] });
  add(LT('label.cmd.edit'), 'selectAll', LT('label.cmd.select_all'), selectAll, { keys: ['Mod+A'], when: () => !isTyping(document.activeElement) }); // in a field Ctrl+A selects its text
  add(LT('label.cmd.edit'), 'deselect', LT('label.cmd.deselect'), () => { if (Drag) return; deselect(); setTool('select'); }, { keys: ['Escape'], keywords: ['select none'] });
  add(LT('label.cmd.edit'), 'editContent', LT('label.cmd.edit_content'), focusContent, { keys: ['Enter'], when: () => App.sel.length === 1, keywords: ['text', 'value'] });
  /* Tools */
  for (const t of TOOLS) {
    if (!t || t === '-') continue;
    add(LT('label.cmd.tools'), 'tool.' + t.id, t.name + ' tool', t.id === 'image' ? () => { setTool('select'); insertImageFile(); } : () => setTool(t.id),
      { keys: t.key ? [t.key] : [], icon: ICO(t.svg), checked: () => App.tool === t.id, keywords: ['tool', t.id] });
  }
  /* Insert */
  add(LT('label.cmd.insert'), 'insert.text', LT('label.cmd.insert_text'), () => insertCentered('text'));
  add(LT('label.cmd.insert'), 'insert.para', LT('label.cmd.insert_paragraph'), () => insertCentered('para'));
  add(LT('label.cmd.insert'), 'insert.barcode', LT('label.cmd.insert_barcode_code_128'), () => insertCentered('barcode', defaultsFor('barcode')), { keywords: ['code128', '1d'] });
  add(LT('label.cmd.insert'), 'insert.ean13', LT('label.cmd.insert_ean_13'), () => insertCentered('barcode', { symbology: 'ean13', content: '590123412345', module: 0.33, hr: 'below', name: 'EAN-13' }), { keywords: ['retail', 'upc', 'gtin'] });
  add(LT('label.cmd.insert'), 'insert.gs1', LT('label.cmd.insert_gs1_128'), () => insertCentered('barcode', { symbology: 'gs1-128', content: '(01)09501101530003(10)LOT42', module: 0.33, name: 'GS1-128' }), { keywords: ['ucc', 'ean128', 'sscc'] });
  add(LT('label.cmd.insert'), 'insert.qr', LT('label.cmd.insert_qr_code'), () => insertCentered('barcode', defaultsFor('qr')), { keywords: ['2d'] });
  add(LT('label.cmd.insert'), 'insert.datamatrix', LT('label.cmd.insert_data_matrix'), () => insertCentered('barcode', { symbology: 'datamatrix', content: 'SLOP-12345', module: 0.5, hr: 'none', name: 'Data Matrix' }), { keywords: ['2d', 'gs1'] });
  add(LT('label.cmd.insert'), 'insert.image', LT('label.cmd.insert_image'), () => insertImageFile(), { keywords: ['picture', 'logo'] });
  add(LT('label.cmd.insert'), 'insert.rect', LT('label.cmd.insert_box'), () => insertCentered('rect'), { keywords: ['rectangle', 'frame'] });
  add(LT('label.cmd.insert'), 'insert.line', LT('label.cmd.insert_line'), () => insertCentered('line', { h: 0.5 }));
  add(LT('label.cmd.insert'), 'insert.ellipse', LT('label.cmd.insert_ellipse'), () => insertCentered('ellipse'), { keywords: ['circle', 'oval'] });
  add(LT('label.cmd.insert'), 'insert.inverse', LT('label.cmd.insert_inverse_box'), () => insertCentered('inverse'), { keywords: ['reverse', 'black'] });
  for (const [t, l] of Object.entries(VAR_TYPES)) add(LT('label.cmd.insert'), 'var.' + t, LT('label.cmd.new_var', { type: LW('var', t, l) }), () => varDialog(null, t), { keywords: ['variable', 'field', t] });
  /* Object */
  const A = [['left', LT('label.cmd.align_left')], ['hcenter', LT('label.cmd.align_centre_horizontally')], ['right', LT('label.cmd.align_right')], ['top', LT('label.cmd.align_top')], ['vcenter', LT('label.cmd.align_centre_vertically')], ['bottom', LT('label.cmd.align_bottom')]];
  for (const [how, l] of A) add(LT('label.cmd.object'), 'align.' + how, l, () => alignSel(how), { when: hasSel, keywords: ['align'] });
  add(LT('label.cmd.object'), 'distribute.h', LT('label.cmd.distribute_horizontally'), () => distributeSel('h'), { when: () => App.sel.length >= 3 });
  add(LT('label.cmd.object'), 'distribute.v', LT('label.cmd.distribute_vertically'), () => distributeSel('v'), { when: () => App.sel.length >= 3 });
  add(LT('label.cmd.object'), 'front', LT('label.cmd.bring_to_front'), () => orderSel('front'), { keys: ['Shift+Mod+]'], when: hasSel, keywords: ['arrange', 'order'] });
  add(LT('label.cmd.object'), 'forward', LT('label.cmd.bring_forward'), () => orderSel('forward'), { keys: ['Mod+]'], when: hasSel, keywords: ['arrange', 'order'] });
  add(LT('label.cmd.object'), 'backward', LT('label.cmd.send_backward'), () => orderSel('backward'), { keys: ['Mod+['], when: hasSel, keywords: ['arrange', 'order'] });
  add(LT('label.cmd.object'), 'back', LT('label.cmd.send_to_back'), () => orderSel('back'), { keys: ['Shift+Mod+['], when: hasSel, keywords: ['arrange', 'order'] });
  add(LT('label.cmd.object'), 'rotateCW', LT('label.cmd.rotate_90_clockwise'), () => rotateSel(90), { when: hasSel, keywords: ['turn'] });
  add(LT('label.cmd.object'), 'rotateCCW', LT('label.cmd.rotate_90_counter_clockwise'), () => rotateSel(270), { when: hasSel, keywords: ['turn'] });
  add(LT('label.cmd.object'), 'group', LT('label.cmd.group'), groupSel, { keys: ['Mod+G'], when: () => App.sel.length >= 2 });
  add(LT('label.cmd.object'), 'ungroup', LT('label.cmd.ungroup'), ungroupSel, { keys: ['Shift+Mod+G'], when: () => selObjs().some((o) => o.group) });
  add(LT('label.cmd.object'), 'lock', LT('label.cmd.lock_unlock'), toggleLock, { keys: ['Mod+L'], when: hasSel });
  add(LT('label.cmd.object'), 'hide', LT('label.cmd.hide_show'), toggleHide, { when: hasSel, keywords: ['visible'] });
  const N = [['Left', -1, 0], ['Right', 1, 0], ['Up', 0, -1], ['Down', 0, 1]];
  for (const [d, x, y] of N) {
    add(LT('label.cmd.object'), 'nudge' + d, LT(NUDGE[d]), () => { const s = nudgeStep(false); nudge(x * s, y * s); }, { keys: ['Arrow' + d], when: hasSel, repeat: true, keywords: ['move'] });
    add(LT('label.cmd.object'), 'nudge' + d + '10', LT(NUDGE[d]) + ' ×10', () => { const s = nudgeStep(true); nudge(x * s, y * s); }, { keys: ['Shift+Arrow' + d], when: hasSel, repeat: true, keywords: ['move'] });
  }
  add(LT('label.cmd.object'), 'props', LT('label.cmd.show_properties'), () => showDock('props'), { keywords: ['panel', 'inspector'] });
  add(LT('label.cmd.object'), 'objects', LT('label.cmd.show_object_list'), () => showDock('objects'), { keywords: ['layers', 'panel'] });
  /* Data */
  const multi = () => recordCount(App.doc) > 1;
  add(LT('label.cmd.data'), 'import', LT('label.cmd.import_csv_excel_json'), () => importDataDialog(), { keywords: ['merge', 'xlsx', 'spreadsheet'] });
  add(LT('label.cmd.data'), 'pasteData', LT('label.cmd.paste_data'), pasteDataDialog, { keywords: ['merge', 'table'] });
  add(LT('label.cmd.data'), 'map', LT('label.cmd.map_columns'), () => mapColumnsDialog(App.doc.data), { when: () => !!App.doc.data });
  add(LT('label.cmd.data'), 'remove', LT('label.cmd.remove_data'), () => editDoc((d) => { d.data = null; }, LT('label.cmd.remove_data')), { when: () => !!App.doc.data });
  add(LT('label.cmd.data'), 'prevRecord', LT('label.cmd.previous_record'), () => setRecord(App.rec - 1), { keys: ['PageUp'], when: multi, repeat: true });
  add(LT('label.cmd.data'), 'nextRecord', LT('label.cmd.next_record'), () => setRecord(App.rec + 1), { keys: ['PageDown'], when: multi, repeat: true });
  add(LT('label.cmd.data'), 'vars', LT('label.cmd.show_variables'), () => showDock('vars'), { keywords: ['panel'] });
  add(LT('label.cmd.data'), 'table', LT('label.cmd.show_data_table'), () => showDock('data'), { keywords: ['panel', 'records'] });
  /* View */
  add(LT('label.cmd.view'), 'zoomIn', LT('label.cmd.zoom_in'), () => zoomTo(App.zoom * 1.25), { keys: ['Mod+=', 'Mod++'], repeat: true });
  add(LT('label.cmd.view'), 'zoomOut', LT('label.cmd.zoom_out'), () => zoomTo(App.zoom / 1.25), { keys: ['Mod+-'], repeat: true });
  add(LT('label.cmd.view'), 'fit', LT('label.cmd.fit_label'), fitView, { keys: ['Mod+0'], keywords: ['zoom'] });
  add(LT('label.cmd.view'), 'actual', LT('label.cmd.actual_size'), zoomActual, { keys: ['Mod+1'], keywords: ['zoom', '100%'] });
  add(LT('label.cmd.view'), 'rulers', LT('label.cmd.rulers'), toggleRulers, { checked: () => !$('workspace').classList.contains('no-rulers') });
  add(LT('label.cmd.view'), 'grid', LT('label.cmd.grid'), () => editDoc((x) => { x.grid.show = !x.grid.show; }, LT('label.cmd.grid')), { checked: () => App.doc.grid.show });
  add(LT('label.cmd.view'), 'snap', LT('label.cmd.snap_to_grid'), () => editDoc((x) => { x.grid.snap = !x.grid.snap; }, LT('label.cmd.snap')), { checked: () => App.doc.grid.snap });
  for (const [id, l] of THEMES) add(LT('label.cmd.view'), 'theme.' + id, LT('label.cmd.theme_name', { name: LT(l) }), () => setTheme(id), { checked: () => document.documentElement.dataset.theme === id, keywords: ['appearance', 'dark', 'light'] });
  /* Help */
  add(LT('label.cmd.help'), 'about', LT('label.cmd.about_sloplabel'), aboutDialog);
  add(LT('label.cmd.help'), 'home', LT('label.cmd.slopographic_home'), () => { location.href = '../'; });
  // nothing runs from the keyboard in print-form mode
  for (const c of C) { const w = c.when; c.when = w ? () => !inFormMode() && w() : () => !inFormMode(); }
  return C;
}
/** Refresh tooltips that show shortcuts (after a rebind). */
function updateKeyTitles() {
  const t = (id, name, k) => { const el = $(id); if (el) el.title = k ? `${name} (${k})` : name; };
  t('btnUndo', LT('label.cmd.undo'), K('undo')); t('btnRedo', LT('label.cmd.redo'), K('redo')); t('btnPrint', LT('label.panels.print'), K('print')); t('zoomVal', LT('label.cmd.fit_label'), K('fit'));
  t('btnCmd', LT('label.page.search_commands'), window.SlopCmd && SlopCmd.keyFor('cmd.palette'));
  document.querySelectorAll('.tool[data-tool]').forEach((b) => { const tool = toolById(b.dataset.tool); const k = K('tool.' + tool.id); b.title = k ? `${tool.name} (${k})` : tool.name; b.setAttribute('aria-label', tool.name); });
}
/** The assistant's commands with arguments (ai-commands.js, ai-files.js) and shared/commands/sources.js, loaded in order the
 * first time SlopCmd.prepare() asks (the AI panel). Not in the offline build, which has no AI panel. */
const LABEL_AI_BASE = (document.currentScript && document.currentScript.src) || location.href;
function loadLabelAI() {
  if (window.LabelAI && window.LabelAI.state) return Promise.resolve();
  const one = (rel) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = new URL(rel, LABEL_AI_BASE).href; s.async = false; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + rel)); document.head.append(s); });
  return (window.SlopCmdSources ? Promise.resolve() : one('../../../shared/commands/sources.js')).then(() => one('ai-commands.js')).then(() => one('ai-files.js'));
}
const NUDGE = { Left: 'label.cmd.nudge_left', Right: 'label.cmd.nudge_right', Up: 'label.cmd.nudge_up', Down: 'label.cmd.nudge_down' };
function initCommands() {
  if (!window.SlopCmd) return false;
  onLabelLang(() => { SlopCmd.register(labelCommands()); updateKeyTitles(); });   // the same ids, the new titles
  if (SlopCmd.provide) SlopCmd.provide({ prepare: loadLabelAI });
  SlopCmd.init({ app: 'label' });
  SlopCmd.register(labelCommands().concat(window.SlopConfigDialog ? SlopConfigDialog.commands({ app: 'label', prefix: 'label' }) : []));
  SlopCmd.on('change', updateKeyTitles);
  const b = $('btnCmd');
  if (b) b.addEventListener('click', () => SlopCmd.open());
  updateKeyTitles();
  return true;
}
