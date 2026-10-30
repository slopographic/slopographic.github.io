/* Slop Code: the open documents (tabs). The store keeps each document's EditorState, so switching tabs
 * keeps undo history and the selection. `dirty` means the text differs from what Slop Drive holds. */
import { makeState, newView, setHooks } from './editor.js';

const docs = [];
let active = null;
let view = null;

export const list = () => docs.slice();
export const current = () => active;
export const find = (id) => docs.find((d) => d.id === id) || null;
export const attachView = (v) => { view = v; };
export const detach = () => { view = null; };
export { newView, setHooks };

/** Open a document. `text` is what the editor shows (a draft, or the saved text); `saved` is the Drive text. */
export function openDoc(rec, text, saved) {
  const doc = { id: rec.id, name: rec.name, folderId: rec.folderId ?? null, savedText: saved, dirty: text !== saved,
    state: makeState(text, rec.name), scroll: 0, langId: null, kind: 'text', preview: false }; // langId: set by the mode switcher (session only)
  docs.push(doc);
  return doc;
}

/** Open a tab that shows the file rather than edits it: 'image', 'audio', 'video', 'pdf' or 'binary'. `url` is the
 * object URL of the blob (the caller frees it on close). Its editor state stays empty and it is never dirty. */
export function openView(rec, kind, url) {
  const doc = { id: rec.id, name: rec.name, folderId: rec.folderId ?? null, savedText: '', dirty: false,
    state: makeState('', rec.name), scroll: 0, langId: null, kind, url, mime: (rec.blob && rec.blob.type) || '', preview: false };
  docs.push(doc);
  return doc;
}

/** The text of a document: the live editor text for the active one, the stored state for the others. */
export function textOf(doc) {
  const st = doc === active && view ? view.state : doc.state;
  return st.doc.toString();
}

/** Recompute `dirty` from the current text. Returns the document. */
export function refreshDirty(doc) {
  doc.dirty = textOf(doc) !== doc.savedText;
  return doc;
}

export function markSaved(doc, text) {
  doc.savedText = text;
  refreshDirty(doc);
}

/** Make a document the one in the editor, keeping the previous one's state and scroll position. */
export function show(doc) {
  if (!doc || doc === active) return; // the active document's live state is in the view, not in doc.state
  if (active && view) { active.state = view.state; active.scroll = view.scrollDOM.scrollTop; }
  active = doc;
  if (view) {
    view.setState(doc.state);
    view.scrollDOM.scrollTop = doc.scroll || 0;
  }
}

/** Remove a document. Returns the document that is shown next (or null). */
export function close(doc) {
  const i = docs.indexOf(doc);
  if (i < 0) return active;
  docs.splice(i, 1);
  if (active !== doc) return active;
  const next = docs[Math.min(i, docs.length - 1)] || null;
  active = null;
  if (next) show(next);
  else if (view) view.setState(makeState('', 'untitled.txt'));
  return next;
}

export function rename(id, name) {
  const d = find(id);
  if (d) d.name = name;
}
