/* SlopVector — core: document tree helpers */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function uid() { return $.uid.apply(this, arguments); }
  var S = $.S;

  /* ================= tree helpers ================= */
  function walk(fn, opts) {
    var stop = false;
    function rec(arr, layer, parent, depth) {
      for (var i = 0; i < arr.length && !stop; i++) {
        var o = arr[i];
        if (fn(o, arr, i, layer, parent, depth) === false) { stop = true; return; }
        if (o.type === 'group' && o.children) rec(o.children, layer, o, depth + 1);
      }
    }
    S.doc.layers.forEach(function (L) { if (!stop) rec(L.children, L, null, 0); });
  }
  SV.walk = walk;
  function find(id) {
    var r = null;
    walk(function (o, arr, i, layer, parent) { if (o.id === id) { r = { obj: o, arr: arr, idx: i, layer: layer, parent: parent }; return false; } });
    return r;
  }
  SV.find = find;
  function getObj(id) { var f = find(id); return f ? f.obj : null; }
  SV.getObj = getObj;
  function layerOf(id) { var f = find(id); return f ? f.layer : null; }
  function topOf(id) {
    var f = find(id); if (!f) return null;
    var res = null;
    f.layer.children.forEach(function (t) { if (t.id === id || containsId(t, id)) res = t; });
    return res;
  }
  SV.topOf = topOf;
  function containsId(o, id) {
    if (o.id === id) return true;
    if (o.type === 'group') for (var i = 0; i < o.children.length; i++) if (containsId(o.children[i], id)) return true;
    return false;
  }
  function getLayer(id) { for (var i = 0; i < S.doc.layers.length; i++) if (S.doc.layers[i].id === id) return S.doc.layers[i]; return null; }
  SV.getLayer = getLayer;
  function activeLayer() {
    var L = getLayer(S.activeLayer);
    if (!L) { L = S.doc.layers[S.doc.layers.length - 1]; S.activeLayer = L.id; }
    return L;
  }
  SV.activeLayer = activeLayer;
  function selObjs() { return S.sel.map(getObj).filter(Boolean); }
  SV.selObjs = selObjs;
  // z-order key for sorting: [layerIndex, path of indices]
  function zKey(id) {
    var f = find(id); if (!f) return [];
    var key = [S.doc.layers.indexOf(f.layer)];
    function rec(arr, path) {
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return path.concat(i);
        if (arr[i].type === 'group') { var r = rec(arr[i].children, path.concat(i)); if (r) return r; }
      }
      return null;
    }
    return key.concat(rec(f.layer.children, []) || []);
  }
  function zCompare(a, b) {
    var ka = zKey(a), kb = zKey(b);
    for (var i = 0; i < max(ka.length, kb.length); i++) { var x = ka[i] === undefined ? -1 : ka[i], y = kb[i] === undefined ? -1 : kb[i]; if (x !== y) return x - y; }
    return 0;
  }
  SV.zSorted = function (ids) { return ids.slice().sort(zCompare); };
  function isEditable(o) {
    var f = find(o.id); if (!f) return false;
    if (f.layer.locked || f.layer.hidden) return false;
    var cur = o; if (cur.locked || cur.hidden) return false;
    var p = f.parent; while (p) { if (p.locked || p.hidden) return false; var pf = find(p.id); p = pf && pf.parent; }
    return true;
  }
  SV.isEditable = isEditable;
  function leaves(o, out) {
    out = out || [];
    if (o.type === 'group') o.children.forEach(function (c) { if (!c.hidden) leaves(c, out); }); else out.push(o);
    return out;
  }
  SV.leaves = leaves;
  function reId(o) { o.id = uid(); if (o.type === 'group') o.children.forEach(reId); return o; }
  SV.reId = reId;

  $.activeLayer = activeLayer; $.find = find; $.getObj = getObj; $.isEditable = isEditable; $.layerOf = layerOf; $.leaves = leaves; $.selObjs = selObjs;
})();
