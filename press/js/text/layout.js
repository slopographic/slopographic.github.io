/* Slop Press — story layout across threaded frames.
   layoutStory(doc, story, frames, envFor) → { frames: { id: { lines, rules } }, overset, end, lines }
   Each frame's inner area is split into columns ("slots"); paragraphs flow slot by slot. Lines carry frame-local
   coordinates: { y (baseline), x, w (segment), asc, desc, lead, g:[glyph {o,c,x,w,size,fk,s,…}], o0, o1, k, si, end }.
   Features: wrap segments, first-baseline = ascent, space before/after, baseline grid, drop caps, rules,
   keep with next / keep together / keep first+last lines, KP or greedy composer, vertical alignment. */
(function () {
  'use strict';
  var PR = window.PR, B = PR.breaker, PP = PR.para, WR = PR.wrap, S = PR.story;
  var L = PR.layout = PR.layout || {};

  function slotsFor(frames) {
    var out = [];
    frames.forEach(function (fr, fi) {
      var ins = Math.max(0, +fr.inset || 0), n = Math.max(1, fr.cols | 0), g = n > 1 ? +fr.gutter || 0 : 0;
      var iw = fr.w - 2 * ins, ih = fr.h - 2 * ins, cw = (iw - g * (n - 1)) / n;
      for (var c = 0; c < n; c++) out.push({ fr: fr, fi: fi, c: c, x: ins + c * (cw + g), y: ins, w: cw, bottom: ins + ih });
    });
    return out;
  }

  L.layoutStory = function (doc, s, frames, envFor) {
    var slots = slotsFor(frames), obsCache = {}, envCache = {};
    var res = { frames: {}, overset: false, end: 0, lines: [], rules: [] };
    frames.forEach(function (fr) { res.frames[fr.id] = { lines: [], rules: [] }; });
    function env(fr) { return envCache[fr.id] || (envCache[fr.id] = (envFor && envFor(fr)) || {}); }
    function obstacles(fr) { return obsCache[fr.id] || (obsCache[fr.id] = WR.obstacles(doc, fr, env(fr).items)); }
    var st = { si: 0, base: null, pend: 0 };
    function save() { return { si: st.si, base: st.base, pend: st.pend, n: res.lines.length, r: res.rules.length }; }
    function restore(sn) { st.si = sn.si; st.base = sn.base; st.pend = sn.pend; res.lines.length = sn.n; res.rules.length = sn.r; }
    function nextSlot() { st.si++; st.base = null; }
    function snapGrid(fr, y) {
      var e = env(fr), step = doc.baseline.step, start = doc.baseline.start;
      if (!step || step <= 0) return y;
      var py = y + fr.y, k = Math.ceil((py - start) / step - 1e-6);
      return start + Math.max(0, k) * step - fr.y;
    }

    // paragraph boundaries
    var bounds = [], a = 0;
    for (var i = 0; i <= s.text.length; i++) if (i === s.text.length || s.text.charCodeAt(i) === 10) { bounds.push([a, i]); a = i + 1; }

    function place(k, opt) {
      var p = bounds[k], info = PP.prepare(doc, s, k, p[0], p[1], slots[st.si] ? env(slots[st.si].fr) : null);
      var E = info.E, ei = 0, li = 0, done = false, firstSi = -1, lines = [], spaced = false, kpBreaks = null, guard = 0;
      var stp = info.st;
      while (!done) {
        if (++guard > 5000) break;
        var slot = slots[st.si];
        if (!slot) { res.overset = true; res.end = lineStart(E, ei, p[0]); return { overset: true }; }
        if (slot.bottom - slot.y <= 0) { nextSlot(); continue; }
        if (opt && opt.breakAt === li && li > 0 && st.base !== null && !opt.broke) { opt.broke = true; nextSlot(); continue; }
        var fr = slot.fr, obs = obstacles(fr), atTop = st.base === null;
        var asc = info.asc, desc = info.desc, lead = info.lead;
        var base = atTop ? slot.y + asc : st.base + lead + (li === 0 && !spaced ? st.pend + (stp.spaceBefore || 0) : 0);
        if (stp.gridAlign) base = snapGrid(fr, base);
        if (base + desc > slot.bottom + 0.01) { nextSlot(); continue; }
        var ind = PP.indents(info, li), cx0 = slot.x + ind.left, cx1 = slot.x + slot.w - ind.right;
        var segs = obs.length ? WR.segments(obs, cx0, cx1, base - asc, base + desc, Math.max(12, info.base.size * 2.5)) : [[cx0, cx1]];
        if (!segs.length) {
          var below = WR.clearBelow(obs, base - asc, base + desc);
          st.base = below !== null ? Math.max(base, below + asc - lead) : base; spaced = true;
          continue;
        }
        if (!kpBreaks && li === 0 && stp.composer === 'kp' && !obs.length) {
          var wFor = function (n) { var id = PP.indents(info, n); return slot.w - id.left - id.right; };
          kpBreaks = B.kp(E, wFor, 2.5) || B.kp(E, wFor, 8) || false;
        }
        var placed = [], ei0 = ei, li0 = li;
        for (var sg = 0; sg < segs.length && !done; sg++) {
          var W = segs[sg][1] - segs[sg][0];
          var b = kpBreaks ? kpBreaks[li] : B.next(E, ei, W);
          if (b === undefined) b = B.next(E, ei, W);
          var ln = B.line(E, ei, b), nx = B.after(E, b);
          for (var t = b + 1; t < nx && t < E.length; t++) E[t].g.forEach(function (g) { g.trail = true; ln.g.push(g); });
          done = nx >= E.length || b >= E.length - 1;
          PP.position(info, ln, segs[sg][0], W, done);
          if (li === 0 && info.drop) info.drop.glyphs.forEach(function (g, gi) { g.x = slot.x + (stp.indentLeft || 0) + info.drop.glyphs.slice(0, gi).reduce(function (acc, x) { return acc + x.w; }, 0); ln.g.unshift(g); });
          var m = PP.lineMetrics(info, ln);
          placed.push({ ln: ln, m: m, x: segs[sg][0], w: W });
          ei = nx; li++;
        }
        // real metrics may differ from the paragraph estimate
        var M0 = placed[0].m;
        var nb = atTop ? slot.y + M0.asc : st.base + M0.lead + (lines.length === 0 && !spaced ? st.pend + (stp.spaceBefore || 0) : 0);
        if (stp.gridAlign) nb = snapGrid(fr, nb);
        if (nb + M0.desc > slot.bottom + 0.01 && !atTop) { // does not fit after all: retry in the next slot
          ei = ei0; li = li0; done = false; nextSlot(); continue;
        }
        spaced = true;
        placed.forEach(function (pl) {
          var g = pl.ln.g, real = g.filter(function (x) { return !x.syn; });
          var line = { y: nb, x: pl.x, w: pl.w, right: pl.ln.right, asc: pl.m.asc, desc: pl.m.desc, lead: pl.m.lead, g: g, k: k, si: st.si, fid: fr.id,
            o0: real.length ? Math.min.apply(null, real.map(function (x) { return x.o; })) : p[0], o1: 0, end: false, hy: pl.ln.hy };
          line.o1 = real.length ? Math.max.apply(null, real.map(function (x) { return x.o; })) + 1 : p[0];
          if (lines.length === 0 && firstSi < 0) firstSi = st.si;
          res.lines.push(line); lines.push(line);
        });
        st.base = nb;
        if (firstSi < 0) firstSi = st.si;
      }
      var last = lines[lines.length - 1];
      if (last) { last.end = true; last.o1 = p[1]; }
      // paragraph rules
      if (lines.length && stp.ruleAbove && stp.ruleAbove.weight) {
        var f0 = lines[0], s0 = slots[f0.si];
        res.rules.push({ si: f0.si, fid: f0.fid, x1: s0.x + (stp.indentLeft || 0), x2: s0.x + s0.w - (stp.indentRight || 0), y: f0.y - f0.asc - (stp.ruleAbove.offset || 0), w: stp.ruleAbove.weight, color: stp.ruleAbove.color || stp.color });
      }
      if (last && stp.ruleBelow && stp.ruleBelow.weight) {
        var sl = slots[last.si];
        res.rules.push({ si: last.si, fid: last.fid, x1: sl.x + (stp.indentLeft || 0), x2: sl.x + sl.w - (stp.indentRight || 0), y: last.y + last.desc + (stp.ruleBelow.offset || 0), w: stp.ruleBelow.weight, color: stp.ruleBelow.color || stp.color });
      }
      st.pend = stp.spaceAfter || 0;
      return { lines: lines, firstSi: firstSi, lastSi: last ? last.si : st.si };
    }
    function lineStart(E, ei, fallback) { for (var q = ei; q < E.length; q++) for (var r = 0; r < E[q].g.length; r++) if (!E[q].g[r].syn) return E[q].g[r].o; return fallback; }
    var infos = [], snaps = [], opts = [], tried = {}, k = 0, loops = 0;
    while (k < bounds.length && loops++ < bounds.length * 4 + 50) {
      snaps[k] = save();
      var atTop = st.base === null;
      var r = place(k, opts[k]);
      if (r.overset) break;
      var stp = PR.styles.paraEffective(doc, s.paras[k] || { ps: '[Basic Paragraph]', ov: {} });
      var per = {}; r.lines.forEach(function (l) { per[l.si] = (per[l.si] || 0) + 1; });
      var slotsUsed = Object.keys(per).map(Number), n = r.lines.length, firstCount = per[r.firstSi] || 0, lastCount = per[r.lastSi] || 0;
      var startTop = atTop || r.firstSi !== snaps[k].si;
      var fix = null;
      if (slotsUsed.length > 1 && !startTop && (stp.keepLines || firstCount < (stp.keepFirst || 1))) fix = { slot: true };
      else if (slotsUsed.length > 1 && lastCount < (stp.keepLast || 1) && n - stp.keepLast >= (stp.keepFirst || 1)) fix = { breakAt: n - (stp.keepLast || 1) };
      if (fix && !tried[k]) { tried[k] = 1; restore(snaps[k]); if (fix.slot) nextSlot(); opts[k] = fix; continue; }
      var prev = infos[k - 1];
      if (prev && prev.keepNext && r.firstSi !== prev.lastSi && !prev.startTop && !tried['n' + k]) {
        tried['n' + k] = 1; restore(snaps[k - 1]); nextSlot(); k--; continue;
      }
      infos[k] = { keepNext: !!stp.keepNext, lastSi: r.lastSi, startTop: startTop };
      k++;
    }
    if (!res.overset) res.end = s.text.length;
    // distribute to frames + vertical alignment
    res.lines.forEach(function (l) { res.frames[l.fid].lines.push(l); });
    res.rules.forEach(function (r) { res.frames[r.fid].rules.push(r); });
    frames.forEach(function (fr) {
      if (!fr.valign || fr.valign === 'top') return;
      var out = res.frames[fr.id], bySlot = {};
      out.lines.forEach(function (l) { (bySlot[l.si] = bySlot[l.si] || []).push(l); });
      Object.keys(bySlot).forEach(function (si) {
        var ls = bySlot[si], slot = slots[si], bottom = Math.max.apply(null, ls.map(function (l) { return l.y + l.desc; }));
        var dy = (slot.bottom - bottom) * (fr.valign === 'center' ? 0.5 : 1);
        if (dy > 0) { ls.forEach(function (l) { l.y += dy; }); out.rules.forEach(function (r) { if (r.si === +si) r.y += dy; }); }
      });
    });
    res.slots = slots;
    void S;
    return res;
  };
})();
