/* PhotoSlop UI: keyboard labels, dialogs and the colour picker */
'use strict';

const MOD = isMac ? '⌘' : 'Ctrl+';
const keyLabel = (k) => (isMac ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧') : k);
const MODIFIERS = ['Ctrl', 'Alt', 'Shift']; // i18n-ignore: ids, key names, CSS
function normCombo(s) {
  const parts = s.split('+').map((p) => p.trim()).filter(Boolean);
  const key = parts.pop();
  return MODIFIERS.filter((m) => parts.includes(m)).concat([key.length === 1 ? key.toUpperCase() : key]).join('+');
}
const CODE_KEY = { BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Quote: "'", Slash: '/', Backslash: '\\', Semicolon: ';', Comma: ',', Period: '.', Backquote: '`', Space: 'Space', NumpadAdd: '=', NumpadSubtract: '-' }; // i18n-ignore: ids, key names, CSS
function comboOf(e) {
  let k = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') && /\d/.test(e.code.slice(6)) ? e.code.slice(6) : CODE_KEY[e.code] || e.key; // i18n-ignore: ids, key names, CSS
  if (k && k.length === 1) k = k.toUpperCase();
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('Ctrl'); // i18n-ignore: ids, key names, CSS
  if (e.altKey) mods.push('Alt'); // i18n-ignore: ids, key names, CSS
  if (e.shiftKey) mods.push('Shift'); // i18n-ignore: ids, key names, CSS
  return mods.concat([k]).join('+');
}

/* ---------- dialogs ---------- */
/* Dialogs come from the shared SlopUI kit (../shared/slopui.js), so PhotoSlop, SlopVector and Slop PDF share them. */
const CLS_MAP = { 'dlg-wide': 'sui-wide', 'dlg-color': 'sui-narrow', 'dlg-filter': 'sui-filter', 'dlg-curve': 'sui-curve' };
function dialog({ title, body, buttons = [], onClose, cls = '' }) {
  const parts = cls.split(/\s+/).filter(Boolean);
  const dock = parts.includes('dlg-filter') ? 'right' : undefined;
  return SlopUI.dialog({ title, body, buttons, onClose, dock, modal: !dock, cls: parts.map((c) => CLS_MAP[c] || c).join(' ') });
}
function field(label, input, unit) { return h('label', { class: 'field' }, h('span', { class: 'field-l' }, label), input, unit ? h('span', { class: 'field-u' }, unit) : null); }
function numInput(v, min, max, step = 1) { return h('input', { type: 'number', value: v, min, max, step, inputmode: 'decimal' }); }
const alertDlg = (title, msg) => SlopUI.alert(title, msg);
const confirmDlg = (title, msg, ok = tr('menu.ok'), opts) => SlopUI.confirm(title, msg, ok, opts);
