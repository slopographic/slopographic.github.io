/* Slop Slides: the top bar. Title, File menu (new, open, save, download, export), undo and redo, insert buttons,
   layout and theme pickers, present (and presenter view), and the save status. Everything refreshes from the model. Exposes SS.toolbar. */
(function () {
  'use strict';
  var SS = window.SS, A = SS.app, D = SS.dom, OP = SS.ops, T = SS.toolbar = {};
  var $ = D.$, t = SS.util.t;

  function keyOf(id) { return window.SlopCmd ? SlopCmd.keyFor(id) : ''; }
  function fileMenu(x, y) {
    var hub = !!window.SlopHub;
    SlopUI.menu([
      { label: t('slides.menu.new_presentation'), key: keyOf('file.new'), act: SS.files.newDeck },
      { label: t('slides.menu.new_from_template'), key: keyOf('file.newTemplate'), act: function () { SS.templatesUI.openNew(); } },
      { label: t('slides.menu.open_from_slop_drive'), key: keyOf('file.open'), act: SS.files.openDrive, disabled: !hub },
      { label: t('slides.menu.open_a_file_from_this_computer'), act: function () { SS.fileDrop.choose(); } },
      { label: t('slides.menu.import_powerpoint_or_picture_from_slop_d'), act: SS.files.importDrive, disabled: !hub },
      '-',
      { label: t('slides.menu.save_to_slop_drive'), key: keyOf('file.save'), act: function () { SS.files.save(false); }, disabled: !hub },
      { label: t('slides.menu.save_as_a_new_drive_file'), act: function () { SS.files.save(true); }, disabled: !hub },
      { label: t('slides.menu.save_as_template'), key: keyOf('file.saveTemplate'), act: function () { SS.templatesUI.openSave(); } },
      '-',
      { label: t('slides.menu.download_sslide'), act: SS.files.download },
      { label: t('slides.menu.download_pdf'), key: keyOf('file.pdf'), act: SS.files.exportPdf },
      { label: t('slides.menu.export_powerpoint_pptx'), act: SS.files.exportPptx },
      { label: t('slides.menu.export_this_slide_as_png'), act: SS.files.exportPng },
      '-',
      '-',
      { label: t('slides.menu.config'), sub: SS.configio && SS.configio.menu ? SS.configio.menu() : [] },
      { label: t('slides.menu.present'), key: keyOf('view.present') || 'F5', act: function () { SS.present.start(); } },
      { label: t('slides.menu.present_with_presenter_view'), key: keyOf('view.presenter'), act: function () { SS.presenter.start(); } }
    ], x, y);
  }
  function fillSelects() {
    var lay = $('selLayout'), th = $('selTheme');
    lay.replaceChildren(...SS.layouts.list.map(function (l) { return D.option(l.id, SS.util.layoutName(l.id), ''); }));
    th.replaceChildren(...SS.themes.list.map(function (x) { return D.option(x.id, SS.util.themeName(x), ''); }));
  }
  function saveText() {
    if (!A.doc) return '';
    if (A.dirty) return t(A.doc.driveId ? 'slides.app.unsaved' : 'slides.app.not_saved');
    return t(A.doc.driveId ? 'slides.app.saved_drive' : 'slides.app.not_saved');
  }
  function refresh() {
    if (!A.deck) return;
    var s = A.slide(), undo = $('btnUndo'), redo = $('btnRedo');
    undo.disabled = !A.hist.canUndo() || A.mode !== 'edit';
    redo.disabled = !A.hist.canRedo() || A.mode !== 'edit';
    undo.title = A.hist.label('undo') ? t('slides.app.undo_what', { what: A.hist.label('undo') }) : t('ui.undo');
    redo.title = A.hist.label('redo') ? t('slides.app.redo_what', { what: A.hist.label('redo') }) : t('ui.redo');
    setVal($('selLayout'), s ? s.layout : '');
    var th = $('selTheme'), own = th.querySelector('option[data-own]');
    // a theme that came with the file (an imported PowerPoint theme) is listed by its own name
    if (!SS.themes.list.some(function (item) { return item.id === A.deck.theme.id; })) {
      if (!own) { own = D.option(A.deck.theme.id, '', ''); own.setAttribute('data-own', ''); th.prepend(own); }
      own.value = A.deck.theme.id; own.textContent = A.deck.theme.name || t('slides.app.file_theme');
    } else if (own) own.remove();
    setVal(th, A.deck.theme.id);
    setVal($('title'), A.deck.title);
    $('saveState').textContent = saveText();
    $('saveState').classList.toggle('dirty', A.dirty);
    $('statusSlide').textContent = t(s && s.hidden ? 'slides.app.status_slide_hidden' : 'slides.app.status_slide', { i: A.idx + 1, n: A.deck.slides.length });
    $('statusSel').textContent = A.sel.length ? t('slides.app.n_selected', { n: A.sel.length }) : '';
  }
  function setVal(el, v) {
    if (el && document.activeElement !== el && el.value !== String(v)) el.value = v;
  }
  T.mount = function () {
    fillSelects();
    var title = $('title');
    title.addEventListener('change', function () { OP.setTitle(title.value.trim() || 'Untitled presentation'); }); // i18n-ignore (the document's own title)
    title.addEventListener('keydown', function (e) { if (e.key === 'Enter') title.blur(); });
    $('btnFile').addEventListener('click', function (e) { var r = e.currentTarget.getBoundingClientRect(); fileMenu(r.left, r.bottom + 4); });
    $('btnUndo').addEventListener('click', function () { A.undo(); });
    $('btnRedo').addEventListener('click', function () { A.redo(); });
    $('insText').addEventListener('click', OP.addText);
    $('insRect').addEventListener('click', function () { OP.addShape('rect'); });
    $('insEllipse').addEventListener('click', function () { OP.addShape('ellipse'); });
    $('insImage').addEventListener('click', OP.addImage);
    $('selLayout').addEventListener('change', function (e) { OP.setLayout(e.target.value); });
    $('selTheme').addEventListener('change', function (e) { OP.setTheme(e.target.value); });
    $('btnPresent').addEventListener('click', function () { SS.present.start(); });
    $('btnSave').addEventListener('click', function () { SS.files.save(false); });
    $('btnPalette').addEventListener('click', function () { if (window.SlopCmd) SlopCmd.open(); });
    $('btnPalette').hidden = !window.SlopCmd;
    $('slNew').addEventListener('click', OP.newSlide);
    $('slDup').addEventListener('click', OP.dupSlide);
    $('slDel').addEventListener('click', OP.delSlide);
    $('slUp').addEventListener('click', function () { OP.moveSlide(-1); });
    $('slDown').addEventListener('click', function () { OP.moveSlide(1); });
    ['load', 'deck', 'slide', 'select', 'change', 'mode'].forEach(function (ev) { A.on(ev, refresh); });
    SS.util.onLang(function () { fillSelects(); refresh(); A.emit('render'); });   // the canvas: the placeholder hints
    refresh();
  };
  T.refresh = refresh;
})();
