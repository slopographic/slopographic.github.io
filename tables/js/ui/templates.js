/* Templates: File ▸ New ▸ From template… (built-in and My templates, each with a preview), File ▸ Save as
   template…, and the .stab-template export (download or Slop Drive) and import (file or Slop Drive). */
import { S, toast } from './state.js';
import { format } from '../engine/index.js';
import { toNative, fromNative } from '../io/native.js';
import { toTemplateBlob, parseTemplate, TEMPLATE_MIME, TEMPLATE_EXT } from '../io/template.js';
import { BUILTIN, builtinById, buildWorkbook } from '../templates/index.js';
import * as store from './template-store.js';
import { useWorkbook } from './storage.js';
import { t as tr } from '../i18n.js';

const hub = () => window.SlopHub || null;
const UI = () => window.SlopUI;
const el = (...a) => UI().el(...a);
const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '-').trim() || tr('tables.tpl.file_fallback');
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fileName = (name) => `${safe(name)}.${TEMPLATE_EXT}`;
const errText = (err) => (err && err.message) || String(err);

/* An entry is { name, description, native, mine }: mine is the stored record, or null for a built-in. */
/** A built-in template's name and description in the chosen language (tables.tpl.<id>_name, _desc). */
const builtinName = (t) => tr('tables.tpl.' + t.id.replace(/-/g, '_') + '_name');
const builtinEntries = () => BUILTIN.map((t) => ({ name: builtinName(t), description: tr('tables.tpl.' + t.id.replace(/-/g, '_') + '_desc'), native: toNative(buildWorkbook(t)), mine: null }));
const mineEntries = async () => (await store.listMine()).map((rec) => ({ name: rec.name, description: rec.description, native: rec.native, mine: rec }));

/** The entry's workbook as built by the engine (formulas computed). */
const workbookOf = (e) => fromNative(e.native);

/** A few rows and columns of computed values, formatted as the grid shows them. */
function miniTable(wb, rows = 5, cols = 4, cls = 'tpl-mini') {
  const sh = wb.sheets[0], u = sh.usedRange(false) || { r1: 0, c1: 0, r2: -1, c2: -1 };
  const body = [];
  for (let r = u.r1; r <= Math.min(u.r2, u.r1 + rows - 1); r++) {
    const tds = [];
    for (let c = u.c1; c <= Math.min(u.c2, u.c1 + cols - 1); c++) {
      const cell = sh.get(r, c), v = sh.value(r, c);
      const text = v === null || v === undefined ? '' : format(v, wb.style(cell && cell.s).nf).text;
      tds.push(el('td', { class: typeof v === 'number' ? 'n' : null, title: text }, text));
    }
    body.push(el('tr', null, tds));
  }
  return el('table', { class: cls }, el('tbody', null, body));
}

let current = null; // { dlg, list } while the From template dialog is open

/** File ▸ New ▸ From template…: cards for the built-in and the person's own templates. */
export function openTemplates() {
  if (current) return;
  const list = el('div', { class: 'tpl-list' });
  const dlg = UI().dialog({
    title: tr('tables.tpl.dlg_title'), cls: 'sui-wide tpl-dlg', body: el('div', { class: 'tpl-body' }, list),
    buttons: [
      { label: tr('tables.tpl.import_file'), act: () => { importFile(); return false; } },
      { label: tr('tables.tpl.import_drive'), act: () => { importFromDrive(); return false; } },
      { label: tr('menu.close'), primary: true },
    ],
    onClose: () => { current = null; },
  });
  current = { dlg, list };
  renderList();
  return dlg;
}

async function renderList() {
  if (!current) return;
  let mine = [];
  try { mine = await mineEntries(); } catch (e) { toast(tr('tables.tpl.read_failed', { error: errText(e) })); }
  if (!current) return;
  current.list.replaceChildren(
    el('h3', null, tr('tables.tpl.builtin')),
    el('div', { class: 'tpl-grid' }, builtinEntries().map(card)),
    el('h3', null, tr('tables.tpl.mine')),
    mine.length ? el('div', { class: 'tpl-grid' }, mine.map(card))
      : el('p', { class: 'tpl-empty' }, tr('tables.tpl.mine_empty')),
  );
}

function card(e) {
  const wb = workbookOf(e);
  return el('article', { class: 'tpl-card' },
    el('h4', null, e.name),
    el('p', { class: 'tpl-desc' }, e.description),
    miniTable(wb),
    el('div', { class: 'tpl-actions' },
      el('button', { type: 'button', class: 'sui-btn', onclick: () => preview(e) }, tr('tables.tpl.preview')),
      el('button', { type: 'button', class: 'sui-btn sui-primary', onclick: () => use(e) }, tr('tables.tpl.use')),
      el('button', { type: 'button', class: 'sui-btn tpl-more', title: tr('ui.more'), 'aria-label': tr('tables.tpl.more_for', { name: e.name }), onclick: (ev) => more(e, ev.currentTarget) }, '⋯')));
}

function preview(e) {
  const wb = workbookOf(e);
  UI().dialog({
    title: e.name, cls: 'sui-wide', body: el('div', { class: 'tpl-preview' }, el('p', { class: 'sui-p' }, e.description), miniTable(wb, 14, 8)),
    buttons: [{ label: tr('menu.close') }, { label: tr('tables.tpl.use_template'), primary: true, act: () => { use(e); } }],
  });
}

/** Open the template as a new, unsaved workbook (asks first if the current one has unsaved changes). */
async function use(e) {
  let wb;
  try { wb = workbookOf(e); } catch (err) { UI().alert(tr('tables.tpl.open_failed'), errText(err)); return; }
  if (await useWorkbook(wb, e.name)) current && current.dlg.close(true);
}

/** Open a built-in template by id (used by tests and the console). */
export async function openBuiltin(id) {
  const t = builtinById(id);
  return t ? useWorkbook(buildWorkbook(t), builtinName(t)) : false;
}

function more(e, anchor) {
  const r = anchor.getBoundingClientRect();
  UI().menu([
    { label: tr('tables.tpl.download'), act: () => downloadTemplate(e) },
    { label: tr('tables.tpl.save_drive'), act: () => saveToDrive(e), disabled: !hub() },
    e.mine ? '-' : null,
    e.mine ? { label: tr('ui.delete'), act: () => remove(e) } : null,
  ], r.left, r.bottom + 2);
}

/** The .stab-template Blob for an entry (download, Slop Drive, tests). */
export const exportBlob = (e) => toTemplateBlob({ name: e.name, description: e.description, native: e.native });
function downloadTemplate(e) { UI().download(exportBlob(e), fileName(e.name)); SlopSupport.afterExport('tables'); }

async function saveToDrive(e) {
  const h = hub();
  if (!h) return;
  try {
    const folderId = await store.templatesFolder();
    await h.put(exportBlob(e), { name: fileName(e.name), from: 'tables', folderId });
    toast(tr('tables.tpl.saved_drive'));
  } catch (err) { UI().alert(tr('tables.tpl.save_drive_failed'), errText(err)); }
}

async function remove(e) {
  const ok = await UI().confirm(tr('tables.tpl.delete_title'), tr('tables.tpl.delete_body', { name: e.name }), tr('ui.delete'), { danger: true });
  if (!ok) return;
  await store.removeMine(e.mine.id);
  refresh();
}

/** File ▸ Save as template…: keeps the current workbook in My templates, and in Slop Drive when it is there. */
export async function saveAsTemplate() {
  const typed = await UI().prompt(tr('tables.tpl.save_title'), tr('tables.tpl.name'), S.file.name || tr('tables.tpl.default_name'), { ok: tr('menu.save') });
  const name = (typed || '').trim().slice(0, 80);
  if (!name) return false;
  const rec = { id: newId(), name, description: tr('tables.tpl.saved_from', { name: S.file.name }), created: Date.now(), native: toNative(S.wb) };
  try { await store.putMine(rec); } catch (err) { UI().alert(tr('tables.tpl.save_failed'), errText(err)); return false; }
  if (hub()) {
    try {
      const folderId = await store.templatesFolder();
      rec.driveId = await hub().put(exportBlob(rec), { name: fileName(name), from: 'tables', folderId });
      await store.putMine(rec);
    } catch (err) { toast(tr('tables.tpl.drive_copy_failed', { error: errText(err) })); return true; }
  }
  toast(tr('tables.tpl.saved', { name }));
  refresh();
  return true;
}

/** Validate a template file and keep it in My templates. Throws (and keeps nothing) if it is broken. */
export async function importBlob(blob) {
  const t = parseTemplate(await blob.text());
  const rec = { id: newId(), name: t.name, description: t.description, created: Date.now(), native: t.native };
  await store.putMine(rec);
  return rec;
}

async function runImport(get) {
  try {
    const rec = await get();
    if (rec) { toast(tr('tables.tpl.added', { name: rec.name })); refresh(); }
  } catch (err) { UI().alert(tr('tables.tpl.import_failed'), errText(err)); }
}
/* Import file… and Import from Drive…: a part of the one intake of its own ('tables.template'). */
function templateIntake() {
  const SI = window.SlopIntake;
  if (SI && !SI.spec('tables.template')) {
    SI.register({ id: 'tables.template', main: false, paste: false, toast: false, limit: 1, driveAccept: [TEMPLATE_MIME],
      accept: { types: [TEMPLATE_MIME, 'application/json'], exts: ['.' + TEMPLATE_EXT, '.json'], get noun() { return tr('tables.tpl.noun'); } },
      process: async (file) => { await runImport(() => importBlob(file)); return file.name; } });
  }
  return SI;
}
const importFile = () => templateIntake().pick({ to: 'tables.template', multiple: false, accept: `.${TEMPLATE_EXT},${TEMPLATE_MIME},application/json` });
const importFromDrive = () => templateIntake().fromDrive({ to: 'tables.template' });

function refresh() { if (current) renderList(); }
/** My templates, newest first (for tests and the console). */
export const listMine = () => store.listMine();
