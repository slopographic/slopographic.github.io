/* Paste commands (SlopCmd: palette, shortcut editor and menu labels) and the right-click menus for pastes. */
import * as A from './actions.js';
import { S, byId, current } from './state.js';
import { $, t, onLang } from './dom.js';

const has = () => !!current();

export function commandList() {
  const C = (id, title, group, keys, extra = {}) => Object.assign({ id: 'paste.' + id, title: t(title), group: t(group), keys, run: () => {} }, extra);
  return [
    C('new', 'paste.app.new', 'menu.file', ['Mod+Alt+N'], { keywords: ['create', 'text'], run: () => A.newPaste({ kind: 'text' }) }),
    C('image', 'paste.cmd.image', 'menu.file', [], { keywords: ['picture', 'photo', 'upload'], run: () => A.addImage() }),
    C('copy', 'paste.cmd.copy', 'menu.file', [], { keywords: ['clipboard'], when: has, run: () => A.copy(current()) }),
    C('download', 'paste.cmd.download', 'menu.file', [], { keywords: ['save', 'file'], when: has, run: () => A.download(current()) }),
    C('share', 'paste.menu.copy_link', 'menu.file', ['Mod+Alt+L'], { keywords: ['link', 'url', 'share'], when: has, run: () => A.share(current()) }),
    C('delete', 'paste.cmd.delete', 'menu.edit', [], { keywords: ['remove', 'delete'], when: has, run: () => A.remove(current()) }),
    C('find', 'paste.app.search_label', 'menu.edit', ['Mod+Shift+F'], { keywords: ['find', 'filter'], run: () => $('pb-q').focus() }),
    C('next', 'paste.cmd.next', 'paste.cmd.go', ['Mod+Alt+ArrowDown'], { keywords: ['down'], run: () => A.step(1) }),
    C('prev', 'paste.cmd.prev', 'paste.cmd.go', ['Mod+Alt+ArrowUp'], { keywords: ['up'], run: () => A.step(-1) }),
  ];
}

export function registerCommands() {
  if (!window.SlopCmd) return;
  SlopCmd.init({ app: 'paste' });
  SlopCmd.register(commandList());
  onLang(() => SlopCmd.register(commandList()));   // the palette in the new language
  // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
  if (SlopCmd.provide) SlopCmd.provide({ prepare: () => import('./ai-commands.js') });
}

/** The menu for a paste in the list: Open, Copy, Download, Share link, Trash. */
export function menuFor(id) {
  const p = byId(id);
  if (!p) return null;
  return [
    { label: t('paste.menu.open'), act: () => A.open(id) },
    { label: t('paste.app.copy'), act: () => A.copy(p) },
    { label: t('paste.app.download'), act: () => A.download(p) },
    { label: t('paste.menu.copy_link'), key: window.SlopCtx ? SlopCtx.keyFor('paste.share') : '', act: () => A.share(p) },
    '-',
    { label: t('paste.menu.trash'), act: () => A.remove(p) },
  ];
}

/** Resolves the right-click or Menu key target: the nearest list item (data-kind="paste"). */
export function resolveMenu(target) {
  const item = target && target.closest ? target.closest('[data-kind="paste"]') : null;
  return item && S.pastes.length ? menuFor(item.dataset.id) : null;
}
