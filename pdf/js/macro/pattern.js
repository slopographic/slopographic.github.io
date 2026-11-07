/* Slop PDF macros — pure helpers: page lists, filename tokens, and filename patterns for automatic rules.
   No DOM and no PDF code, so node can test it. Classic script; exposes window.SlopPdfMacro. */
(function () {
  'use strict';
  var M = window.SlopPdfMacro = window.SlopPdfMacro || {};
  /** The chosen language's text for a key (SlopI18n), else the English given: a string, or [one, other] for vars.n
   *  (node tests and pages without the tables). */
  function tr(k, en, v) {
    var I = window.SlopI18n;
    if (I && I.has && I.has(k)) return I.t(k, v);
    if (Array.isArray(en)) en = v && v.n === 1 ? en[0] : en[1];
    return String(en).replace(/\{(\w+)\}/g, function (m, n) { return v && n in v ? String(v[n]) : m; });
  }

  /** Parses a page list such as "1-3, 5, last" (1-based) into sorted 0-based indices.
   *  "" or "all" means every page. Keywords: all, odd, even, last. Throws a readable Error for bad
   *  syntax, or for a page outside 1..n. n = Infinity skips the range check (syntax-only check). */
  M.parsePages = function (spec, n) {
    var s = String(spec == null ? '' : spec).trim().toLowerCase();
    var total = n == null ? Infinity : n, out = new Set();
    var finite = isFinite(total);
    function addAll(test) { for (var i = 0; finite && i < total; i++) if (!test || test(i + 1)) out.add(i); }
    if (!s) s = 'all';
    s.split(',').forEach(function (raw) {
      var p = raw.trim();
      if (!p) return;
      if (p === 'all') return addAll();
      if (p === 'odd') return addAll(function (k) { return k % 2 === 1; });
      if (p === 'even') return addAll(function (k) { return k % 2 === 0; });
      if (p === 'last') { if (finite && total > 0) out.add(total - 1); return; }
      var m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
      if (!m) throw new Error(tr('pdf.macro.err_page_word', '“{p}” is not a page number. Use numbers such as 2 or 1-3, or the words all, odd, even, last.', { p: p }));
      var a = +m[1], b = m[2] != null ? +m[2] : a;
      if (a > b) { var t = a; a = b; b = t; }
      for (var k = a; k <= b; k++) {
        if (finite && (k < 1 || k > total)) throw new Error(tr('pdf.macro.err_page_range', ['Page {k} is not in this file, which has {n} page.', 'Page {k} is not in this file, which has {n} pages.'], { k: String(k), n: total }));
        out.add(k - 1);
      }
    });
    return Array.from(out).sort(function (x, y) { return x - y; });
  };

  /** Replaces {page}, {pages}, {date} and {filename} in text. Unknown tokens are left as they are. */
  M.expandTokens = function (text, info) {
    info = info || {};
    return String(text == null ? '' : text).replace(/\{(page|pages|date|filename)\}/g, function (m, k) {
      return info[k] == null ? m : String(info[k]);
    });
  };

  /** Local calendar date as YYYY-MM-DD. */
  M.isoDate = function (d) {
    d = d instanceof Date ? d : new Date(d || Date.now());
    var p = function (v) { return (v < 10 ? '0' : '') + v; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  /** Compiles a filename pattern. "/regex/flags" is a regular expression (case-insensitive unless flags say
   *  otherwise); anything else is a glob where * is any run of characters and ? is one character. Both must
   *  match the whole file name. Returns null for an empty pattern and throws for an invalid regular expression. */
  M.compilePattern = function (pattern) {
    var p = String(pattern == null ? '' : pattern).trim();
    if (!p) return null;
    var m = /^\/(.+)\/([a-z]*)$/i.exec(p);
    if (m) {
      var flags = m[2].replace(/[gy]/g, '');
      if (flags.indexOf('i') < 0) flags += 'i';
      return new RegExp('^(?:' + m[1] + ')$', flags);
    }
    var src = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + src + '$', 'i');
  };

  /** True when the file name matches the pattern. An empty or invalid pattern matches nothing. */
  M.matchName = function (pattern, name) {
    var re;
    try { re = M.compilePattern(pattern); } catch (e) { return false; }
    return !!re && re.test(String(name == null ? '' : name));
  };

  /** The first macro whose automatic rule (auto is 'ask' or 'silent') matches the file name, or null. */
  M.findRule = function (macros, name) {
    var list = Array.isArray(macros) ? macros : [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m && (m.auto === 'ask' || m.auto === 'silent') && M.matchName(m.pattern, name)) return m;
    }
    return null;
  };
  /** Every macro whose automatic rule matches the file name, in list order. */
  M.findRules = function (macros, name) {
    return (Array.isArray(macros) ? macros : []).filter(function (m) {
      return m && (m.auto === 'ask' || m.auto === 'silent') && M.matchName(m.pattern, name);
    });
  };
})();
