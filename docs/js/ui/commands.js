/* Slop Docs — ui/commands: every action registered with SlopCmd, the shared palette (Ctrl/⌘+K) and customisable
 * shortcuts (Help ▸ Keyboard shortcuts). Without SlopCmd the fallbacks in input.js still handle the basic keys. Classic script. */
(function () {
  'use strict';
  const C = window.SlopCmd;
  const S = window.SlopDocs;
  if (!C) return;
  const A = () => S.A;
  const t = S.t;
  /** A command; title and group are table keys (docs.cmd.*), read in the language at the time of registering. */
  const GROUP = { file: 'docs.cmd.group_file', edit: 'docs.cmd.group_edit', format: 'docs.cmd.group_format', help: 'docs.cmd.group_help' };
  const cmd = (id, title, group, keys, run, extra) => Object.assign({ id, title: t('docs.cmd.' + title), group: t(GROUP[group]), keys: keys || [], run }, extra || {});
  const hasText = () => !!S.doc;
  const HERE = (document.currentScript && document.currentScript.src) || new URL('js/ui/commands.js', location.href).href;

  C.init({ app: 'docs' });
  const all = () => [
    ...(window.SlopDocsConfig ? window.SlopDocsConfig.commands() : []),
    cmd('file.new', 'file_new', 'file', [], () => S.newDoc(), { keywords: ['blank', 'create'] }),
    cmd('file.open', 'file_open', 'file', ['Mod+O'], () => S.openFromDrive(), { keywords: ['drive', 'import', 'docx', 'word'] }),
    cmd('file.random', 'file_random', 'file', [], () => S.random.open(), { keywords: ['template', 'design', 'generate', 'seed', 'new'] }),
    cmd('file.save', 'file_save', 'file', ['Mod+S'], () => S.save(), { keywords: ['store', 'drive'] }),
    cmd('file.rename', 'file_rename', 'file', [], () => window.SlopDocTabs.rename(null), { keywords: ['name', 'title'] }),
    cmd('file.pdf', 'file_pdf', 'file', [], () => S.download('pdf'), { keywords: ['export', 'pdf', 'print'] }),
    cmd('file.print', 'file_print', 'file', [], () => S.print(), { keywords: ['paper', 'printer'] }),
    cmd('format.headerFooter', 'header_footer', 'format', [], () => S.openHF(), { keywords: ['page number', 'footer', 'header', 'page count'] }),
    cmd('file.docx', 'file_docx', 'file', [], () => S.download('docx'), { keywords: ['export', 'word'] }),
    cmd('file.md', 'file_md', 'file', [], () => S.download('md'), { keywords: ['export'] }),
    cmd('file.txt', 'file_txt', 'file', [], () => S.download('txt'), { keywords: ['export'] }),
    cmd('edit.undo', 'undo', 'edit', ['Mod+Z'], () => A().undo(), { when: () => S.canUndo() }),
    cmd('edit.copyBuffer', 'copy_buffer', 'edit', [], () => A().copyToBuffer(), { when: hasText }),
    cmd('edit.redo', 'redo', 'edit', ['Shift+Mod+Z', 'Mod+Y'], () => A().redo(), { when: () => S.canRedo() }),
    cmd('edit.selectAll', 'select_all', 'edit', ['Mod+A'], () => A().selectAll(), { when: hasText }),
    cmd('format.bold', 'bold', 'format', ['Mod+B'], () => A().toggle('b'), { keywords: ['strong'] }),
    cmd('format.italic', 'italic', 'format', ['Mod+I'], () => A().toggle('i'), { keywords: ['emphasis'] }),
    cmd('format.underline', 'underline', 'format', ['Mod+U'], () => A().toggle('u')),
    cmd('format.alignLeft', 'align_left', 'format', ['Shift+Mod+1'], () => A().setAlign('left')),
    cmd('format.alignCenter', 'align_center', 'format', ['Shift+Mod+2'], () => A().setAlign('center')),
    cmd('format.alignRight', 'align_right', 'format', ['Shift+Mod+3'], () => A().setAlign('right')),
    cmd('format.alignJustify', 'justify', 'format', ['Shift+Mod+4'], () => A().setAlign('justify')),
    cmd('format.bullets', 'bullets', 'format', ['Shift+Mod+L'], () => A().toggleList('bul')),
    cmd('format.numbers', 'numbers', 'format', ['Shift+Mod+7'], () => A().toggleList('num')),
    cmd('format.bigger', 'bigger', 'format', ['Shift+Mod+.'], () => A().stepSize(1)),
    cmd('format.smaller', 'smaller', 'format', ['Shift+Mod+,'], () => A().stepSize(-1)),
    cmd('format.clear', 'clear', 'format', ['Mod+Space'], () => A().clearFormat()),
    cmd('style.normal', 'style_normal', 'format', [], () => A().setStyle('Normal'), { keywords: ['paragraph'] }),
    cmd('style.h1', 'style_h1', 'format', ['Mod+Alt+1'], () => A().setStyle('H1'), { keywords: ['title', 'heading'] }),
    cmd('style.h2', 'style_h2', 'format', ['Mod+Alt+2'], () => A().setStyle('H2'), { keywords: ['heading'] }),
    cmd('style.h3', 'style_h3', 'format', ['Mod+Alt+3'], () => A().setStyle('H3'), { keywords: ['heading'] }),
    cmd('style.quote', 'style_quote', 'format', [], () => A().setStyle('Quote'), { keywords: ['blockquote'] }),
    cmd('help.keys', 'keys', 'help', [], () => C.openKeymap(), { keywords: ['keys', 'hotkeys'] }),
  ];
  C.register(all());
  S.onLang(() => C.register(all()));   // the palette follows a language switch
  /** The assistant's commands with arguments, its state summary and checkpoint (ai-commands.js), loaded when the AI panel needs them. */
  if (C.provide) C.provide({ prepare: () => import(new URL('ai-commands.js', HERE).href) });

  /** A ⌘K button in the top bar, next to Save. */
  const save = document.getElementById('btnSave');
  if (save) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb';
    b.id = 'btnCmd';
    const words = () => { b.setAttribute('aria-label', t('docs.app.search_cmds')); b.title = t('docs.app.search_cmds_key', { key: C.keyFor('cmd.palette') }); };
    words();
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/></svg>';
    b.addEventListener('click', () => C.open());
    save.parentNode.insertBefore(b, save);
    C.on('change', words);
    S.onLang(words);
  }
})();
