/* Slop Notes: the open notes as tabs (the shared strip, shared/doctabs). A tab is one note: T = { id, creating, ready }, where
 * id is the note's Slop Drive record. The note itself is that record (store.js) and keeps saving as it always did; the tab
 * remembers which notes are open, across reloads (SlopDocTabs.session). The strip's Save writes the note's Markdown body to
 * its own Drive file (drive.js, the same record). A blank tab (no note yet, or a note that is gone) shows the empty state
 * and creates no Drive record. Exposes nothing global: main.js and actions.js import from here. */
import * as store from './store.js';
import { S, byId } from './state.js';
import { t } from './dom.js';

const MD = 'text/markdown';
let api = null, session = null, redraw = () => {}, restoring = false, quiet = 0, wantNew = 0;

const toast = (m) => { if (window.SlopUI) SlopUI.toast(m); };
const noteOf = (T) => (T && T.id ? byId(S.notes, T.id) : null);
const isBlank = (T) => !!T && !T.id && !T.creating;

/** The notebook new notes go into: the chosen one, else the first, else a new 'My notes'. */
export async function ensureNotebook() {
  if (S.notebookId) return S.notebookId;
  if (!S.notebooks.length) S.notebooks.push(await store.createNotebook(t('notes.app.my_notes')));
  S.notebookId = S.notebooks[0].id;
  return S.notebookId;
}
/** A new note record in Drive, added to the list. */
async function newRecord() {
  const notebook = await ensureNotebook();
  const n = await store.createNote({ notebook, folder: S.folderId, title: '' });
  S.notes.push(n);
  return n;
}
function focusTitle() {
  const field = document.getElementById('nt-title');
  if (field) { field.focus(); field.select(); }
}
/** Runs fn with blank tabs created without a Drive record (restore, and a close that leaves one blank tab). */
function quietly(fn) {
  quiet++;
  try { return fn(); } finally { quiet--; }
}

const adapter = {
  newDoc() {
    // Only New note creates a Drive record. A blank tab from + or from closing the last note tab stays empty.
    const T = { id: null, creating: false, ready: null };
    if (restoring || quiet || !wantNew) return T;
    T.creating = true;
    T.ready = newRecord().then((n) => {
      T.id = n.id;
      T.creating = false;
      api.setDriveId(T, n.id);
      if (api.current() === T) { S.noteId = n.id; S.pane = 'editor'; redraw(); focusTitle(); }
      return n;
    }, (e) => {
      T.creating = false;
      toast(t('notes.toast.create_failed', { error: e && e.message ? e.message : e }));
    });
    return T;
  },
  serialize: (T) => ({ noteId: T.id || null }),
  restore(s) {
    if (!s || typeof s.noteId !== 'string' || !byId(S.notes, s.noteId)) throw new Error('that note is no longer in Slop Drive');
    return { id: s.noteId, creating: false, ready: null };
  },
  title: (T) => { const n = noteOf(T); return n ? (n.title || t('ui.untitled')) : t('ui.untitled'); },
  dirty: (T) => { const n = noteOf(T); return !!(n && n.dirty); },
  activate(T) {
    S.noteId = T.id || null;
    const n = noteOf(T);
    if (n && n.notebook) S.notebookId = n.notebook;
    S.pane = T.id ? 'editor' : 'list';   // a blank tab has nothing to edit: a phone shows the notes to pick from
    redraw();
  },
  deactivate() { /* the note stays in the list; nothing to put away */ },
  saved() { /* the note is written by store.js; the strip's Save only marks the tab */ },
  drive: {
    ext: '.md',
    mime: MD,
    toBlob: (T) => { const n = noteOf(T); return new Blob([n ? n.body || '' : ''], { type: MD }); },
    fromBlob: async () => { throw new Error('Notes are opened from the list'); },
  },
};

/** Mounts the strip. Call restore() once the notes are loaded from Slop Drive. */
export function init(opts = {}) {
  redraw = opts.redraw || redraw;
  api = SlopDocTabs.mount(document.getElementById('nt-tabs'), adapter, { appId: 'notes' });
  api.on(() => { if (window.SlopGuard) SlopGuard.setUnsaved('notes', store.hasPending()); });
  session = SlopDocTabs.session('notes', api, { notice: toast });
  return session;
}
/** Writes the open tabs to this device now (called once a save has reached Slop Drive, so a reload finds them). */
export function flush() {
  return session ? session.flush() : Promise.resolve(false);
}
/** Reopens the notes that were open last. Blank tabs are not given a note. */
export async function restore(session) {
  restoring = true;
  try { await session.restore(); } finally { restoring = false; }
}
/** Redraws the strip (titles and unsaved dots). Called after any change to the notes. */
export function refresh() {
  if (api && api.current()) api.changed(api.current());
}
/** Shows a note in a tab: its own tab if it has one, else a new tab that replaces a blank one. */
export function openNote(id) {
  if (!api || !byId(S.notes, id)) return;
  const open = api.tabs().find((tab) => tab.doc.id === id);
  if (open) { api.activate(open.doc); return; }
  const blank = api.current() && isBlank(api.current()) ? api.current() : null;
  api.openDoc({ id, creating: false, ready: null }, { driveId: id });
  if (blank) quietly(() => api.close(blank));
}
/** New note: a new Drive record in a new tab (a blank tab it replaces is closed). */
export function newNoteTab() {
  if (!api) return null;
  const blank = api.current() && isBlank(api.current()) ? api.current() : null;
  wantNew++;
  let entry;
  try { entry = api.newTab(); } finally { wantNew--; }
  if (blank) quietly(() => api.close(blank));
  return entry;
}
/** Notes moved to the Trash: their tabs close without asking (store.forget already dropped their pending writes). */
export function dropNotes(ids) {
  if (!api) return;
  const gone = new Set(ids);
  for (const e of api.tabs()) {
    if (!e.doc.id || !gone.has(e.doc.id)) continue;
    const n = noteOf(e.doc);
    if (n) n.dirty = false;
    quietly(() => api.close(e.doc));
  }
}
/** Save (Ctrl+S): the note's own record first, then the strip's Save writes its body to the same Drive file. */
export async function saveCurrent() {
  const T = api && api.current();
  if (!T || !T.id) return false;
  await store.flush();
  return !!(await api.saveToDrive(T));
}
