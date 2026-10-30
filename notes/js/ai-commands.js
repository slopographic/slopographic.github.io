/* Slop Notes for the assistant: SlopCmd commands with arguments (shared/commands/args.js), imported on demand by
 * SlopCmd.prepare() (commands.js). Notes, notebooks and their Drive records go through the app's own store (store.js:
 * createNote, createNotebook, touch, trash), actions (selectNote, remove) and exports (export.js blobFor). The checkpoint
 * moves the notes the assistant made to the Trash and puts changed notes back as they were. */
import * as store from './store.js';
import * as A from './actions.js';
import { S, byId, curNote, snippet } from './state.js';
import { ensureNotebook, dropNotes } from './tabs.js';
import { blobFor, fileBase } from './export.js';

const C = window.SlopCmd;
const log = [];   // { made: id } | { changed: note, before }
const list = [];
const add = C.aiAdder('notes', list);   // shared/commands/commands.js
const NOTE = { name: 'note', type: 'string', maxLength: 200, description: 'note id or title; the open note when empty' };
const TAGS = { name: 'tags', type: 'array', maxItems: 30, items: { type: 'string' }, description: 'tags, without #' };
const cleanTags = (t) => [...new Set([].concat(t || []).map((x) => String(x).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 30);

/** A note by id or title (exact, then a part of it), or the open one. */
function noteOf(q) {
  if (q == null || q === '') { const n = curNote(); if (!n) throw new Error('No note is open: give note'); return n; }
  const s = String(q).toLowerCase();
  const n = byId(S.notes, q) || S.notes.find((x) => (x.title || '').toLowerCase() === s) || S.notes.find((x) => (x.title || '').toLowerCase().includes(s));
  if (!n) throw new Error(`No note “${q}”`);
  return n;
}
/** A notebook by name (made when new), or the current one. */
async function notebookOf(name) {
  if (!name) return ensureNotebook();
  const s = String(name).trim().toLowerCase(), hit = S.notebooks.find((b) => b.title.toLowerCase() === s);
  if (hit) return hit.id;
  const nb = await store.createNotebook(String(name).trim());
  S.notebooks.push(nb);
  log.push({ made: nb.id });
  return nb.id;
}
function change(n, fn) {
  log.push({ changed: n, before: { title: n.title, body: n.body, tags: n.tags.slice(), pinned: n.pinned } });
  fn(n);
  store.touch(n);
  A.refresh();
}

add('new_note', 'New note', [{ name: 'title', type: 'string', maxLength: 200, required: true }, { name: 'body', type: 'string', maxLength: 200000, description: 'the text, in Markdown' }, TAGS,
  { name: 'notebook', type: 'string', maxLength: 200, description: 'notebook name (made when new); the current one when empty' }],
async (a) => {
  const notebook = await notebookOf(a.notebook);
  const n = await store.createNote({ notebook, folder: null, title: a.title, body: a.body || '', tags: cleanTags(a.tags) });
  S.notes.push(n);
  log.push({ made: n.id });
  A.selectNote(n.id);
  return { done: `Made the note “${n.title}” in Slop Drive.`, id: n.id };
}, { description: 'Write a new note (title, Markdown text, tags) into a notebook; it is saved to Slop Drive.' });

add('new_notebook', 'New notebook', [{ name: 'title', type: 'string', maxLength: 200, required: true }], async (a) => {
  const id = await notebookOf(a.title); A.selectNotebook(id); return `The notebook “${a.title}” is open.`;
});

add('insert_text', 'Add text to a note', [NOTE, { name: 'text', type: 'string', maxLength: 200000, required: true, description: 'Markdown' },
  { name: 'where', type: 'enum', values: ['end', 'start'], default: 'end' }],
(a) => {
  const n = noteOf(a.note);
  change(n, (x) => { const b = x.body || ''; x.body = a.where === 'start' ? `${a.text}\n\n${b}`.trimEnd() + '\n' : `${b.replace(/\s*$/, '')}${b.trim() ? '\n\n' : ''}${a.text}\n`; });
  return `Added ${a.text.length} characters to “${n.title || 'Untitled'}”.`;
}, { description: 'Append (or prepend) Markdown text to a note.' });

add('set_note', 'Change a note', [NOTE, { name: 'title', type: 'string', maxLength: 200 }, { name: 'body', type: 'string', maxLength: 200000, description: 'replaces the whole text' },
  TAGS, { name: 'add_tags', type: 'array', maxItems: 30, items: { type: 'string' } }, { name: 'pinned', type: 'boolean' }],
(a) => {
  const n = noteOf(a.note);
  change(n, (x) => {
    if (a.title != null) x.title = String(a.title).trim();
    if (a.body != null) x.body = a.body;
    if (a.tags) x.tags = cleanTags(a.tags);
    if (a.add_tags) x.tags = cleanTags(x.tags.concat(a.add_tags));
    if (a.pinned != null) x.pinned = a.pinned;
  });
  return `Changed “${n.title || 'Untitled'}”: tags ${n.tags.join(', ') || 'none'}${n.pinned ? ', pinned' : ''}.`;
}, { description: 'Rename a note, replace its text, set or add tags, pin it.' });

add('delete_note', 'Move a note to Trash', [NOTE], async (a) => {
  const n = noteOf(a.note);
  await A.remove(n, { ask: false });
  return `Moved “${n.title || 'Untitled'}” to the Slop Drive Trash (it can be restored there).`;
}, { destructive: true });

add('export_note', 'Export a note', [NOTE, { name: 'format', type: 'enum', values: ['md', 'html', 'txt', 'doc'], default: 'md' },
  { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
async (a) => {
  const n = noteOf(a.note), blob = blobFor(n, a.format), name = fileBase(n.title) + '.' + a.format, out = [];
  if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'notes' })})`);
  if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
  return out.join(' and ') + '.';
}, { description: 'Save a note as Markdown, HTML, text or Word (.doc) to Slop Drive and/or a download.' });

function state() {
  const n = curNote();
  return { app: 'Slop Notes', notebooks: S.notebooks.map((b) => b.title),
    notes: S.notes.slice(0, 100).map((x) => ({ id: x.id, title: x.title, tags: x.tags, pinned: x.pinned, snippet: snippet(x.body) })),
    open: n ? { id: n.id, title: n.title, tags: n.tags, body: (n.body || '').slice(0, 4000) } : null };
}
function checkpoint() {
  const mark = log.length;
  return () => {
    const undo = log.splice(mark).reverse();
    const made = undo.filter((e) => e.made).map((e) => e.made);
    for (const e of undo) if (e.changed) { Object.assign(e.changed, e.before); store.touch(e.changed); }
    if (made.length) {
      store.forget(made);
      dropNotes(made);
      store.trash(made).catch(() => {});
      const gone = new Set(made);
      S.notes = S.notes.filter((x) => !gone.has(x.id)); S.notebooks = S.notebooks.filter((b) => !gone.has(b.id));
      if (gone.has(S.notebookId)) S.notebookId = null;
    }
    A.refresh();
    return true;
  };
}

C.register(list);
C.provide({ state, checkpoint });
