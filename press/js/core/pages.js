/* Slop Press — pages and spreads: sides, numbering, spreads, master application, page operations. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;
  var P = PR.pages = {};

  /** Page number shown for page index i. */
  P.number = function (doc, i) { return (doc.startPage || 1) + i; };
  P.label = function (doc, i) { return String(P.number(doc, i)); };
  /** 'left' | 'right' | 'single'. With facing pages, odd numbers are right-hand pages. */
  P.side = function (doc, i) { return !doc.facing ? 'single' : P.number(doc, i) % 2 ? 'right' : 'left'; };
  /** Master page index (0 = left, 1 = right) used by page i. */
  P.masterSide = function (doc, i) { return doc.facing && P.side(doc, i) === 'right' ? 1 : 0; };

  /** Spreads: [{ pages:[index…], x:[offset of each page within the spread] }]. */
  P.spreads = function (doc) {
    var out = [], cur = null, w = doc.size.w;
    for (var i = 0; i < doc.pages.length; i++) {
      var side = P.side(doc, i);
      if (side === 'single') { out.push({ pages: [i], x: [0], w: w }); continue; }
      if (side === 'left') { cur = { pages: [i], x: [0], w: w * 2 }; out.push(cur); }
      else if (cur && cur.pages.length === 1 && P.side(doc, cur.pages[0]) === 'left') { cur.pages.push(i); cur.x.push(w); cur = null; }
      else { out.push({ pages: [i], x: [w], w: w * 2, lone: true }); cur = null; }
    }
    return out;
  };
  P.spreadOf = function (doc, i) { var ss = P.spreads(doc); for (var s = 0; s < ss.length; s++) if (ss[s].pages.indexOf(i) >= 0) return s; return 0; };

  /** Margins resolved to left/right for page i (or for a side: 'left' | 'right' | 'single'). */
  P.marginsSide = function (doc, s) {
    var m = doc.margins, left = s === 'left' ? m.outside : m.inside, right = s === 'left' ? m.inside : m.outside;
    return { top: m.top, bottom: m.bottom, left: left, right: right };
  };
  P.margins = function (doc, i) { return P.marginsSide(doc, typeof i === 'string' ? i : P.side(doc, i)); };
  P.bleedSide = function (doc, s) {
    var b = doc.bleed;
    return { top: b.top, bottom: b.bottom, left: s === 'left' ? b.outside : b.inside, right: s === 'left' ? b.inside : b.outside };
  };
  P.bleed = function (doc, i) { return P.bleedSide(doc, typeof i === 'string' ? i : P.side(doc, i)); };
  P.slug = function (doc, i) {
    var b = doc.slug, s = typeof i === 'string' ? i : P.side(doc, i);
    return { top: b.top, bottom: b.bottom, left: s === 'left' ? b.outside : b.inside, right: s === 'left' ? b.inside : b.outside };
  };
  /** Side of master page `side` index: 'left' | 'right' | 'single'. */
  P.masterSideName = function (doc, side) { return !doc.facing ? 'single' : side === 0 ? 'left' : 'right'; };
  /** Column rectangles inside the margins of page i (page coordinates). */
  P.columns = function (doc, i) {
    var m = P.margins(doc, i), n = Math.max(1, doc.columns.count | 0), g = doc.columns.gutter;
    var x0 = m.left, w = doc.size.w - m.left - m.right, cw = (w - g * (n - 1)) / n, out = [];
    for (var c = 0; c < n; c++) out.push({ x: x0 + c * (cw + g), y: m.top, w: cw, h: doc.size.h - m.top - m.bottom });
    return out;
  };

  /* ---------- masters ---------- */
  /** Master items that show on page i (following basedOn chains), bottom-most first. */
  P.masterItems = function (doc, i) {
    var page = doc.pages[i]; if (!page || !page.master) return [];
    var side = P.masterSide(doc, i), out = [], m = M.findMaster(doc, page.master), seen = {};
    var chain = [];
    while (m && !seen[m.id]) { seen[m.id] = 1; chain.unshift(m); m = m.basedOn ? M.findMaster(doc, m.basedOn) : null; }
    chain.forEach(function (mm) { var mp = mm.pages[Math.min(side, mm.pages.length - 1)]; out = out.concat(mp.items.filter(function (it) { return !(page.hidden || []).includes(it.id); })); });
    return out;
  };
  P.applyMaster = function (doc, pageIdx, masterId) {
    [].concat(pageIdx).forEach(function (i) { if (doc.pages[i]) doc.pages[i].master = masterId || null; });
  };
  /** Copies the master items of page i onto the page so they can be edited ("Override All Master Page Items"). */
  P.overrideMaster = function (doc, i) {
    var page = doc.pages[i], items = P.masterItems(doc, i), idmap = {};
    items.forEach(function (it) { idmap[it.id] = U.uid('F'); });
    var storyMap = {};
    var made = items.map(function (it) {
      var c = U.clone(it); c.id = idmap[it.id];
      if (c.type === 'text') {
        if (!storyMap[it.story]) { var ns = U.clone(doc.stories[it.story]); ns.id = U.uid('S'); doc.stories[ns.id] = ns; storyMap[it.story] = ns.id; }
        c.story = storyMap[it.story];
        c.next = c.next && idmap[c.next] || null; c.prev = c.prev && idmap[c.prev] || null;
      }
      return c;
    });
    page.hidden = (page.hidden || []).concat(items.map(function (it) { return it.id; }));
    page.items = made.concat(page.items);
    return made;
  };
  P.newMaster = function (doc, name, basedOn) {
    var used = doc.masters.map(function (m) { return m.prefix; }), p = 'A';
    for (var c = 65; c < 91; c++) { p = String.fromCharCode(c); if (used.indexOf(p) < 0) break; }
    var m = M.master(doc, p, name || 'Master'); m.basedOn = basedOn || null;
    doc.masters.push(m); return m;
  };
  P.deleteMaster = function (doc, id) {
    doc.masters = doc.masters.filter(function (m) { return m.id !== id; });
    doc.pages.forEach(function (p) { if (p.master === id) p.master = null; });
    doc.masters.forEach(function (m) { if (m.basedOn === id) m.basedOn = null; });
  };
  P.masterLabel = function (doc, id) { var m = id && M.findMaster(doc, id); return m ? m.prefix + '-' + m.name : '[None]'; };

  /* ---------- page operations ---------- */
  P.insertPages = function (doc, at, count, masterId) {
    if (masterId === undefined) masterId = (doc.pages[Math.max(0, at - 1)] || doc.pages[0] || {}).master || (doc.masters[0] && doc.masters[0].id) || null;
    var made = [];
    for (var k = 0; k < (count || 1); k++) made.push(M.page(masterId));
    doc.pages.splice.apply(doc.pages, [U.clamp(at, 0, doc.pages.length), 0].concat(made));
    return made;
  };
  /** Deletes pages; text frames on them are unlinked from their threads (the text flows on). */
  P.deletePages = function (doc, idxs) {
    idxs = [].concat(idxs).sort(function (a, b) { return b - a; });
    if (idxs.length >= doc.pages.length) idxs = idxs.slice(0, doc.pages.length - 1);
    idxs.forEach(function (i) {
      var page = doc.pages[i]; if (!page) return;
      page.items.slice().forEach(function (it) { PR.items.unthread(doc, it); });
      doc.pages.splice(i, 1);
    });
    PR.items.gcStories(doc);
  };
  P.movePage = function (doc, from, to) {
    var p = doc.pages.splice(from, 1)[0];
    doc.pages.splice(U.clamp(to, 0, doc.pages.length), 0, p);
  };
  P.duplicatePage = function (doc, i) {
    var src = doc.pages[i], copy = M.page(src.master), idmap = {};
    src.items.forEach(function (it) { idmap[it.id] = U.uid('F'); });
    var storyMap = {};
    copy.items = src.items.map(function (it) {
      var c = U.clone(it); c.id = idmap[it.id];
      if (c.type === 'text') {
        if (!storyMap[c.story]) { var ns = U.clone(doc.stories[c.story]); ns.id = U.uid('S'); doc.stories[ns.id] = ns; storyMap[c.story] = ns.id; }
        c.story = storyMap[c.story];
        c.next = c.next && idmap[c.next] || null; c.prev = c.prev && idmap[c.prev] || null;
      }
      return c;
    });
    copy.guides = U.clone(src.guides || []);
    doc.pages.splice(i + 1, 0, copy);
    return copy;
  };
})();
