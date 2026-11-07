/* Slop PDF — page actions (rotate, delete, duplicate, insert, sort, context menu) and opening files
   (picker, drag & drop, images, password prompts, the sample). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, PN = SP.panels, A = SP.app, S = A._;
  var $ = U.$, h = U.h, t = U.t;
  /* ---------------------------------------------------------- page ops */
  A.targetIds = function () { var s = O.selected(); return s.length ? s : E.state.pages.map(function (p) { return p.id; }); };
  A.rotate = function (ids, d) { if (!ids.length) return; E.commit(t('pdf.act.undo_rotate', { n: ids.length }), function (st) { E.ops.rotate(st, ids, d); }); A.announce(t(d > 0 ? 'pdf.act.rotated_right' : 'pdf.act.rotated_left', { n: ids.length })); };
  A.remove = function (ids) {
    if (!ids.length) return;
    var idx = E.indexOf(ids[0]);
    E.commit(t('pdf.act.undo_delete', { n: ids.length }), function (st) { E.ops.remove(st, ids); });
    var next = E.state.pages[Math.min(idx, E.state.pages.length - 1)];
    if (next) { O.setSelection([next.id], next.id); if (A.mode === 'grid') O.focus(next.id); }
    A.announce(t('pdf.act.deleted', { n: ids.length }));
  };
  A.duplicate = function (ids) {
    if (!ids.length) return;
    var added = E.commit(t('pdf.act.undo_duplicate', { n: ids.length }), function (st) { return E.ops.duplicate(st, ids); });
    O.setSelection(added, added[0]); A.announce(t('pdf.act.duplicated', { n: ids.length }));
  };
  A.reverse = function () { var ids = O.selected(); E.commit(t('pdf.act.undo_reverse'), function (st) { E.ops.reverse(st, ids.length > 1 ? ids : null); }); A.announce(t(ids.length > 1 ? 'pdf.act.reversed_sel' : 'pdf.act.reversed_all')); };
  A.sort = function (mode) { E.commit(t('pdf.act.undo_sort'), function (st) { E.ops.sort(st, mode); }); A.announce(t('pdf.act.sorted')); };
  S.insertIndex = function () {
    var idx = O.selectedIndices(), w = A.insertOpts.where, n = E.state.pages.length;
    if (w === 'start') return 0;
    if (w === 'end' || !idx.length) return n;
    return w === 'before' ? idx[0] : idx[idx.length - 1] + 1;
  }
  A.insertBlank = function () {
    var o = A.insertOpts, at = S.insertIndex(), w, hh;
    if (o.size === 'same') {
      var nb = E.state.pages[at - 1] || E.state.pages[at];
      if (nb) { var vs = E.viewSize(nb); w = vs.w; hh = vs.h; } else { w = E.SIZES.a4[0]; hh = E.SIZES.a4[1]; }
    } else {
      var s = E.SIZES[o.size] || E.SIZES.a4; w = s[0]; hh = s[1];
      if (o.orient === 'landscape') { var sw = w; w = hh; hh = sw; }
    }
    var p = E.blankPage(U.round(w, 2), U.round(hh, 2));
    E.commit(t('pdf.act.undo_insert_blank'), function (st) { E.ops.insert(st, at, [p]); });
    O.setSelection([p.id], p.id); O.reveal(p.id);
    A.announce(t('pdf.act.inserted_blank', { pos: String(at + 1) }));
  };
  var OPEN_ACCEPT = 'application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif';
  A.insertFromFile = function () {
    return SlopIntake.pick({ to: 'pdf', accept: OPEN_ACCEPT, mode: 'add', data: { at: S.insertIndex() } }); // ui/drop.js
  };
  A.pageMenuItems = function () {
    var ids = A.targetIds(), one = ids.length === 1;
    return [
      { label: t('pdf.act.open_page_view'), key: 'Enter', act: function () { A.openPage(ids[0]); }, disabled: !one },
      '-',
      { label: t('pdf.act.rotate_right'), key: 'R', act: function () { A.rotate(ids, 90); } },
      { label: t('pdf.act.rotate_left'), key: 'Shift+R', act: function () { A.rotate(ids, -90); } },
      { label: t('ui.duplicate'), key: 'Ctrl+D', act: function () { A.duplicate(ids); } },
      { label: t('pdf.act.extract_new'), act: function () { A.extract(); } },
      one && A.sendSub ? A.sendSub(A.sendPageItems(ids[0]), t('pdf.act.send_page_to'), t('pdf.act.send_no_app')) : null,
      '-',
      { label: t('pdf.act.insert_blank_after'), act: function () { A.insertOpts.where = 'after'; A.insertBlank(); } },
      { label: t('pdf.act.insert_file_after'), act: function () { A.insertOpts.where = 'after'; A.insertFromFile(); } },
      { label: t('pdf.act.move_start'), act: function () { E.commit(t('pdf.act.undo_move'), function (st) { E.ops.move(st, ids, 0); }); } },
      { label: t('pdf.act.move_end'), act: function () { E.commit(t('pdf.act.undo_move'), function (st) { E.ops.move(st, ids, st.pages.length); }); } },
      '-',
      { label: t('ui.delete'), key: 'Del', act: function () { A.remove(ids); } }
    ];
  };
  A.splitPreview = function () {
    if (A.tool !== 'split' || !E.state.pages.length) return null;
    var groups; try { groups = PN.splitGroups(); } catch (e) { return null; }
    var labels = {}, used = new Set();
    groups.forEach(function (g, k) { g.forEach(function (i, j) { used.add(i); if (j === 0 && labels[i] == null) labels[i] = t('pdf.act.split_part_first', { k: k + 1 }); else if (labels[i] == null) labels[i] = t('pdf.act.split_part', { k: k + 1 }); }); });
    E.state.pages.forEach(function (_, i) { if (!used.has(i)) labels[i] = t('pdf.act.split_excluded'); });
    return labels;
  };

  /* -------------------------------------------------------- open files */
  A.openDialog = function () {
    return SlopIntake.pick({ to: 'pdf', accept: OPEN_ACCEPT }); // the one intake (ui/drop.js): Add to current or Create new
  };
  A.askPassword = function (name, wrong) {
    return new Promise(function (res) {
      var inp = h('input', { class: 'sui-input', type: 'password', autocomplete: 'off', 'aria-label': t('pdf.act.password') });
      var body = h('div', null, h('p', { class: 'sui-p' + (wrong ? ' sp-err' : '') }, wrong ? t('pdf.act.pw_wrong_msg') : t('pdf.act.pw_needed_msg', { name: name })), SlopUI.field(t('pdf.act.password'), inp));
      var val = null;
      SlopUI.dialog({ title: wrong ? t('pdf.act.pw_wrong') : t('pdf.act.pw_required'), body: body, cls: 'sui-narrow', buttons: [{ label: t('menu.cancel') }, { label: t('pdf.act.unlock'), primary: true, act: function () { val = inp.value; } }], onClose: function (ok) { res(ok ? val : null); } });
    });
  };
  /** Adds PDFs/images. opts.at = insertion index (default end). */
  A.addFiles = async function (files, opts) {
    opts = opts || {};
    var newPages = [], errors = [], imgs = [], firstFile = null, opened = [], sources = [], total = files.length, k = 0;
    var wasEmptyOpen = !E.state.pages.length;
    S.busy(total > 1 ? t('pdf.act.opening_files', { n: total }) : t('pdf.act.opening_file', { name: files[0].name }), 0);
    async function flushImages() {
      if (!imgs.length) return;
      var name = imgs.length === 1 ? imgs[0].name : t('pdf.act.images_name', { n: imgs.length });
      try {
        var pdf = await E.imagesToPdf(imgs, { size: 'fit' });
        var f = await E.registerPdf(pdf, name.replace(/\.(png|jpe?g|webp|gif)$/i, '') + '.pdf', null);
        f.noLog = true; // generated from images
        firstFile = firstFile || f; newPages = newPages.concat(E.pagesForFile(f));
      } catch (e) { errors.push(t('pdf.act.err_images', { msg: String(e.message || e) })); }
      imgs = [];
    }
    try {
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        S.busy(t('pdf.act.opening_file', { name: file.name }), k++ / total);
        var bytes;
        try { bytes = await U.readFile(file); } catch (e) { errors.push(t('pdf.act.err_read', { name: file.name })); continue; }
        var kind = U.sniff(bytes);
        if (kind === 'pdf') {
          await flushImages();
          try {
            var f = await E.registerPdf(bytes, file.name, A.askPassword);
            if (opts.drive && !opts.drive.log) f.noLog = true; // a Drive version: its saved log is not used
            sources.push({ bytes: bytes, name: file.name });
            if (f.locked) errors.push(t('pdf.act.err_locked', { name: file.name, why: String(f.locked) }));
            firstFile = firstFile || f; opened.push(f); newPages = newPages.concat(E.pagesForFile(f));
          } catch (e) { var msg = E.friendlyError(e, file.name); if (msg) errors.push(msg); }
        } else if (kind === 'png' || kind === 'jpeg' || kind === 'webp' || kind === 'gif' || kind === 'bmp') {
          imgs.push({ bytes: bytes, kind: kind, name: file.name });
        } else errors.push(t('pdf.act.err_type', { name: file.name }));
      }
      await flushImages();
    } finally { S.busy(null); }
    if (newPages.length) {
      var at = opts.at == null ? E.state.pages.length : opts.at, wasEmpty = !E.state.pages.length;
      if (wasEmpty && firstFile) { var md = await E.readMeta(firstFile); if (md) E.state.meta = md; }
      E.commit(wasEmpty ? (files.length > 1 ? t('pdf.act.undo_open_files', { n: files.length }) : t('pdf.act.undo_open_file', { name: files[0].name })) : t('pdf.act.undo_add_pages'), function (st) { E.ops.insert(st, at, newPages); });
      if (!S.fileNameTouched) S.els.fileName.value = E.files.size > 1 ? 'merged.pdf' : U.safeName(U.baseName(firstFile.name) + '-edited', 'pdf');
      if (!wasEmpty) { O.setSelection(newPages.map(function (p) { return p.id; }), newPages[0].id); O.reveal(newPages[0].id); }
      A.announce(t('pdf.act.added_pages', { n: newPages.length }));
      S.els.restore.hidden = true;
    }
    var hadPw = opened.filter(function (f) { return f.security && f.security.encrypted; })[0];
    if (hadPw) A.status(t('pdf.act.had_pw', { name: hadPw.name }), 'warn');
    if (errors.length) SlopUI.alert(t(errors.length > 1 ? 'pdf.act.open_fail_many' : 'pdf.act.open_fail_one'), h('div', null, errors.map(function (e) { return h('p', { class: 'sui-p' }, e); })));
    // Slop Drive: a version opened from Drive is linked to its document; other PDFs are kept there at once
    if (sources.length && newPages.length) {
      if (opts.drive) { if (wasEmptyOpen) A.driveId = opts.drive.link; }
      else await A.autosaveOpened(sources, wasEmptyOpen);
    }
    // saved edits from an earlier session, asked once the files are open
    for (var oi = 0; oi < opened.length; oi++) await SP.editLog.offer(opened[oi]);
  };
  A.loadSample = async function () {
    S.busy(E.sampleInfo.busy, 0.3);
    try {
      var bytes = await E.makeSample();
      var f = await E.registerPdf(bytes, E.sampleInfo.file, null);
      f.noLog = true; // random every time: nothing to replay
      var wasEmpty = !E.state.pages.length;
      if (wasEmpty) { var md = await E.readMeta(f); if (md) E.state.meta = md; }
      E.commit(t('pdf.act.undo_open_sample'), function (st) { E.ops.insert(st, st.pages.length, E.pagesForFile(f)); });
      if (!S.fileNameTouched) S.els.fileName.value = E.sampleInfo.slug;
      S.els.restore.hidden = true;
      A.announce(t('pdf.act.sample_loaded', { n: 4 }));
    } catch (e) { SlopUI.alert(t('pdf.act.sample_failed'), String(e.message || e)); console.error(e); }
    finally { S.busy(null); }
  };
})();
