/* Slop Press — Export PDF, Export PNG and Print dialogs. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, t = U.t, h = U.h, S = PR.state, P = PR.pages;
  var UI = PR.ui = PR.ui || {};
  var SU = function () { return window.SlopUI; };
  var ST = PR.store;

  function check(label, on, title) { var c = h('input', { type: 'checkbox' }); c.checked = !!on; return { el: h('label', { class: 'pr-check', title: title || '' }, c, label), input: c }; }
  function rangeField() {
    var mode = SU().select([['all', t('press.export.all_pages')], ['current', t('press.export.current_page', { page: String(P.label(S.doc, S.page)) })], ['range', t('press.export.range_dots')]], 'all');
    var txt = h('input', { class: 'sui-input', type: 'text', placeholder: t('press.dlg.range_placeholder', { eg: '1-4, 8' }), value: '1-' + P.label(S.doc, S.doc.pages.length - 1) });
    var f = SU().field(t('press.export.range'), txt); f.hidden = true;
    mode.addEventListener('change', function () { f.hidden = mode.value !== 'range'; });
    return { els: [SU().field(t('press.dlg.pages'), mode), f], pages: function () { return mode.value === 'all' ? null : mode.value === 'current' ? [S.page] : UI.parseRange(txt.value); } };
  }
  function busy(label, p) {
    // key: press.export.<what> ('Exporting PDF…'), <what>_done and <what>_failed
    U.toast(t(label), 60000);
    return p.then(function (r) { U.toast(t(label + '_done')); return r; }, function (e) { console.error(e); U.toast(t(label + '_failed', { error: e.message }), 5000); throw e; });
  }

  UI.exportPDF = function () {
    var last = ST.pref('pdfopts') || { preset: 'press', bleed: true, cropMarks: true, bleedMarks: false, regMarks: true, pageInfo: true, embed: true };
    var preset = SU().select([['press', t('press.export.preset_press')], ['digital', t('press.export.preset_digital')], ['custom', t('press.dlg.custom')]], last.preset);
    var rg = rangeField();
    var bleed = check(t('press.export.bleed_n', { size: U.fmt(S.doc.bleed.top, S.doc.unit, true) }), last.bleed), crop = check(t('press.export.crop_marks'), last.cropMarks), bm = check(t('press.export.bleed_marks'), last.bleedMarks),
      reg = check(t('press.export.reg_marks'), last.regMarks), info = check(t('press.export.page_info'), last.pageInfo), emb = check(t('press.export.embed'), last.embed, t('press.export.embed_tip'));
    function applyPreset() {
      if (preset.value === 'press') { bleed.input.checked = crop.input.checked = reg.input.checked = info.input.checked = true; bm.input.checked = false; }
      if (preset.value === 'digital') { bleed.input.checked = crop.input.checked = reg.input.checked = info.input.checked = bm.input.checked = false; }
    }
    preset.addEventListener('change', applyPreset);
    [bleed, crop, bm, reg, info].forEach(function (c) { c.input.addEventListener('change', function () { preset.value = 'custom'; }); });
    var over = PR.engine.oversetStories().length, STD = { Helvetica: 1, Arial: 1, Times: 1, Courier: 1 };
    var subs = {}; PR.pdfDraw.fontKeys(S.doc, S.doc.pages.map(function (p, i) { return i; })).forEach(function (k) { var f = k.split('|')[0]; if (!STD[f] && PR.fonts.substituted(f)) subs[f] = PR.fonts.family(f).std || 'Helvetica'; });
    var subList = Object.keys(subs).map(function (f) { return f + ' → ' + subs[f]; }).join(', ');
    var body = h('div', { class: 'pr-form' }, SU().field(t('press.dlg.preset'), preset), rg.els, h('h4', null, t('press.export.marks_bleed')), h('div', { class: 'pr-cols' }, bleed.el, crop.el, bm.el, reg.el, info.el, emb.el),
      h('p', { class: 'sui-p' }, t('press.export.boxes_note')),
      subList ? h('p', { class: 'sui-p' }, 'ⓘ ' + t('press.export.no_font_file', { fonts: subList })) : null,
      over ? h('p', { class: 'sui-p', style: { color: '#ff6b6b' } }, '⚠ ' + t('press.export.overset', { n: over })) : null);
    SU().dialog({ title: t('press.export.pdf_title'), body: body, cls: 'pr-mid', buttons: [{ label: t('menu.cancel') }, { label: t('menu.export'), primary: true, act: function () {
      var o = { preset: preset.value, bleed: bleed.input.checked, cropMarks: crop.input.checked, bleedMarks: bm.input.checked, regMarks: reg.input.checked, pageInfo: info.input.checked, embed: emb.input.checked };
      ST.pref('pdfopts', o);
      busy('press.export.busy_pdf', PR.pdf.download(U.assign({ pages: rg.pages() }, o)));
    } }] });
  };
  UI.exportPNG = function () {
    var rg = rangeField(), dpi = SU().select([['72', t('press.export.ppi_screen', { n: '72' })], ['150', '150 ppi'], ['300', t('press.export.ppi_print', { n: '300' })]], '150');
    var fmt = SU().select([['image/png', 'PNG'], ['image/jpeg', 'JPEG']], 'image/png'), bleed = check(t('press.export.bleed'), false), tr = check(t('press.export.transparent'), false);
    SU().dialog({ title: t('press.export.png_title'), body: h('div', { class: 'pr-form' }, rg.els, SU().field(t('press.export.resolution'), dpi), SU().field(t('press.export.format'), fmt), bleed.el, tr.el, h('p', { class: 'sui-p' }, t('press.export.png_note'))),
      buttons: [{ label: t('menu.cancel') }, { label: t('menu.export'), primary: true, act: function () {
        var pages = rg.pages() || S.doc.pages.map(function (p, i) { return i; });
        busy('press.export.busy_images', PR.raster.exportPNG(pages, +dpi.value, { bleed: bleed.input.checked, transparent: tr.input.checked && fmt.value === 'image/png', type: fmt.value, quality: 0.92 }));
      } }] });
  };
  UI.printDialog = function () {
    var rg = rangeField(), dpi = SU().select([['150', t('press.export.q_draft', { n: '150' })], ['200', t('press.export.q_normal', { n: '200' })], ['300', t('press.export.q_high', { n: '300' })]], '200'), bleed = check(t('press.export.bleed'), false);
    SU().dialog({ title: t('menu.print'), body: h('div', { class: 'pr-form' }, rg.els, SU().field(t('press.export.quality'), dpi), bleed.el,
      h('p', { class: 'sui-p' }, t('press.export.print_note'))),
      buttons: [{ label: t('press.export.pdf_instead'), act: function () { setTimeout(UI.exportPDF, 160); } }, { label: t('menu.cancel') }, { label: t('menu.print'), primary: true, act: function () {
        var pages = rg.pages() || S.doc.pages.map(function (p, i) { return i; });
        busy('press.export.busy_print', PR.raster.print(pages, +dpi.value, { bleed: bleed.input.checked }));
      } }] });
  };
})();
