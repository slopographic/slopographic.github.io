/* Slop Press — line breaking on a box/glue/penalty model.
   Glyphs → elements: box {t:'box', w, g:[glyphs]}, glue {t:'glue', w, y (stretch), z (shrink), g:[space]},
   penalty {t:'pen', w (width if broken here, i.e. the hyphen), p, f (flagged), g:[hidden glyph], hy (hyphen glyph)}.
   Two breakers: greedy (first fit, line by line, any widths) and a Knuth–Plass "lite" (total-fit dynamic
   programming without fitness classes) that falls back to greedy when no feasible set of breaks exists. */
(function () {
  'use strict';
  var PR = window.PR;
  var B = PR.breaker = {};
  var INF = Infinity;
  var SPACES = { ' ': 1, '\u2002': 1, '\u2003': 1, '\u2009': 1, '\t': 1 };
  var LETTER = /[A-Za-zÀ-ɏ]/;

  /** Builds elements for one paragraph. opts: { hyphenate, hyphen(glyph) → hyphen glyph, minHyphenWord }. */
  B.elements = function (glyphs, opts) {
    opts = opts || {};
    var E = [], box = null;
    function flush() { if (box) { E.push(box); box = null; } }
    function addBox(gs) { var w = 0; gs.forEach(function (g) { w += g.w; }); E.push({ t: 'box', w: w, g: gs }); }
    function pen(w, p, f, hy, g) { E.push({ t: 'pen', w: w, p: p, f: f, hy: hy || null, g: g ? [g] : [] }); }
    var i = 0;
    while (i < glyphs.length) {
      var g = glyphs[i], c = g.c;
      if (SPACES[c] && !g.drop) {
        flush();
        var fixed = c !== ' ';
        E.push({ t: 'glue', w: g.w, y: fixed ? 0 : g.w * 0.5, z: fixed ? 0 : g.w * 0.25, g: [g] });
        i++; continue;
      }
      if (c === '\u2028') { flush(); pen(0, -INF, 0, null, g); i++; continue; }
      if (c === '\u00AD') { flush(); g.w = 0; g.hidden = true; pen(opts.hyphen ? opts.hyphen(g).w : 0, 50, 1, opts.hyphen ? opts.hyphen(g) : null, g); i++; continue; }
      // a word: run of non-space glyphs
      var j = i, word = [];
      while (j < glyphs.length && !SPACES[glyphs[j].c] && glyphs[j].c !== '\u2028' && glyphs[j].c !== '\u00AD') { word.push(glyphs[j]); j++; }
      flush();
      splitWord(word, E, opts, pen, addBox);
      i = j;
    }
    flush();
    // finishing glue + forced break
    E.push({ t: 'glue', w: 0, y: 1e6, z: 0, g: [], fill: true });
    E.push({ t: 'pen', w: 0, p: -INF, f: 0, g: [], end: true });
    return E;
  };
  function splitWord(word, E, opts, pen, addBox) {
    // break opportunities after hard hyphens / dashes / slashes inside the word
    var parts = [], cur = [];
    word.forEach(function (g, k) {
      cur.push(g);
      if ((g.c === '-' || g.c === '—' || g.c === '–' || g.c === '/') && k > 0 && k < word.length - 1) { parts.push({ gs: cur, after: g.c }); cur = []; }
    });
    if (cur.length) parts.push({ gs: cur, after: null });
    parts.forEach(function (part, pi) {
      var gs = part.gs, pts = [];
      if (opts.hyphenate && PR.hyphen) {
        // hyphenate the alphabetic core of the part (leading/trailing punctuation excluded)
        var a = 0, b = gs.length;
        while (a < b && !LETTER.test(gs[a].c)) a++;
        while (b > a && !LETTER.test(gs[b - 1].c)) b--;
        var core = gs.slice(a, b).map(function (g) { return g.c; }).join('');
        if (/^[A-Za-z]+$/.test(core) && gs.slice(a, b).every(function (g) { return !g.drop && !g.pn; })) pts = PR.hyphen.points(core).map(function (p) { return p + a; });
      }
      var last = 0;
      pts.forEach(function (p) {
        addBox(gs.slice(last, p));
        var hy = opts.hyphen ? opts.hyphen(gs[p - 1]) : null;
        pen(hy ? hy.w : 0, 50, 1, hy);
        last = p;
      });
      addBox(gs.slice(last));
      if (part.after && pi < parts.length - 1) pen(0, part.after === '-' ? 50 : 0, part.after === '-' ? 1 : 0, null);
    });
  }

  /** Index of the first element of a line that starts after break b (skips discardable glue/penalties). */
  B.after = function (E, b) {
    var s = b + 1;
    while (s < E.length && (E[s].t === 'glue' && !E[s].fill || E[s].t === 'pen' && E[s].p !== -INF)) s++;
    return s;
  };

  /** Greedy: the break for a line starting at element i with width W. May split an over-long box. */
  B.next = function (E, i, W) {
    var w = 0, best = -1;
    for (var j = i; j < E.length; j++) {
      var e = E[j];
      if (e.t === 'box') {
        if (w + e.w > W + 0.001) {
          if (best >= 0) return best;
          // nothing fits: split this box at the glyph level (or break before it)
          var room = W - w, k = 0, acc = 0;
          while (k < e.g.length && acc + e.g[k].w <= room + 0.001) { acc += e.g[k].w; k++; }
          if (k === 0 && j === i) k = 1;
          if (k === 0) { E.splice(j, 0, { t: 'pen', w: 0, p: 0, f: 0, g: [] }); return j; }
          if (k >= e.g.length) { w += e.w; continue; }
          var a = e.g.slice(0, k), b = e.g.slice(k), wa = 0;
          a.forEach(function (g) { wa += g.w; });
          E.splice(j, 1, { t: 'box', w: wa, g: a }, { t: 'pen', w: 0, p: 0, f: 0, g: [] }, { t: 'box', w: e.w - wa, g: b });
          return j + 1;
        }
        w += e.w;
      } else if (e.t === 'glue') {
        if (j > i && E[j - 1].t === 'box') best = j;
        w += e.w;
      } else {
        if (e.p === -INF) return j;
        if (e.p < 1000 && w + e.w <= W + 0.001) best = j;
      }
    }
    return E.length - 1;
  };

  /** Knuth–Plass lite. widthAt(lineIndex) → width. Returns an array of break indices, or null. */
  B.kp = function (E, widthAt, tol) {
    var n = E.length, sw = new Float64Array(n + 1), sy = new Float64Array(n + 1), sz = new Float64Array(n + 1);
    for (var k = 0; k < n; k++) {
      var e = E[k], isW = e.t !== 'pen';
      sw[k + 1] = sw[k] + (isW ? e.w : 0); sy[k + 1] = sy[k] + (e.t === 'glue' ? e.y : 0); sz[k + 1] = sz[k] + (e.t === 'glue' ? e.z : 0);
    }
    var active = [{ b: -1, s: B.after(E, -1), line: 0, dem: 0, prev: null, hy: false }];
    var finals = [];
    for (var j = 0; j < n; j++) {
      var el = E[j], isPen = el.t === 'pen';
      if (el.t === 'box' || (el.t === 'glue' && !(j > 0 && E[j - 1].t === 'box')) || (isPen && el.p >= 1000)) continue;
      var best = null, keep = [];
      for (var q = 0; q < active.length; q++) {
        var a = active[q], W = widthAt(a.line);
        var L = sw[j] - sw[a.s] + (isPen ? el.w : 0), Y = sy[j] - sy[a.s], Z = sz[j] - sz[a.s];
        var r = L < W ? (Y > 0 ? (W - L) / Y : 1e9) : L > W ? (Z > 0 ? (W - L) / Z : -1e9) : 0;
        if (!(r < -1 || (isPen && el.p === -INF))) keep.push(a);
        if (r >= -1 && r <= tol) {
          var bad = 100 * Math.pow(Math.abs(r), 3), p = isPen ? el.p : 0;
          var d = (10 + bad) * (10 + bad) + (p >= 0 ? p * p : p > -INF ? -p * p : 0) + (isPen && el.f && a.hy ? 3000 : 0);
          var tot = a.dem + d;
          if (!best || tot < best.dem) best = { b: j, s: B.after(E, j), line: a.line + 1, dem: tot, prev: a, hy: !!(isPen && el.f) };
        }
      }
      active = keep;
      if (best) { active.push(best); if (isPen && el.p === -INF) finals.push(best); }
      if (!active.length) return null;
    }
    if (!finals.length) return null;
    var node = finals[finals.length - 1], out = [];
    while (node && node.b >= 0) { out.unshift(node.b); node = node.prev; }
    return out;
  };

  /** Glyphs of the line E[i..b] (break element b included as hyphen / hidden glyph). */
  B.line = function (E, i, b) {
    var g = [], nat = 0, spaces = 0, stretch = 0;
    for (var k = i; k < b; k++) {
      var e = E[k];
      if (e.t === 'box') { e.g.forEach(function (x) { g.push(x); }); nat += e.w; }
      else if (e.t === 'glue') { e.g.forEach(function (x) { x.space = e.y > 0; g.push(x); }); nat += e.w; if (e.y > 0 && !e.fill) { spaces++; stretch += e.y; } }
      else e.g.forEach(function (x) { x.hidden = true; g.push(x); });
    }
    var br = E[b], forced = br && br.t === 'pen' && br.p === -INF;
    if (br && br.t === 'pen' && br.hy && !forced) { g.push(br.hy); nat += br.hy.w; }
    // trailing spaces never count towards the measure
    while (g.length && g[g.length - 1].space && !g[g.length - 1].hidden) { var t = g[g.length - 1]; nat -= t.w; t.trail = true; break; }
    if (br) br.g.forEach(function (x) { if (br.t === 'glue') { x.trail = true; } else x.hidden = true; g.push(x); });
    return { g: g, nat: nat, spaces: spaces, stretch: stretch, forced: forced, end: !!(br && br.end), hy: !!(br && br.t === 'pen' && br.hy && !forced) };
  };
})();
