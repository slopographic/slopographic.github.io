/* Slop PDF — the one way files come in (shared/intake, spec 'pdf'). A drop on the document area or the tab strip, the
   empty page's zone and its Choose files, File ▸ Open (Ctrl+O), Insert pages from file, Open from Slop Drive, ?drive=<id>
   (Send to…), a paste, a split pane's "Open a file", the Convert dialog's PDFs and a PWA launch all call SlopIntake.take.
   PDFs and raster images open here; every other file (SVG, Office files, text, HTML...) goes to the Convert dialog with its
   target set to PDF (route), and the PDF it makes comes back through the intake (source 'convert'). With a document open
   the intake asks "Add to current" or "Create new" (the drop's place decides for the tab strip and the panes): Add puts
   the pages at a place the person picks (or opts.at for Insert pages from file), as one undo step; New opens each file in a
   tab of its own, or into the empty tab. A PDF already open asks first. SlopDrop (shared/drop) draws the zone, the
   outlines over the stage and the tabs, and each file's row. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, A = SP.app, S = A._; // SP.docs (io/doc-state.js) loads after the first paint: read it when used
  var h = U.h, t = U.t;
  var OPENS = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
  var OPEN_TYPE = /^application\/pdf$|^image\/(png|jpe?g|webp|gif|bmp)$/;
  var RULES = { any: true, get noun() { return t('pdf.app.drop_noun'); } }; // every file is taken by the zone; the ones not opened here go to Convert

  /** 'open' for a PDF or a raster image, 'convert' for any other file (the Convert dialog says what it can make of it). */
  function kind(file) {
    var ext = String(file.name || '').toLowerCase().split('.').pop(), type = String(file.type || '').toLowerCase();
    return OPENS.indexOf(ext) >= 0 || OPEN_TYPE.test(type) ? 'open' : 'convert';
  }
  function split(files) {
    var out = { open: [], convert: [] };
    files.forEach(function (f) { out[kind(f)].push(f); });
    return out;
  }
  function onTabs(target) { return !!(target && target.closest && target.closest('#tabs')); }

  /** The SHA-256 of a dropped PDF (null for images and anything unreadable). */
  async function fingerprintOf(file) {
    try { var bytes = await U.readFile(file); return U.sniff(bytes) === 'pdf' ? await SP.editLog.fingerprint(bytes) : null; } catch (e) { return null; }
  }

  /** One file in a new tab. A PDF that is open in another tab asks first. Throws the reason when it is not opened. */
  async function openInTab(file) {
    var fp = await fingerprintOf(file);
    if (fp && SP.docs.holding(fp)) {
      var again = await SlopUI.confirm(t('pdf.app.already_open'), t('pdf.app.already_open_msg', { name: file.name }), t('pdf.app.open_again'));
      if (!again) throw new Error(t('pdf.app.err_not_again'));
    }
    await A.lockedOpen(async function () {
      A.newDocTab(file.name);
      await A.addFiles([file]);
      if (!E.state.pages.length) A.closeTab(); // the file did not open (an error was shown): no empty tab left behind
    });
    if (!E.state.pages.length) throw new Error(t('pdf.app.err_not_opened'));
    if (file.slopDrive) A.driveId = file.slopDrive.id; // a Slop Drive file: Save writes back to it
  }

  /** The PDFs the Convert dialog made (open-convert.js): through the intake, each in a new tab; then a toast names the
   *  files they came from. */
  A.openConverted = async function (outs, names) {
    var r = await SlopIntake.fromConvert(outs, { to: 'pdf', mode: 'new', data: { tab: true } });
    if (r && r.added.length) SlopUI.toast(names.length === 1 ? t('pdf.app.converted_one', { name: names[0] }) : t('pdf.app.converted_n', { n: names.length }));
  };

  /** Files opened into split pane i (a drop on it, or Open a file in its empty state), from the intake's onNew. Each opens in a tab; the first one is
   *  then shown live in pane i, and the document that was live goes to the pane that held it. */
  A.openFilesInPane = async function (pane, files) {
    var opens = files.filter(function (f) { return kind(f) === 'open'; });
    if (!opens.length) return;
    var prev = SP.tabs.current(), first = null;
    for (var i = 0; i < opens.length; i++) {
      try { await openInTab(opens[i]); } catch (err) { A.status(t('pdf.app.file_error', { name: opens[i].name, error: err.message }), 'err'); continue; }
      if (!first) first = SP.tabs.current();
    }
    SP.panes.placeIn(pane, first, prev);
    if (first && E.state.pages.length) A.openPage(E.state.pages[0].id, true);
  };

  /** Adds the files' pages to the open document. A PDF that is already in it asks first; the position is asked once. */
  async function addToDocument(files, at) {
    var keep = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i], fp = await fingerprintOf(file);
      var inDoc = !!fp && Array.from(E.files.values()).some(function (f) { return f.fp === fp; });
      if (inDoc) {
        var again = await SlopUI.confirm(t('pdf.app.already_in_doc'), t('pdf.app.already_in_doc_msg', { name: file.name }), t('pdf.app.add_again'));
        if (!again) continue;
      }
      keep.push(file);
    }
    if (!keep.length) return;
    if (at == null) at = await askPosition(E.state.pages.length);
    if (at == null) return;
    await A.lockedOpen(function () { return A.addFiles(keep, { at: at }); });
  }

  /** Where the pages go: at the start, at the end, or after page N. Resolves the page index, or null when cancelled. */
  function askPosition(n) {
    return new Promise(function (res) {
      var sel = document.createElement('select');
      sel.className = 'sui-input';
      sel.setAttribute('aria-label', t('pdf.app.insert_position'));
      var choices = [['start', t('pdf.app.pos_start')], ['end', t('pdf.app.pos_end')]];
      for (var p = 1; p <= n; p++) choices.push(['after:' + p, t('pdf.app.pos_after', { n: String(p) })]);
      choices.forEach(function (c) { var o = document.createElement('option'); o.value = c[0]; o.textContent = c[1]; sel.append(o); });
      sel.value = 'end';
      var val = null;
      var body = h('div', null, h('p', { class: 'sui-p' }, t('pdf.app.pos_question')), SlopUI.field(t('pdf.app.position'), sel));
      SlopUI.dialog({
        title: t('pdf.app.add_pages'), body: body, cls: 'sui-narrow',
        buttons: [{ label: t('menu.cancel') }, { label: t('pdf.app.add_pages'), primary: true, act: function () { val = sel.value; } }],
        onClose: function (ok) {
          if (!ok) { res(null); return; }
          res(val === 'start' ? 0 : val && val.indexOf('after:') === 0 ? Number(val.slice(6)) : n);
        },
      });
    });
  }

  /** New: each file in a tab of its own (the tab strip, a launch, the Convert dialog), into a split pane, or, when the tab
   *  on screen is empty, all of them into it (merged, as Open always did). */
  async function openNew(files, ctx) {
    var data = ctx.data || {};
    if (data.pane >= 0) { await A.openFilesInPane(data.pane, files); return; }
    if (!data.tab && !E.state.pages.length) {
      await A.lockedOpen(function () { return A.addFiles(files); });
      if (!E.state.pages.length) throw new Error(t('pdf.app.err_not_opened'));
      if (files.length === 1 && files[0].slopDrive) A.driveId = files[0].slopDrive.id; // a Slop Drive file: Save writes back to it
      return;
    }
    var errs = [];
    for (var i = 0; i < files.length; i++) {
      try { await openInTab(files[i]); } catch (err) { errs.push(t('pdf.app.file_error', { name: files[i].name, error: err.message })); }
    }
    if (errs.length) throw new Error(errs.join('; '));
  }

  /** Registers Slop PDF with the intake: what it takes, the Add or New question, and the readers. */
  function register() {
    SlopIntake.register({
      id: 'pdf', accept: RULES, driveAccept: ['application/pdf', 'image/*'],
      hasOpen: function () { return !!E.state.pages.length; },
      openName: function () { return t('pdf.app.this_document'); },
      labels: { get title() { return t('pdf.app.add_files'); }, get message() { return t('pdf.app.add_files_msg'); }, get add() { return t('pdf.app.add_current'); }, get new() { return t('pdf.app.create_new'); } }, // getters: read when the question is asked
      // the files this page does not open go to the Convert dialog, which makes a PDF and hands it back (source 'convert')
      route: async function (files) {
        if (!A.isReady) await A.ready; // files before the rest of the app has loaded (ui/app.js) wait for it
        var r = split(files);
        if (r.convert.length) A.convertFiles(r.convert);
        return r.open;
      },
      gate: function () {
        if (!A.isLocked()) return true;
        A.status(t('pdf.app.wait_open'), 'err');
        return false;
      },
      onAdd: function (files, ctx) { return addToDocument(files, ctx.data && ctx.data.at); },
      onNew: openNew,
    });
  }

  /** Where a drop lands decides: the tab strip opens new tabs, a split pane that is not the focused one opens there. */
  function dropMode(e) {
    var pane = SP.panes && SP.panes.paneAt ? SP.panes.paneAt(e && e.target) : -1;
    if (pane >= 0 && pane !== SP.panes.focused()) return 'new';
    return onTabs(e && e.target) ? 'new' : null;
  }
  function dropData(e) {
    var pane = SP.panes && SP.panes.paneAt ? SP.panes.paneAt(e && e.target) : -1;
    if (pane >= 0 && pane !== SP.panes.focused()) return { pane: pane };
    return onTabs(e && e.target) ? { tab: true } : {};
  }

  /** Wires the zone (on the empty page) and the drop targets (the stage and the tab strip). Called from ui/app.js. */
  S.setupDrop = function () {
    register();
    if (!window.SlopDrop) return;
    SlopDrop.attach(document.getElementById('pdfDrop'), {
      intake: 'pdf', compact: true, label: 'pdf.app.drop_label', chooseLabel: 'pdf.app.choose_files',
      targets: [document.getElementById('stage'), document.getElementById('tabs')],
      mode: dropMode, data: dropData,
    });
    // The empty page shows a finished PDF and how (SlopDrop's preview), in place of the drawing; Try a sample stays below.
    var art = document.querySelector('#empty .empty-art');
    var preview = function () {
      return SlopDrop.panel.preview({
        picture: { src: '../assets/shots/pdf-preview.webp', alt: t('pdf.app.preview_alt') },
        steps: [t('pdf.app.preview_step1'), t('pdf.app.preview_step2'), t('pdf.app.preview_step3')],
      });
    };
    if (art && SlopDrop.panel) { var shown = preview(); if (shown) art.replaceWith(shown); art = shown || art; }
    // A language switch: the preview is drawn again in the new words (the zone's own words are keys SlopDrop redraws)
    U.onLang(function () {
      if (art && art.classList && art.classList.contains('sd-preview') && art.parentNode) { var next = preview(); if (next) { art.replaceWith(next); art = next; } }
    });
  };
})();
