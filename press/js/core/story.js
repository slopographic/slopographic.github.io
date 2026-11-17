/* Slop Press — story editing: a story is { text, runs:[{n, cs, ov}], paras:[{ps, ov}] }.
   runs cover text exactly (sum of n === text.length); paras has one entry per '\n'-separated paragraph. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;
  var S = PR.story = {};

  function sameAttrs(a, b) { return a.cs === b.cs && JSON.stringify(a.ov || {}) === JSON.stringify(b.ov || {}); }
  S.normalizeRuns = function (s) {
    var out = [];
    s.runs.forEach(function (r) {
      if (r.n <= 0) return;
      var last = out[out.length - 1];
      if (last && sameAttrs(last, r)) last.n += r.n; else out.push({ n: r.n, cs: r.cs || null, ov: U.clone(r.ov || {}) });
    });
    if (!out.length) out.push({ n: 0, cs: (s.runs[0] && s.runs[0].cs) || null, ov: U.clone((s.runs[0] && s.runs[0].ov) || {}) });
    s.runs = out;
  };
  /** Splits runs so a run boundary sits at offset o. Returns the index of the run starting at o. */
  S.splitAt = function (s, o) {
    var pos = 0;
    for (var i = 0; i < s.runs.length; i++) {
      var r = s.runs[i];
      if (o === pos) return i;
      if (o < pos + r.n) {
        var a = { n: o - pos, cs: r.cs, ov: U.clone(r.ov) }, b = { n: r.n - (o - pos), cs: r.cs, ov: U.clone(r.ov) };
        s.runs.splice(i, 1, a, b); return i + 1;
      }
      pos += r.n;
    }
    return s.runs.length;
  };
  /** Run attributes at offset o (the run before the caret, as typing continues it). */
  S.attrsAt = function (s, o) {
    var pos = 0, prev = s.runs[0];
    for (var i = 0; i < s.runs.length; i++) {
      var r = s.runs[i];
      if (o > pos && o <= pos + r.n) return r;
      if (o === 0 && r.n > 0) return r;
      pos += r.n; prev = r;
    }
    return prev || { cs: null, ov: {} };
  };
  /** Paragraph index containing offset o. */
  S.paraAt = function (s, o) { var n = 0; for (var i = 0; i < o && i < s.text.length; i++) if (s.text.charCodeAt(i) === 10) n++; return n; };
  /** [start, end) offsets of paragraph k (end excludes the '\n'). */
  S.paraRange = function (s, k) {
    var start = 0, n = 0;
    for (var i = 0; i < s.text.length && n < k; i++) if (s.text.charCodeAt(i) === 10) { n++; start = i + 1; }
    var end = s.text.indexOf('\n', start); if (end < 0) end = s.text.length;
    return [start, end];
  };

  /** Inserts text at offset o. attrs ({cs, ov}) defaults to the attributes before the caret. */
  S.insert = function (s, o, text, attrs) {
    if (!text) return o;
    text = String(text).replace(/\r\n?/g, '\n');
    o = U.clamp(o, 0, s.text.length);
    var a = attrs || S.attrsAt(s, o), k = S.paraAt(s, o);
    s.text = s.text.slice(0, o) + text + s.text.slice(o);
    var i = S.splitAt(s, o);
    s.runs.splice(i, 0, { n: text.length, cs: a.cs || null, ov: U.clone(a.ov || {}) });
    var nl = text.split('\n').length - 1;
    if (nl) {
      var base = s.paras[k] || { ps: '[Basic Paragraph]', ov: {} }, add = [];
      for (var j = 0; j < nl; j++) add.push({ ps: base.ps, ov: U.clone(base.ov) });
      s.paras.splice.apply(s.paras, [k + 1, 0].concat(add));
    }
    S.normalizeRuns(s);
    return o + text.length;
  };
  /** Deletes [a, b). Paragraphs merged by removing '\n's keep the first paragraph's attributes. */
  S.remove = function (s, a, b) {
    if (b < a) { var t = a; a = b; b = t; }
    a = U.clamp(a, 0, s.text.length); b = U.clamp(b, 0, s.text.length);
    if (a === b) return a;
    var k = S.paraAt(s, a), nl = (s.text.slice(a, b).match(/\n/g) || []).length;
    var keepAttrs = s.text.length && b - a === s.text.length ? S.attrsAt(s, 0) : null;
    s.text = s.text.slice(0, a) + s.text.slice(b);
    var i = S.splitAt(s, a), j = i;
    // remove run lengths covering b - a characters starting at run i
    var left = b - a;
    while (left > 0 && j < s.runs.length) { var take = Math.min(left, s.runs[j].n); s.runs[j].n -= take; left -= take; if (left > 0) j++; }
    if (nl) s.paras.splice(k + 1, nl);
    if (keepAttrs) s.runs = [{ n: 0, cs: keepAttrs.cs, ov: U.clone(keepAttrs.ov) }];
    S.normalizeRuns(s);
    return a;
  };
  /** Returns a story fragment for [a, b) (used for copy/paste with styles). */
  S.slice = function (s, a, b) {
    var out = { text: s.text.slice(a, b), runs: [], paras: [] }, pos = 0;
    s.runs.forEach(function (r) {
      var r0 = Math.max(a, pos), r1 = Math.min(b, pos + r.n);
      if (r1 > r0) out.runs.push({ n: r1 - r0, cs: r.cs, ov: U.clone(r.ov) });
      pos += r.n;
    });
    var k0 = S.paraAt(s, a), k1 = S.paraAt(s, b);
    for (var k = k0; k <= k1; k++) out.paras.push(U.clone(s.paras[k]));
    return out;
  };
  /** Pastes a fragment from slice() at o, keeping its character and paragraph attributes. */
  S.insertFragment = function (s, o, frag) {
    var pos = o, off = 0;
    frag.runs.forEach(function (r) { pos = S.insert(s, pos, frag.text.slice(off, off + r.n), r); off += r.n; });
    var k = S.paraAt(s, o);
    for (var j = 1; j < frag.paras.length; j++) if (s.paras[k + j]) s.paras[k + j] = U.clone(frag.paras[j]);
    return pos;
  };
  /** Appends another story (threading). */
  S.appendStory = function (s, other) {
    var o = s.text.length;
    if (s.text.length) { S.insert(s, o, '\n'); o++; }
    var firstPara = s.paras.length - 1;
    S.insertFragment(s, o, { text: other.text, runs: other.runs, paras: other.paras });
    if (other.paras[0]) s.paras[firstPara] = U.clone(other.paras[0]);
  };

  /* ---------- formatting ---------- */
  /** Applies character attributes to [a, b): patch.cs sets the character style; other keys go into overrides
      (null removes an override). With clearOv, overrides are cleared first (applying a style "cleanly"). */
  S.formatChars = function (s, a, b, patch, clearOv) {
    if (b < a) { var t = a; a = b; b = t; }
    if (a === b) return;
    var i = S.splitAt(s, a), j = S.splitAt(s, b);
    for (var k = i; k < j; k++) {
      var r = s.runs[k];
      if (clearOv) r.ov = {};
      for (var key in patch) {
        if (key === 'cs') r.cs = patch.cs;
        else if (patch[key] === null) delete r.ov[key];
        else r.ov[key] = patch[key];
      }
    }
    S.normalizeRuns(s);
  };
  /** Applies paragraph attributes to every paragraph touched by [a, b]. patch.ps sets the style. */
  S.formatParas = function (s, a, b, patch, clearOv) {
    var k0 = S.paraAt(s, Math.min(a, b)), k1 = S.paraAt(s, Math.max(a, b));
    for (var k = k0; k <= k1; k++) {
      var p = s.paras[k]; if (!p) continue;
      if (clearOv) p.ov = {};
      for (var key in patch) {
        if (key === 'ps') p.ps = patch.ps;
        else if (patch[key] === null) delete p.ov[key];
        else p.ov[key] = patch[key];
      }
    }
  };
  /** Word boundaries around offset o: [start, end). */
  S.wordAt = function (s, o) {
    var re = /[\wÀ-ɏͰ-ϿЀ-ӿ'’-]/, a = o, b = o, t = s.text;
    while (a > 0 && re.test(t[a - 1])) a--;
    while (b < t.length && re.test(t[b])) b++;
    if (a === b && b < t.length) b++;
    return [a, b];
  };
  S.plain = function (s) { return s.text.split(M.PAGE_NUM).join('#'); };
})();
