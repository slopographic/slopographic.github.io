/* Right-click and keyboard menus for notebooks, folders, notes and the note source, and the Export menu. Items call the
 * actions. F2 on a notebook, folder or note renames it (renameFocused). */
import * as A from './actions.js';
import { S, byId, curNote } from './state.js';
import { blockItems } from './blocks.js';
import { t } from './dom.js';

const key = (id) => (window.SlopCtx ? SlopCtx.keyFor(id) : '');

/** The export choices for one note: each format once, then the whole notebook as a zip. The Export button and the
 * right-click menu both use this list. */
export function exportItems(n) {
  return [
    { label: t('notes.menu.md'), act: () => A.exportNote(n, 'md') },
    { label: t('notes.menu.html'), act: () => A.exportNote(n, 'html') },
    { label: t('notes.menu.txt'), act: () => A.exportNote(n, 'txt') },
    { label: t('notes.menu.pdf'), act: () => A.exportNote(n, 'pdf') },
    { label: t('notes.menu.doc'), act: () => A.exportNote(n, 'doc') },
    '-',
    { label: t('notes.menu.book_md'), act: () => A.exportNotebook(n.notebook, 'md') },
    { label: t('notes.menu.book_html'), act: () => A.exportNotebook(n.notebook, 'html') },
  ];
}

/** The menu for one item. kind is 'notebook', 'folder' or 'note'; id is its Drive id. */
export function menuFor(kind, id) {
  if (kind === 'notebook') {
    const nb = byId(S.notebooks, id);
    if (!nb) return null;
    return [
      { label: t('notes.menu.open_book'), act: () => A.selectNotebook(id) },
      { label: t('notes.menu.new_here'), act: () => { A.selectNotebook(id); A.newNote(); } },
      { label: t('notes.menu.new_folder'), act: () => { A.selectNotebook(id); A.newFolder(null); } },
      { label: t('ui.rename_dots'), act: () => A.rename(nb) },
      { label: t('notes.menu.export_book'), sub: [
        { label: t('notes.menu.as_md'), act: () => A.exportNotebook(id, 'md') },
        { label: t('notes.menu.as_html'), act: () => A.exportNotebook(id, 'html') },
      ] },
      '-',
      { label: t('notes.menu.trash'), act: () => A.remove(nb) },
    ];
  }
  if (kind === 'folder') {
    const f = byId(S.folders, id);
    if (!f) return null;
    return [
      { label: t('notes.menu.open_folder'), act: () => A.selectFolder(id) },
      { label: t('notes.menu.new_sub'), act: () => A.newFolder(id) },
      { label: t('ui.rename_dots'), act: () => A.rename(f) },
      '-',
      { label: t('notes.menu.trash'), act: () => A.remove(f) },
    ];
  }
  if (kind === 'note') {
    const n = byId(S.notes, id);
    if (!n) return null;
    const here = S.folders.filter((f) => f.notebook === n.notebook);
    const toFolders = [{ label: t('notes.menu.top'), disabled: !n.folder, act: () => A.moveToFolder(n, null) }]
      .concat(here.map((f) => ({ label: f.title || t('notes.app.untitled_folder'), disabled: n.folder === f.id, act: () => A.moveToFolder(n, f.id) })));
    const toBooks = S.notebooks.filter((b) => b.id !== n.notebook).map((b) => ({ label: b.title || t('notes.app.untitled_book'), act: () => A.moveToNotebook(n, b.id) }));
    return [
      { label: t('notes.menu.open_note'), act: () => A.selectNote(id) },
      { label: n.pinned ? t('notes.menu.unpin') : t('notes.menu.pin_top'), key: key('notes.pin'), act: () => A.togglePin(n) },
      { label: t('ui.rename_dots'), act: () => A.rename(n) },
      { label: t('notes.menu.to_folder'), sub: toFolders },
      ...(toBooks.length ? [{ label: t('notes.menu.to_book'), sub: toBooks }] : []),
      '-',
      { label: t('menu.export'), sub: exportItems(n) },
      '-',
      { label: t('notes.menu.trash'), key: key('notes.delete'), act: () => A.remove(n) },
    ];
  }
  return null;
}

/** The Export button's menu, for the current note. */
export function exportMenu() {
  const n = curNote();
  return n ? exportItems(n) : null;
}

/** The menu for a right-click or Menu key target: the note source offers the blocks; otherwise the nearest item with
 * data-kind offers its own menu. */
export function resolveMenu(target) {
  if (target && target.id === 'nt-body') return blockItems();
  const item = target && target.closest ? target.closest('[data-kind]') : null;
  return item ? menuFor(item.dataset.kind, item.dataset.id) : null;
}

const LISTS = { notebook: () => S.notebooks, folder: () => S.folders, note: () => S.notes };

/** F2 on a notebook, folder or note renames it. Returns true when it did. */
export function renameFocused(target) {
  const item = target && target.closest ? target.closest('[data-kind]') : null;
  const list = item && LISTS[item.dataset.kind] ? LISTS[item.dataset.kind]() : null;
  const x = list && byId(list, item.dataset.id);
  if (!x) return false;
  A.rename(x);
  return true;
}
