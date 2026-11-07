/* Slop Notes state: what is loaded from Drive and what the screen shows. One object, read and changed by the views.
 * S.notebookId null = every notebook. S.folderId null = the whole notebook. S.tag null = every tag.
 * S.pane is the phone view: 'list' (notes) or 'editor' (one note); on a phone the notebooks are a drawer over it (main.js).
 * Wide screens show all three. */
export const S = {
  notebooks: [], folders: [], notes: [],
  notebookId: null, folderId: null, tag: null, query: '',
  noteId: null, mode: 'split', pane: 'list',
};

export const byId = (list, id) => list.find((x) => x.id === id) || null;
export const curNote = () => byId(S.notes, S.noteId);
export const curBook = () => byId(S.notebooks, S.notebookId);
export const curFolder = () => byId(S.folders, S.folderId);

/** The notes the list shows: the chosen notebook and folder, the tag and the search, pinned first, then newest. */
export function visibleNotes() {
  const q = S.query.trim().toLowerCase();
  return S.notes.filter((n) => {
    if (S.notebookId && n.notebook !== S.notebookId) return false;
    if (S.folderId && n.folder !== S.folderId) return false;
    if (S.tag && !n.tags.includes(S.tag)) return false;
    if (q && !(n.title + '\n' + n.body + '\n' + n.tags.join(' ')).toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (b.pinned - a.pinned) || (b.modified - a.modified));
}

/** Tags used by the notes in the chosen notebook (or all), with counts, most used first. */
export function tagCounts() {
  const counts = new Map();
  for (const n of S.notes) {
    if (S.notebookId && n.notebook !== S.notebookId) continue;
    for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Folders in the chosen notebook, as a list of [folder, depth], depth-first, so a tree reads top to bottom. */
export function folderTree() {
  if (!S.notebookId) return [];
  const out = [];
  const walk = (parent, depth) => {
    for (const f of S.folders) {
      if (f.notebook !== S.notebookId || (f.parent || null) !== parent) continue;
      out.push([f, depth]);
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The text shown under a note's title: its first line of prose, with the Markdown marks taken off. */
export function snippet(body) {
  const line = String(body || '').split('\n').map((l) => l.replace(/^[#>*\-+\s`]+|[*_`~\[\]]/g, '').trim()).find((l) => l) || '';
  return line.length > 90 ? line.slice(0, 89) + '…' : line;
}
