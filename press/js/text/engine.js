/* Slop Press — layout cache for a whole document.
   Page stories are laid out once per revision; master stories are laid out per page that shows them
   (the page-number marker differs). PR.engine.frame(frame, pageIdx) returns that frame's lines. */
(function () {
  'use strict';
  var PR = window.PR, M = PR.model, P = PR.pages, L = PR.layout;
  var E = PR.engine = {};
  var cache = {}, cacheRev = -1, cacheDoc = null;

  function check() {
    var S = PR.state;
    if (cacheRev !== S.rev || cacheDoc !== S.doc) { cache = {}; cacheRev = S.rev; cacheDoc = S.doc; }
  }
  E.clear = function () { cache = {}; cacheRev = -1; };

  /** Index of the page whose item list holds `it` (or -1 for master items). */
  E.pageOf = function (doc, it) {
    for (var i = 0; i < doc.pages.length; i++) if (doc.pages[i].items.indexOf(it) >= 0) return i;
    return -1;
  };
  /** Everything shown on page i: master items (bottom) then page items. */
  E.pageItems = function (doc, i) { var p = doc.pages[i]; return p ? P.masterItems(doc, i).concat(p.items) : []; };

  /** Layout of a story. pageIdx: for master stories, the page instance (null = the master itself). */
  E.story = function (sid, pageIdx) {
    check();
    var doc = PR.state.doc, key = sid + '@' + (pageIdx == null ? '' : pageIdx);
    if (cache[key]) return cache[key];
    var s = doc.stories[sid];
    if (!s) return null;
    var frames = M.storyFrames(doc, sid);
    if (!frames.length) return null;
    var envFor = function (fr) {
      var f = M.findItem(doc, fr.id), pi = pageIdx;
      if (f && f.page) pi = doc.pages.indexOf(f.page);
      if (f && f.master && pageIdx == null) {
        // shown on the master itself: page number is the master prefix (as in InDesign)
        return { items: f.items, pageNumber: f.master.prefix };
      }
      return { items: pi != null && pi >= 0 ? E.pageItems(doc, pi) : (f ? f.items : []), pageNumber: pi != null && pi >= 0 ? P.label(doc, pi) : '#' };
    };
    var t0 = performance.now();
    var r = L.layoutStory(doc, s, frames, envFor);
    r.ms = performance.now() - t0;
    return (cache[key] = r);
  };
  /** Lines/rules of one frame. For master frames shown on a page, pass that page's index. */
  E.frame = function (fr, pageIdx) {
    var r = E.story(fr.story, pageIdx);
    return r ? r.frames[fr.id] || { lines: [], rules: [] } : { lines: [], rules: [] };
  };
  /** Is the story of this frame overset (text left over after its last frame)? */
  E.overset = function (fr, pageIdx) { var r = E.story(fr.story, pageIdx); return !!(r && r.overset); };
  /** Stories with overset text (page stories only). */
  E.oversetStories = function () {
    var doc = PR.state.doc, out = [];
    Object.keys(doc.stories).forEach(function (sid) {
      var frames = M.storyFrames(doc, sid); if (!frames.length) return;
      var f = M.findItem(doc, frames[0].id); if (!f || f.master) return;
      var r = E.story(sid); if (r && r.overset) out.push(sid);
    });
    return out;
  };
  /** Adds pages (with a threaded frame in the margins of each) until story sid is no longer overset. */
  E.autoflow = function (sid, maxPages) {
    var doc = PR.state.doc, added = 0;
    maxPages = maxPages || 200;
    for (;;) {
      PR.touch();
      var r = E.story(sid); if (!r || !r.overset || added >= maxPages) break;
      var frames = M.storyFrames(doc, sid), last = frames[frames.length - 1];
      var lp = E.pageOf(doc, last); if (lp < 0) break;
      var np = P.insertPages(doc, lp + 1, 1)[0], idx = lp + 1, m = P.margins(doc, idx);
      var fr = M.item('text', m.left, m.top, doc.size.w - m.left - m.right, doc.size.h - m.top - m.bottom, { cols: doc.columns.count, gutter: doc.columns.gutter, layer: last.layer });
      fr.story = sid; fr.prev = last.id; last.next = fr.id;
      np.items.push(fr); added++;
    }
    return added;
  };
  PR.on('fonts', function () { E.clear(); if (PR.state.doc) PR.touch(); });
})();
