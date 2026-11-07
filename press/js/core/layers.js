/* Slop Press — layers (document-wide, shared by every page and master) and ruler guides. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;
  var L = PR.layers = {};

  L.add = function (doc, name) {
    var l = M.layer(name || 'Layer ' + (doc.layers.length + 1), doc.layers.length);
    doc.layers.push(l); return l;
  };
  /** Deletes a layer and every item on it (the last layer cannot be deleted). */
  L.remove = function (doc, id) {
    if (doc.layers.length < 2) return false;
    M.containers(doc).forEach(function (c) {
      c.items.filter(function (it) { return it.layer === id; }).forEach(function (it) { PR.items.remove(doc, it.id); });
    });
    doc.layers = doc.layers.filter(function (l) { return l.id !== id; });
    return true;
  };
  L.move = function (doc, from, to) { var l = doc.layers.splice(from, 1)[0]; doc.layers.splice(U.clamp(to, 0, doc.layers.length), 0, l); };
  L.index = function (doc, id) { for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].id === id) return i; return 0; };
  L.visible = function (doc, it) { var l = M.findLayer(doc, it.layer); return !l || l.visible; };
  L.locked = function (doc, it) { var l = M.findLayer(doc, it.layer); return it.locked || (l && l.locked); };
  /** Items in paint order: layer order first, then the order within the page. */
  L.sorted = function (doc, items) {
    var order = {}; doc.layers.forEach(function (l, i) { order[l.id] = i; });
    return items.map(function (it, i) { return { it: it, i: i }; })
      .sort(function (a, b) { return (order[a.it.layer] || 0) - (order[b.it.layer] || 0) || a.i - b.i; })
      .map(function (o) { return o.it; });
  };
  L.merge = function (doc, ids) {
    if (ids.length < 2) return;
    var keep = ids[ids.length - 1];
    M.containers(doc).forEach(function (c) { c.items.forEach(function (it) { if (ids.indexOf(it.layer) >= 0) it.layer = keep; }); });
    doc.layers = doc.layers.filter(function (l) { return l.id === keep || ids.indexOf(l.id) < 0; });
  };

  /* ---------- guides: { axis: 'x' | 'y', pos (points, page coordinates) } ---------- */
  L.guideList = function (doc, S) {
    if (S.editMaster) { var m = M.findMaster(doc, S.editMaster.id); return m ? m.pages[Math.min(S.editMaster.side, m.pages.length - 1)].guides : []; }
    var p = doc.pages[S.page]; return p ? (p.guides = p.guides || []) : [];
  };
  /** Adds evenly spaced column/row guides inside the margins (a simple "Create Guides…"). */
  L.makeGrid = function (doc, pageIdx, rows, cols, gutter, list) {
    var m = PR.pages.margins(doc, pageIdx), W = doc.size.w - m.left - m.right, H = doc.size.h - m.top - m.bottom;
    var add = function (axis, pos) { list.push({ axis: axis, pos: U.round(pos, 3) }); };
    var cw = (W - gutter * (cols - 1)) / cols, rh = (H - gutter * (rows - 1)) / rows;
    for (var c = 1; c < cols; c++) { add('x', m.left + c * cw + (c - 1) * gutter); if (gutter) add('x', m.left + c * (cw + gutter)); }
    for (var r = 1; r < rows; r++) { add('y', m.top + r * rh + (r - 1) * gutter); if (gutter) add('y', m.top + r * (rh + gutter)); }
  };
})();
