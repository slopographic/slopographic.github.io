/* Slop PDF — redaction search: finds text (plain, regex or presets such as e-mails, phone numbers,
   card numbers and SSN-like IDs) on every page with pdf.js text positions, and turns each match into
   page-space boxes (unrotated user space from the top-left of the visible box, like annotations). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine;
  var R = SP.redact = SP.redact || {};

  function luhn(d) {
    var s = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; }
    return s % 10 === 0;
  }
  function digits(s) { return s.replace(/\D/g, ''); }
  /** Presets: id → {label, re, ok(match)}. The label is read when the panel renders (the chosen language). */
  R.PRESETS = {
    email: { get label() { return U.t('pdf.redact.preset_email'); }, re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
    phone: { get label() { return U.t('pdf.redact.preset_phone'); }, re: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}/g,
      ok: function (m) { var n = digits(m).length; return n >= 7 && n <= 15 && !/^\d{4}-\d{2}-\d{2}$/.test(m.trim()); } },
    card: { get label() { return U.t('pdf.redact.preset_card'); }, re: /\b\d(?:[ -]?\d){12,18}\b/g, ok: function (m) { var d = digits(m); return d.length >= 13 && d.length <= 19 && luhn(d); } },
    ssn: { get label() { return U.t('pdf.redact.preset_ssn'); }, re: /\b(?:\d{3}-\d{2}-\d{4}|(?:19|20)?\d{6}[-+]\d{4})\b/g }
  };
  R.luhn = luhn;

  /** Builds a matcher list from {text, regex, matchCase, presets:[ids]}. Throws on a bad regex. */
  R.matchers = function (q) {
    var out = [];
    if (q.text) {
      var src = q.regex ? q.text : q.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out.push({ kind: q.regex ? 'regex' : 'text', re: new RegExp(src, 'g' + (q.matchCase ? '' : 'i') + 'u') });
    }
    (q.presets || []).forEach(function (id) { var p = R.PRESETS[id]; if (p) out.push({ kind: id, re: new RegExp(p.re.source, p.re.flags), ok: p.ok }); });
    return out;
  };

  /** All match ranges [s, e, kind] in a string, without overlaps (earlier/longer wins). */
  R.findIn = function (str, matchers) {
    var hits = [];
    matchers.forEach(function (m) {
      m.re.lastIndex = 0;
      var r;
      while ((r = m.re.exec(str))) {
        if (!r[0].length) { m.re.lastIndex++; continue; }
        if (!m.ok || m.ok(r[0])) hits.push([r.index, r.index + r[0].length, m.kind]);
      }
    });
    hits.sort(function (a, b) { return a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]); });
    var out = [], end = -1;
    hits.forEach(function (h) { if (h[0] >= end) { out.push(h); end = h[1]; } });
    return out;
  };

  var mctx = null;
  function measure(str, family) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = '100px ' + (family || 'sans-serif');
    return mctx.measureText(str).width;
  }
  /** Fraction (0..1) of an item's width before character k, by measured glyph widths. */
  function frac(item, k, family) {
    var n = item.str.length; if (!n) return 0;
    if (k <= 0) return 0; if (k >= n) return 1;
    var all = measure(item.str, family);
    return all > 0 ? measure(item.str.slice(0, k), family) / all : k / n;
  }
  /** Page-space box {x, y, w, h} covering characters [a, b) of a pdf.js text item. */
  R.itemBox = function (item, a, b, view, family) {
    var t = item.transform, sx = Math.hypot(t[0], t[1]) || 1, fs = Math.hypot(t[2], t[3]) || item.height || 10;
    var dx = t[0] / sx, dy = t[1] / sx, ux = t[2] / fs, uy = t[3] / fs;
    var w = item.width || 0, f0 = frac(item, a, family), f1 = frac(item, b, family);
    var pad = fs * 0.12, x0 = w * f0 - pad, x1 = w * f1 + pad, lo = -fs * 0.28, hi = fs * 0.98;
    var xs = [], ys = [];
    [[x0, lo], [x0, hi], [x1, lo], [x1, hi]].forEach(function (c) { xs.push(t[4] + dx * c[0] + ux * c[1]); ys.push(t[5] + dy * c[0] + uy * c[1]); });
    var minx = Math.min.apply(null, xs), maxx = Math.max.apply(null, xs), miny = Math.min.apply(null, ys), maxy = Math.max.apply(null, ys);
    return { x: minx - view[0], y: view[3] - maxy, w: maxx - minx, h: maxy - miny };
  };

  /** Searches one pdf.js page; returns [{text, kind, boxes:[{x,y,w,h}]}]. */
  R.searchPage = async function (pg, matchers, view) {
    var tc = await pg.getTextContent(), str = '', spans = [];
    tc.items.forEach(function (it) {
      if (typeof it.str !== 'string') return;
      spans.push({ s: str.length, it: it });
      str += it.str;
      if (it.hasEOL) str += '\n';
    });
    return R.findIn(str, matchers).map(function (h) {
      var boxes = [];
      spans.forEach(function (sp) {
        var a = Math.max(h[0], sp.s), b = Math.min(h[1], sp.s + sp.it.str.length);
        if (b <= a) return;
        var st = tc.styles && tc.styles[sp.it.fontName];
        boxes.push(R.itemBox(sp.it, a - sp.s, b - sp.s, view, st && st.fontFamily));
      });
      return { text: str.slice(h[0], h[1]), kind: h[2], boxes: boxes };
    }).filter(function (m) { return m.boxes.length; });
  };

  /** Searches every page of the document. q as in R.matchers. Resolves [{pid, index, text, kind, boxes}]. */
  R.search = async function (q, onProgress) {
    var matchers = R.matchers(q), out = [], pages = E.state.pages;
    if (!matchers.length) return out;
    for (var k = 0; k < pages.length; k++) {
      var p = pages[k], f = E.fileOfPage(p);
      if (!f || p.redacted) continue;
      var pg = await f.doc.getPage(p.i + 1);
      var found = await R.searchPage(pg, matchers, f.info[p.i].view);
      found.forEach(function (m) { out.push(Object.assign({ pid: p.id, index: k }, m)); });
      if (onProgress) onProgress((k + 1) / pages.length);
    }
    return out;
  };

  /** A redaction mark (box annotation) for a page-space rect. */
  R.mark = function (r, label) {
    return { id: U.uid('a'), type: 'redact', cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: Math.max(2, r.w), h: Math.max(2, r.h), rot: 0, label: label || '' };
  };
  /** Adds marks for search matches as one undo step. */
  R.markMatches = function (matches) {
    if (!matches.length) return 0;
    var n = 0;
    E.commit(U.t('pdf.redact.mark_cmd'), function (st) {
      matches.forEach(function (m) {
        var p = st.pages.filter(function (x) { return x.id === m.pid; })[0]; if (!p) return;
        m.boxes.forEach(function (b) { p.annots.push(R.mark(b, m.text)); n++; });
      });
    });
    return n;
  };
  /** Pending (not yet applied) marks: [{p, index, a}]. */
  R.pending = function (pages) {
    var out = [];
    (pages || E.state.pages).forEach(function (p, i) { (p.annots || []).forEach(function (a) { if (a.type === 'redact') out.push({ p: p, index: i, a: a }); }); });
    return out;
  };
})();
