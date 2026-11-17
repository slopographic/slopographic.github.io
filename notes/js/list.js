/* The note list: the notes the sidebar and the search allow, pinned first, newest first. */
import { S, visibleNotes, snippet, curBook, curFolder } from './state.js';
import * as A from './actions.js';
import { $, el, clear, dateText, t } from './dom.js';

function crumb() {
  const b = curBook(), f = curFolder();
  $('nt-crumb').textContent = b ? (b.title || t('notes.app.untitled_book')) + (f ? ' › ' + (f.title || t('notes.app.untitled_folder')) : '') : t('notes.app.all_books');
}

export function renderList() {
  crumb();
  const box = clear($('nt-notes'));
  const items = visibleNotes();
  for (const n of items) {
    const meta = [dateText(n.modified), n.tags.length ? n.tags.map((g) => '#' + g).join(' ') : ''].filter(Boolean).join(' · ');
    box.append(el('button', { class: 'nt-note' + (n.id === S.noteId ? ' on' : ''), type: 'button', 'data-kind': 'note', 'data-id': n.id,
      'aria-current': n.id === S.noteId ? 'true' : null, onclick: () => A.selectNote(n.id) },
    el('span', { class: 'nt-note-top' }, n.pinned ? el('span', { class: 'nt-pin', title: t('notes.app.pinned'), 'aria-label': t('notes.app.pinned') }, '★') : null,
      el('span', { class: 'nt-note-title' }, n.title || t('ui.untitled'))),
    el('span', { class: 'nt-note-snip' }, snippet(n.body) || t('notes.app.no_text')),
    el('span', { class: 'nt-note-meta' }, meta)));
  }
  const none = $('nt-none');
  none.hidden = items.length > 0;
  none.textContent = S.notes.length ? t('notes.app.no_match') : t('notes.app.no_notes');
}
