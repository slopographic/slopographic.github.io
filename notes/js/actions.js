/* Slop Notes actions: every change the screen, the menus and the commands make. Each one changes S, saves through the
 * store and asks the views to redraw. Nothing here touches the DOM except the focus after a new note. */
import * as store from './store.js';
import { S, byId, curNote, visibleNotes } from './state.js';
import { download, notebookZip, fileBase } from './export.js';
import { openNote, newNoteTab, dropNotes } from './tabs.js';
import { t } from './dom.js';

let redraw = () => {};
export const setRedraw = (fn) => { redraw = fn; };
const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };
const ask = (title, label, value, ok) => SlopUI.prompt(title, label, value, { ok });
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });

export function setPane(pane) { S.pane = pane; redraw(); }
/** The phone's notebooks drawer (SlopSheet, set by main.js): choosing a notebook or a folder closes it. */
let side = null;
export const setSide = (sheet) => { side = sheet; };
const closeSide = () => { if (side) side.close(); };

export function selectNotebook(id) {
  S.notebookId = id || null;
  S.folderId = null;
  S.tag = null;
  S.pane = 'list';
  closeSide();
  redraw();
}

export function selectFolder(id) { S.folderId = id || null; S.tag = null; S.pane = 'list'; closeSide(); redraw(); }
export function selectTag(tag) { S.tag = S.tag === tag ? null : tag; redraw(); }

/** Shows a note in its tab (a new tab when it is not open yet). */
export function selectNote(id) {
  if (!S.notes.some((n) => n.id === id)) return;
  S.pane = 'editor';
  openNote(id);
  redraw();
}

/** New note: a new record in Drive, in a new tab (the title gets the focus once it exists). */
export function newNote() {
  newNoteTab();
}

export async function newNotebook() {
  const title = await ask(t('notes.dlg.new_book'), t('notes.dlg.name'), '', t('notes.dlg.create'));
  if (title == null) return;
  const nb = await store.createNotebook(clean(title) || t('notes.app.untitled_book'));
  S.notebooks.push(nb);
  S.notebooks.sort(byTitle);
  selectNotebook(nb.id);
  toast(t('notes.toast.book_made'));
}

/** A folder inside a notebook, under parent (a folder id, or null for the top of the notebook). */
export async function newFolder(parent = S.folderId) {
  if (!S.notebookId) { toast(t('notes.toast.choose_book')); return; }
  const title = await ask(t('notes.dlg.new_folder'), t('notes.dlg.name'), '', t('notes.dlg.create'));
  if (title == null) return;
  const f = await store.createFolder(S.notebookId, parent || null, clean(title) || t('notes.app.untitled_folder'));
  S.folders.push(f);
  redraw();
  toast(t('notes.toast.folder_made'));
}

/** Renames a notebook, folder or note (the title shows in the list and, for a note, in its file name). */
export async function rename(item) {
  const title = await ask(t('ui.rename'), t('notes.dlg.name'), item.title, t('ui.rename'));
  if (title == null) return;
  item.title = clean(title) || (item.kind === 'note' ? '' : item.title);
  store.touch(item);
  redraw();
}

export function togglePin(n = curNote()) {
  if (!n) return;
  n.pinned = !n.pinned;
  store.touch(n);
  redraw();
}

/** Moves a note into a folder of its notebook (folder id), or to the top of its notebook (null). */
export function moveToFolder(n, folder) {
  n.folder = folder || null;
  store.touch(n);
  redraw();
}

export function moveToNotebook(n, notebook) {
  n.notebook = notebook;
  n.folder = null;
  store.touch(n);
  redraw();
}

/** Moves an item and what is in it to the Drive Trash, after a confirmation (ask: false when the caller already asked,
 *  as the assistant's panel does for destructive commands). Resolves true when it was moved. */
export async function remove(item, { ask = true } = {}) {
  const all = { notebooks: S.notebooks, folders: S.folders, notes: S.notes };
  const ids = store.trashIds(all, item);
  const body = item.kind === 'note' ? t('notes.dlg.trash_note', { title: item.title || t('ui.untitled') }) : t('notes.dlg.trash_items', { title: item.title, n: ids.length - 1 });
  const ok = !ask || await SlopUI.confirm(t('notes.dlg.trash_q'), body, t('notes.dlg.trash_ok'), { danger: true });
  if (!ok) return false;
  store.forget(ids);
  try { await store.trash(ids); } catch (e) { toast(t('notes.toast.trash_failed', { error: e.message })); if (!ask) throw e; return false; }
  const gone = new Set(ids);
  S.notes = S.notes.filter((n) => !gone.has(n.id));
  S.folders = S.folders.filter((f) => !gone.has(f.id));
  S.notebooks = S.notebooks.filter((b) => !gone.has(b.id));
  dropNotes(ids);
  if (gone.has(S.notebookId)) { S.notebookId = null; S.folderId = null; }
  if (gone.has(S.folderId)) S.folderId = null;
  redraw();
  toast(t('notes.toast.trashed'));
  return true;
}
/** Redraws every view (after a change made outside the screen, such as the assistant's). */
export const refresh = () => redraw();

/** Exports one note (md, html, txt, doc) or opens its print view (pdf). */
export function exportNote(n, format) {
  if (!n) return;
  const name = download(n, format);
  toast(name ? t('notes.toast.exported', { name }) : t('notes.toast.print_view'));
}

/** Exports a whole notebook as a zip of its notes (md or html), in their folders. */
export async function exportNotebook(id, format) {
  const nb = byId(S.notebooks, id);
  if (!nb) return;
  const notes = S.notes.filter((n) => n.notebook === id);
  const blob = await notebookZip(notes, S.folders.filter((f) => f.notebook === id), format);
  const name = fileBase(nb.title) + ' (' + (format === 'html' ? 'HTML' : 'Markdown') + ').zip';
  SlopUI.download(blob, name);
  toast(t('notes.toast.exported_n', { n: notes.length, name }));
}

/** The next (+1) or previous (-1) note in the list. */
export function stepNote(dir) {
  const list = visibleNotes();
  if (!list.length) return;
  const i = list.findIndex((n) => n.id === S.noteId);
  const j = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  selectNote(list[j].id);
}
