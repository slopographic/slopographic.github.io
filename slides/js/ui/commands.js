/* Slop Slides: every command with its shortcut, registered with SlopCmd (the Mod+K palette and the customisable
   keymap). Editing commands are off while Present mode runs or a text box is open. Exposes window.SS.commands. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, OP = SS.ops, C = null;
  var K = SS.commands = {};
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  /** The assistant's commands with arguments (ai-files.js, ai-commands.js), loaded in order when SlopCmd.prepare() asks. */
  function script(name) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = new URL(name, HERE).href; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + name)); };
      document.head.append(s);
    });
  }
  K.prepare = function () {
    if (SS.aiCmd) return Promise.resolve();
    return window.SlopCmd.sources()   // shared/commands/sources.js, loaded once
      .then(function () { return script('ai-files.js'); }).then(function () { return script('ai-commands.js'); });
  };
  function editing() { return A.mode === 'edit' && !SS.textEdit.editing; }
  function hasSel() { return editing() && A.sel.length > 0; }
  /** title and group are keys (the list is built again on a language change, so the palette reads the current language). */
  function cmd(id, title, group, keys, run, when, extra) {
    var t = SS.util.t;
    return Object.assign({ id: id, title: t(title), group: t(group), keys: keys || [], run: run, when: when || null }, extra || {});
  }
  function list() {
    var one = function () { var o = A.selObjs(); return A.sel.length === 1 && o[0] && SS.textEdit.canEdit(o[0]) ? o[0] : null; };
    var L = [
      cmd('file.new', 'slides.cmd.file_new', 'menu.file', ['Mod+N'], function () { SS.files.newDeck(); }, function () { return A.mode === 'edit'; }),
      cmd('file.open', 'slides.cmd.file_open', 'menu.file', ['Mod+O'], function () { SS.files.openDrive(); }, editing, { keywords: ['import'] }),
      cmd('file.save', 'slides.cmd.file_save', 'menu.file', ['Mod+S'], function () { SS.files.save(false); }, editing, { keywords: ['store'] }),
      cmd('file.rename', 'slides.cmd.file_rename', 'menu.file', [], function () { SlopDocTabs.rename(null); }, null, { keywords: ['name', 'title'] }),
      cmd('file.saveAs', 'slides.cmd.file_save_as', 'menu.file', [], function () { SS.files.save(true); }, editing),
      cmd('file.download', 'slides.cmd.file_download', 'menu.file', [], function () { SS.files.download(); }),
      cmd('file.newTemplate', 'slides.cmd.file_new_template', 'menu.file', [], function () { SS.templatesUI.openNew(); }, function () { return A.mode === 'edit'; }, { keywords: ['template', 'import'] }),
      cmd('file.saveTemplate', 'slides.cmd.file_save_template', 'menu.file', [], function () { SS.templatesUI.openSave(); }, editing, { keywords: ['template', 'export'] }),
      cmd('file.pptx', 'slides.cmd.file_pptx', 'menu.file', [], function () { SS.files.exportPptx(); }, null, { keywords: ['powerpoint', 'export'] }),
      cmd('file.pdf', 'slides.cmd.file_pdf', 'menu.file', [], function () { SS.files.exportPdf(); }, null, { keywords: ['pdf', 'export', 'print'] }),
      cmd('file.openLocal', 'slides.cmd.file_open_local', 'menu.file', [], function () { SS.fileDrop.choose(); }, function () { return A.mode === 'edit'; }, { keywords: ['import', 'powerpoint', 'pptx'] }),
      cmd('edit.undo', 'ui.undo', 'menu.edit', ['Mod+Z'], function () { A.undo(); }, function () { return editing() && A.hist.canUndo(); }),
      cmd('edit.redo', 'ui.redo', 'menu.edit', ['Shift+Mod+Z', 'Mod+Y'], function () { A.redo(); }, function () { return editing() && A.hist.canRedo(); }),
      cmd('edit.copy', 'ui.copy', 'menu.edit', ['Mod+C'], function () { OP.copy(); }, hasSel),
      cmd('edit.copyBuffer', 'slides.cmd.edit_copy_buffer', 'menu.edit', [], function () { OP.copyToBuffer(); }, hasSel),
      cmd('edit.paste', 'ui.paste', 'menu.edit', ['Mod+V'], function () { OP.paste(); }, function () { return editing() && (!!A.clip || (OP.hasBuffer && OP.hasBuffer())); }),
      cmd('edit.duplicate', 'ui.duplicate', 'menu.edit', ['Mod+D'], function () { OP.duplicateSel(); }, hasSel),
      cmd('edit.delete', 'ui.delete', 'menu.edit', ['Delete', 'Backspace'], function () { OP.deleteSel(); }, hasSel),
      cmd('edit.selectAll', 'slides.cmd.edit_select_all', 'menu.edit', ['Mod+A'], function () { A.select(A.slide().objects.map(function (o) { return o.id; })); }, editing),
      cmd('edit.deselect', 'slides.cmd.edit_deselect', 'menu.edit', ['Escape'], function () { A.select([]); }, hasSel, { hidden: true }),
      cmd('edit.text', 'slides.cmd.edit_text', 'menu.edit', ['Enter'], function () { SS.textEdit.open(one()); }, function () { return editing() && !!one(); }),
      cmd('insert.text', 'slides.cmd.insert_text', 'slides.cmd.group_insert', ['T'], function () { OP.addText(); }, editing),
      cmd('insert.rect', 'slides.cmd.insert_rect', 'slides.cmd.group_insert', [], function () { OP.addShape('rect'); }, editing),
      cmd('insert.ellipse', 'slides.cmd.insert_ellipse', 'slides.cmd.group_insert', [], function () { OP.addShape('ellipse'); }, editing),
      cmd('insert.image', 'slides.cmd.insert_image', 'slides.cmd.group_insert', [], function () { OP.addImage(); }, editing),
      cmd('edit.restoreAspect', 'slides.cmd.edit_restore_aspect', 'menu.edit', [], function () { SS.aspect.restore(null); }, function () { return hasSel() && !!SS.aspect.target(); }),
      cmd('arrange.front', 'slides.cmd.arrange_front', 'slides.cmd.group_arrange', ['Mod+Shift+]'], function () { OP.arrange('front'); }, hasSel),
      cmd('arrange.back', 'slides.cmd.arrange_back', 'slides.cmd.group_arrange', ['Mod+Shift+['], function () { OP.arrange('back'); }, hasSel),
      cmd('slide.new', 'slides.cmd.slide_new', 'slides.cmd.group_slide', ['Shift+Mod+Enter'], function () { OP.newSlide(); }, editing),
      cmd('slide.duplicate', 'slides.cmd.slide_duplicate', 'slides.cmd.group_slide', [], function () { OP.dupSlide(); }, editing),
      cmd('slide.delete', 'slides.cmd.slide_delete', 'slides.cmd.group_slide', [], function () { OP.delSlide(); }, function () { return editing() && A.deck.slides.length > 1; }),
      cmd('slide.up', 'slides.cmd.slide_up', 'slides.cmd.group_slide', [], function () { OP.moveSlide(-1); }, editing),
      cmd('slide.down', 'slides.cmd.slide_down', 'slides.cmd.group_slide', [], function () { OP.moveSlide(1); }, editing),
      cmd('slide.next', 'slides.cmd.slide_next', 'slides.cmd.group_slide', ['PageDown'], function () { A.go(A.idx + 1); }, function () { return editing() && A.idx < A.deck.slides.length - 1; }, { hidden: true }),
      cmd('slide.prev', 'slides.cmd.slide_prev', 'slides.cmd.group_slide', ['PageUp'], function () { A.go(A.idx - 1); }, function () { return editing() && A.idx > 0; }, { hidden: true }),
      cmd('view.present', 'slides.cmd.view_present', 'menu.view', ['F5'], function () { SS.present.start(); }, editing),
      cmd('view.presenter', 'slides.cmd.view_presenter', 'menu.view', ['Alt+F5'], function () { SS.presenter.start(); }, editing, { keywords: ['notes', 'speaker', 'timer'] })
    ];
    [['Left', -1, 0], ['Right', 1, 0], ['Up', 0, -1], ['Down', 0, 1]].forEach(function (d) {
      L.push(cmd('nudge.' + d[0].toLowerCase(), `slides.cmd.nudge_${d[0].toLowerCase()}`, 'slides.cmd.group_arrange', ['Arrow' + d[0]], function () { OP.nudge(d[1], d[2]); }, hasSel, { repeat: true, hidden: true }));
      L.push(cmd('nudge.big' + d[0].toLowerCase(), `slides.cmd.nudge_big_${d[0].toLowerCase()}`, 'slides.cmd.group_arrange', ['Shift+Arrow' + d[0]], function () { OP.nudge(d[1] * 10, d[2] * 10); }, hasSel, { repeat: true, hidden: true }));
    });
    return L.concat(SS.configio && SS.configio.commands ? SS.configio.commands() : []);
  }
  /** Called once at boot. Without SlopCmd the editor still works, only without shortcuts and the palette. */
  K.setup = function () {
    C = window.SlopCmd || null;
    if (!C) { console.warn('Slop Slides: SlopCmd is missing; keyboard shortcuts are off'); return; }
    C.init({ app: 'slides' });
    C.register(list());
    SS.util.onLang(function () { C.register(list()); });
    if (C.provide) C.provide({ prepare: K.prepare });
  };
})();
