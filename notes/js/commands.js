/* Slop Notes commands, registered with SlopCmd so the palette, the menus and the shortcut editor all know them.
 * Commands that need a note are hidden when none is open (when()). */
import * as A from './actions.js';
import { S, curNote } from './state.js';
import { $ } from './dom.js';
import { setMode } from './editor.js';
import * as tabs from './tabs.js';
import { t, onLang } from './dom.js';

const MODES = ['split', 'write', 'preview'];

export function commandList() {
  const has = () => !!curNote();
  // title and group are keys, read in the current language each time the list is built
  const C = (id, title, group, keys, extra = {}) => Object.assign({ id: 'notes.' + id, title: t(title), group: t(group), keys, run: () => {} }, extra);
  return [
    C('new', 'notes.cmd.new', 'menu.file', ['Mod+Alt+N'], { keywords: ['create', 'write'], run: () => A.newNote() }),
    C('save', 'notes.cmd.save', 'menu.file', ['Mod+S'], { keywords: ['store', 'drive'], when: has, run: () => tabs.saveCurrent() }),
    C('rename', 'ui.rename_dots', 'menu.file', [], { keywords: ['name', 'title'], when: has, run: () => window.SlopDocTabs.rename(null) }),
    C('notebook', 'notes.cmd.notebook', 'menu.file', [], { keywords: ['folder', 'book'], run: () => A.newNotebook() }),
    C('folder', 'notes.menu.new_folder', 'menu.file', [], { keywords: ['subfolder'], run: () => A.newFolder() }),
    C('md', 'notes.cmd.md', 'menu.file', [], { keywords: ['download', '.md'], when: has, run: () => A.exportNote(curNote(), 'md') }),
    C('html', 'notes.cmd.html', 'menu.file', [], { keywords: ['download', '.html', 'web page'], when: has, run: () => A.exportNote(curNote(), 'html') }),
    C('find', 'notes.app.search_aria', 'menu.edit', ['Mod+Shift+F'], { keywords: ['find', 'filter'], run: () => $('nt-q').focus() }),
    C('pin', 'notes.cmd.pin', 'menu.edit', ['Mod+Alt+P'], { keywords: ['star', 'top'], when: has, run: () => A.togglePin() }),
    C('delete', 'notes.cmd.delete', 'menu.edit', [], { keywords: ['remove', 'delete'], when: has, run: () => A.remove(curNote()) }),
    C('view', 'notes.cmd.view', 'menu.view', ['Mod+Alt+V'], { keywords: ['preview', 'markdown', 'split'], run: () => setMode(MODES[(MODES.indexOf(S.mode) + 1) % MODES.length]) }),
    C('next', 'notes.cmd.next', 'notes.cmd.g_go', ['Mod+Alt+ArrowDown'], { keywords: ['down'], run: () => A.stepNote(1) }),
    C('prev', 'notes.cmd.prev', 'notes.cmd.g_go', ['Mod+Alt+ArrowUp'], { keywords: ['up'], run: () => A.stepNote(-1) }),
  ];
}

/** Registers the commands with SlopCmd when it is loaded. */
export function registerCommands() {
  if (!window.SlopCmd) return;
  SlopCmd.init({ app: 'notes' });
  SlopCmd.register(commandList());
  onLang(() => SlopCmd.register(commandList()));   // the palette follows a language change
  // the assistant's commands with arguments (ai-commands.js), loaded when the AI panel first asks
  if (SlopCmd.provide) SlopCmd.provide({ prepare: () => import('./ai-commands.js') });
}
