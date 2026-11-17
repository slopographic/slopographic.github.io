/* Slop PDF — every command (tools, page operations, menu actions) registered with SlopCmd: the shared
   Spotlight palette (Mod+K) and customizable shortcuts (Help ▸ Keyboard shortcuts). Keyboard handling
   lives here; organize/keys.js only keeps the page grid's listbox navigation (arrows, Space, Enter). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, A = SP.app, S = A._;
  var C = window.SlopCmd, t = U.t;
  function noMenu() { return !document.querySelector('.sui-menu'); }
  function inField() { var a = document.activeElement; return !!(a && a.closest && a.closest('input, select, textarea, [contenteditable="true"], .ctx-edittext [role="radio"]')); }
  /** A paragraph frame has the focus (editor/para-mode.js): Escape lets it go, Enter opens it. */
  function paraFocus() { var a = document.activeElement; return !!(a && a.classList && a.classList.contains('para-frame')); }
  /** No menu, no field: the clipboard keys work (also on a focused paragraph frame). */
  function quiet() { return noMenu() && !inField(); }
  /** ...and no focused paragraph frame: its letters, arrows and Delete are its own (editor/para-xform.js). */
  function idle() { return quiet() && !paraFocus(); }
  /** The page's text is selected (the browser copies it). */
  function textSel() { var s = window.getSelection && window.getSelection(); return !!(s && !s.isCollapsed); }
  /** The text selection bar is up: Escape belongs to it (sel-bar.js), not to the page. */
  function selBarOpen() { return !!(window.SlopSelBar && SlopSelBar.isOpen()); }
  function has() { return E.state.pages.length > 0; }
  function pg() { return A.mode === 'page' && has(); }
  function grid() { return A.mode !== 'page' && has(); }
  /** Selected pages, else the focused thumbnail. */
  function gridIds() {
    if (O.sel.size) return O.selected();
    var a = document.activeElement, thumb = a && a.closest && a.closest('#grid .thumb');
    return thumb ? [thumb.dataset.id] : [];
  }
  function pageIds() { return pg() ? [Ed.pid] : A.targetIds(); }
  function zoom(k) { if (A.mode === 'page') Ed.zoomBy(k); else O.zoomBy(k); }
  /** Display key for a menu label ('' when unbound or SlopCmd is missing). */
  A.key = function (id) { return C ? C.keyFor(id) : ''; };

  function cmd(id, title, group, keys, run, when, extra) {
    return Object.assign({ id: id, title: title, group: group, keys: keys || [], run: run, when: when }, extra || {});
  }
  /** A page object is selected in Objects mode (editor/obj-mode.js): the arrows, Delete and Escape are its. */
  function objSel() { return pg() && idle() && !!(Ed._.obj && Ed._.obj.live() && Ed._.obj.selected()) && !Ed.getSelected(); }
  /** A label another file owns: a key once that file is translated, else its English. */
  function lbl(s) { return /^pdf\./.test(s) ? t(s) : s; }
  function ten(title, step) { return step > 1 ? t('pdf.cmd.nudge_10', { what: title }) : title; }
  /** Built on every call (registration and each language change), so titles and groups read the current language. */
  function all() {
    var G = { file: t('menu.file'), edit: t('menu.edit'), view: t('menu.view'), help: t('menu.help'), pages: t('pdf.cmd.group_pages'), annot: t('pdf.cmd.group_annotation'),
      redact: t('pdf.cmd.group_redact'), tools: t('pdf.cmd.group_tools'), obj: t('pdf.cmd.group_object'), panels: t('pdf.cmd.group_panels') };
    var L = [
      cmd('file.open', t('pdf.cmd.file_open'), G.file, ['Mod+O'], function () { A.openDialog(); }, noMenu, { keywords: ['add', 'import', 'merge'] }),
      cmd('file.drive', t('pdf.cmd.file_drive'), G.file, [], function () { A.openFromDrive(); }, function () { return !!window.SlopHub && !SP.offline; }),
      cmd('file.sample', t('pdf.cmd.file_sample'), G.file, [], function () { A.loadSample(); }),
      cmd('file.fonts', t('pdf.cmd.file_fonts'), G.file, [], function () { A.openFonts(); }, has, { keywords: ['font', 'typeface', 'missing', 'embedded'] }),
      cmd('file.extractAssets', t('pdf.cmd.file_extract_assets'), G.file, [], function () { A.extractAssets(); }, has, { keywords: ['images', 'fonts', 'attachments', 'embedded files', 'text', 'zip', 'save', 'export', 'assets'] }),
      cmd('file.save', t('menu.save'), G.file, ['Mod+S'], function () { if (window.SlopHub && !SP.offline) A.saveToDrive(); else A.download(); }, function () { return has() && noMenu(); }, { keywords: ['save', 'drive'] }),
      cmd('file.download', t('pdf.cmd.file_download'), G.file, [], function () { A.download(); }, function () { return has() && noMenu(); }, { keywords: ['save', 'export'] }),
      cmd('file.protect', t('pdf.cmd.file_protect'), G.file, [], function () { A.protect(); }, function () { return has() && noMenu(); }, { keywords: ['password', 'encrypt', 'lock', 'secure', 'protect'] }),
      cmd('file.extract', t('pdf.cmd.file_extract'), G.file, [], function () { A.extract(); }, function () { return O.sel.size > 0; }),
      cmd('file.text', t('pdf.cmd.file_text'), G.file, [], function () { A.extractText(); }, has),
      cmd('file.images', t('pdf.cmd.file_images'), G.file, [], function () { A.setTool('convert'); }, has, { keywords: ['png', 'jpeg', 'convert'] }),
      cmd('file.app', t('pdf.cmd.file_app'), G.file, [], function () { A.downloadApp(); }),
      cmd('file.rename', t('ui.rename_dots'), G.file, [], function () { A.rename(null); }, null, { keywords: ['name', 'title'] }),
      cmd('file.closeAll', t('pdf.cmd.file_close_all'), G.file, [], function () { A.closeAll(); }, has),
      cmd('edit.text', t('pdf.cmd.edit_text'), G.edit, ['Mod+E'], function () { Ed.toggleEditText(); }, pg, { keywords: ['replace', 'change', 'type over'] }),
      cmd('edit.objects', t('pdf.cmd.edit_objects'), G.edit, ['O'], function () { Ed.toggleObjects(); }, function () { return pg() && idle(); }, { keywords: ['move image', 'resize', 'rotate', 'logo', 'vector', 'objects', 'arrange'], checked: function () { return !!Ed.objMode; } }),
      cmd('edit.find', t('pdf.cmd.edit_find'), G.edit, ['Mod+F'], function () { SlopPdfFind.open(); }, function () { return has() && noMenu(); }, { keywords: ['search', 'highlight', 'text'] }),
      cmd('edit.undo', t('ui.undo'), G.edit, ['Mod+Z'], function () { A.undo(); }, function () { return E.canUndo() && !inField() && noMenu(); }),
      cmd('edit.redo', t('ui.redo'), G.edit, ['Shift+Mod+Z', 'Mod+Y'], function () { A.redo(); }, function () { return E.canRedo() && !inField() && noMenu(); }),
      cmd('edit.selectAll', t('pdf.cmd.edit_select_all'), G.edit, ['Mod+A'], function () { O.selectAll(); }, function () { return grid() && idle(); }),
      cmd('edit.selectNone', t('ui.select_none'), G.edit, [], function () { O.setSelection([]); }, function () { return O.sel.size > 0; }),
      cmd('edit.duplicate', t('ui.duplicate'), G.edit, ['Mod+D'], function () { if (pg()) Ed.duplicateSelected(); else A.duplicate(A.targetIds()); }, function () { return quiet() && (pg() ? Ed.canCopy() : has()); }, { keywords: ['copy', 'pages', 'annotation'] }),
      cmd('edit.copy', t('pdf.se.cmd_copy'), G.edit, ['Mod+C'], function () { Ed.copy(); }, function () { return pg() && quiet() && Ed.canCopy() && !textSel(); }),
      cmd('edit.cut', t('pdf.se.cmd_cut'), G.edit, ['Mod+X'], function () { Ed.cut(); }, function () { return pg() && quiet() && Ed.canCopy() && !textSel(); }),
      cmd('edit.paste', t('pdf.se.cmd_paste'), G.edit, ['Mod+V'], function () { Ed.paste(); }, function () { return pg() && quiet() && Ed.canPaste(); }, { keywords: ['paste in place'] }),
      cmd('edit.pasteAll', t('pdf.se.cmd_paste_all'), G.edit, [], function () { Ed.pasteOnPages(); }, function () { return pg() && Ed.canPaste(); }, { keywords: ['logo', 'stamp', 'every page'] }),
      cmd('edit.pasteOnPages', t('pdf.se.cmd_paste_pages'), G.edit, [], function () { Ed.askPasteOnPages(); }, function () { return pg() && Ed.canPaste(); }, { keywords: ['logo', 'stamp', 'range'] }),
      cmd('edit.selectBlockText', t('pdf.se.cmd_select_words'), G.edit, [], function () { Ed.selectBlockText(); }, function () { return pg() && !!Ed.canSelectBlockText && Ed.canSelectBlockText(); }, { keywords: ['highlight', 'underline', 'strikethrough', 'words', 'range'] }),
      cmd('edit.delete', t('ui.delete'), G.edit, ['Delete', 'Backspace'], function () { if (pg()) Ed.deleteSelected(); else A.remove(gridIds()); }, function () { return idle() && (pg() ? !!Ed.getSelected() : gridIds().length > 0); }, { keywords: ['remove', 'pages', 'annotation'] }),
      cmd('edit.escape', t('pdf.cmd.edit_escape'), G.view, ['Escape'], function () {
        if (!pg()) { O.setSelection([]); return; }
        if (Ed.getSelected()) Ed.select(null); else if (Ed.tool !== 'select') Ed.setTool('select'); else A.showGrid();
      }, function () { return idle() && !selBarOpen() && !paraFocus() && (pg() || (grid() && O.sel.size > 0)); }, { hidden: true }),
      cmd('pages.rotateRight', t('pdf.cmd.pages_rotate_right'), G.pages, ['R'], function () { A.rotate(grid() ? gridIds() : [Ed.pid], 90); }, function () { return idle() && (grid() ? gridIds().length > 0 : false); }),
      cmd('pages.rotateLeft', t('pdf.cmd.pages_rotate_left'), G.pages, ['Shift+R'], function () { A.rotate(grid() ? gridIds() : [Ed.pid], -90); }, function () { return idle() && grid() && gridIds().length > 0; }),
      cmd('pages.rotateAllRight', t('pdf.cmd.pages_rotate_all_right'), G.pages, [], function () { A.rotate(pageIds(), 90); }, has),
      cmd('pages.rotateAllLeft', t('pdf.cmd.pages_rotate_all_left'), G.pages, [], function () { A.rotate(pageIds(), -90); }, has),
      cmd('pages.duplicate', t('pdf.cmd.pages_duplicate'), G.pages, [], function () { A.duplicate(A.targetIds()); }, has),
      cmd('pages.delete', t('pdf.cmd.pages_delete'), G.pages, [], function () { A.remove(pageIds()); }, has),
      cmd('pages.reverse', t('pdf.cmd.pages_reverse'), G.pages, [], function () { A.reverse(); }, has),
      cmd('pages.blank', t('pdf.cmd.pages_blank'), G.pages, [], function () { A.insertBlank(); }, has),
      cmd('pages.insert', t('pdf.cmd.pages_insert'), G.pages, [], function () { A.insertFromFile(); }, has),
      cmd('pages.focus', t('pdf.cmd.pages_focus'), G.pages, ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], function () { O.focus(O.focusId || E.state.pages[0].id); }, function () {
        var a = document.activeElement; return grid() && idle() && !(a && a.closest && a.closest('.thumb, #props, .topbar, .rail, .ctxbar'));
      }, { hidden: true }),
      cmd('view.grid', t('pdf.cmd.view_grid'), G.view, [], function () { A.showGrid(); }, has, { checked: function () { return A.mode !== 'page'; } }),
      cmd('view.page', t('pdf.cmd.view_page'), G.view, ['Enter'], function () { A.ensurePage(); }, function () { var a = document.activeElement; return grid() && idle() && !(a && a.closest && a.closest('.thumb, button, a')); }, { checked: function () { return A.mode === 'page'; } }),
      cmd('annot.editText', t('pdf.cmd.annot_edit_text'), G.annot, ['Enter'], function () { Ed.editSelectedText(); }, function () { var a = Ed.getSelected(); return pg() && idle() && !!a && a.type === 'text'; }),
      cmd('view.next', t('pdf.cmd.view_next'), G.view, ['PageDown', 'ArrowRight'], function () { A.gotoPage(1); }, function () { return pg() && idle() && !Ed.getSelected() && !objSel(); }),
      cmd('view.prev', t('pdf.cmd.view_prev'), G.view, ['PageUp', 'ArrowLeft'], function () { A.gotoPage(-1); }, function () { return pg() && idle() && !Ed.getSelected() && !objSel(); }),
      cmd('view.continuous', t('pdf.cmd.view_continuous'), G.view, [], function () { Ed.setLayout('continuous'); }, function () { return pg() && idle(); }, { checked: function () { return Ed.layoutMode === 'continuous'; } }),
      cmd('view.single', t('pdf.cmd.view_single'), G.view, [], function () { Ed.setLayout('single'); }, function () { return pg() && idle(); }, { checked: function () { return Ed.layoutMode === 'single'; } }),
      cmd('view.two', t('pdf.cmd.view_two'), G.view, [], function () { Ed.setLayout('two'); }, function () { return pg() && idle(); }, { checked: function () { return Ed.layoutMode === 'two'; } }),
      cmd('view.zoomIn', t('ui.zoom_in'), G.view, ['+', '=', 'Mod+=', 'Mod++'], function () { zoom(1.25); }, function () { return has() && !inField(); }, { repeat: true }),
      cmd('view.zoomOut', t('ui.zoom_out'), G.view, ['-', 'Mod+-'], function () { zoom(0.8); }, function () { return has() && !inField(); }, { repeat: true }),
      cmd('view.fit', t('pdf.cmd.view_fit'), G.view, ['0'], function () { Ed.fit('fit'); }, function () { return pg() && idle(); }),
      cmd('view.fitWidth', t('pdf.cmd.view_fit_width'), G.view, [], function () { Ed.fit('width'); }, pg),
      cmd('view.thumbsRow', t('pdf.cmd.view_thumbs_row'), G.view, [], function () { O.zoomTo(O.maxSize()); }, grid),
      cmd('view.panel', t('pdf.cmd.view_panel'), G.view, [], function () { A.togglePanel(); }, null, { checked: function () { return !S.els.app.classList.contains('no-panel'); } }),
      cmd('redact.panel', t('pdf.cmd.redact_panel'), G.redact, [], function () { A.setTool('redact'); }, has, { keywords: ['remove', 'black out', 'censor', 'privacy', 'gdpr'] }),
      cmd('redact.apply', t('pdf.cmd.redact_apply'), G.redact, [], function () { A.applyRedactions(); }, function () { return SP.redact.pending().length > 0; }),
      cmd('help.about', t('pdf.cmd.help_about'), G.help, [], function () { S.showAbout(); }),
      cmd('help.home', t('pdf.cmd.help_home'), G.help, [], function () { location.href = SP.offline ? 'https://slopographic.com/' : '../'; })
    ];
    O.PRESETS.forEach(function (p) { L.push(cmd('view.thumbs' + p[1], t('pdf.cmd.view_thumbs_size', { size: p[1] }), G.view, [], function () { O.zoomTo(p[0]); }, grid)); });
    Ed.TOOLS.forEach(function (tl) {
      L.push(cmd('tool.' + tl[0], t('pdf.cmd.tool', { tool: lbl(tl[1]).split(' (')[0] }), G.tools, [tl[3]], function () { Ed.setTool(tl[0]); }, function () { return pg() && idle(); }, { icon: U.icon(tl[2]), keywords: ['annotate', 'draw'] }));
    });
    [[-1, 0, 'Left', 'pdf.cmd.annot_nudge_left'], [1, 0, 'Right', 'pdf.cmd.annot_nudge_right'], [0, -1, 'Up', 'pdf.cmd.annot_nudge_up'], [0, 1, 'Down', 'pdf.cmd.annot_nudge_down']].forEach(function (d) {
      [[1, ''], [10, 'Shift+']].forEach(function (s) {
        L.push(cmd('annot.nudge' + d[2] + (s[0] > 1 ? '10' : ''), ten(t(d[3]), s[0]), G.annot, [s[1] + 'Arrow' + d[2]], function () { Ed.nudgeSelected(d[0] * s[0], d[1] * s[0]); }, function () { return pg() && idle() && !!Ed.getSelected(); }, { repeat: true, hidden: true }));
      });
    });
    // a selected page object (Objects mode, editor/obj-bar.js): arrows nudge, Delete deletes, Escape lets go
    [[-1, 0, 'Left', 'pdf.cmd.obj_nudge_left'], [1, 0, 'Right', 'pdf.cmd.obj_nudge_right'], [0, -1, 'Up', 'pdf.cmd.obj_nudge_up'], [0, 1, 'Down', 'pdf.cmd.obj_nudge_down']].forEach(function (d) {
      [[1, ''], [10, 'Shift+']].forEach(function (s) {
        L.push(cmd('obj.nudge' + d[2] + (s[0] > 1 ? '10' : ''), ten(t(d[3]), s[0]), G.obj, [s[1] + 'Arrow' + d[2]], function () { Ed._.obj.act.nudge(d[0] * s[0], d[1] * s[0]); }, objSel, { repeat: true, hidden: true }));
      });
    });
    L.push(cmd('obj.delete', t('pdf.cmd.obj_delete'), G.obj, ['Delete', 'Backspace'], function () { Ed._.obj.act.remove(); }, objSel, { hidden: true }),
      cmd('obj.escape', t('pdf.cmd.obj_escape'), G.obj, ['Escape'], function () { Ed._.obj.select(null); }, objSel, { hidden: true }));
    if (!SP.offline && window.SlopAITools) L.push(
      cmd('tools.ocrPage', t('pdf.cmd.tools_ocr_page'), G.tools, [], function () { A.recognisePage(); }, has, { keywords: ['ocr', 'scan', 'read text'] }),
      cmd('tools.ocrAll', t('pdf.cmd.tools_ocr_all'), G.tools, [], function () { A.recogniseAll(); }, has, { keywords: ['ocr', 'scan', 'read text'] }));
    S.RAIL.forEach(function (r) { L.push(cmd('panel.' + r[0], lbl(r[1]), G.panels, [], function () { A.setTool(r[0]); }, null, { icon: U.icon(r[2]), keywords: ['tool', 'panel'] })); });
    return L;
  }

  S.setupKeys = function () {
    if (!C) { console.warn('Slop PDF: SlopCmd is missing; keyboard shortcuts are off'); return; }
    C.init({ app: 'pdf' });
    C.register(all());
    // a language change: the same ids again with the new titles and groups (register replaces by id; nothing else re-runs)
    U.onLang(function () { C.register(all()); paintBtn(); });
    // the assistant's commands with arguments (ai-pages.js, ai-commands.js, ai-objects.js), loaded when the AI panel first asks
    if (C.provide && !SP.offline) C.provide({ prepare: function () { return SP.aiPdf ? null : ['../shared/commands/sources.js', 'js/ui/ai-pages.js', 'js/ui/ai-commands.js', 'js/ui/ai-objects.js', 'js/ui/ai-edit.js'].reduce(function (p, src) {
      return p.then(function () { return src.indexOf('sources') >= 0 && window.SlopCmdSources ? null : new Promise(function (res, rej) {
        var s = document.createElement('script'); s.src = new URL(src, location.href).href; s.async = false;
        s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.append(s);
      }); });
    }, Promise.resolve()); } });
    // The button is in the page (index.html), so the top bar is whole at its first paint; it works from here on
    var b = document.getElementById('btnCmd');
    if (!b) { b = U.h('button', { type: 'button', class: 'tb', id: 'btnCmd', 'aria-label': t('pdf.cmd.search_commands'), html: U.icon('search') }); S.els.btnPanel.parentNode.insertBefore(b, S.els.btnPanel); }
    function paintBtn() { b.setAttribute('aria-label', t('pdf.cmd.search_commands')); b.title = t('pdf.cmd.search_commands_key', { key: C.keyFor('cmd.palette') }); }
    paintBtn();
    b.addEventListener('click', function () { C.open(); });
    C.on('change', paintBtn);
  };
})();
