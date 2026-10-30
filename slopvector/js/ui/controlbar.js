/* SlopVector — ui: context-sensitive control bar */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function bind() { return $.bind.apply(this, arguments); }
  function btn() { return $.btn.apply(this, arguments); }
  function chip() { return $.chip.apply(this, arguments); }
  function curFont() { return $.curFont.apply(this, arguments); }
  function curStyle() { return $.curStyle.apply(this, arguments); }
  function field() { return $.field.apply(this, arguments); }
  function firstOfType() { return $.firstOfType.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function ibtn() { return $.ibtn.apply(this, arguments); }
  function keyLabel() { return $.keyLabel.apply(this, arguments); }
  function numIn() { return $.numIn.apply(this, arguments); }
  function seg() { return $.seg.apply(this, arguments); }
  function selIn() { return $.selIn.apply(this, arguments); }
  function selLabel() { return $.selLabel.apply(this, arguments); }
  var I = $.I;
  var binds = $.binds;

  /* ================= control bar ================= */
  UI.st.cbSig = '';
  function controlContext() {
    var objs = SV.selObjs(), types = {};
    objs.forEach(function (o) { SV.leaves(o).forEach(function (l) { types[l.type] = 1; }); });
    return { n: objs.length, types: types, tool: S.tool, editing: !!S.editing };
  }
  /** The tool hint at the end of the bar when nothing is selected: vector.hint.<tool id in snake case>. */
  function hintFor(tool) { return tool ? SV.t('vector.hint.' + tool.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()) : ''; }
  function buildControlBar(ctx) {
    var cb = document.getElementById('controlbar'); cb.innerHTML = ''; binds.cb = [];
    var g = 'cb';
    var label = h('span', { class: 'cb-label' }); bind(g, function () { label.textContent = S.editing ? SV.t('vector.tool.type') : selLabel(); });
    cb.appendChild(label);
    var showStyle = ctx.n > 0 || ['pen', 'pencil', 'brush', 'rect', 'rrect', 'ellipse', 'polygon', 'star', 'line', 'type'].indexOf(ctx.tool) >= 0;
    if (showStyle && !(ctx.n && Object.keys(ctx.types).length === 1 && ctx.types.image)) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(field('vector.paint.fill', chip(g, 'fill', true)));
      cb.appendChild(field('vector.paint.stroke', chip(g, 'stroke', true)));
      cb.appendChild(numIn(g, { label: 'vector.paint.stroke_weight', min: 0, max: 1000, step: 0.5, get: function () { return curStyle().sw; }, set: function (v) { SV.applyStyle('sw', v); if (v > 0 && !SV.currentPaint('stroke')) SV.applyStyle('stroke', '#0a0a0a'); }, cls: 'w52' }));
      cb.appendChild(h('span', { class: 'fu', text: 'px' }));
    }
    var hasType = ctx.types.text || ctx.tool === 'type';
    var shapeOpt = function (key) {
      return ctx.types[{ radius: 'rect', sides: 'polygon', points: 'star', inner: 'star' }[key]] || (!ctx.n && ({ radius: 'rrect', sides: 'polygon', points: 'star', inner: 'star' }[key] === ctx.tool));
    };
    if (shapeOpt('radius')) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      var corners = $.cornerControls(g, 'w52', null);
      cb.appendChild(corners.one); cb.appendChild(corners.four); cb.appendChild(corners.link);
    }
    if (shapeOpt('sides')) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(field('vector.cb.sides', numIn(g, { label: 'vector.cb.polygon_sides', min: 3, max: 64, get: function () { var r = firstOfType('polygon'); return r ? r.sides : S.shape.sides; }, set: function (v) { SV.applyShapeOpt('sides', round(v)); }, cls: 'w44' })));
    }
    if (shapeOpt('points')) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(field('vector.cb.points', numIn(g, { label: 'vector.cb.star_points', min: 2, max: 64, get: function () { var r = firstOfType('star'); return r ? r.points : S.shape.points; }, set: function (v) { SV.applyShapeOpt('points', round(v)); }, cls: 'w44' })));
      cb.appendChild(field('vector.cb.inner', numIn(g, { label: 'vector.cb.inner_radius_pct', min: 5, max: 100, get: function () { var r = firstOfType('star'); return round((r ? r.r2 / (r.r1 || 1) : S.shape.inner) * 100); }, set: function (v) { SV.applyShapeOpt('inner', v / 100); }, cls: 'w44' }), '%'));
    }
    if (ctx.tool === 'brush' && !ctx.n) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(field('vector.cb.brush', numIn(g, { label: 'vector.cb.brush_size', min: 0.5, max: 200, get: function () { return S.brush.size; }, set: function (v) { S.brush.size = v; } , cls: 'w52'}), 'px'));
    }
    if (hasType) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild($.fontSel(g, function () { return curFont().family; }, function (v) { SV.applyFont('family', v); }, 'vector.type.font_family'));
      cb.appendChild(selIn(g, SV.WEIGHTS, function () { return curFont().weight; }, function (v) { SV.applyFont('weight', +v); }, 'vector.type.font_weight'));
      cb.appendChild(numIn(g, { label: 'vector.type.font_size', min: 1, max: 2000, get: function () { return curFont().size; }, set: function (v) { SV.applyFont('size', v); }, cls: 'w52' }));
      cb.appendChild(h('span', { class: 'fu', text: 'px' }));
      cb.appendChild(seg(g, [['left', I.txtL, 'vector.type.align_left'], ['center', I.txtC, 'vector.type.align_center'], ['right', I.txtR, 'vector.type.align_right']], function () { return curFont().align; }, function (v) { SV.applyFont('align', v); }, 'vector.type.paragraph_align'));
    }
    if (ctx.n) {
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(field('vector.paint.opacity', numIn(g, { label: 'vector.paint.opacity', min: 0, max: 100, get: function () { return round((curStyle().opacity == null ? 1 : curStyle().opacity) * 100); }, set: function (v) { SV.applyStyle('opacity', v / 100); }, cls: 'w44' }), '%'));
    }
    cb.appendChild(h('span', { class: 'grow' }));
    if (ctx.n) {
      var al = h('div', { class: 'cb-align' }, [
        ibtn(I.alignL, 'vector.align.left', function () { C.align('left'); }), ibtn(I.alignHC, 'vector.align.hcenter', function () { C.align('hcenter'); }), ibtn(I.alignR, 'vector.align.right', function () { C.align('right'); }),
        ibtn(I.alignT, 'vector.align.top', function () { C.align('top'); }), ibtn(I.alignVC, 'vector.align.vcenter', function () { C.align('vcenter'); }), ibtn(I.alignB, 'vector.align.bottom', function () { C.align('bottom'); })
      ]);
      cb.appendChild(al);
      cb.appendChild(h('span', { class: 'cb-sep' }));
      cb.appendChild(h('button', { type: 'button', class: 'btn slop', title: SV.t('vector.cb.slopify_tip', { key: keyLabel('mod+alt+s') }), html: I.slop + '<span>' + esc(SV.t('vector.act.object_slopify')) + '</span>', onclick: function () { SV.runAction('object.slopify'); } }));
    } else {
      var hint = h('span', { class: 'cb-hint' }); bind(g, function () { hint.textContent = hintFor(S.tool); });
      cb.appendChild(hint);
    }
  }

  $.buildControlBar = buildControlBar; $.controlContext = controlContext;
})();
