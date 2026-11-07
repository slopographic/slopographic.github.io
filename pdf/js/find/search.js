/* Slop PDF find — the search over the whole document. Matches come from the same locator Replace text uses
   (macro/text.js: pdf.js text positions joined per page), so the count, the highlights and the replacements agree.
   Each match carries page boxes for the highlights (SP.redact.itemBox, page points from the top-left of the view box)
   and whether its position is exact (precise). Also the step and label helpers the find bar uses. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, E = SP.engine, M = window.SlopPdfMacro;
  var F = window.SlopPdfFind = window.SlopPdfFind || {};
  var T = M.text;
  /** A word from the tables (pdf/i18n/en/find.js), English when SlopI18n is not on the page (node tests). */
  function tr(key, en, vars) {
    var I = window.SlopI18n;
    if (I && (!I.has || I.has(key))) return I.t(key, vars);
    return en.replace(/\{(\w+)\}/g, function (m, k) { return vars && k in vars ? String(vars[k]) : m; });
  }

  /** Next (dir 1) or previous (dir -1) index with wrap-around. -1 when there is nothing to step through. */
  F.step = function (cur, total, dir) {
    if (!total) return -1;
    if (cur < 0 || cur >= total) return dir > 0 ? 0 : total - 1;
    return (cur + dir + total) % total;
  };
  /** The count as the bar shows it: "3 of 12", "No results", or "Searching…". */
  F.label = function (cur, total, busy) {
    if (busy) return tr('pdf.find.searching', 'Searching…');
    if (!total) return tr('pdf.find.no_results', 'No results');
    return tr('pdf.find.count', '{cur} of {total}', { cur: String(cur + 1), total: String(total) });
  };
  /** The text around a match for the result list: the match itself, with up to 30 characters before and 40 after. */
  F.context = function (text, start, end) {
    var a = Math.max(0, start - 30), b = Math.min(text.length, end + 40);
    var before = text.slice(a, start).replace(/\s+/g, ' ').replace(/^\s+/, '');
    var after = text.slice(end, b).replace(/\s+/g, ' ').replace(/\s+$/, '');
    return { before: (a > 0 ? '…' : '') + before, match: text.slice(start, end), after: after + (b < text.length ? '…' : '') };
  };
  /** Page boxes of one match: one per run of characters that come from the same text item. */
  F.boxes = function (ix, m, view) {
    var groups = [], cur = null;
    for (var k = m.index; k < m.index + m.text.length; k++) {
      var o = ix.owner[k];
      if (o < 0) continue;
      if (!cur || cur.o !== o) { cur = { o: o, a: ix.off[k], b: ix.off[k] + 1 }; groups.push(cur); }
      else cur.b = ix.off[k] + 1;
    }
    return groups.map(function (g) {
      var it = ix.items[g.o], st = ix.styles[it.fontName];
      return SP.redact.itemBox(it, g.a, g.b, view, st && st.fontFamily);
    });
  };
  /** Matches in one page's text content. measure(family, str, size) as macro/text.js uses it. */
  F.matchesIn = function (tc, query, opts, measure, view) {
    var ix = T.index(tc);
    return T.find(ix, query, opts, measure).map(function (m) {
      return { index: m.index, text: m.text, precise: m.precise, segs: m.segs, boxes: view ? F.boxes(ix, m, view) : [], ctx: F.context(ix.text, m.index, m.index + m.text.length) };
    });
  };

  /* ------------------------------------------------------------ document */
  var textCache = new Map(); // file page → Promise of { tc, view }
  F.forgetText = function () { textCache.clear(); };
  function textOf(p) {
    var f = E.fileOfPage(p); if (!f) return Promise.resolve(null);
    var key = f.id + ':' + p.i;
    if (!textCache.has(key)) {
      var pr = f.doc.getPage(p.i + 1).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { return { tc: tc, view: f.info[p.i].view }; });
      pr.catch(function () { textCache.delete(key); });
      textCache.set(key, pr);
    }
    return textCache.get(key);
  }
  function measure(fam, str, size) { return E.measure(str, fam, size); }
  /** Every match in the document, in page order. Each: { pid, page, index, text, precise, boxes, ctx }. */
  F.search = async function (query, opts) {
    var out = [];
    if (!query) return out;
    var pages = E.state.pages;
    for (var k = 0; k < pages.length; k++) {
      var p = pages[k];
      if (p.blank || p.redacted) continue;
      var t = await textOf(p); if (!t) continue;
      F.matchesIn(t.tc, query, opts, measure, t.view).forEach(function (m) {
        m.pid = p.id; m.page = k + 1; out.push(m);
      });
    }
    return out;
  };
})();
