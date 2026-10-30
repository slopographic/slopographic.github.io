/* Slop PDF — File ▸ Extract all… (and the command palette): everything stored in the document, listed with checkboxes in
   the shared dialog: images (the stored pictures, once each, with size, colour space and pages; inline pictures too),
   embedded files (attachments of the document and of its pages, e.g. a ZUGFeRD / Factur-X invoice), fonts (the embedded
   font programs), the text of each page (.txt, .md) and the pages themselves (PNG or SVG). Download ZIP (or one file each),
   Save to Slop Drive (a folder named after the PDF) or Open in… (SlopOuttake: one file as it is, more as the ZIP). Items
   that cannot be saved are listed with the reason. Reading: io/assets-scan.js; saving: assets-save.js, extract-more.js. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, Ed = SP.editor, A = SP.app, X = SP.assets, Mod = window.SlopPdfAssets, h = U.h, t = U.t;

  /** Everything the dialog lists: { images, inline, attachments, fonts }. */
  X.findAll = async function () {
    var found = await X.scan();
    return { images: found.images, fonts: found.fonts, attachments: await X.attachments(), inline: await X.inlineImages().catch(function () { return []; }) };
  };
  A.extractAssets = async function () {
    if (!E.state.pages.length) return;
    if (Ed.isEditingText()) Ed.commitText();
    A.busy(t('pdf.act.ea_reading'), 0);
    var found;
    try { found = await X.findAll(); }
    catch (e) { console.error(e); SlopUI.alert(t('pdf.act.ea_read_fail'), String((e && e.message) || e)); return; }
    finally { A.busy(null); }
    openList(found);
  };

  function openList(found) {
    var rows = Mod.rows(found.images, found.fonts), att = Mod.attachmentRows(found.attachments), chosen = new Set(), boxes = [];
    var inl = found.inline.map(function (im) { return { id: im.id, title: t('pdf.act.ea_inline', { name: im.name }), meta: [im.width + '×' + im.height, t(im.ext === 'jpg' ? 'pdf.act.ea_jpeg_stored' : 'pdf.act.ea_drawn_png'), t('pdf.act.ea_page', { p: String(im.page) })], checked: true }; });
    var base = X.baseName(), canDrive = !!window.SlopHub && !SP.offline, zipName = base + '-assets.zip';
    var sum = h('p', { class: 'sui-p ea-sum' });
    var textSel = h('select', { class: 'ea-fmt', 'aria-label': t('pdf.act.ea_text_format') }, h('option', { value: 'both' }, t('pdf.act.ea_txt_md')), h('option', { value: 'txt' }, '.txt'), h('option', { value: 'md' }, t('pdf.act.ea_markdown')));
    var pageSel = h('select', { class: 'ea-fmt', 'aria-label': t('pdf.act.ea_page_format') }, h('option', { value: 'png' }, t('pdf.act.ea_png_dpi', { dpi: '150' })), h('option', { value: 'png300' }, t('pdf.act.ea_png_dpi', { dpi: '300' })), h('option', { value: 'svg' }, 'SVG'));
    var textCb = h('input', { type: 'checkbox', 'data-part': 'text' }), pageCb = h('input', { type: 'checkbox', 'data-part': 'pages' });
    var outSel = h('select', { class: 'ea-fmt', 'aria-label': t('pdf.act.ea_output') }, h('option', { value: 'zip' }, t('pdf.act.ea_one_zip')), h('option', { value: 'files' }, t('pdf.act.ea_each_file')));
    function count() {
      var n = chosen.size + (textCb.checked ? 1 : 0) + (pageCb.checked ? 1 : 0);
      sum.textContent = t('pdf.act.ea_sum', { n: n, images: t('pdf.act.ea_images', { n: rows.counts.images + inl.length }),
        files: t('pdf.act.ea_files', { n: att.length }), fonts: t('pdf.act.ea_fonts', { n: rows.counts.fonts }) });
    }
    function setAll(on) {
      boxes.forEach(function (b) { if (!b.cb.disabled) { b.cb.checked = on; if (on) chosen.add(b.id); else chosen.delete(b.id); } });
      textCb.checked = pageCb.checked = on; count();
    }
    function row(r) {
      var cb = h('input', { type: 'checkbox', disabled: r.disabled });
      cb.checked = chosen.has(r.id);
      cb.addEventListener('change', function () { if (cb.checked) chosen.add(r.id); else chosen.delete(r.id); count(); });
      boxes.push({ id: r.id, cb: cb });
      return h('label', { class: 'ea-row' + (r.disabled ? ' is-off' : ''), 'data-id': r.id }, cb,
        h('span', { class: 'ea-main' }, h('span', { class: 'ea-title' }, r.title), h('span', { class: 'ea-meta' }, r.meta.join(' · ')),
          r.reason ? h('span', { class: 'ea-reason' }, r.reason) : null));
    }
    function section(title, list, part) {
      if (!list.length) return null;
      return h('section', { class: 'ea-sec', 'data-part': part }, h('h3', { class: 'ea-h' }, t('pdf.act.ea_section', { title: title, n: list.length })), h('div', { class: 'ea-items' }, list.map(row)));
    }
    function opt(cb, label, sel) { cb.addEventListener('change', count); return h('label', { class: 'ea-row ea-opt' }, cb, h('span', { class: 'ea-main' }, h('span', { class: 'ea-title' }, label), sel)); }
    rows.images.concat(inl, att, rows.fonts).forEach(function (r) { if (r.checked) chosen.add(r.id); });
    var body = h('div', { class: 'ea-body' },
      h('div', { class: 'ea-tools' }, sum, h('button', { type: 'button', class: 'sui-btn', onclick: function () { setAll(true); } }, t('ui.all')),
        h('button', { type: 'button', class: 'sui-btn', onclick: function () { setAll(false); } }, t('ui.none'))),
      h('p', { class: 'sui-p ea-note' }, t('pdf.act.ea_note')),
      section(t('pdf.act.ea_sec_images'), rows.images.concat(inl), 'images'), section(t('pdf.act.ea_sec_files'), att, 'attachments'), section(t('pdf.act.fonts_title'), rows.fonts, 'fonts'),
      h('section', { class: 'ea-sec', 'data-part': 'doc' }, h('h3', { class: 'ea-h' }, t('pdf.act.ea_sec_doc')),
        h('div', { class: 'ea-items' }, opt(textCb, t('pdf.act.ea_opt_text'), textSel), opt(pageCb, t('pdf.act.ea_opt_pages'), pageSel))),
      h('label', { class: 'ea-fmtrow' }, t('pdf.act.ea_output') + ' ', outSel));
    count();
    var buttons = [{ label: t('menu.close') }];
    if (window.SlopOuttake && canDrive) buttons.push({ label: t('pdf.act.ea_open_in'), act: function () { openIn(); return false; } });
    if (canDrive) buttons.push({ label: t('pdf.act.ea_save_drive'), act: function () { return run('drive'); } });
    buttons.push({ label: t('pdf.act.ea_download_zip'), primary: true, act: function () { return run('download'); } });
    SlopUI.dialog({ title: t('pdf.act.ea_title'), cls: 'sui-wide ea-dlg', body: body, buttons: buttons });
    outSel.addEventListener('change', function () { var b = document.querySelector('.ea-dlg .sui-btn.sui-primary'); if (b) b.textContent = outSel.value === 'zip' ? t('pdf.act.ea_download_zip') : t('ui.download'); });

    function choice() {
      var pick = function (l) { return l.filter(function (x) { return chosen.has(x.id); }); };
      var pf = pageCb.checked ? pageSel.value : '';
      return { images: pick(found.images), fonts: pick(found.fonts), attachments: pick(found.attachments), inline: pick(found.inline),
        text: textCb.checked ? textSel.value : '', pages: pf === 'svg' ? 'svg' : pf ? 'png' : '', dpi: pf === 'png300' ? 300 : 150 };
    }
    async function collect() {
      var c = choice();
      if (!c.images.length && !c.fonts.length && !c.attachments.length && !c.inline.length && !c.text && !c.pages) { SlopUI.toast(t('pdf.act.ea_select_some')); return null; }
      A.busy(t('pdf.act.ea_preparing'), 0);
      try { return await X.collect(c, function (f) { A.busy(t('pdf.act.ea_preparing'), f); }); } finally { A.busy(null); }
    }
    async function run(dest) {
      var out, asZip = outSel.value === 'zip';
      try {
        out = await collect(); if (!out) return false;
        if (!out.entries.length) { SlopUI.alert(t('pdf.act.ea_nothing_title'), skipText(out.skipped)); return false; }
        A.busy(t(dest === 'drive' ? 'pdf.act.ea_saving_drive' : 'pdf.act.ea_saving'), 0.5);
        if (dest === 'drive') await X.saveToDrive(out.entries, zipName, base, asZip);
        else await X.download(out.entries, zipName, asZip);
      } catch (e) {
        console.error(e); SlopUI.alert(t('pdf.act.ea_save_fail'), String((e && e.message) || e)); return false;
      } finally { A.busy(null); }
      var n = out.entries.length, drive = dest === 'drive';
      var v = { n: n, zip: zipName };
      var what = asZip ? (drive ? t('pdf.act.ea_saved_zip_drive', v) : t('pdf.act.ea_saved_zip', v)) : drive ? t('pdf.act.ea_saved_drive', v) : t('pdf.act.ea_saved', v);
      SlopUI.toast(out.skipped.length ? t('pdf.act.ea_with_skipped', { what: what, k: out.skipped.length }) : what);
      A.status(what, 'ok');
      if (out.skipped.length) SlopUI.alert(t('pdf.act.ea_skipped_title'), skipText(out.skipped));
      return true;
    }
    /** Open in…: one file goes as it is, more as the ZIP (SlopOuttake builds the list of apps that take it). */
    function openIn() {
      var made = null, at = Array.prototype.find.call(document.querySelectorAll('.ea-dlg .sui-btn'), function (b) { return b.textContent === t('pdf.act.ea_open_in'); }) || document.querySelector('.ea-dlg');
      var one = function () { return (made = made || collect()).then(function (o) { if (!o || !o.entries.length) throw new Error(t('pdf.act.ea_select_some')); return o; }); };
      var c = choice(), single = c.images.length + c.fonts.length + c.attachments.length + c.inline.length === 1 && !c.text && !c.pages;
      var a = single && c.attachments[0], type = a ? a.mime : single && (c.images[0] || c.inline[0]) ? 'image/' + ((c.images[0] || c.inline[0]).ext === 'jpg' ? 'jpeg' : 'png') : single ? 'font/sfnt' : 'application/zip';
      SlopOuttake.menu(at, { from: 'pdf', type: type,
        name: function () { return single ? (a ? a.name : base + '-' + ((c.images[0] || c.inline[0] || c.fonts[0]).name || 'file')) : zipName; },
        get: function () { return one().then(function (o) { return single ? new Blob([o.entries[0].data], { type: type }) : X.zipBlob(o.entries); }); } });
    }
  }
  function skipText(list) { return list.length ? list.map(function (s) { return t('pdf.act.ea_skip_item', { name: s.name, reason: s.reason }); }).join('. ') : t('pdf.act.ea_none_skipped'); }
})();
