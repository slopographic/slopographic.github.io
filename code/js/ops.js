/* Slop Code: file operations. Open a Slop Drive record, save it back to the same record, save as into a
 * folder, new file, close (asks when there are unsaved changes), autosaved drafts and restoring tabs. */
import * as docs from './docs.js';
import { getDraft, putDraft, dropDraft } from './drafts.js';
import { readText, writeText, createFile, uniqueName, pathOf } from './drive.js';
import { askNewFile, askUnsaved } from './dialogs.js';
import { mimeFor, langOf } from './lang.js';
import { mediaKind } from './viewers.js';
import { renderChrome, setStatus, env, toast } from './ui.js';
import { setActive, refresh as refreshTree, revealFolder } from './tree.js';
import { t } from './dom.js';

const H = () => window.SlopHub;
const TABS_KEY = 'slop-code.tabs';
const timers = new Map();

/** Open a record in a tab (or switch to its tab). Pictures, audio, video and PDFs open as views; a file that is not
 * text opens as a view with the "Open in an app" list. Text opens in the editor. */
export async function openRecord(rec, { quiet = false, activate = true } = {}) {
  if (!rec) return null;
  const have = docs.find(rec.id);
  if (have) { if (activate) showDoc(have); return have; }
  if (rec.trashedAt) { if (!quiet) toast(t('code.toast.in_trash', { name: rec.name })); return null; }
  const media = mediaKind(rec.name);
  const text = media ? null : await readText(rec);
  if (media || text === null) {
    const doc = docs.openView(rec, media || 'binary', URL.createObjectURL(rec.blob));
    H().touch(rec.id);
    if (activate) showDoc(doc); else { renderChrome(); persistTabs(); }
    return doc;
  }
  const draft = await getDraft(rec.id);
  const restore = !!draft && typeof draft.text === 'string' && draft.text !== text;
  const doc = docs.openDoc(rec, restore ? draft.text : text, text);
  H().touch(rec.id);
  if (restore && !quiet) toast(t('code.toast.restored'));
  if (activate) showDoc(doc); else { renderChrome(); persistTabs(); }
  return doc;
}

/** Show a tab and mark it in the tree. */
export function showDoc(doc) {
  docs.show(doc);
  setActive(doc.id);
  H().get(doc.id).then((rec) => { if (rec && rec.folderId) revealFolder(rec.folderId); }).catch(() => {});
  renderChrome();
  persistTabs();
  if (env.view) env.view.focus();
}

/** Save the document's text to its own Slop Drive record. Views (pictures, media, binary) are not saved here. */
export async function saveDoc(doc = docs.current()) {
  if (!doc || doc.kind !== 'text') return false;
  const text = docs.textOf(doc);
  try { await writeText(doc.id, text, doc.name); } catch (e) { toast(t('code.toast.save_failed', { error: e.message })); return false; }
  docs.markSaved(doc, text);
  clearTimeout(timers.get(doc.id));
  await dropDraft(doc.id);
  renderChrome();
  toast(t('code.toast.saved'));
  return true;
}

/** Save a copy into a folder the user picks. Opens the copy in a new tab. */
export async function saveAs(doc = docs.current()) {
  if (!doc || doc.kind !== 'text') return null;
  const name = await SlopUI.prompt(t('code.app.saveas'), t('code.dlg.file_name'), doc.name, { ok: t('ui.next') });
  if (!name || !name.trim()) return null;
  const folderId = await H().pickFolder({ title: t('code.dlg.save_to', { name: name.trim() }), ok: t('code.dlg.save_here'), start: doc.folderId ?? await H().appFolderId('code') });
  if (folderId === undefined) return null;
  const fname = await uniqueName(name.trim(), folderId);
  const id = await H().put(new Blob([docs.textOf(doc)], { type: mimeFor(fname) }), { name: fname, from: 'code', folderId });
  await refreshTree();
  toast(t('code.toast.saved_as', { name: fname }));
  return openRecord(await H().get(id));
}

/** New file: pick a type and a name, in the folder given (null: the root). */
export async function newFile(folderId = null) {
  const label = await pathOf(folderId ?? null);
  const picked = await askNewFile(label === '/' ? t('code.dlg.root') : label);
  if (!picked) return null;
  const name = await uniqueName(picked.name, folderId ?? null);
  const rec = await createFile(name, folderId ?? null);
  await refreshTree();
  return openRecord(rec);
}

/** Close a tab. Unsaved text asks first: Save, Discard or Cancel. */
export async function closeDoc(doc = docs.current()) {
  if (!doc) return false;
  if (doc.dirty) {
    const choice = await askUnsaved(doc.name);
    if (choice === 'cancel') return false;
    if (choice === 'save' && !(await saveDoc(doc))) return false;
  }
  clearTimeout(timers.get(doc.id));
  await dropDraft(doc.id);
  docs.close(doc);
  if (doc.url) URL.revokeObjectURL(doc.url);
  setActive(docs.current() ? docs.current().id : null);
  renderChrome();
  persistTabs();
  return true;
}

/** Switch a Markdown tab between the editor and its rendered preview. Only the view changes, not the text. */
export function togglePreview(doc = docs.current()) {
  if (!doc || doc.kind !== 'text' || langOf(doc).id !== 'markdown') { toast(t('code.toast.md_only')); return false; }
  doc.preview = !doc.preview;
  renderChrome();
  if (env.view && !doc.preview) env.view.focus();
  return doc.preview;
}

/** Called on every edit of the editor. Refreshes the dirty flag and schedules the draft autosave. */
export function onEdit() {
  const d = docs.current();
  if (!d) return;
  const was = d.dirty;
  docs.refreshDirty(d);
  if (was !== d.dirty) renderChrome(); else setStatus();
  clearTimeout(timers.get(d.id));
  timers.set(d.id, setTimeout(() => flushDraft(d.id), 400));
}
async function flushDraft(id) {
  const d = docs.find(id);
  if (!d) return;
  if (d.dirty) await putDraft(id, docs.textOf(d)); else await dropDraft(id);
}

/** Tab ids and the active tab, kept per viewer so a reload brings the same tabs back. */
export function persistTabs() {
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ ids: docs.list().map((d) => d.id), active: docs.current() ? docs.current().id : null }));
  } catch (e) { /* not kept */ }
}
export async function restoreTabs() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null'); } catch (e) { saved = null; }
  if (!saved || !Array.isArray(saved.ids)) return;
  for (const id of saved.ids) {
    const rec = await H().get(id).catch(() => null);
    if (rec) await openRecord(rec, { quiet: true, activate: false });
  }
  const want = docs.find(saved.active) || docs.list()[0];
  if (want) showDoc(want);
}
