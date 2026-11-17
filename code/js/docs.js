/* Slop Code: the open documents (tabs). The store keeps each document's EditorState, so switching tabs
 * keeps undo history and the selection. `dirty` means the text differs from what Slop Drive holds. */
import { makeState, newView, setHooks, langEffect } from './editor.js';
import { loadMore } from './lang-load.js';
import { syncDisplay } from './display.js';

const docs = [];
let active = null;
let view = null;

export const list = () => docs.slice();
export const current = () => active;
export const find = (id) => docs.find((d) => d.id === id) || null;
export const attachView = (v) => { view = v; };
/** The one editor view (null before the app has made it). */
export const mainView = () => view;
export const detach = () => { view = null; };
export { newView, setHooks };

/** Open a document. `text` is what the editor shows (a draft, or the saved text); `saved` is the Drive text. `meta` says how the
 * file is stored: its encoding ('utf-8', 'windows-1252'...), a byte order mark, and the line ending to write back. */
export function openDoc(rec, text, saved, meta = {}) {
  const doc = { id: rec.id, name: rec.name, folderId: rec.folderId ?? null, savedText: saved, dirty: text !== saved,
    state: makeState(text, rec.name), scroll: 0, langId: null, kind: 'text', preview: false, // langId: set by the mode switcher (session only)
    encoding: meta.encoding || 'utf-8', bom: !!meta.bom, eol: meta.eol || 'lf', ascii: !!meta.ascii, metaDirty: false };
  docs.push(doc);
  return doc;
}

/** Open a tab that shows the file rather than edits it: 'image', 'audio', 'video', 'pdf' or 'binary'. `url` is the
 * object URL of the blob (the caller frees it on close). Its editor state stays empty and it is never dirty. */
export function openView(rec, kind, url, meta = {}) {
  const doc = { id: rec.id, name: rec.name, folderId: rec.folderId ?? null, savedText: '', dirty: false,
    state: makeState('', rec.name), scroll: 0, langId: null, kind, url, mime: (rec.blob && rec.blob.type) || '', preview: false,
    info: meta.info || null, large: !!meta.large, size: rec.blob ? rec.blob.size : 0, blob: rec.blob || null }; // info: what the first bytes say (openfile.js)
  docs.push(doc);
  return doc;
}

/** Give a document a language. A built-in one applies at once; an extra one loads its mode first (the text shows plain until it
 * arrives). `keep` remembers it as the document's chosen language (the mode switcher, or a guess from its content). */
export async function applyLanguage(doc, lang, { keep = false } = {}) {
  if (keep) doc.langId = lang.id;
  const put = (extra) => {
    const effects = langEffect(lang, extra);
    if (doc === active && view) view.dispatch({ effects }); else doc.state = doc.state.update({ effects }).state;
  };
  if (!lang.more) { put(null); return; }
  if (keep) put(null);
  const support = await loadMore(lang.more);
  const still = keep ? doc.langId === lang.id : !doc.langId && docs.includes(doc);
  if (still && support && !(Array.isArray(support) && !support.length)) put(support);
}

/** The text of a document: the live editor text for the active one, the stored state for the others. */
export function textOf(doc) {
  const st = doc === active && view ? view.state : doc.state;
  return st.doc.toString();
}

/** Recompute `dirty` from the current text. Returns the document. */
export function refreshDirty(doc) {
  doc.dirty = textOf(doc) !== doc.savedText || !!doc.metaDirty; // metaDirty: the line ending was changed, the text was not
  return doc;
}

export function markSaved(doc, text) {
  doc.savedText = text;
  doc.metaDirty = false;
  refreshDirty(doc);
}

/** Make a document the one in the editor, keeping the previous one's state and scroll position. */
export function show(doc) {
  if (!doc || doc === active) return; // the active document's live state is in the view, not in doc.state
  if (active && view) { active.state = view.state; active.scroll = view.scrollDOM.scrollTop; }
  active = doc;
  if (view) {
    view.setState(doc.state);
    syncDisplay(view); // the display options belong to the viewer, not to one document
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
