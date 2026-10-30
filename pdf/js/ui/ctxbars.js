/* Slop PDF — contextual toolbars above the workspace (organizer actions; page view nav, tools, zoom). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, O = SP.organizer, Ed = SP.editor, PN = SP.panels, A = SP.app, S = A._;
  var $ = U.$, h = U.h;
  /* ------------------------------------------------------------ ctx bars */
  // The bars are built once: each label is a key (or a function giving the text) and is set again on a language change.
  var live = [];
  function txt(l) { return typeof l === 'function' ? l() : U.t(l); }
  function keep(fn) { live.push(fn); fn(); }
  U.onLang(function () { live.forEach(function (fn) { fn(); }); });
  S.ib = function (icon, label, fn, extra) {
    var b = h('button', Object.assign({ type: 'button', class: 'tb', html: U.icon(icon) }, extra || {}));
    keep(function () { var s = txt(label); b.title = s; b.setAttribute('aria-label', s); });
    b.addEventListener('click', fn);
    return b;
  }
  S.ibl = function (icon, label, fn, short) {
    var b = h('button', { type: 'button', class: 'tb tb-l', html: U.icon(icon) + '<span></span>' }), sp = b.querySelector('span');
    keep(function () { b.title = txt(label); sp.textContent = txt(short || label); });
    b.addEventListener('click', fn);
    return b;
  }
  S.sep = function () { return h('span', { class: 'tb-sep', 'aria-hidden': 'true' }); }
  S.buildCtxBars = function () {
    var g = S.els.ctxGrid;
    var sizeSeg = O.sizeControl();
    g.append(
      S.ibl('selectall', 'ui.select_all', function () { if (O.sel.size === E.state.pages.length) O.setSelection([]); else O.selectAll(); }, 'ui.all'), S.sep(),
      S.ib('rotl', 'pdf.act.rotate_left', function () { A.rotate(A.targetIds(), -90); }),
      S.ib('rotr', 'pdf.act.rotate_right', function () { A.rotate(A.targetIds(), 90); }),
      S.ib('copy', 'ui.duplicate', function () { A.duplicate(A.targetIds()); }),
      S.ib('trash', 'ui.delete', function () { A.remove(A.targetIds()); }), S.sep(),
      S.ibl('extract', 'pdf.act.bar_extract', function () { A.extract(); }, 'pdf.act.bar_extract_short'),
      S.ibl('blank', 'pdf.act.undo_insert_blank', function () { A.insertBlank(); }, 'pdf.act.bar_blank_short'),
      S.ibl('insert', 'pdf.act.bar_insert', function () { A.insertFromFile(); }, 'pdf.act.bar_insert_short'),
      S.ib('reverse', 'pdf.act.undo_reverse', function () { A.reverse(); }),
      S.ib('eye', 'pdf.act.bar_open_page', function () { A.ensurePage(); }),
      h('span', { class: 'tb-flex' }), sizeSeg);
    var p = S.els.ctxPage;
    var pageNo = h('span', { class: 'pv-num', id: 'pvNum' }, '');
    var zoomLbl = h('button', { type: 'button', class: 'tb tb-zoom', id: 'zoomLbl' }, '100%');
    keep(function () { zoomLbl.title = U.t('pdf.act.zoom_presets'); });
    zoomLbl.addEventListener('click', function (e) {
      var r = zoomLbl.getBoundingClientRect();
      SlopUI.menu([{ label: U.t('pdf.act.fit_page'), key: '0', act: function () { Ed.fit('fit'); } }, { label: U.t('pdf.act.fit_width'), act: function () { Ed.fit('width'); } }, '-'].concat([0.5, 0.75, 1, 1.5, 2, 3, 4].map(function (z) { return { label: Math.round(z * 100) + '%', act: function () { Ed.setZoom(z * 96 / 72); } }; })), r.left, r.bottom + 4);
      e.stopPropagation();
    });
    var tools = h('div', { class: 'pv-tools', role: 'toolbar' });
    keep(function () { tools.setAttribute('aria-label', U.t('pdf.act.tools_label')); });
    Ed.TOOLS.forEach(function (t) {
      var b = S.ib(t[2], function () { return U.t('pdf.act.with_key', { label: U.t(t[1]), key: t[3] }); }, function () { Ed.setTool(t[0]); }, { 'data-tool': t[0] });
      tools.appendChild(b);
    });
    // Objects mode (editor/obj-mode.js): the page's own images and artwork can be moved, resized and turned
    var objBtn = S.ibl('image', 'pdf.act.bar_objects', function () { if (Ed.toggleObjects) Ed.toggleObjects(); }, 'pdf.act.bar_objects_short');
    objBtn.id = 'btnObjects'; objBtn.setAttribute('aria-pressed', 'false');
    p.append(
      S.ibl('organize', 'pdf.act.bar_back', function () { A.showGrid(); }, 'pdf.act.bar_back_short'), S.sep(),
      S.ib('prev', 'pdf.act.bar_prev', function () { A.gotoPage(-1); }), pageNo, S.ib('next', 'pdf.act.bar_next', function () { A.gotoPage(1); }), S.sep(),
      S.ib('rotl', 'pdf.act.bar_rot_left', function () { A.rotate([Ed.pid], -90); }), S.ib('rotr', 'pdf.act.bar_rot_right', function () { A.rotate([Ed.pid], 90); }), S.sep(),
      objBtn, S.sep(), tools, h('span', { class: 'tb-flex' }),
      S.ib('zoomout', 'pdf.act.bar_zoom_out', function () { Ed.zoomBy(1 / 1.25); }), zoomLbl, S.ib('zoomin', 'pdf.act.bar_zoom_in', function () { Ed.zoomBy(1.25); }), S.ib('fit', 'pdf.act.bar_fit', function () { Ed.fit('fit'); }));
  }
})();
