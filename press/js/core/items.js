/* Slop Press — item operations: create, delete, duplicate, arrange, threads, geometry. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;
  var I = PR.items = {};

  /** Adds an item to a container's item list (page or master page). Text frames get a fresh story. */
  I.add = function (doc, items, it, opts) {
    opts = opts || {};
    if (!it.layer) it.layer = opts.layer || doc.layers[doc.layers.length - 1].id;
    if (it.type === 'text' && !it.story) { var s = M.story(opts.text || '', opts.ps || 'Body'); doc.stories[s.id] = s; it.story = s.id; }
    items.push(it);
    return it;
  };
  /** Removes an item, keeping the thread intact (its text moves to the neighbouring frames). */
  I.remove = function (doc, id) {
    var f = M.findItem(doc, id); if (!f) return;
    I.unthread(doc, f.item);
    f.items.splice(f.items.indexOf(f.item), 1);
    I.gcStories(doc);
  };
  /** Takes a frame out of its thread, joining its neighbours. */
  I.unthread = function (doc, it) {
    if (it.type !== 'text') return;
    var prev = it.prev && M.findItem(doc, it.prev), next = it.next && M.findItem(doc, it.next);
    if (prev) prev.item.next = next ? next.item.id : null;
    if (next) next.item.prev = prev ? prev.item.id : null;
    if (!prev && next) { /* next becomes the head and keeps the story */ }
    it.prev = it.next = null;
    if (prev || next) { var s = M.story('', 'Body'); doc.stories[s.id] = s; it.story = s.id; }
  };
  /** Links frame a → b (b's own text is appended to a's story). Returns false if not allowed. */
  I.link = function (doc, aId, bId) {
    var A = M.findItem(doc, aId), B = M.findItem(doc, bId);
    if (!A || !B || A.item.type !== 'text' || B.item.type !== 'text' || aId === bId) return false;
    var a = A.item, b = B.item;
    if (a.story === b.story) return false;
    if (!!A.master !== !!B.master) return false;
    // b must be the head of its own thread; its whole thread joins after a.
    while (b.prev) b = M.findItem(doc, b.prev).item;
    var oldNext = a.next && M.findItem(doc, a.next);
    var bs = doc.stories[b.story], as = doc.stories[a.story];
    if (bs && bs.text.length) PR.story.appendStory(as, bs);
    var tail = b, f = b;
    while (f) { f.story = a.story; tail = f; f = f.next ? M.findItem(doc, f.next).item : null; }
    delete doc.stories[bs && bs.id];
    a.next = b.id; b.prev = a.id;
    if (oldNext) { tail.next = oldNext.item.id; oldNext.item.prev = tail.id; }
    return true;
  };
  /** Breaks the thread after frame a. The frames after it get a new, empty story. */
  I.breakAfter = function (doc, aId) {
    var A = M.findItem(doc, aId); if (!A || !A.item.next) return;
    var n = M.findItem(doc, A.item.next).item, s = M.story('', 'Body');
    doc.stories[s.id] = s; A.item.next = null; n.prev = null;
    for (var f = n; f; f = f.next ? M.findItem(doc, f.next).item : null) f.story = s.id;
  };
  I.gcStories = function (doc) {
    var used = {};
    M.containers(doc).forEach(function (c) { c.items.forEach(function (it) { if (it.type === 'text') used[it.story] = 1; }); });
    Object.keys(doc.stories).forEach(function (k) { if (!used[k]) delete doc.stories[k]; });
  };
  /** Duplicates items within the same container (offset by dx, dy). Threads inside the set are kept. */
  I.duplicate = function (doc, ids, dx, dy) {
    var idmap = {}, out = [], storyMap = {};
    ids.forEach(function (id) { idmap[id] = U.uid('F'); });
    ids.forEach(function (id) {
      var f = M.findItem(doc, id); if (!f) return;
      var c = U.clone(f.item); c.id = idmap[id]; c.x += dx || 0; c.y += dy || 0;
      if (c.type === 'text') {
        var key = f.item.story;
        if (!storyMap[key]) { var ns = U.clone(doc.stories[key]); ns.id = U.uid('S'); doc.stories[ns.id] = ns; storyMap[key] = ns.id; }
        c.story = storyMap[key];
        c.next = c.next && idmap[c.next] || null; c.prev = c.prev && idmap[c.prev] || null;
      }
      f.items.push(c); out.push(c);
    });
    return out;
  };
  I.arrange = function (doc, ids, how) {
    ids.forEach(function (id) {
      var f = M.findItem(doc, id); if (!f) return;
      var a = f.items, i = a.indexOf(f.item); a.splice(i, 1);
      var j = how === 'front' ? a.length : how === 'back' ? 0 : how === 'forward' ? Math.min(a.length, i + 1) : Math.max(0, i - 1);
      a.splice(j, 0, f.item);
    });
  };
  /** Moves items to another page (or master page) list, keeping page coordinates. */
  I.moveTo = function (doc, ids, items) {
    ids.forEach(function (id) { var f = M.findItem(doc, id); if (!f || f.items === items) return; f.items.splice(f.items.indexOf(f.item), 1); items.push(f.item); });
  };

  /* ---------- geometry ---------- */
  I.center = function (it) { return { x: it.x + it.w / 2, y: it.y + it.h / 2 }; };
  /** Page point → item-local point (undoing rotation about the centre). */
  I.toLocal = function (it, px, py) {
    if (!it.rot) return { x: px - it.x, y: py - it.y };
    var c = I.center(it), a = -it.rot * Math.PI / 180, dx = px - c.x, dy = py - c.y;
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a) - it.x, y: c.y + dx * Math.sin(a) + dy * Math.cos(a) - it.y };
  };
  I.toPage = function (it, lx, ly) {
    if (!it.rot) return { x: it.x + lx, y: it.y + ly };
    var c = I.center(it), a = it.rot * Math.PI / 180, dx = it.x + lx - c.x, dy = it.y + ly - c.y;
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
  };
  /** Axis-aligned bounds (page coordinates) of the possibly rotated item. */
  I.bounds = function (it) {
    if (!it.rot) return { x: it.x, y: it.y, w: it.w, h: it.h };
    var pts = [[0, 0], [it.w, 0], [it.w, it.h], [0, it.h]].map(function (p) { return I.toPage(it, p[0], p[1]); });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  };
  I.unionBounds = function (items) {
    if (!items.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    items.forEach(function (it) { var b = I.bounds(it); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  /** Polygon / star vertices in item-local coordinates. */
  I.polygonPoints = function (it) {
    var n = Math.max(3, it.sides | 0), star = U.clamp(+it.inset || 0, 0, 0.95), pts = [], cx = it.w / 2, cy = it.h / 2;
    var steps = star ? n * 2 : n;
    for (var k = 0; k < steps; k++) {
      var a = -Math.PI / 2 + k * 2 * Math.PI / steps, r = star && k % 2 ? 1 - star : 1;
      pts.push([cx + Math.cos(a) * cx * r, cy + Math.sin(a) * cy * r]);
    }
    return pts;
  };
  /** Builds the item's outline as abstract path commands (local coords): [['M',x,y],['L',x,y],['C',…],['Z']]. */
  I.path = function (it) {
    var w = it.w, h = it.h, K = 0.5522847498;
    if (it.type === 'ellipse') {
      var rx = w / 2, ry = h / 2, cx = rx, cy = ry;
      return [['M', cx + rx, cy], ['C', cx + rx, cy + ry * K, cx + rx * K, cy + ry, cx, cy + ry], ['C', cx - rx * K, cy + ry, cx - rx, cy + ry * K, cx - rx, cy],
        ['C', cx - rx, cy - ry * K, cx - rx * K, cy - ry, cx, cy - ry], ['C', cx + rx * K, cy - ry, cx + rx, cy - ry * K, cx + rx, cy], ['Z']];
    }
    if (it.type === 'line') return it.dir ? [['M', 0, h], ['L', w, 0]] : [['M', 0, 0], ['L', w, h]];
    if (it.type === 'polygon') return I.polygonPoints(it).map(function (p, k) { return [k ? 'L' : 'M', p[0], p[1]]; }).concat([['Z']]);
    var r = Math.min(Math.max(0, +it.radius || 0), w / 2, h / 2);
    if (!r) return [['M', 0, 0], ['L', w, 0], ['L', w, h], ['L', 0, h], ['Z']];
    var k = r * (1 - K);
    return [['M', r, 0], ['L', w - r, 0], ['C', w - k, 0, w, k, w, r], ['L', w, h - r], ['C', w, h - k, w - k, h, w - r, h], ['L', r, h],
      ['C', k, h, 0, h - k, 0, h - r], ['L', 0, r], ['C', 0, k, k, 0, r, 0], ['Z']];
  };
  /** Replays a path on a canvas context (already transformed to the item's local space). */
  I.tracePath = function (ctx, cmds) {
    ctx.beginPath();
    cmds.forEach(function (c) {
      if (c[0] === 'M') ctx.moveTo(c[1], c[2]); else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
      else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]); else ctx.closePath();
    });
  };
})();
