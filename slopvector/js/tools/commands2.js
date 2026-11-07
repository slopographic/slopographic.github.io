/* SlopVector — tools: object commands (compound, pathfinder, slopify, align, styles) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function cur() { return $.cur.apply(this, arguments); }
  function topSel() { return $.topSel.apply(this, arguments); }

  function pathish(o) { return o.type !== 'text' && o.type !== 'image' && o.type !== 'group'; }
  C.makeCompound = function () {
    var ids = topSel(), objs = [];
    ids.forEach(function (id) { SV.leaves(getObj(id)).forEach(function (l) { if (pathish(l)) objs.push(l); }); });
    if (objs.length < 1) return SV.toast(SV.t('vector.msg.compound_select'));
    var subs = []; objs.forEach(function (o) { subs = subs.concat(SV.docSubs(o)); });
    var np = SV.mk.path(subs, clone(objs[0].style), 'Compound Path'); np.style.rule = 'evenodd';
    SV.replaceObj(ids[ids.length - 1], np);
    ids.slice(0, -1).forEach(SV.removeObj);
    SV.select([np.id]); SV.commit('compound');
  };
  C.releaseCompound = function () {
    var ids = topSel(), out = [], any = false;
    ids.forEach(function (id) {
      var o = getObj(id);
      if (o.type === 'path' && o.subpaths.length > 1) {
        any = true;
        var f = find(id), parts = o.subpaths.map(function (sp) { var st = clone(o.style); st.rule = 'nonzero'; return SV.mk.path([clone(sp)], st); });
        f.arr.splice.apply(f.arr, [f.idx, 1].concat(parts));
        parts.forEach(function (p) { out.push(p.id); });
      } else out.push(id);
    });
    if (!any) return SV.toast(SV.t('vector.msg.no_compound'));
    SV.select(out); SV.commit('release compound');
  };
  C.expand = function () {
    var ids = topSel(), n = 0;
    ids.forEach(function (id) { SV.leaves(getObj(id)).forEach(function (l) { if (pathish(l) && l.type !== 'path') { SV.toPath(l); n++; } }); });
    if (!n) return SV.toast(SV.t('vector.msg.nothing_expand'));
    SV.commit('expand'); SV.toast(SV.t('vector.msg.expanded', { n: n }));
  };
  function operandOf(o) {
    var ls = SV.leaves(o).filter(pathish);
    if (!ls.length) return null;
    var ops = ls.map(function (l) { return { rings: G.flatten(SV.docSubs(l), 0.35).map(function (p) { return p.pts; }), rule: l.style.rule }; });
    if (ops.length === 1) return ops[0];
    return { rings: G.boolean(ops, 'union'), rule: 'nonzero' };
  }
  C.pathfinder = function (op) {
    var ids = topSel(), objs = ids.map(getObj);
    var bad = objs.filter(function (o) { return !SV.leaves(o).some(pathish); });
    objs = objs.filter(function (o) { return bad.indexOf(o) < 0; });
    if (objs.length < 2) return SV.toast(bad.length ? SV.t('vector.msg.pf_select_skip') : SV.t('vector.msg.pf_select'), 'warn');
    var ck = new Set();
    objs.forEach(function (o) { SV.leaves(o).filter(pathish).forEach(function (l) { G.cornerKeysOf(SV.docSubs(l), ck); }); });
    var operands = objs.map(operandOf);
    var rings = G.boolean(operands, op, ck);
    if (!rings.length) return SV.toast(SV.t('vector.msg.pf_empty'), 'warn');
    var subs = G.fitRings(rings, ck);
    var styleSrc = op === 'minus' ? objs[0] : objs[objs.length - 1];
    var leaf = SV.leaves(styleSrc).filter(pathish).pop();
    var st = clone(leaf.style); st.rule = 'nonzero';
    var np = SV.mk.path(subs, st, '');
    var anchorObj = op === 'minus' ? objs[0] : objs[objs.length - 1];
    SV.replaceObj(anchorObj.id, np);
    objs.forEach(function (o) { if (o !== anchorObj) SV.removeObj(o.id); });
    SV.select([np.id]); SV.commit('pathfinder ' + op);
    return np;
  };
  C.slopify = function () {
    var ids = topSel(); if (!ids.length) return SV.toast(SV.t('vector.msg.slopify_select'));
    var out = [], skipped = 0;
    ids.forEach(function (id) {
      var o = getObj(id), ls = SV.leaves(o).filter(pathish);
      if (!ls.length) { skipped++; out.push(id); return; }
      var subs = [], rule = 'nonzero';
      if (ls.length === 1) { subs = SV.docSubs(ls[0]); rule = ls[0].style.rule; }
      else { var u = operandOf(o); subs = u.rings.map(function (r) { return { closed: true, pts: r.map(function (p) { return G.A(p.x, p.y); }) }; }); }
      subs = subs.map(function (sp) { return { closed: true, pts: sp.pts }; });
      var res = G.slopify(subs, { rule: rule });
      if (!res || !res.body.length) { skipped++; out.push(id); return; }
      var srcSt = ls[ls.length - 1].style;
      var st = SV.mkStyle({
        fill: { type: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [{ o: 0, c: '#f4ffa8', a: 1 }, { o: 0.42, c: '#d4ff3a', a: 1 }, { o: 1, c: '#86b800', a: 1 }] },
        stroke: srcSt.stroke ? '#1b2600' : null, sw: srcSt.stroke ? max(1, srcSt.sw) : 1, join: 'round', cap: 'round'
      });
      var body = SV.mk.path(res.body, st, 'Slime');
      var kids = [body];
      if (res.gloss) kids.push(SV.mk.path(res.gloss, { fill: '#ffffff', opacity: 0.6 }, 'Gloss'));
      var g = SV.mk.group(kids, (o.name ? o.name + ' ' : 'Slime ') + '(slopified)');
      SV.replaceObj(id, g); out.push(g.id);
    });
    SV.select(out); SV.commit('slopify');
    if (skipped) SV.toast(SV.t('vector.msg.slopify_skipped', { n: skipped }), 'warn');
    else SV.toast(SV.t('vector.msg.slopified'));
  };
  C.transformSel = function (M, copy, label) {
    var ids = topSel(); if (!ids.length) return;
    if (copy) {
      var nids = [];
      ids.slice().reverse().forEach(function (id) { var f = find(id), c = SV.reId(clone(f.obj)); f.arr.splice(f.idx + 1, 0, c); nids.unshift(c.id); });
      ids = nids;
    }
    ids.forEach(function (id) { SV.transformObj(getObj(id), M); });
    SV.select(ids); SV.commit(label || 'transform');
  };
  C.flip = function (axis) {
    var b = SV.selBBox(topSel()); if (!b) return;
    var cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    C.transformSel(axis === 'h' ? G.scale(-1, 1, cx, cy) : G.scale(1, -1, cx, cy), false, 'reflect');
  };
  C.align = function (how) {
    var ids = topSel(); if (!ids.length) return;
    var ref = (ids.length === 1 || S.prefs.alignTo === 'artboard') ? { x: 0, y: 0, w: S.doc.width, h: S.doc.height } : SV.selBBox(ids);
    ids.forEach(function (id) {
      var o = getObj(id), b = SV.objBBox(o); if (!b) return;
      var dx = 0, dy = 0;
      if (how === 'left') dx = ref.x - b.x; else if (how === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2); else if (how === 'right') dx = ref.x + ref.w - (b.x + b.w);
      else if (how === 'top') dy = ref.y - b.y; else if (how === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2); else if (how === 'bottom') dy = ref.y + ref.h - (b.y + b.h);
      if (dx || dy) SV.transformObj(o, G.translate(dx, dy));
    });
    SV.commit('align');
  };
  C.distribute = function (how) {
    var ids = topSel(); if (ids.length < 3) return SV.toast(SV.t('vector.msg.distribute_select'));
    var items = ids.map(function (id) { return { o: getObj(id), b: SV.objBBox(getObj(id)) }; });
    var horiz = how === 'hcenter' || how === 'hspace';
    items.sort(function (a, b) { return horiz ? a.b.x - b.b.x : a.b.y - b.b.y; });
    var first = items[0].b, last = items[items.length - 1].b, n = items.length;
    if (how === 'hcenter' || how === 'vcenter') {
      var c0 = horiz ? first.x + first.w / 2 : first.y + first.h / 2, c1 = horiz ? last.x + last.w / 2 : last.y + last.h / 2;
      items.forEach(function (it, i) { var target = c0 + (c1 - c0) * i / (n - 1), cur = horiz ? it.b.x + it.b.w / 2 : it.b.y + it.b.h / 2; SV.transformObj(it.o, horiz ? G.translate(target - cur, 0) : G.translate(0, target - cur)); });
    } else {
      var total = 0; items.forEach(function (it) { total += horiz ? it.b.w : it.b.h; });
      var span = horiz ? last.x + last.w - first.x : last.y + last.h - first.y, gap = (span - total) / (n - 1), pos = horiz ? first.x : first.y;
      items.forEach(function (it) { var cur = horiz ? it.b.x : it.b.y; SV.transformObj(it.o, horiz ? G.translate(pos - cur, 0) : G.translate(0, pos - cur)); pos += (horiz ? it.b.w : it.b.h) + gap; });
    }
    SV.commit('distribute');
  };
  C.selectInverse = function () {
    var ids = [];
    S.doc.layers.forEach(function (L) { if (!L.hidden && !L.locked) L.children.forEach(function (o) { if (!o.hidden && !o.locked && S.sel.indexOf(o.id) < 0) ids.push(o.id); }); });
    SV.select(ids);
  };
  C.selectSame = function (attr) {
    var src = SV.selObjs()[0]; if (!src || !src.style) return SV.toast(SV.t('vector.msg.select_object'));
    var v = JSON.stringify(src.style[attr]), ids = [];
    S.doc.layers.forEach(function (L) { if (!L.hidden && !L.locked) L.children.forEach(function (o) { if (!o.hidden && !o.locked && SV.leaves(o).some(function (l) { return l.style && JSON.stringify(l.style[attr]) === v; })) ids.push(o.id); }); });
    SV.select(ids);
  };
  C.selectLayer = function () {
    var L = SV.activeLayer(); SV.select(L.children.filter(function (o) { return !o.hidden && !o.locked; }).map(function (o) { return o.id; }));
  };
  C.nudge = function (dx, dy) {
    if (S.tool === 'direct' && Object.keys(S.psel).some(function (k) { return (S.psel[k] || []).length; })) {
      SV.movePoints(Object.keys(S.psel).filter(function (id) { return getObj(id); }), dx, dy);
    } else {
      var ids = topSel(); if (!ids.length) return;
      ids.forEach(function (id) { SV.transformObj(getObj(id), G.translate(dx, dy)); });
    }
    SV.commit('nudge');
  };
  // apply a style attribute to the selection (and the current default style)
  SV.applyStyle = function (attr, value, opts) {
    opts = opts || {};
    S.style[attr] = clone(value);
    var n = 0;
    SV.selObjs().forEach(function (o) {
      SV.leaves(o).forEach(function (l) {
        if (!SV.isEditable(l) || !l.style) return;
        if (l.type === 'image' && attr !== 'opacity' && attr !== 'blend') return;
        l.style[attr] = clone(value); n++;
      });
      if (o.type === 'group' && (attr === 'opacity' || attr === 'blend')) { /* applied to leaves */ }
    });
    if (opts.commit !== false && n) SV.commit('style ' + attr); else SV.requestRender(true);
    return n;
  };
  SV.applyFont = function (key, value, opts) {
    S.font[key] = value;
    var n = 0;
    SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.type === 'text' && SV.isEditable(l)) { l.font[key] = value; n++; } }); });
    if (S.editing) SV.positionEditor();
    if (n && (!opts || opts.commit !== false)) SV.commit('font ' + key); else SV.requestRender(true);
  };
  SV.applyShapeOpt = function (key, value) {
    S.shape[key] = value;
    var n = 0;
    SV.selObjs().forEach(function (o) {
      SV.leaves(o).forEach(function (l) {
        if (!SV.isEditable(l)) return;
        if (key === 'radius' && l.type === 'rect') { l.rx = value; delete l.rc; n++; }
        if (key === 'sides' && l.type === 'polygon') { l.sides = value; n++; }
        if (key === 'points' && l.type === 'star') { l.points = value; n++; }
        if (key === 'inner' && l.type === 'star') { l.r2 = l.r1 * value; n++; }
      });
    });
    if (n) SV.commit('shape ' + key); else SV.requestRender(true);
  };
  SV.currentPaint = function (which) {
    var o = SV.selObjs()[0];
    if (o) { var l = SV.leaves(o).filter(function (x) { return x.style && x.type !== 'image'; })[0]; if (l) return l.style[which]; }
    return S.style[which];
  };
  SV.swapFillStroke = function () {
    var objs = [];
    SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.style && l.type !== 'image' && SV.isEditable(l)) objs.push(l); }); });
    var t = S.style.fill; S.style.fill = S.style.stroke; S.style.stroke = t;
    objs.forEach(function (l) { var f = l.style.fill; l.style.fill = l.style.stroke; l.style.stroke = f; });
    if (objs.length) SV.commit('swap'); else SV.requestRender(true);
  };
  SV.defaultFillStroke = function () {
    var objs = [];
    SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.style && l.type !== 'image' && l.type !== 'text' && SV.isEditable(l)) objs.push(l); }); });
    S.style.fill = '#ffffff'; S.style.stroke = '#000000'; S.style.sw = 1; S.style.dash = null;
    objs.forEach(function (l) { l.style.fill = '#ffffff'; l.style.stroke = '#000000'; l.style.sw = 1; l.style.dash = null; });
    if (objs.length) SV.commit('default colors'); else SV.requestRender(true);
  };
})();
