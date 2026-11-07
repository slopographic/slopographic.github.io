/* Paste state: the pastes loaded from Slop Drive and what the screen shows. S.id is the open paste (its Drive id).
 * S.pane is the phone view: 'list' or 'editor'. Wide screens show both. */
export const S = { pastes: [], id: null, query: '', pane: 'list' };

export const byId = (id) => S.pastes.find((p) => p.id === id) || null;
export const current = () => byId(S.id);
export const byLink = (pasteId) => S.pastes.find((p) => p.pasteId === pasteId) || null;

/** The pastes the list shows: newest first, filtered by the search (title, text, language). */
export function visible() {
  const q = S.query.trim().toLowerCase();
  return S.pastes.filter((p) => !q || (p.title + '\n' + p.body + '\n' + p.language).toLowerCase().includes(q))
    .sort((a, b) => b.modified - a.modified);
}

/** The first line of a text paste, for the list. */
export const firstLine = (p) => (p.kind === 'image' ? (window.SlopI18n ? window.SlopI18n.t('paste.app.image') : 'Image') : (String(p.body || '').split('\n').find((l) => l.trim()) || '').trim().slice(0, 90));
