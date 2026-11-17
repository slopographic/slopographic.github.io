/* Slop Press — status bar: page navigation, zoom, preflight (overset text, missing images), pointer position. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, h = U.h, S = PR.state, V = PR.view, K = PR.kit, P = PR.pages, M = PR.model;
  var UI = PR.ui = PR.ui || {};
  var el = {};
  UI.status = {
    hint: function (msg) { if (el.hint) el.hint.textContent = msg || ''; }
  };
  function btn(icon, title, id) { var b = h('button', { type: 'button', class: 'sbb', title: title, 'aria-label': title, html: K.icon(icon) }); b.addEventListener('click', function () { PR.actions.run(id); }); return b; }
  UI.buildStatus = function () {
    var bar = U.$('#statusbar'); bar.innerHTML = '';
    el.zoom = h('input', { class: 'num sb-zoom', type: 'text', title: U.t('press.status.zoom'), 'aria-label': U.t('press.status.zoom_pct') });
    el.zoom.addEventListener('change', function () { var v = parseFloat(el.zoom.value); if (v > 0) V.setZoom(v / 100 * V.ACTUAL); });
    el.zoom.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.zoom.blur(); e.stopPropagation(); });
    el.page = h('select', { class: 'sel sb-page', title: U.t('press.status.go_page'), 'aria-label': U.t('press.status.cur_page') });
    el.page.addEventListener('change', function () {
      var v = el.page.value;
      if (v.charAt(0) === 'm') UI.editMaster(v.slice(1), 0); else PR.goPage(+v);
    });
    el.pre = h('span', { class: 'sb-item', title: U.t('press.status.preflight') });
    el.pre.addEventListener('click', function () { var o = PR.engine.oversetStories()[0]; if (!o) return; var fr = M.storyFrames(S.doc, o); var last = fr[fr.length - 1]; var pi = PR.engine.pageOf(S.doc, last); if (pi >= 0) { PR.goPage(pi); PR.select([last.id]); } });
    el.pos = h('span', { class: 'sb-item sb-pos mono' });
    el.hint = h('span', { class: 'sb-item sb-hint' });
    bar.append(h('div', { class: 'sb-grp' }, btn('first', U.t('press.status.first'), 'layout.firstPage'), btn('prev', U.t('press.status.prev'), 'layout.prevPage'), el.page, btn('next', U.t('press.status.next'), 'layout.nextPage'), btn('last', U.t('press.status.last'), 'layout.lastPage')),
      h('div', { class: 'sb-grp' }, btn('zoom', U.t('ui.zoom_out'), 'view.zoomOut'), el.zoom, btn('plus', U.t('ui.zoom_in'), 'view.zoomIn')), el.pre, el.pos, el.hint);
    UI.refreshStatus();
  };
  UI.refreshStatus = function () {
    if (!el.page || !S.doc) return;
    var d = S.doc, opts = d.pages.map(function (p, i) { return [String(i), P.label(d, i)]; }).concat(d.masters.map(function (m) { return ['m' + m.id, m.prefix + '-' + m.name]; }));
    var cur = S.editMaster ? 'm' + S.editMaster.id : String(S.page);
    if (el.page.options.length !== opts.length || el.page.getAttribute('data-sig') !== opts.join()) {
      el.page.innerHTML = ''; opts.forEach(function (o) { el.page.append(h('option', { value: o[0] }, o[1])); }); el.page.setAttribute('data-sig', opts.join());
    }
    el.page.value = cur;
    if (document.activeElement !== el.zoom) el.zoom.value = Math.round(V.zoom / V.ACTUAL * 100) + '%';
    var over = PR.engine.oversetStories().length, missing = 0;
    M.containers(d).forEach(function (c) { c.items.forEach(function (it) { if (it.type === 'image' && it.asset && !d.assets[it.asset]) missing++; }); });
    el.pre.className = 'sb-item ' + (over || missing ? 'sb-warn' : 'sb-ok');
    var bits = [over ? U.t('press.status.overset_n', { n: over }) : '', missing ? U.t('press.status.missing_n', { n: missing }) : ''].filter(Boolean);
    el.pre.textContent = '● ' + (bits.length ? (window.SlopI18n && SlopI18n.list ? SlopI18n.list(bits) : bits.join(', ')) : U.t('press.status.no_errors'));
    el.pre.title = U.t(over ? 'press.status.jump_overset' : 'press.status.preflight');
    var t = U.$('#docTitle');
    if (t) { t.innerHTML = ''; t.append(d.name, S.dirty ? h('span', { class: 'dirty', title: U.t('press.status.unsaved') }, ' •') : ''); }
    document.title = d.name + ' — Slop Press';
  };
  var soon = U.debounce(UI.refreshStatus, 80);
  ['commit', 'doc', 'page', 'zoom', 'change'].forEach(function (e) { PR.on(e, soon); });
  PR.on('pointer', function (w) {
    if (!el.pos || !S.doc) return;
    var s = V.surfaceAt(w.x, w.y); if (!s) return;
    el.pos.textContent = 'x ' + U.fmt(w.x - s.x, S.doc.unit) + '  y ' + U.fmt(w.y - s.y, S.doc.unit) + ' ' + S.doc.unit;
  });
  PR.on('tool', function () { UI.status.hint(''); });
  U.onLang(function () { if (el.page) UI.buildStatus(); });
})();
