/* Slop Tables commands: every action in the menus, registered with SlopCmd (palette and remappable keys).
   Without SlopCmd, runShortcut() handles the Ctrl/⌘ keys below. Menus are built from the same list. */
import { S, $, toast } from './state.js';
import { undo, redo, canUndo, canRedo } from './history.js';
import * as A from './actions.js';
import * as F from './storage.js';
import * as Sh from './sheets.js';
import * as TPL from './templates.js';
import { NUMBER_FORMATS, nfLabel } from './numfmt.js';
import { clearRange } from './actions.js';
import { configCommands } from '../io/config.js';
import * as OBJ from './objects.js';
import { t, onLang } from '../i18n.js';

/** Grid commands run only when no text field has focus (Ctrl+A, Ctrl+Z… belong to the field then). */
const idle = () => { const a = document.activeElement; return !S.edit && !(a && a.closest && a.closest('input, textarea, select, [contenteditable="true"]')); };

export const COMMANDS = [
  { id: 'file.new', tk: 'file_new', group: 'file', run: F.newBlank },
  { id: 'file.fromTemplate', tk: 'file_from_template', group: 'file', run: () => TPL.openTemplates() },
  { id: 'file.saveTemplate', tk: 'file_save_template', group: 'file', run: () => TPL.saveAsTemplate() },
  { id: 'file.open', tk: 'file_open', group: 'file', keys: ['Mod+O'], run: F.openFromDrive, when: () => !!window.SlopHub },
  { id: 'file.openFile', tk: 'file_open_file', group: 'file', run: F.pickAndOpen },
  { id: 'file.save', tk: 'file_save', group: 'file', keys: ['Mod+S'], run: () => F.save() },
  { id: 'file.saveAs', tk: 'file_save_as', group: 'file', run: () => F.save({ as: true }), when: () => !!window.SlopHub },
  { id: 'file.rename', tk: 'file_rename', group: 'file', run: () => window.SlopDocTabs.rename(null) },
  { id: 'file.stab', tk: 'file_stab', group: 'file', run: F.downloadNative },
  { id: 'file.csv', tk: 'file_csv', group: 'file', run: F.downloadCsv },
  { id: 'file.xlsx', tk: 'file_xlsx', group: 'file', run: F.downloadXlsx },
  { id: 'edit.undo', tk: 'edit_undo', group: 'edit', keys: ['Mod+Z'], run: undo, when: () => idle() && canUndo() },
  { id: 'edit.redo', tk: 'edit_redo', group: 'edit', keys: ['Shift+Mod+Z', 'Mod+Y'], run: redo, when: () => idle() && canRedo() },
  { id: 'edit.selectAll', tk: 'edit_select_all', group: 'edit', keys: ['Mod+A'], run: A.selectAll, when: idle },
  { id: 'edit.clear', tk: 'edit_clear', group: 'edit', run: () => clearRange('contents'), when: idle },
  { id: 'edit.clearAll', tk: 'edit_clear_all', group: 'edit', run: () => clearRange('all'), when: idle },
  { id: 'format.bold', tk: 'format_bold', group: 'format', keys: ['Mod+B'], run: () => A.toggleStyle('b'), when: idle },
  { id: 'format.italic', tk: 'format_italic', group: 'format', keys: ['Mod+I'], run: () => A.toggleStyle('i'), when: idle },
  ...NUMBER_FORMATS.map(([label, code], i) => ({ id: 'format.nf' + i, tk: 'number_format', vars: () => ({ name: nfLabel(label) }), group: 'format', run: () => A.setFormat(code) })),
  ...OBJ.commands(),
  { id: 'view.freeze', tk: 'view_freeze', group: 'view', run: () => A.freezeAt() },
  { id: 'view.unfreeze', tk: 'view_unfreeze', group: 'view', run: () => A.unfreeze() },
  { id: 'sheet.add', tk: 'sheet_add', group: 'sheets', run: () => Sh.add() },
  { id: 'sheet.rename', tk: 'sheet_rename', group: 'sheets', run: () => Sh.rename() },
  { id: 'sheet.delete', tk: 'sheet_delete', group: 'sheets', run: () => Sh.remove() },
  { id: 'help.keys', tk: 'help_keys', group: 'help', run: () => window.SlopCmd && window.SlopCmd.openKeymap(), when: () => !!window.SlopCmd },
  { id: 'help.about', tk: 'help_about', group: 'help', run: about },
];
COMMANDS.push(...configCommands()); // Config: export, plain template, import, ask AI (io/config.js)
const byId = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));
/** A command's words in the chosen language: ours from tables.cmd.*, the shared Config commands' own. */
const titleOf = (c) => (c.tk ? t('tables.cmd.' + c.tk, c.vars && c.vars()) : c.title);
const groupOf = (c) => (c.tk ? t(`tables.cmd.group_${c.group}`) : c.group);
export const run = (id) => byId[id] && byId[id].run();

function about() {
  window.SlopUI.alert('Slop Tables', t('tables.app.about'));
}

/** Ctrl/⌘ shortcuts when SlopCmd is not loaded. */
export function runShortcut(e) {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  for (const c of COMMANDS) for (const key of c.keys || []) {
    const parts = key.split('+'), want = parts.pop();
    if (!parts.includes('Mod')) continue;
    if (k !== want.toUpperCase() || parts.includes('Shift') !== !!e.shiftKey) continue;
    if (c.when && !c.when()) continue;
    c.run();
    return true;
  }
  return false;
}

/** Register with SlopCmd and wire the ⌘K button. */
export function init() {
  const C = window.SlopCmd;
  if (!C) return;
  C.init({ app: 'tables' });
  const reg = () => C.register(COMMANDS.map((c) => ({ id: c.id, title: titleOf(c), group: groupOf(c), keys: c.keys || [], when: c.when, run: () => c.run() })));
  reg();
  onLang(() => { reg(); label(); }); // the palette and the ⌘K button follow a language switch
  // The assistant's commands with arguments (sort, filter, add/fill column, set cell), state and checkpoint: loaded when the AI panel first needs them.
  if (C.provide) C.provide({ prepare: () => import('./ai-commands.js').then((m) => m.register()) });
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tb'; b.id = 'btnCmd';
  const label = () => { b.title = t('ui.cmd.search'); b.setAttribute('aria-label', b.title); };
  label();
  b.textContent = '⌘K';
  b.addEventListener('click', () => C.open());
  $('btnSave').before(b);
}

const keyText = (c) => (window.SlopCmd ? window.SlopCmd.keyFor(c.id) : (c.keys || [])[0]) || '';
const item = (id, label) => { const c = byId[id]; return { id, label: label || titleOf(c), key: keyText(c), disabled: !!(c.when && !c.when()), act: () => c.run() }; };

/** The names on the menu bar, by the menus() keys. */
const MENU_KEYS = { File: 'menu.file', Edit: 'menu.edit', Format: 'ui.mb.format', Insert: 'ui.mb.insert', View: 'menu.view', Sheets: 'tables.menu.sheets', Help: 'menu.help' };
export const menuLabel = (name) => t(MENU_KEYS[name] || name);

/** The menus in the top bar. */
export function menus() {
  const paste = () => (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().then(A.paste, () => toast(t('tables.toast.use_ctrl_v'))) : toast(t('tables.toast.use_ctrl_v')));
  return {
    File: [item('file.new'), item('file.fromTemplate'), item('file.open'), item('file.openFile'), '-', item('file.save'), item('file.saveAs'), item('file.saveTemplate'), '-',
      { label: t('tables.menu.config'), sub: ['tables.config.export', 'tables.config.template', 'tables.config.import', 'tables.config.ai'].map((id) => item(id)) }, '-',
      { label: t('ui.download'), sub: [item('file.stab', t('tables.menu.download_stab')), item('file.csv'), item('file.xlsx')] }],
    Edit: [item('edit.undo'), item('edit.redo'), '-',
      { id: 'edit.cut', label: t('ui.cut'), key: 'Ctrl+X', act: () => document.execCommand('cut') },
      { id: 'edit.copy', label: t('ui.copy'), key: 'Ctrl+C', act: () => document.execCommand('copy') },
      { id: 'edit.paste', label: t('ui.paste'), key: 'Ctrl+V', act: paste }, '-',
      item('edit.selectAll'), item('edit.clear'), item('edit.clearAll')],
    Format: [item('format.bold'), item('format.italic'), '-',
      { id: 'format.nf', label: t('tables.app.number_format'), sub: NUMBER_FORMATS.map((_, i) => item('format.nf' + i)) }],
    Insert: [item('insert.chart'), item('insert.pivot'), '-', item('data.refreshPivots')],
    View: [item('view.freeze'), item('view.unfreeze')],
    Sheets: [item('sheet.add'), item('sheet.rename'), item('sheet.delete')],
    Help: [window.SlopCmd ? { label: t('ui.cmd.palette_dots'), key: keyText({ id: 'cmd.palette' }), act: () => window.SlopCmd.open() } : null,
      item('help.keys'), '-', item('help.about')],
  };
}
