/* Slop PDF — progress indicator and every output: download, extract, split (zip), compress,
   pages to images, images to PDF, text extraction and the offline app download. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, PN = SP.panels, A = SP.app, S = A._;
  var $ = U.$, h = U.h, t = U.t;
  /* ------------------------------------------------------------ S.busy */
  S.busy = function (msg, frac) {
    if (msg == null) { S.els.busy.hidden = true; S.els.app.removeAttribute('aria-busy'); return; }
    S.els.busy.hidden = false; S.els.app.setAttribute('aria-busy', 'true');
    S.els.busy.querySelector('.busy-msg').textContent = msg;
    var bar = S.els.busy.querySelector('.busy-bar i');
    if (frac == null) bar.parentNode.classList.add('indet'); else { bar.parentNode.classList.remove('indet'); bar.style.width = Math.round(U.clamp(frac, 0, 1) * 100) + '%'; }
  }
  A.busy = S.busy;
  S.guarded = async function (label, fn) {
    if (Ed.isEditingText()) Ed.commitText();
    S.busy(label, 0);
    try { return await fn(function (f, m) { S.busy(m || label, f); }); }
    catch (e) { console.error(e); SlopUI.alert(t('pdf.act.err_title'), String((e && e.message) || e)); return null; }
    finally { S.busy(null); }
  }
  S.outName = function (suffix, ext) {
    var b = U.baseName(S.els.fileName.value || 'document');
    return U.safeName(b + (suffix ? '-' + suffix : ''), ext || 'pdf');
  }

  /* --------------------------------------------------------- downloads */
  /** Builds, checks and downloads the document. opts.protect (ui/protect.js): { pw, owner, print, copy, edit } adds a
   *  password (AES-256) after the check, which pdf.js could not open without it. The caller forgets the fields. */
  A.download = function (opts) {
    if (!E.state.pages.length) return;
    var prot = opts && opts.protect && opts.protect.pw ? opts.protect : null, locked = !!prot;
    function forget() { if (prot) { prot.pw = ''; prot.owner = ''; prot = null; } }
    return S.guarded(t('pdf.act.busy_building'), async function (prog) {
      try { return await save(prog); } finally { forget(); }
    });
    async function save(prog) {
      var n = E.state.pages.length;
      var bytes = await E.build({ onProgress: function (f) { prog(f * 0.85); } });
      prog(0.92, t('pdf.act.busy_checking'));
      await E.validate(bytes, n);
      if (prot) {
        prog(0.96, t('pdf.act.busy_password'));
        bytes = await SP.decrypt.encryptPdf(bytes, { userPassword: prot.pw, ownerPassword: prot.owner || '',
          permissions: { print: prot.print !== false, copy: prot.copy !== false, modify: prot.edit !== false, annotate: prot.edit !== false, assemble: prot.edit !== false } });
        forget();
      }
      var name = U.safeName(S.els.fileName.value || 'document.pdf', 'pdf');
      S.els.fileName.value = name;
      U.download(bytes, name, 'application/pdf');
      A.lastOutput = bytes;
      A.status(t(locked ? 'pdf.act.saved_locked' : 'pdf.act.saved', { name: name, n: n, size: U.fmtBytes(bytes.length) }), 'ok');
      SlopUI.toast(t(locked ? 'pdf.act.downloaded_locked' : 'pdf.act.downloaded', { name: name, size: U.fmtBytes(bytes.length) }));
      return bytes;
    }
  };
  A.extract = function (idList) {
    var ids = idList || O.selected();
    if (!ids.length) { SlopUI.toast(t('pdf.act.extract_first')); return; }
    return S.guarded(t('pdf.act.busy_extracting'), async function (prog) {
      var set = new Set(ids), pages = E.state.pages.filter(function (p) { return set.has(p.id); });
      var bytes = await E.build({ pages: pages, onProgress: prog });
      await E.validate(bytes, pages.length);
      var shown = E.state.pages.map(function (p, i) { return set.has(p.id) ? i : -1; }).filter(function (i) { return i >= 0; });
      var name = S.outName('pages-' + U.describeIdx(shown).replace(/[–, ]+/g, function (m) { return m.indexOf(',') >= 0 ? '_' : '-'; }));
      U.download(bytes, name, 'application/pdf');
      A.status(t('pdf.act.extracted', { n: pages.length, name: name }), 'ok');
      return bytes;
    });
  };
  A.split = function () {
    var groups;
    try { groups = PN.splitGroups(); } catch (e) { SlopUI.alert(t('pdf.act.check_ranges'), e.message); return; }
    if (!groups.length) return;
    return S.guarded(t('pdf.act.busy_splitting'), async function (prog) {
      var files = [], width = String(groups.length).length;
      for (var i = 0; i < groups.length; i++) {
        var pages = groups[i].map(function (k) { return E.state.pages[k]; });
        var bytes = await E.build({ pages: pages });
        await E.validate(bytes, pages.length);
        files.push({ name: S.outName('part' + String(i + 1).padStart(width, '0') + '-p' + U.describeIdx(groups[i]).replace(/[–]/g, '-').replace(/[, ]+/g, '_')), data: bytes });
        prog((i + 1) / groups.length, t('pdf.act.busy_splitting_n', { i: i + 1, total: groups.length }));
      }
      if (PN.split.output === 'zip' && files.length > 1) {
        U.download(U.makeZip(files), S.outName('split', 'zip'));
        A.status(t('pdf.act.split_zip', { n: files.length }), 'ok');
      } else {
        for (var j = 0; j < files.length; j++) { U.download(files[j].data, files[j].name, 'application/pdf'); await U.sleep(350); }
        A.status(t('pdf.act.split_files', { n: files.length }), 'ok');
        if (files.length > 3) SlopUI.toast(t('pdf.act.split_many_hint'));
      }
      return files;
    });
  };
  A.compress = function (o, resultEl) {
    return S.guarded(t('pdf.act.busy_compressing'), async function (prog) {
      var n = E.state.pages.length, before = 0;
      new Set(E.state.pages.filter(function (p) { return p.f; }).map(function (p) { return p.f; })).forEach(function (fid) { before += E.files.get(fid).bytes.length; });
      var bytes = await E.build({ onProgress: function (f) { prog(f * (o.mode === 'lossy' ? 0.3 : 0.9)); } });
      if (o.mode === 'lossy') bytes = await E.rasterize(bytes, { dpi: o.dpi, quality: o.quality, onProgress: function (f) { prog(0.3 + f * 0.65, t('pdf.act.busy_raster', { i: Math.ceil(f * n), total: n })); } });
      else bytes = await E.resave(bytes);
      await E.validate(bytes, n);
      var name = S.outName('compressed');
      U.download(bytes, name, 'application/pdf');
      var pct = before ? Math.round((1 - bytes.length / before) * 100) : 0;
      if (resultEl) {
        resultEl.innerHTML = '';
        resultEl.append(h('div', { class: 'res-sizes' }, h('span', null, U.fmtBytes(before)), h('i', { html: U.icon('next') }), h('b', null, U.fmtBytes(bytes.length))),
          h('p', { class: 'pp-note' }, pct > 0 ? t('pdf.act.compress_smaller', { pct: pct, name: name }) : t('pdf.act.compress_none', { name: name })));
      }
      A.status(t('pdf.act.compressed', { before: U.fmtBytes(before), after: U.fmtBytes(bytes.length) }), 'ok');
      return bytes;
    });
  };
  A.toImages = function (o) {
    return S.guarded(t('pdf.act.busy_rendering'), async function (prog) {
      var pages = E.state.pages, idx = null;
      if (o.which === 'sel') { var s = O.selectedIndices(); if (!s.length) { SlopUI.toast(t('pdf.act.select_pages_first')); return null; } idx = s; }
      var bytes = await E.build({ onProgress: function (f) { prog(f * 0.3); } });
      var files = await E.toImages(bytes, { format: o.format, dpi: o.dpi, quality: o.quality, indices: idx, base: U.baseName(S.els.fileName.value || 'page'), onProgress: function (f) { prog(0.3 + f * 0.7, t('pdf.act.busy_rendering_pct', { pct: Math.round(f * 100) })); } });
      if (files.length === 1) U.download(files[0].data, files[0].name, files[0].mime);
      else U.download(U.makeZip(files), S.outName('images', 'zip'));
      A.status(t('pdf.act.exported_images', { n: files.length, dpi: String(o.dpi) }), 'ok');
      void pages;
      return files;
    });
  };
  /** Images to PDF (Document panel): the pictures come in through the intake (shared/intake), a part of its own. */
  var imagesIo = null;
  A.imagesToPdf = function (io) {
    imagesIo = io;
    SlopIntake.register({
      id: 'pdf.images-to-pdf', main: false, paste: false, toast: false,
      accept: { types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], noun: 'pdf.act.images_noun' },
      processAll: imagesToPdfFiles,
    });
    return SlopIntake.pick({ to: 'pdf.images-to-pdf' });
  };
  function imagesToPdfFiles(files) {
    var io = imagesIo || {};
    return S.guarded(t('pdf.act.busy_converting'), async function (prog) {
      var items = [];
      for (var i = 0; i < files.length; i++) { var b = await U.readFile(files[i]), k = U.sniff(b); if (/png|jpeg|webp|gif|bmp/.test(k)) items.push({ bytes: b, kind: k, name: files[i].name }); }
      if (!items.length) { SlopUI.alert(t('pdf.act.no_images_title'), t('pdf.act.no_images')); return; }
      var pdf = await E.imagesToPdf(items, io);
      prog(0.8);
      if (io.add && E.state.pages.length) {
        var f = await E.registerPdf(pdf, (items.length === 1 ? U.baseName(items[0].name) : t('pdf.act.images_name', { n: items.length })) + '.pdf', null);
        f.noLog = true; // generated from images
        var pages = E.pagesForFile(f);
        E.commit(t('pdf.act.undo_add_images'), function (st) { E.ops.insert(st, st.pages.length, pages); });
        A.announce(t('pdf.act.added_image_pages', { n: pages.length }));
      } else {
        U.download(pdf, items.length === 1 ? U.safeName(U.baseName(items[0].name), 'pdf') : 'images.pdf', 'application/pdf');
        A.status(t('pdf.act.converted_images', { n: items.length }), 'ok');
      }
    });
  }
  A.extractText = function () {
    return S.guarded(t('pdf.act.busy_text'), async function () {
      var bytes = await E.build({ stamps: true });
      var txt = await E.extractText(bytes);
      var ta = h('textarea', { class: 'sui-input sp-textout', readonly: true, rows: 16, spellcheck: 'false', 'aria-label': t('pdf.act.text_title') });
      ta.value = txt;
      var words = (txt.match(/\S+/g) || []).length;
      SlopUI.dialog({ title: t('pdf.act.text_title'), cls: 'sui-wide', body: h('div', null, h('p', { class: 'sui-p' }, t('pdf.act.words_from', { n: words, pages: E.state.pages.length })), ta), buttons: [
        { label: t('ui.copy'), act: function () { ta.select(); var ok = false; try { if (navigator.clipboard) { navigator.clipboard.writeText(txt); ok = true; } } catch (e) { /* ignore */ } if (!ok) try { document.execCommand('copy'); } catch (e) { /* ignore */ } SlopUI.toast(t('ui.copied')); return false; } },
        { label: t('pdf.act.download_txt'), primary: true, act: function () { U.download(new Blob([txt], { type: 'text/plain;charset=utf-8' }), S.outName('', 'txt')); } }] });
      return txt;
    });
  };
  A.downloadApp = function () {
    return S.guarded(t('pdf.act.busy_pack'), async function () {
      var html = await SP.build.make();
      U.download(new Blob([html], { type: 'text/html;charset=utf-8' }), 'slop-pdf.html');
      A.status(t('pdf.act.offline_saved', { file: 'slop-pdf.html', size: U.fmtBytes(html.length) }), 'ok');
      return html;
    });
  };
})();
