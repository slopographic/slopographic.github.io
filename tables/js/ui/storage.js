/* Files: open and save through Slop Drive (SlopHub), CSV and TSV import, the launch from ?drive=<id>,
   and downloads for when Slop Drive is not available. Each workbook is a tab (ui/tabs.js): Save and Save as new go
   through the strip's saveToDrive (drive.js), and a zero-byte .stab from Drive's New menu is a blank workbook that
   saves back to that same Drive file. A CSV, XLSX or ODS file opens as an unsaved import (io/import.js reads XLSX and ODS
   through the shared reader), so its Drive record is never overwritten; what the import left out is said in a notice.
   Files from this device (File ▸ Open file, or a drop: ui/drop.js) go through the same openRecord. */
import { S, emit, sheet, toast } from './state.js';
import { Workbook } from '../engine/index.js';
import { toBlob, fromBlob, MIME, EXT } from '../io/native.js';
import { toCsv, parseCsv } from '../io/csv.js';
import { toXlsx } from '../io/xlsx.js';
import { tabs } from './tabs.js';
import { readWorkbook } from '../io/import.js';
import { t } from '../i18n.js';

// A new sheet's default name in the chosen language ("Blad1" in Swedish); a sheet keeps the name it has.
Workbook.defaultSheetName = (n) => { const s = t('tables.sheet.default', { n: String(n) }); return s === 'tables.sheet.default' ? 'Sheet' + n : s; };
const hub = () => window.SlopHub || null;
const CSV_TYPES = ['text/csv', 'text/tab-separated-values'];
const isCsv = (rec) => CSV_TYPES.includes(rec.type) || /\.(csv|tsv)$/i.test(rec.name || '');
export const SHEET_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.oasis.opendocument.spreadsheet'];
const isSheetFile = (rec) => !/\.(csv|tsv)$/i.test(rec.name || '') && (SHEET_TYPES.includes(rec.type) || /spreadsheetml|opendocument\.spreadsheet|ms-excel/.test(rec.type || '') || /\.(xlsx|xlsm|ods|xls)$/i.test(rec.name || ''));
export const OPEN_EXTS = ['.stab', '.xlsx', '.xlsm', '.ods', '.csv', '.tsv'];
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '-').trim() || t('tables.app.untitled');
export const fileName = (ext = EXT) => `${safe(S.file.name)}.${ext}`;

async function importCsv(blob, name) {
  const delim = /\.tsv$/i.test(name) || /tab-separated/.test(blob.type) ? '\t' : ',';
  const rows = parseCsv(await blob.text(), delim), wb = new Workbook(), sh = wb.sheets[0];
  wb.batch(() => rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') wb.input(sh, r, c, v); })));
  return wb;
}

/** Open a Slop Drive record in a tab (the picker or ?drive=). A tab already showing it is brought forward. Resolves true when open. */
export async function openRecord(rec) {
  if (!rec) return false;
  const name = (rec.name || '').replace(/\.[^.]+$/, '') || t('tables.app.untitled');
  let wb;
  if (isSheetFile(rec)) {
    let got;
    try { got = await readWorkbook(rec.blob, rec.name || 'book.xlsx'); }
    catch (err) { window.SlopUI.alert(t('tables.file.open_failed'), err.message || String(err)); return false; }
    tabs.open(got.wb, { name, dirty: true, origName: rec.name }, null);
    if (got.notes.length) {
      const el = window.SlopUI.el;
      window.SlopUI.alert(t('tables.file.left_out'), el('div', { class: 'import-notes' }, el('ul', null, got.notes.map((n) => el('li', null, n))),
        el('p', { class: 'sui-p' }, t('tables.file.left_out_body'))));
    }
    else toast(rec.name ? t('tables.file.opened', { name: rec.name }) : t('tables.file.opened_it'));
    return true;
  }
  try {
    if (isCsv(rec)) wb = await importCsv(rec.blob, rec.name || '');
    else if (!rec.blob || rec.blob.size === 0) wb = new Workbook();
    else wb = await fromBlob(rec.blob);
  } catch (err) {
    window.SlopUI.alert(t('tables.file.open_failed'), t('tables.file.not_ours') + ' ' + (err.message && !/JSON/.test(err.message) ? err.message : ''));
    return false;
  }
  // A CSV is imported as a new, unsaved workbook: its Drive record must not be overwritten with .stab data.
  if (isCsv(rec)) { tabs.open(wb, { name, dirty: true, origName: rec.name }, null); return true; }
  const open = tabs.tabFor(rec.id);
  if (open) tabs.api().activate(open.doc);
  else tabs.open(wb, { name, folderId: rec.folderId, origName: rec.name }, rec.id);
  return true;
}

/** File ▸ Open from Slop Drive (Ctrl+O): a source of the one intake (ui/drop.js). */
export const openFromDrive = () => window.SlopIntake.fromDrive({ to: 'tables', accept: [MIME, ...CSV_TYPES, ...SHEET_TYPES] });

/** A file from this device (File ▸ Open file, a drop): .stab, XLSX, ODS, CSV or TSV, in a new tab. Throws the reason. */
export async function openFile(file) {
  const rec = { name: file.name || 'Untitled', type: file.type || '', blob: file };
  if (!isSheetFile(rec) && !isCsv(rec)) {
    if (!/\.stab$/i.test(rec.name) && rec.type !== MIME) throw new Error(t('tables.file.kinds'));
    let wb;
    try { wb = await fromBlob(file); } catch (e) { throw new Error(t('tables.file.not_ours')); }
    tabs.open(wb, { name: rec.name.replace(/\.[^.]+$/, ''), dirty: true }, null);
    return true;
  }
  return openRecord(rec);
}

/** File ▸ Open file from this device: a source of the one intake (ui/drop.js). */
export const pickAndOpen = () => window.SlopIntake.pick({ to: 'tables', accept: OPEN_EXTS.join(',') });

/** File ▸ New workbook: a blank workbook in a new tab. */
export async function newBlank() {
  tabs.newTab();
}

/** Save the open workbook to its Drive file (in place), or to a new file the person picks the folder for. Without Slop Drive it downloads. */
export async function save({ as = false } = {}) {
  const T = tabs.current();
  if (!T) return false;
  tabs.sync();
  if (!hub()) { window.SlopUI.download(toBlob(S.wb), fileName()); T.file.dirty = false; emit('saved'); return true; }
  const api = tabs.api(), prev = api.driveIdOf(T);
  try {
    if (as) api.setDriveId(T, null);
    const id = await api.saveToDrive(T);   // drive.js: the same record, or a new file in a folder the person picks
    if (!id) { if (as) api.setDriveId(T, prev); return false; }
    tabs.setUrl(id);
    return true;
  } catch (err) {
    window.SlopUI.alert(t('tables.file.save_failed'), err.message || String(err));
    return false;
  }
}

/** Open wb as a new, unsaved workbook in a new tab (a template). */
export async function useWorkbook(wb, name) {
  tabs.open(wb, { name: name || t('tables.app.untitled') }, null);
  return true;
}

export const downloadNative = () => { window.SlopUI.download(toBlob(S.wb), fileName()); SlopSupport.afterExport('tables'); };
export const downloadCsv = () => { window.SlopUI.download(new Blob([toCsv(sheet())], { type: 'text/csv' }), fileName('csv')); SlopSupport.afterExport('tables'); };
export async function downloadXlsx() { window.SlopUI.download(await toXlsx(S.wb), fileName('xlsx')); SlopSupport.afterExport('tables'); }

/* Startup reads are time-limited: a storage that never answers (a stalled hub) must not keep the page from
   opening, or it stays blank. A late answer is ignored. */
const START_MS = 1500;
const within = (p, fallback) => new Promise((res) => {
  const timer = setTimeout(() => res(fallback), START_MS);
  Promise.resolve(p).then((v) => { clearTimeout(timer); res(v); }, () => { clearTimeout(timer); res(fallback); });
});

/* The intake waits for the tabs (ui/drop.js: its before step), so a file never opens before them. */
let tabsReady = null;
export const whenTabs = () => tabsReady;
/** Startup: the launch through the intake (?drive=<id> is read first, since showing a tab rewrites the address bar; a PWA
 * launch's files too), then the open tabs from this device, then a blank workbook when there are none. A launch that
 * opens replaces the blank one. */
export async function launch() {
  const h = hub();
  if (h) { try { h.register('tables'); } catch (e) { /* hub without register */ } }
  let ready;
  tabsReady = new Promise((r) => { ready = r; });
  const launched = window.SlopIntake ? window.SlopIntake.launch({ to: 'tables' }) : Promise.resolve(null);
  tabs.init();
  await within(Promise.resolve().then(() => tabs.restore()).catch(() => 0), 0); // storage blocked or stalled: start blank
  if (!tabs.current()) tabs.newTab();
  const blank = tabs.isPristine(tabs.current()) ? tabs.current() : null;
  ready();
  const r = await within(launched, null);
  if (r && r.added && r.added.length && blank && tabs.current() !== blank) tabs.api().close(blank);
}
