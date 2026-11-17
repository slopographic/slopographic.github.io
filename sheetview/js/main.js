/* Slop Sheets viewer: boot. Opens files through the one intake (shared/intake, spec 'sheetview': the Open buttons, a
 * drop, the sample, a paste, ?drive=<id> from Slop Drive, a PWA launch; several at once as tabs),
 * wires the header, the Export and Menu buttons, the commands, the table style choices and Open in Slop Table.
 * Module script; the classic scripts (apps, slopui, hub, drop, commands) load first.
 * Test hook: window.SlopSheetView.open(files) takes File objects through the intake, as the Open button does. */
import { read } from '../../shared/sheets/read.js';
import { csvBlob } from '../../shared/sheets/csv.js';
import { createStore } from './state.js';
import { createView } from './view.js';
import { exportItems, exportFile } from './export.js';
import { STYLES, PALETTES, loadAppearance, saveAppearance } from './appearance.js';
import { mountPanel } from './panel.js';

const $ = (id) => document.getElementById(id);
const toast = (msg) => { if (window.SlopUI) window.SlopUI.toast(msg); };
const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
const ACCEPT = '.xlsx,.xlsm,.csv,.tsv,.xls,.ods';
const MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet', 'text/csv', 'text/tab-separated-values', 'text/plain',
];

const appearance = loadAppearance();
let view = null, side = null;
const store = createStore(() => { if (view) view.render(); if (side) side.paint(); });

/** Reads one file into a new tab. Throws the reason when it cannot be read (the drop panel shows it). */
async function openFile(file) {
  const parsed = await read(file, { name: file.name });
  store.addDoc(parsed, { name: file.name });
  return file.name;
}

/* The one way in: every source reaches openFile, a file at a time (one that fails is refused with its reason in the strip
   and the toast, and the rest still open). */
function registerIntake() {
  window.SlopIntake.register({
    id: 'sheetview', limit: 20, process: (file) => openFile(file),
    accept: { types: MIME, exts: ['.xlsx', '.xlsm', '.csv', '.tsv', '.xls', '.ods'], noun: 'sheetview.app.a_spreadsheet' },
  });
}
const pickFiles = () => window.SlopIntake.pick({ to: 'sheetview', accept: ACCEPT });

/** The current sheet, all rows, as CSV, opened in Slop Table through Slop Drive. */
async function openInTables() {
  const d = store.doc();
  if (!d) return;
  const sheet = store.sheet();
  const name = `${d.name}${d.sheets.length > 1 ? ' - ' + sheet.name : ''}.csv`;
  try {
    // No byte-order mark: Slop Tables reads the text as it is, and a BOM would sit in cell A1. The one way out.
    await window.SlopOuttake.send('tables', { from: 'sheetview', get: () => csvBlob(sheet, null, ',', { bom: false }), name, type: 'text/csv' });
  } catch (e) {
    toast(t('sheetview.toast.send_failed', { msg: e.message }));
  }
}

async function runExport(kind, scope, ctx) {
  try {
    const name = await exportFile(kind, scope, ctx);
    toast(t('sheetview.toast.exported', { name }));
  } catch (e) {
    toast(t('sheetview.toast.export_failed', { msg: e.message }));
  }
}

function exportContext() {
  const d = store.doc();
  return d ? { doc: d, sheet: store.sheet(), order: store.order() } : null;
}

function exportMenu(anchor) {
  const ctx = exportContext();
  if (!ctx) { toast(t('sheetview.toast.open_first')); return; }
  const r = anchor.getBoundingClientRect();
  window.SlopUI.menu(exportItems(ctx, runExport), r.left, r.bottom + 4);
}

/** Convert… (shared/convert/dialog.js, loaded on first use): File convert's tool in a dialog, with the open document
 *  as XLSX (its provider is in export.js). This page has no shell header, so the Menu and the palette offer it. */
const openConvert = () => import('../../shared/convert/dialog.js').then((m) => m.open({})).catch(() => toast(t('sheetview.toast.convert_offline')));

function menuItems() {
  const has = !!store.doc();
  const v = store.view();
  const nothingToClear = !v || (!v.sort && ![...v.filters.values()].length);
  return [
    { label: t('sheetview.menu.open'), key: cmdKey('open'), act: pickFiles },
    '-',
    ...exportItems(exportContext() || { doc: null, sheet: null, order: [] }, runExport).map((it) => (it === '-' ? it : { ...it, disabled: !has })),
    '-',
    { label: t('sheetview.menu.hub'), disabled: !has, act: openInTables },
    { label: t('sheetview.menu.convert'), act: openConvert },
    { label: t('sheetview.app.clear'), disabled: !has || nothingToClear, act: () => store.clearView() },
  ];
}

const cmdKey = (id) => (window.SlopCtx ? SlopCtx.keyFor('sheetview.' + id) : '');

function registerCommands() {
  if (!window.SlopCmd) return;
  SlopCmd.init({ app: 'sheetview' });
  const C = (id, title, keys, run, extra = {}) => ({ id: 'sheetview.' + id, title: t(title), group: t('menu.file'), keys, run, ...extra });
  // registered again on a language change, so the palette reads the new language
  const register = () => SlopCmd.register([
    C('open', 'sheetview.menu.open', ['Mod+O'], pickFiles, { keywords: ['load', 'csv', 'xlsx', 'computer'] }),
    C('hub', 'sheetview.menu.hub', [], openInTables, { keywords: ['tables', 'edit', 'drive'], when: () => !!store.doc() }),
    C('export-visible-csv', 'sheetview.cmd.export_visible_csv', [], () => runExport('csv', 'visible', exportContext()), { keywords: ['save', 'filter'], when: () => !!store.doc() }),
    C('export-all-xlsx', 'sheetview.cmd.export_all_xlsx', [], () => runExport('xlsx', 'all', exportContext()), { keywords: ['excel', 'save'], when: () => !!store.doc() }),
    C('convert', 'sheetview.menu.convert', [], openConvert, { keywords: ['convert', 'format', 'pdf', 'json', 'csv'] }),
    C('clear', 'sheetview.app.clear', [], () => store.clearView(), { keywords: ['reset', 'sort', 'filter'], when: () => !!store.doc() }),
  ]);
  register();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(register);
  // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
  if (SlopCmd.provide) SlopCmd.provide({ prepare: () => import('./ai-commands.js').then((m) => m.install(store, openFile)) });
}

function wireHeader() {
  $('sv-open').addEventListener('click', pickFiles);
  $('sv-open2').addEventListener('click', pickFiles);
  $('sv-export').addEventListener('click', (e) => exportMenu(e.currentTarget));
  $('sv-hub').addEventListener('click', openInTables);
  $('sv-clear').addEventListener('click', () => store.clearView());
  $('sv-cmd').addEventListener('click', () => { if (window.SlopCmd && SlopCmd.open) SlopCmd.open(); });
  $('sv-menu').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    window.SlopUI.menu(menuItems(), r.left, r.bottom + 4);
  });

  const fill = (sel, list, value) => {
    sel.replaceChildren(...list.map(([id, key]) => { const o = document.createElement('option'); o.value = id; o.textContent = t(key); return o; }));
    sel.value = value;
  };
  const style = $('sv-style'), palette = $('sv-palette');
  const fillBoth = () => { fill(style, STYLES, appearance.style); fill(palette, PALETTES, appearance.palette); };
  fillBoth();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(fillBoth);   // the option names in the new language
  const change = () => {
    appearance.style = style.value;
    appearance.palette = palette.value;
    saveAppearance(appearance);
    view.restyle(appearance);
  };
  style.addEventListener('change', change);
  palette.addEventListener('change', change);
}

const STEPS = ['sheetview.drop.step1', 'sheetview.drop.step2', 'sheetview.drop.step3'];
function wireDrop() {
  window.SlopDrop.attach($('sv-drop'), {
    intake: 'sheetview',
    compact: true,
    targets: [document.querySelector('.sv-app')],
  });
  // The empty page shows what a sheet looks like here and how (SlopDrop's preview); the sample goes through the strip.
  const empty = $('sv-empty'), sample = document.createElement('button');
  empty.insertBefore(window.SlopDrop.panel.preview({
    picture: { src: '../assets/shots/sheetview.jpg', alt: t('sheetview.drop.alt') },
    steps: STEPS.map((k) => t(k)),
  }), empty.querySelector('.sv-empty-b'));
  // the preview's words are drawn once: marked, they follow a language change (shared/i18n apply)
  empty.querySelectorAll('.sd-steps li').forEach((li, i) => { li.dataset.i18n = STEPS[i]; });
  const img = empty.querySelector('.sd-pic img');
  if (img) img.dataset.i18nAttr = 'alt:sheetview.drop.alt';
  sample.type = 'button'; sample.className = 'sd-sample'; sample.id = 'sv-sample'; sample.textContent = t('sheetview.drop.sample');
  sample.dataset.i18n = 'sheetview.drop.sample';
  sample.addEventListener('click', () => window.SlopIntake.sample(() => window.SlopSamples.docs.xlsx().then((f) => [f]), { to: 'sheetview' }));
  empty.querySelector('.sv-empty-b').append(sample);
}

async function boot() {
  SlopHub.register('sheetview');
  registerIntake();
  view = createView(store, {
    empty: $('sv-empty'), view: $('sv-view'), grid: $('sv-grid'), docs: $('sv-docs'), sheets: $('sv-sheets'),
    name: $('sv-name'), status: $('sv-status'), clear: $('sv-clear'),
  }, appearance);
  wireHeader();
  side = mountPanel({ has: () => !!store.doc() });   // the panel on the right, Export at its foot (panel.js)
  wireDrop();
  registerCommands();
  window.SlopSheetView = { open: (files) => window.SlopIntake.take(Array.from(files), { to: 'sheetview' }), store };
  view.render();
  if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => view.render());   // tabs and status line
  try { await window.SlopIntake.launch({ to: 'sheetview' }); } catch (e) { toast(t('sheetview.toast.open_failed', { msg: e.message })); }
  view.render();
  document.body.classList.add('ready');
}

// Module scripts run once the page is parsed, so the elements exist here.
boot().catch((e) => { console.error(e); document.body.classList.add('ready'); toast(t('sheetview.toast.start_failed', { msg: e.message })); });
