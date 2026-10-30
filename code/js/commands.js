/* Slop Code: the commands, registered with SlopCmd (shared/commands) so the palette, the key labels and the
 * shortcut editor all know them. Without SlopCmd, the same shortcuts are handled here. */
import { t, onLang } from './dom.js';

/** The command list for the action table `A` (open, new, save, saveAs, close, find, replace, wrap, files, run, and the
 * Explorer and Extensions actions: newFolder, format, language, extensions). */
export function commandList(A) {
  // title and group are keys, read in the current language each time the list is built
  const C = (id, title, group, keys, extra = {}) => ({ id: 'code.' + id, title: t(title), group: t(group), keys, run: () => A[id](), ...extra });
  return [
    C('open', 'code.cmd.open', 'menu.file', ['Mod+O'], { keywords: ['load', 'drive'] }),
    C('new', 'code.cmd.new', 'menu.file', ['Mod+Alt+N'], { keywords: ['create', 'type', 'language'] }),
    C('save', 'menu.save', 'menu.file', ['Mod+S'], { keywords: ['write', 'drive'] }),
    C('saveAs', 'code.cmd.saveas', 'menu.file', ['Shift+Mod+S'], { keywords: ['copy', 'folder'] }),
    C('close', 'code.cmd.close', 'menu.file', ['Mod+Alt+W']),
    C('find', 'code.cmd.find', 'menu.edit', ['Mod+F'], { keywords: ['search'] }),
    C('replace', 'ui.replace', 'menu.edit', ['Mod+H'], { keywords: ['substitute'] }),
    C('wrap', 'code.cmd.wrap', 'menu.view', ['Mod+Alt+Z'], { keywords: ['word wrap'] }),
    C('files', 'code.cmd.files', 'menu.view', ['Mod+B'], { keywords: ['files', 'tree', 'sidebar', 'drawer'] }),
    C('newFolder', 'code.cmd.new_folder', 'menu.file', ['Mod+Alt+Shift+N'], { keywords: ['folder', 'directory', 'create'] }),
    C('extensions', 'code.cmd.extensions', 'menu.view', [], { keywords: ['helpers', 'toggle', 'snippets', 'formatter'] }),
    C('language', 'code.cmd.language', 'ui.mb.tools', [], { keywords: ['highlight', 'syntax', 'mode', 'language'] }),
    C('format', 'code.ext.formatter_btn', 'ui.mb.tools', ['Shift+Mod+F'], { keywords: ['pretty', 'indent', 'beautify', 'formatter'] }),
    C('run', 'code.cmd.run', 'ui.mb.tools', ['Mod+Enter'], { keywords: ['preview', 'html', 'javascript'] }),
  ];
}

/** Register with SlopCmd, or install a small keydown handler when it is not loaded. */
export function registerCommands(A) {
  const list = commandList(A);
  if (window.SlopCmd) {
    try {
      SlopCmd.init({ app: 'code' }); SlopCmd.register(list);
      onLang(() => SlopCmd.register(commandList(A)));   // the palette follows a language change
      if (SlopCmd.provide) SlopCmd.provide({ prepare: () => import('./ai-commands.js') });   // the assistant's commands, when the AI panel first asks
      return;
    } catch (e) { /* fall back below */ }
  }
  const binds = list.flatMap((c) => c.keys.map((k) => ({ run: c.run, ...parse(k) })));
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const hit = binds.find((b) => b.mod === mod && b.shift === e.shiftKey && b.alt === e.altKey && b.key === String(e.key).toLowerCase());
    if (!hit) return;
    e.preventDefault();
    hit.run();
  }, true);
}

function parse(s) {
  const parts = s.split('+'), key = parts.pop().toLowerCase();
  return { mod: parts.includes('Mod'), shift: parts.includes('Shift'), alt: parts.includes('Alt'), key };
}
