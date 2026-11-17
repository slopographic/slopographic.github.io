/* SlopVector — ui: Properties and Appearance panels */
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
  function docSetupDialog() { return $.docSetupDialog.apply(this, arguments); }
  function field() { return $.field.apply(this, arguments); }
  function firstOfType() { return $.firstOfType.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function ibtn() { return $.ibtn.apply(this, arguments); }
  function numIn() { return $.numIn.apply(this, arguments); }
  function paintLabel() { return $.paintLabel.apply(this, arguments); }
  function runBinds() { return $.runBinds.apply(this, arguments); }
  function seg() { return $.seg.apply(this, arguments); }
  function selIn() { return $.selIn.apply(this, arguments); }
  var A = $.A;
  var I = $.I;
  var panelEls = $.panelEls;

  /* ---------- Properties ---------- */
  var refPt = 'nw', linkWH = true, propsSig = '';
  function refOf(b) { var fx = refPt.indexOf('w') >= 0 ? 0 : refPt.indexOf('e') >= 0 ? 1 : 0.5, fy = refPt.indexOf('n') >= 0 ? 0 : refPt.indexOf('s') >= 0 ? 1 : 0.5; if (refPt === 'c') { fx = fy = 0.5; } return { x: b.x + fx * b.w, y: b.y + fy * b.h, fx: fx, fy: fy }; }
  function setTransformField(k, v) {
    var ids = SV.zSorted(S.sel), b = SV.selBBox(ids); if (!b) return;
    var r = refOf(b), M;
    if (k === 'x') M = G.translate(v - r.x, 0);
    else if (k === 'y') M = G.translate(0, v - r.y);
    else if (k === 'w' || k === 'h') {
      var cur = k === 'w' ? b.w : b.h; if (cur < 1e-6 || v <= 0) return;
      var s = v / cur, sx = k === 'w' ? s : (linkWH ? s : 1), sy = k === 'h' ? s : (linkWH ? s : 1);
      M = G.scale(sx, sy, r.x, r.y);
    } else if (k === 'rot') {
      var o = getObj(ids[0]), curD = -SV.objRot(o), delta = v - curD, a = -delta * PI / 180;
      var c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      M = G.rotate(a, c.x, c.y);
      ids.forEach(function (id) { var oo = getObj(id); SV.transformObj(oo, M); if (oo.type === 'path' || oo.type === 'group') oo.rot = SV.normAng((oo.rot || 0) + a * 180 / PI); });
      SV.commit('rotate'); return;
    }
    if (M) { ids.forEach(function (id) { SV.transformObj(getObj(id), M); }); SV.commit('transform'); }
  }
  function buildProperties() {
    var body = panelEls.properties.body, g = 'props';
    var none = h('div', { class: 'psec doc-sec' });
    none.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.props.document' } }));
    none.appendChild(h('div', { class: 'grid2' }, [
      field('vector.props.w', numIn(g, { label: 'vector.props.artboard_w', min: 1, max: 20000, get: function () { return S.doc.width; }, set: function (v) { S.doc.width = v; SV.commit('artboard'); } }), 'px'),
      field('vector.props.h', numIn(g, { label: 'vector.props.artboard_h', min: 1, max: 20000, get: function () { return S.doc.height; }, set: function (v) { S.doc.height = v; SV.commit('artboard'); } }), 'px')
    ]));
    none.appendChild(h('div', { class: 'btnrow' }, [btn('vector.act.file_doc_setup', function () { docSetupDialog(); }), btn('vector.props.fit_artboard', function () { SV.fitArtboard(); })]));
    var toggles = h('div', { class: 'checks' });
    [['rulers', 'vector.act.view_rulers', 'view.rulers'], ['grid', 'vector.act.view_grid', 'view.grid'], ['snapGrid', 'vector.props.snap_grid', 'view.snapGrid'], ['smart', 'vector.props.smart', 'view.smart'], ['outline', 'vector.props.outline', 'view.outline']].forEach(function (t) {
      var cbx = h('input', { type: 'checkbox' });
      cbx.addEventListener('change', function () { if (!!S.prefs[t[0]] !== cbx.checked) SV.runAction(t[2]); });
      bind(g, function () { cbx.checked = !!S.prefs[t[0]]; });
      toggles.appendChild(h('label', { class: 'chk' }, [cbx, h('span', { i18n: { text: t[1] } })]));
    });
    none.appendChild(toggles);
    none.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.props.tip' } }));
    none.appendChild(h('p', { class: 'tip', i18n: { text: 'vector.props.tip_text' } }));
    // transform section
    var tr = h('div', { class: 'psec tr-sec' });
    tr.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.menu.transform' } }));
    var grid9 = h('div', { class: 'ref9', role: 'radiogroup', i18n: { 'aria-label': 'vector.props.ref_point' } });
    ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se'].forEach(function (p) {
      var b = h('button', { type: 'button', class: 'refpt', i18n: { title: 'vector.props.ref_point', 'aria-label': `vector.props.ref_${p}` } });
      b.addEventListener('click', function () { refPt = p; runBinds(g); });
      bind(g, function () { b.classList.toggle('on', refPt === p); });
      grid9.appendChild(b);
    });
    var gv = function (k) { return function () { var b = SV.selBBox(); if (!b) return null; var r = refOf(b); return k === 'x' ? r.x : k === 'y' ? r.y : k === 'w' ? b.w : b.h; }; };
    var link = h('button', { type: 'button', class: 'ibtn link', i18n: { title: 'vector.props.constrain_tip', 'aria-label': 'vector.props.constrain' }, html: I.link, onclick: function () { linkWH = !linkWH; runBinds(g); } });
    bind(g, function () { link.classList.toggle('on', linkWH); });
    tr.appendChild(h('div', { class: 'tr-grid' }, [grid9, h('div', { class: 'grid2 tight' }, [
      field('X', numIn(g, { label: 'X', step: 1, get: gv('x'), set: function (v) { setTransformField('x', v); } }), 'px'),
      field('vector.props.w', numIn(g, { label: 'vector.props.width', step: 1, min: 0, get: gv('w'), set: function (v) { setTransformField('w', v); } }), 'px'),
      field('Y', numIn(g, { label: 'Y', step: 1, get: gv('y'), set: function (v) { setTransformField('y', v); } }), 'px'),
      field('vector.props.h', numIn(g, { label: 'vector.props.height', step: 1, min: 0, get: gv('h'), set: function (v) { setTransformField('h', v); } }), 'px')
    ]), link]));
    tr.appendChild(h('div', { class: 'grid2 rotrow' }, [
      field('∠', numIn(g, { label: 'vector.props.rotation', step: 1, get: function () { var o = SV.selObjs()[0]; return o && S.sel.length === 1 ? SV.normAng(-SV.objRot(o)) : 0; }, set: function (v) { setTransformField('rot', v); } }), '°', 'vector.tool.rotate'),
      h('div', { class: 'btnrow right' }, [ibtn(I.flipH, 'vector.act.transform_flip_h', function () { C.flip('h'); }), ibtn(I.flipV, 'vector.act.transform_flip_v', function () { C.flip('v'); })])
    ]));
    // shape section
    var shp = h('div', { class: 'psec shape-sec' });
    shp.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.props.shape' } }));
    var corners = $.cornerControls(g, '', function () { return !!firstOfType('rect'); });
    var shPoly = field('vector.cb.sides', numIn(g, { label: 'vector.cb.sides', min: 3, max: 64, get: function () { var r = firstOfType('polygon'); return r ? r.sides : 6; }, set: function (v) { SV.applyShapeOpt('sides', round(v)); } }));
    var shStar = field('vector.cb.points', numIn(g, { label: 'vector.cb.points', min: 2, max: 64, get: function () { var r = firstOfType('star'); return r ? r.points : 5; }, set: function (v) { SV.applyShapeOpt('points', round(v)); } }));
    var shStar2 = field('vector.props.inner_radius', numIn(g, { label: 'vector.props.inner_radius', min: 5, max: 100, get: function () { var r = firstOfType('star'); return r ? round(r.r2 / (r.r1 || 1) * 100) : 45; }, set: function (v) { SV.applyShapeOpt('inner', v / 100); } }), '%');
    shp.appendChild(h('div', { class: 'grid2' }, [corners.one, shPoly, shStar, shStar2]));
    shp.appendChild(corners.four); shp.appendChild(h('div', { class: 'btnrow' }, [corners.link]));
    bind(g, function () { shPoly.hidden = !firstOfType('polygon'); shStar.hidden = shStar2.hidden = !firstOfType('star'); });
    // character section
    var ch = h('div', { class: 'psec char-sec' });
    ch.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.props.character' } }));
    ch.appendChild($.fontSel(g, function () { return curFont().family; }, function (v) { SV.applyFont('family', v); }, 'vector.type.font_family'));
    ch.appendChild(h('div', { class: 'grid2' }, [
      selIn(g, SV.WEIGHTS, function () { return curFont().weight; }, function (v) { SV.applyFont('weight', +v); }, 'vector.type.font_weight'),
      field('vector.props.size', numIn(g, { label: 'vector.type.font_size', min: 1, get: function () { return curFont().size; }, set: function (v) { SV.applyFont('size', v); } }), 'px'),
      field('vector.props.leading', numIn(g, { label: 'vector.props.line_height', min: 0.5, max: 5, step: 0.05, get: function () { return curFont().lh; }, set: function (v) { SV.applyFont('lh', v); } }), '×'),
      field('vector.props.tracking', numIn(g, { label: 'vector.props.tracking_tip', min: -500, max: 2000, step: 10, get: function () { return curFont().tracking; }, set: function (v) { SV.applyFont('tracking', v); } }))
    ]));
    ch.appendChild(h('div', { class: 'btnrow' }, [seg(g, [['left', I.txtL, 'vector.type.align_left'], ['center', I.txtC, 'vector.type.align_center'], ['right', I.txtR, 'vector.type.align_right']], function () { return curFont().align; }, function (v) { SV.applyFont('align', v); }, 'vector.props.alignment'),
      seg(g, [['normal', '<b style="font-style:normal">I</b>', 'vector.props.roman'], ['italic', '<i>I</i>', 'vector.props.italic']], function () { return curFont().style; }, function (v) { SV.applyFont('style', v); }, 'vector.props.style')]));
    // quick actions
    var qa = h('div', { class: 'psec qa-sec' });
    qa.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.props.quick_actions' } }));
    var qbtns = h('div', { class: 'qbtns' });
    [['vector.act.object_group', 'object.group'], ['vector.act.object_ungroup', 'object.ungroup'], ['ui.duplicate', 'edit.duplicate'], ['vector.act.arrange_front', 'arrange.front'], ['vector.act.arrange_back', 'arrange.back'], ['vector.props.expand', 'object.expand'], ['vector.props.lock', 'object.lock'], ['ui.delete', 'edit.clear']].forEach(function (q) {
      var b = btn(q[0], function () { SV.runAction(q[1]); }, 'small');
      bind(g, function () { var a = A[q[1]]; b.disabled = a.enabled ? !a.enabled() : false; });
      qbtns.appendChild(b);
    });
    qa.appendChild(qbtns);
    var slopB = h('button', { type: 'button', class: 'btn slop wide', html: I.slop, onclick: function () { SV.runAction('object.slopify'); } });
    slopB.appendChild(h('span', { i18n: { text: 'vector.props.slopify_sel' } }));
    qa.appendChild(slopB);
    [none, tr, shp, ch, qa].forEach(function (s) { body.appendChild(s); });
    bind(g, function () {
      var n = S.sel.length;
      none.hidden = n > 0; tr.hidden = !n; qa.hidden = !n;
      shp.hidden = !(firstOfType('rect') || firstOfType('polygon') || firstOfType('star'));
      ch.hidden = !(firstOfType('text') || S.tool === 'type');
    });
  }

  /* ---------- Appearance ---------- */
  function buildAppearance() {
    var body = panelEls.appearance.body, g = 'app';
    var fillLabel = h('span', { class: 'plabel mono' }), strokeLabel = h('span', { class: 'plabel mono' });
    bind(g, function () { fillLabel.textContent = paintLabel(SV.currentPaint('fill')); strokeLabel.textContent = paintLabel(SV.currentPaint('stroke')); });
    body.appendChild(h('div', { class: 'arow' }, [h('span', { class: 'alabel', i18n: { text: 'vector.paint.fill' } }), chip(g, 'fill'), fillLabel]));
    body.appendChild(h('div', { class: 'arow' }, [h('span', { class: 'alabel', i18n: { text: 'vector.paint.stroke' } }), chip(g, 'stroke'), strokeLabel]));
    body.appendChild(h('div', { class: 'grid2' }, [
      field('vector.paint.weight', numIn(g, { label: 'vector.paint.stroke_weight', min: 0, max: 1000, step: 0.5, get: function () { return curStyle().sw; }, set: function (v) { SV.applyStyle('sw', v); if (v > 0 && !SV.currentPaint('stroke')) SV.applyStyle('stroke', '#0a0a0a'); } }), 'px'),
      field('vector.paint.miter', numIn(g, { label: 'vector.paint.miter_limit', min: 1, max: 500, get: function () { return curStyle().miter; }, set: function (v) { SV.applyStyle('miter', v); } }), '×')
    ]));
    body.appendChild(h('div', { class: 'arow' }, [h('span', { class: 'alabel', i18n: { text: 'vector.paint.cap' } }), seg(g, [['butt', I.capButt, 'vector.paint.cap_butt'], ['round', I.capRound, 'vector.paint.cap_round'], ['square', I.capSquare, 'vector.paint.cap_square']], function () { return curStyle().cap; }, function (v) { SV.applyStyle('cap', v); }, 'vector.paint.cap'),
      h('span', { class: 'alabel', i18n: { text: 'vector.paint.join' } }), seg(g, [['miter', I.joinMiter, 'vector.paint.join_miter'], ['round', I.joinRound, 'vector.paint.join_round'], ['bevel', I.joinBevel, 'vector.paint.join_bevel']], function () { return curStyle().join; }, function (v) { SV.applyStyle('join', v); }, 'vector.paint.join')]));
    var dashChk = h('input', { type: 'checkbox' });
    var dashA = numIn(g, { label: 'vector.paint.dash_length', min: 0, max: 1000, get: function () { var d = curStyle().dash; return d ? d[0] : 12; }, set: function (v) { var d = curStyle().dash || [12, 6]; SV.applyStyle('dash', [v, d[1] == null ? v : d[1]]); }, enabled: function () { return !!curStyle().dash; } });
    var dashB = numIn(g, { label: 'vector.paint.gap_length', min: 0, max: 1000, get: function () { var d = curStyle().dash; return d ? (d[1] == null ? d[0] : d[1]) : 6; }, set: function (v) { var d = curStyle().dash || [12, 6]; SV.applyStyle('dash', [d[0], v]); }, enabled: function () { return !!curStyle().dash; } });
    dashChk.addEventListener('change', function () { SV.applyStyle('dash', dashChk.checked ? [12, 6] : null); });
    bind(g, function () { dashChk.checked = !!curStyle().dash; });
    body.appendChild(h('div', { class: 'arow dashrow' }, [h('label', { class: 'chk' }, [dashChk, h('span', { i18n: { text: 'vector.paint.dashed' } })]), field('vector.paint.dash', dashA), field('vector.paint.gap', dashB)]));
    var op = h('input', { type: 'range', min: 0, max: 100, class: 'range', i18n: { 'aria-label': 'vector.paint.opacity' } });
    var opBefore = null;
    op.addEventListener('input', function () { if (opBefore === null) opBefore = 1; SV.applyStyle('opacity', +op.value / 100, { commit: false }); });
    op.addEventListener('change', function () { opBefore = null; SV.commit('opacity'); });
    bind(g, function () { if (document.activeElement !== op) op.value = round((curStyle().opacity == null ? 1 : curStyle().opacity) * 100); });
    body.appendChild(h('div', { class: 'arow' }, [h('span', { class: 'alabel', i18n: { text: 'vector.paint.opacity' } }), op, numIn(g, { label: 'vector.paint.opacity_pct', min: 0, max: 100, get: function () { return round((curStyle().opacity == null ? 1 : curStyle().opacity) * 100); }, set: function (v) { SV.applyStyle('opacity', v / 100); }, cls: 'w44' }), h('span', { class: 'fu', text: '%' })]));
    body.appendChild(h('div', { class: 'grid2' }, [
      h('label', { class: 'fld col' }, [h('span', { class: 'fl', i18n: { text: 'vector.paint.blending' } }), selIn(g, SV.BLENDS.map(function (b) { return [b, 'vector.blend.' + b.replace(/-/g, '_')]; }), function () { return curStyle().blend || 'normal'; }, function (v) { SV.applyStyle('blend', v); }, 'vector.paint.blend_mode')]),
      h('label', { class: 'fld col' }, [h('span', { class: 'fl', i18n: { text: 'vector.paint.fill_rule' } }), selIn(g, [['nonzero', 'vector.paint.nonzero'], ['evenodd', 'vector.paint.evenodd']], function () { return curStyle().rule || 'nonzero'; }, function (v) { SV.applyStyle('rule', v); }, 'vector.paint.fill_rule')])
    ]));
  }

  $.buildAppearance = buildAppearance; $.buildProperties = buildProperties;
})();
