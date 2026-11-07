/* SlopVector — tools: edit commands (clipboard, group, arrange, lock) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};

  /* ================= commands ================= */

  function topSel() { return SV.zSorted(S.sel.filter(function (id) { var o = getObj(id); return o && SV.isEditable(o); })); }
  C.deleteSel = function () {
    if (S.tool === 'direct' || S.tool === 'pen') {
      var ids = Object.keys(S.psel).filter(function (id) { return getObj(id) && (S.psel[id] || []).length; });
      var partial = ids.filter(function (id) { var o = getObj(id), tot = 0; SV.localSubs(o).forEach(function (sp) { tot += sp.pts.length; }); return S.psel[id].length < tot; });
      if (partial.length) {
        partial.forEach(function (id) {
          var o = getObj(id); SV.toPath(o);
          var keys = S.psel[id].map(function (k) { return k.split(':').map(Number); }).sort(function (a, b) { return b[0] - a[0] || b[1] - a[1]; });
          keys.forEach(function (k) { var sp = o.subpaths[k[0]]; if (sp) sp.pts.splice(k[1], 1); });
          o.subpaths = o.subpaths.filter(function (sp) { return sp.pts.length > 1; });
          if (!o.subpaths.length) SV.removeObj(id);
        });
        S.psel = {}; S.sel = S.sel.filter(function (id) { return getObj(id); });
        if (S.pen) S.pen = null;
        SV.commit('delete points'); return;
      }
    }
    var ids2 = topSel(); if (!ids2.length) return;
    ids2.forEach(SV.removeObj);
    S.sel = []; S.psel = {}; S.pen = null;
    SV.commit('delete');
  };
  C.copy = function () {
    var ids = topSel(); if (!ids.length) return false;
    S.clipboard = { objs: ids.map(function (id) { return clone(getObj(id)); }), box: SV.selBBox(ids), assets: {}, t: Date.now() };
    S.clipboard.objs.forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.type === 'image') S.clipboard.assets[l.asset] = S.doc.assets[l.asset]; }); });
    try { S.clipText = SV.io.exportSVG({ ids: ids }); } catch (e) { S.clipText = ''; }
    return true;
  };
  C.cut = function () { if (C.copy()) { topSel().forEach(SV.removeObj); S.sel = []; SV.commit('cut'); } };
  C.paste = function (mode) {
    var cb = S.clipboard; if (!cb || !cb.objs.length) return SV.toast(SV.t('vector.msg.clipboard_empty'));
    Object.keys(cb.assets || {}).forEach(function (k) { if (!S.doc.assets[k]) S.doc.assets[k] = cb.assets[k]; });
    var objs = cb.objs.map(function (o) { return SV.reId(clone(o)); }), ids = objs.map(function (o) { return o.id; });
    var L = SV.activeLayer();
    if (L.locked || L.hidden) return SV.toast(SV.t('vector.msg.layer_unusable'), 'warn');
    var sel = topSel();
    if (mode === 'front' && sel.length) {
      var f = find(sel[sel.length - 1]); f.arr.splice.apply(f.arr, [f.idx + 1, 0].concat(objs));
    } else if (mode === 'back' && sel.length) {
      var fb = find(sel[0]); fb.arr.splice.apply(fb.arr, [fb.idx, 0].concat(objs));
    } else {
      objs.forEach(function (o) { L.children.push(o); });
      if (!mode && cb.box) {
        var r = D.stage.getBoundingClientRect(), c = SV.toDoc(r.width / 2, r.height / 2);
        var M = G.translate(c.x - (cb.box.x + cb.box.w / 2), c.y - (cb.box.y + cb.box.h / 2));
        objs.forEach(function (o) { SV.transformObj(o, M); });
      }
    }
    SV.select(ids); SV.commit('paste');
  };
  C.duplicate = function () {
    var ids = topSel(); if (!ids.length) return;
    var off = S.lastDup || { dx: 10, dy: 10 }, newIds = [];
    ids.slice().reverse().forEach(function (id) {
      var f = find(id), c = SV.reId(clone(f.obj));
      SV.transformObj(c, G.translate(off.dx, off.dy));
      f.arr.splice(f.idx + 1, 0, c); newIds.unshift(c.id);
    });
    S.lastDup = off;
    SV.select(newIds); SV.commit('duplicate');
  };
  C.group = function () {
    var ids = topSel(); if (!ids.length) return;
    var objs = ids.map(getObj), g = SV.mk.group([], '');
    SV.replaceObj(ids[ids.length - 1], g);
    ids.slice(0, -1).forEach(function (id) { var f = find(id); if (f) f.arr.splice(f.idx, 1); });
    g.children = objs;
    SV.select([g.id]); SV.commit('group');
  };
  C.ungroup = function () {
    var ids = topSel(), out = [], any = false;
    ids.forEach(function (id) {
      var o = getObj(id);
      if (o && o.type === 'group') {
        any = true;
        var f = find(id), ch = o.children;
        if (o.style && o.style.opacity < 1) ch.forEach(function (c) { if (c.style) c.style.opacity = (c.style.opacity == null ? 1 : c.style.opacity) * o.style.opacity; });
        f.arr.splice.apply(f.arr, [f.idx, 1].concat(ch));
        ch.forEach(function (c) { out.push(c.id); });
      } else out.push(id);
    });
    if (!any) return SV.toast(SV.t('vector.msg.no_groups'));
    SV.select(out); SV.commit('ungroup');
  };
  C.arrange = function (how) {
    var ids = topSel(); if (!ids.length) return;
    var selSet = new Set(ids);
    if (how === 'front') ids.forEach(function (id) { var f = find(id); f.arr.splice(f.idx, 1); f.arr.push(f.obj); });
    else if (how === 'back') ids.slice().reverse().forEach(function (id) { var f = find(id); f.arr.splice(f.idx, 1); f.arr.unshift(f.obj); });
    else if (how === 'forward') ids.slice().reverse().forEach(function (id) { var f = find(id); if (f.idx < f.arr.length - 1 && !selSet.has(f.arr[f.idx + 1].id)) { f.arr[f.idx] = f.arr[f.idx + 1]; f.arr[f.idx + 1] = f.obj; } });
    else if (how === 'backward') ids.forEach(function (id) { var f = find(id); if (f.idx > 0 && !selSet.has(f.arr[f.idx - 1].id)) { f.arr[f.idx] = f.arr[f.idx - 1]; f.arr[f.idx - 1] = f.obj; } });
    SV.commit('arrange');
  };
  C.lockSel = function () { var ids = topSel(); if (!ids.length) return; ids.forEach(function (id) { getObj(id).locked = true; }); S.sel = []; SV.commit('lock'); };
  C.unlockAll = function () {
    var ids = [];
    S.doc.layers.forEach(function (L) { if (L.locked) return; (function rec(arr, top) { arr.forEach(function (o) { if (o.locked) { o.locked = false; if (top) ids.push(o.id); } if (o.type === 'group') rec(o.children, false); }); })(L.children, true); });
    S.sel = ids; SV.commit('unlock all');
  };
  C.hideSel = function () { var ids = topSel(); if (!ids.length) return; ids.forEach(function (id) { getObj(id).hidden = true; }); S.sel = []; SV.commit('hide'); };
  C.showAll = function () {
    var ids = [];
    S.doc.layers.forEach(function (L) { (function rec(arr, top) { arr.forEach(function (o) { if (o.hidden) { o.hidden = false; if (top) ids.push(o.id); } if (o.type === 'group') rec(o.children, false); }); })(L.children, true); });
    S.sel = ids; SV.commit('show all');
  };

  $.topSel = topSel;
})();
