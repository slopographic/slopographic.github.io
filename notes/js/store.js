/* Slop Notes data, kept in Slop Drive. Every notebook, folder and note is a Drive file with meta.type 'notes' and a
 * meta.kind ('notebook' | 'folder' | 'note'). A note is a Markdown file (text/markdown) whose body is the blob; the other
 * two are small records (application/x-slop-notes). New files go into the app's own Drive folder (see SlopHub.put).
 * Saves are debounced: touch(note) schedules one write, flush() writes now. Deleting moves to the Drive Trash. */
const TYPE = 'notes';
const NOTE_MIME = 'text/markdown';
const META_MIME = 'application/x-slop-notes';
const APP = 'notes';
const DELAY = 600;

const SH = () => window.SlopHub;
const metaOf = (r) => (r && r.meta && r.meta.type === TYPE ? r.meta : null);
const clean = (s, fallback) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;
const noteName = (n) => clean(n.title, 'Untitled') + '.md';

/** The meta object kept on the Drive record. Only fields that belong to the item's kind. */
function metaFor(n) {
  const base = { type: TYPE, kind: n.kind, title: n.title };
  if (n.kind === 'note') return { ...base, tags: n.tags, pinned: n.pinned, notebook: n.notebook, folder: n.folder };
  if (n.kind === 'folder') return { ...base, notebook: n.notebook, parent: n.parent };
  return base;
}
const blobOf = (n) => (n.kind === 'note' ? new Blob([n.body || ''], { type: NOTE_MIME }) : new Blob([], { type: META_MIME }));

async function bodyOf(r) {
  try { return r.blob ? await r.blob.text() : ''; } catch (e) { return ''; }
}

/** Every live notebook, folder and note from Drive (the Trash is left out). */
export async function load() {
  const recs = await SH().list({ accept: [NOTE_MIME, META_MIME] }); // intake-ok: the notes store, not a picker
  const out = { notebooks: [], folders: [], notes: [] };
  for (const r of recs) {
    const m = metaOf(r);
    if (!m) continue;
    const at = { id: r.id, title: m.title || r.name || '', time: r.time, modified: r.modified || r.time };
    if (m.kind === 'notebook') out.notebooks.push({ ...at, kind: 'notebook' });
    else if (m.kind === 'folder') out.folders.push({ ...at, kind: 'folder', notebook: m.notebook || null, parent: m.parent || null });
    else if (m.kind === 'note') {
      out.notes.push({ ...at, kind: 'note', body: await bodyOf(r), tags: Array.isArray(m.tags) ? m.tags : [], pinned: !!m.pinned,
        notebook: m.notebook || null, folder: m.folder || null, dirty: false });
    }
  }
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  out.notebooks.sort(byTitle);
  out.folders.sort(byTitle);
  return out;
}

/** Writes a new item to Drive now. Resolves with the item, now carrying its Drive id. */
async function putNew(item) {
  const title = item.kind === 'note' ? clean(item.title, '') : clean(item.title, item.kind === 'notebook' ? 'Untitled notebook' : 'Untitled folder');
  const it = { ...item, title };
  const name = it.kind === 'note' ? noteName(it) : title;
  it.id = await SH().put(blobOf(it), { name, from: APP, meta: metaFor(it) });
  it.time = it.modified = Date.now();
  it.dirty = false;
  return it;
}

export const createNotebook = (title) => putNew({ kind: 'notebook', title, notebook: null, parent: null });
export const createFolder = (notebook, parent, title) => putNew({ kind: 'folder', title, notebook, parent });
export const createNote = ({ notebook = null, folder = null, title = '', body = '', tags = [] } = {}) =>
  putNew({ kind: 'note', title, body, tags, pinned: false, notebook, folder });

/** Writes the current state of one item (its meta, and for a note its body) back to its Drive record. */
export async function saveNow(n) {
  const patch = { name: n.kind === 'note' ? noteName(n) : n.title, meta: metaFor(n) };
  if (n.kind === 'note') { const b = blobOf(n); patch.blob = b; patch.type = b.type; }
  const out = await SH().update(n.id, patch);
  if (!out) throw new Error('This note is no longer in Slop Drive');
}

/** The ids to move to the Trash for an item: a notebook takes its folders and notes, a folder its sub-folders and notes. */
export function trashIds(all, item) {
  if (item.kind === 'note') return [item.id];
  const folders = new Set(item.kind === 'notebook' ? [] : [item.id]);
  const books = new Set(item.kind === 'notebook' ? [item.id] : []);
  if (item.kind === 'folder') {
    for (let grew = true; grew;) {
      grew = false;
      for (const f of all.folders) if (!folders.has(f.id) && folders.has(f.parent)) { folders.add(f.id); grew = true; }
    }
  }
  const notes = all.notes.filter((n) => (books.has(n.notebook)) || (folders.has(n.folder)));
  const subFolders = all.folders.filter((f) => books.has(f.notebook) || folders.has(f.id));
  return [item.id, ...notes.map((n) => n.id), ...subFolders.map((f) => f.id)].filter((v, i, a) => a.indexOf(v) === i);
}

export async function trash(ids) {
  const now = Date.now();
  for (const id of ids) await SH().update(id, { trashedAt: now });
}

/* ---------- debounced saves ---------- */
const dirty = new Map();
let timer = 0, inFlight = 0, chain = Promise.resolve(), listener = () => {};

/** Called with 'saving', 'saved' or ('error', err). */
export function onSaveState(fn) { listener = fn; }
export const hasPending = () => dirty.size > 0 || timer !== 0 || inFlight > 0;
/** Drops queued writes for items that were moved to the Trash. */
export function forget(ids) { for (const id of ids) dirty.delete(id); }

/** Marks an item as changed; it is written DELAY ms after the last change. */
export function touch(n) {
  n.dirty = true;
  dirty.set(n.id, n);
  listener('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, DELAY);
}

/** Writes every changed item now. Writes run one after another, so a save never overtakes an older one. */
export function flush() {
  clearTimeout(timer);
  timer = 0;
  chain = chain.then(async () => {
    if (!dirty.size) return;
    const list = [...dirty.values()];
    dirty.clear();
    inFlight++;
    try {
      for (const n of list) { await saveNow(n); n.dirty = dirty.has(n.id); }
      inFlight--;
      listener('saved');
    } catch (e) {
      inFlight--;
      for (const n of list) if (!dirty.has(n.id)) dirty.set(n.id, n);
      listener('error', e);
      timer = setTimeout(flush, 3000);
    }
  });
  return chain;
}
