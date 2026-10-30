/* Slop Press — the control bar: type controls while editing text, geometry/paint for selected objects. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, K = PR.kit, H = PR.history, FM = PR.format, F = PR.fonts, h = U.h;
  var UI = PR.ui = PR.ui || {};
  var sig = '', refreshers = [], t = U.t;

  function textMode() { return !!S.text || (S.tool === 'text' && PR.selected().some(function (it) { return it.type === 'text'; })); }
  function sep() { return h('span', { class: 'cb-sep' }); }
  function reg(el, fn) { refreshers.push(fn || el.refresh); return el; }

  function typeControls(bar) {
    var cur = function () { return FM.current() || { ps: '', cs: '', char: {}, para: {} }; };
    var ps = K.select(PR.styles.names(S.doc, 'para'), cur().ps, function (v) { FM.paraStyle(v); }, 'wide');
    ps.title = t('press.ctl.para_style');
    var cs = K.select(PR.styles.names(S.doc, 'char'), cur().cs, function (v) { FM.charStyle(v); });
    cs.title = t('press.ctl.char_style');
    reg(ps, function () { ps.value = cur().ps; }); reg(cs, function () { cs.value = cur().cs; });
    var fam = K.select(F.list(), cur().char.font, function (v) { FM.char({ font: v }); }, 'wide'); fam.title = t('press.ctl.font_family');
    var fonts = h('button', { type: 'button', class: 'btn small', title: t('press.ctl.fonts_tip'), onclick: function () { UI.openFonts([cur().char.font]); } }, t('press.ctl.fonts'));
    var sty = K.select(F.STYLES, cur().char.fontStyle, function (v) { FM.char({ fontStyle: v }); }); sty.title = t('press.ctl.font_style');
    reg(fam, function () { fam.value = cur().char.font; }); reg(sty, function () { sty.value = cur().char.fontStyle || 'Regular'; });
    var size = reg(K.num({ unit: 'pt', cls: 'w48', title: t('press.ctl.size_tip'), get: function () { return cur().char.size; }, set: function (v) { FM.char({ size: Math.max(1, v) }); }, min: 1 }));
    var lead = reg(K.num({ unit: 'pt', cls: 'w48', title: t('press.ctl.leading_tip'), allow: ['auto'], get: function () { var l = cur().char.leading; return l === 'auto' ? 'Auto' : l; }, set: function (v) { FM.char({ leading: v === 'auto' ? 'auto' : v }); } }));
    var track = reg(K.num({ unit: 'raw', cls: 'w48', title: t('press.ctl.tracking_tip'), get: function () { return cur().char.tracking || 0; }, set: function (v) { FM.char({ tracking: v }); }, step: 10 }));
    var al = cur().para.align;
    var aligns = K.seg(['left', 'center', 'right', 'justify', 'justify-all'].map(function (k) { var n = k.replace('-', '_'); return [k, t('press.ctl.al.' + n), t('press.ctl.al.' + n + '_tip'), k]; }), al, function (v) { FM.para({ align: v }); });
    reg(aligns, function () { var a = cur().para.align; U.$$('.segb', aligns).forEach(function (b, i) { b.classList.toggle('on', ['left', 'center', 'right', 'justify', 'justify-all'][i] === a); }); });
    var color = h('span');
    reg(color, function () { color.innerHTML = ''; color.append(K.chip(cur().char.color, t('press.ctl.text_colour'), function (c) { FM.char({ color: c || '#000000' }); })); });
    var sb = reg(K.num({ unit: 'pt', cls: 'w48', title: t('press.ctl.space_before'), get: function () { return cur().para.spaceBefore || 0; }, set: function (v) { FM.para({ spaceBefore: v }); } }));
    var sa = reg(K.num({ unit: 'pt', cls: 'w48', title: t('press.ctl.space_after'), get: function () { return cur().para.spaceAfter || 0; }, set: function (v) { FM.para({ spaceAfter: v }); } }));
    var fi = reg(K.num({ unit: 'doc', cls: 'w48', title: t('press.ctl.first_indent'), get: function () { return cur().para.indentFirst || 0; }, set: function (v) { FM.para({ indentFirst: v }); } }));
    bar.append(h('span', { class: 'cb-label' }, '¶'), ps, cs, sep(), fam, fonts, sty, K.field(t('press.ctl.size'), size), K.field(t('press.ctl.lead'), lead), K.field(t('press.ctl.track'), track), color, sep(), aligns, sep(),
      K.field(t('press.ctl.before'), sb), K.field(t('press.ctl.after'), sa), K.field(t('press.ctl.indent'), fi));
  }
  function objControls(bar, its) {
    var it = its[0], unit = S.doc.unit;
    function geo(key, label) {
      return K.field(label, reg(K.num({ cls: 'w80', title: t('press.ctl.geo_tip', { name: label, unit: unit }), get: function () { return it[key]; }, set: function (v) {
        var d = v - it[key]; its.forEach(function (x) { if (key === 'x' || key === 'y') x[key] += d; else x[key] = Math.max(1, v); }); H.commit(t('press.props.undo.transform'));
      } })));
    }
    bar.append(h('span', { class: 'cb-label' }, its.length > 1 ? t('press.ctl.n_objects', { n: its.length }) : t('press.ctl.kind.' + it.type)),
      sep(), geo('x', 'X'), geo('y', 'Y'), geo('w', 'W'), geo('h', 'H'),
      K.field('∠', reg(K.num({ unit: '°', cls: 'w48', title: t('press.ctl.rotation_tip'), get: function () { return it.rot || 0; }, set: function (v) { its.forEach(function (x) { x.rot = ((v % 360) + 360) % 360; }); H.commit(t('press.props.undo.rotate')); } }))), sep());
    var fill = h('span'), stroke = h('span');
    reg(fill, function () { fill.innerHTML = ''; fill.append(K.chip(it.fill, t('press.ctl.fill'), function (c) { UI.setPaint('fill', c); })); });
    reg(stroke, function () { stroke.innerHTML = ''; stroke.append(K.chip(it.stroke, t('press.ctl.stroke'), function (c) { UI.setPaint('stroke', c); })); });
    bar.append(K.field(t('press.ctl.fill'), fill), K.field(t('press.ctl.stroke'), stroke),
      reg(K.num({ unit: 'pt', cls: 'w48', title: t('press.ctl.stroke_weight_tip'), get: function () { return it.sw; }, set: function (v) { its.forEach(function (x) { x.sw = Math.max(0, v); }); H.commit(t('press.props.undo.stroke_weight')); }, min: 0, step: 0.5 })));
    if (it.type === 'rect' || it.type === 'image' || it.type === 'text') bar.append(K.field(t('press.ctl.corner'), reg(K.num({ unit: 'doc', cls: 'w48', title: t('press.ctl.corner_radius'), get: function () { return it.radius || 0; }, set: function (v) { its.forEach(function (x) { x.radius = Math.max(0, v); }); H.commit(t('press.props.undo.corner_radius')); }, min: 0 }))));
    bar.append(K.field(t('press.ctl.opacity'), reg(K.num({ unit: '%', cls: 'w48', title: t('press.ctl.opacity_tip'), get: function () { return Math.round((it.opacity == null ? 1 : it.opacity) * 100); }, set: function (v) { its.forEach(function (x) { x.opacity = U.clamp(v, 0, 100) / 100; }); H.commit(t('press.props.undo.opacity')); } }))));
    if (it.type === 'text') bar.append(sep(), K.field(t('press.ctl.columns'), reg(K.num({ unit: 'raw', cls: 'w48', title: t('press.ctl.columns_tip'), get: function () { return it.cols || 1; }, set: function (v) { it.cols = U.clamp(Math.round(v), 1, 12); H.commit(t('press.props.undo.columns')); }, min: 1 }))));
    if (it.type === 'image') bar.append(sep(), K.seg(['fill', 'fit', 'center', 'stretch'].map(function (k) { return [k, t('press.ctl.fit.' + k), t('press.ctl.fit.' + k + '_tip')]; }), it.fit, function (v) { its.forEach(function (x) { x.fit = v; }); H.commit(t('press.props.undo.fitting')); UI.refreshControlBar(true); }));
    bar.append(sep(), h('span', { class: 'fl' }, t('press.ctl.wrap')), K.seg(['none', 'box', 'contour', 'jump'].map(function (k) { return [k, t('press.props.wrap.' + k), t('press.ctl.wrap.' + k + '_tip')]; }), (it.wrap || {}).type || 'none', function (v) { its.forEach(function (x) { x.wrap = U.assign({ off: 6 }, x.wrap, { type: v }); }); H.commit(t('press.props.undo.text_wrap')); UI.refreshControlBar(true); }));
  }
  function idleControls(bar) {
    var d = S.doc, pre = U.presetFor(d.size.w, d.size.h);
    bar.append(h('span', { class: 'cb-label' }, t('press.ctl.size_line', { name: pre ? pre.name : t('press.ctl.custom'), w: U.fmt(d.size.w, d.unit, true), h: U.fmt(d.size.h, d.unit, true) })),
      sep(), h('span', { class: 'cb-hint' }, t(d.facing ? 'press.ctl.doc_line_facing' : 'press.ctl.doc_line', { n: d.pages.length, cols: d.columns.count })), sep());
    var b1 = h('button', { type: 'button', class: 'btn small' }, t('press.ctl.doc_setup')); b1.addEventListener('click', function () { PR.actions.run('file.docSetup'); });
    var b2 = h('button', { type: 'button', class: 'btn small' }, t('press.ctl.margins_columns')); b2.addEventListener('click', function () { PR.actions.run('layout.marginsColumns'); });
    // Export PDF… is the main button at the foot of the dock (ui/dock.js, the suite rule), not repeated here
    bar.append(b1, b2, sep(), h('span', { class: 'cb-hint' }, hint()));
  }
  function hint() {
    return /^(select|text|frame|rect|ellipse|line|polygon|hand|zoom)$/.test(S.tool) ? t('press.ctl.hint.' + S.tool) : '';
  }
  UI.refreshControlBar = function (force) {
    var bar = U.$('#controlbar'); if (!bar || !S.doc) return;
    var its = S.text ? [] : PR.selected();
    var s2 = (textMode() ? 'T' : its.length ? 'O' + S.sel.join(',') : 'I' + S.tool + S.doc.pages.length) + '|' + S.doc.unit;
    if (s2 === sig && !force) { refreshers.forEach(function (f) { try { f(); } catch (e) { /* stale */ } }); return; }
    sig = s2; refreshers = []; bar.innerHTML = '';
    if (textMode()) typeControls(bar); else if (its.length) objControls(bar, its); else idleControls(bar);
    refreshers.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } });
  };
  var q = false;
  function later() { if (q) return; q = true; requestAnimationFrame(function () { q = false; UI.refreshControlBar(); }); }
  ['select', 'tool', 'textsel', 'commit', 'doc', 'fonts', 'change'].forEach(function (ev) { PR.on(ev, later); });
  U.onLang(function () { UI.refreshControlBar(true); });
})();
