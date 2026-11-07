/* Slop Press — paragraph and character styles with basedOn cascades.
   Effective text attributes = [Basic Paragraph] ← paragraph style chain ← paragraph overrides
                               ← character style chain ← character overrides. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, M = PR.model;
  var ST = PR.styles = {};

  ST.PARA_KEYS = ['font', 'fontStyle', 'size', 'leading', 'tracking', 'align', 'color', 'spaceBefore', 'spaceAfter', 'indentLeft', 'indentRight', 'indentFirst',
    'dropLines', 'dropChars', 'ruleAbove', 'ruleBelow', 'keepNext', 'keepLines', 'keepFirst', 'keepLast', 'hyphenate', 'composer', 'gridAlign', 'caps', 'baselineShift', 'underline', 'strike'];
  ST.CHAR_KEYS = ['font', 'fontStyle', 'size', 'tracking', 'color', 'caps', 'baselineShift', 'underline', 'strike'];
  /** Attribute names as shown (read in the current language on every use). */
  ST.LABELS = PR.util.named({}, { font: 'press.core.attr_font', fontStyle: 'press.core.attr_font_style', size: 'press.core.attr_size',
    leading: 'press.core.attr_leading', tracking: 'press.core.attr_tracking', align: 'press.core.attr_align', color: 'press.core.attr_color',
    spaceBefore: 'press.core.attr_space_before', spaceAfter: 'press.core.attr_space_after', indentLeft: 'press.core.attr_indent_left',
    indentRight: 'press.core.attr_indent_right', indentFirst: 'press.core.attr_indent_first', dropLines: 'press.core.attr_drop_lines',
    dropChars: 'press.core.attr_drop_chars', keepNext: 'press.core.attr_keep_next', keepLines: 'press.core.attr_keep_lines',
    keepFirst: 'press.core.attr_keep_first', keepLast: 'press.core.attr_keep_last', hyphenate: 'press.core.attr_hyphenate',
    composer: 'press.core.attr_composer', gridAlign: 'press.core.attr_grid_align', caps: 'press.core.attr_caps',
    baselineShift: 'press.core.attr_baseline_shift', underline: 'press.core.attr_underline', strike: 'press.core.attr_strike',
    ruleAbove: 'press.core.attr_rule_above', ruleBelow: 'press.core.attr_rule_below' });

  var cache = { doc: null, rev: -1, para: {}, char: {}, glyph: {} };
  /** Call after any style edit (the app bumps doc revisions; tests may call it directly). */
  ST.invalidate = function () { cache.para = {}; cache.char = {}; cache.glyph = {}; cache.rev++; };
  function check(doc) { if (cache.doc !== doc) { cache.doc = doc; ST.invalidate(); } }

  function chain(table, name, root) {
    var out = [], seen = {}, n = name;
    while (n && table[n] && !seen[n]) { seen[n] = 1; out.unshift(table[n]); n = table[n].basedOn; }
    if (root && table[root] && out[0] !== table[root]) out.unshift(table[root]);
    return out;
  }
  ST.para = function (doc, name) {
    check(doc);
    if (cache.para[name]) return cache.para[name];
    var r = {};
    chain(doc.styles.para, name || '[Basic Paragraph]', '[Basic Paragraph]').forEach(function (st) { for (var k in st) if (k !== 'basedOn' && k !== 'nextStyle' && st[k] !== undefined) r[k] = st[k]; });
    return (cache.para[name] = r);
  };
  ST.char = function (doc, name) {
    check(doc);
    if (!name || name === '[None]') return {};
    if (cache.char[name]) return cache.char[name];
    var r = {};
    chain(doc.styles.char, name).forEach(function (st) { for (var k in st) if (k !== 'basedOn' && st[k] !== undefined) r[k] = st[k]; });
    return (cache.char[name] = r);
  };
  /** Effective attributes for a paragraph (no character layer). */
  ST.paraEffective = function (doc, para) {
    var base = ST.para(doc, para.ps);
    if (!para.ov || !Object.keys(para.ov).length) return base;
    return U.assign({}, base, para.ov);
  };
  /** Effective attributes for one run in one paragraph (cached, shared object: do not mutate). */
  ST.glyph = function (doc, para, run) {
    check(doc);
    var key = para.ps + '|' + JSON.stringify(para.ov || {}) + '|' + (run.cs || '') + '|' + JSON.stringify(run.ov || {});
    var g = cache.glyph[key];
    if (g) return g;
    g = U.assign({}, ST.paraEffective(doc, para), ST.char(doc, run.cs), run.ov);
    g.leadingPt = g.leading === 'auto' || g.leading == null ? g.size * 1.2 : +g.leading;
    g.key = key;
    return (cache.glyph[key] = g);
  };

  /* ---------- editing styles ---------- */
  function validName(table, name) { return name && !table[name]; }
  ST.createPara = function (doc, name, props, basedOn) {
    if (!validName(doc.styles.para, name)) return false;
    doc.styles.para[name] = U.assign({ basedOn: basedOn || '[Basic Paragraph]' }, props);
    ST.invalidate(); return true;
  };
  ST.createChar = function (doc, name, props, basedOn) {
    if (!validName(doc.styles.char, name)) return false;
    doc.styles.char[name] = U.assign(basedOn ? { basedOn: basedOn } : {}, props);
    ST.invalidate(); return true;
  };
  /** Redefines a style from overrides (e.g. "Redefine Style" after local formatting). */
  ST.update = function (doc, kind, name, patch) {
    var t = doc.styles[kind][name]; if (!t) return;
    for (var k in patch) { if (patch[k] === null) delete t[k]; else t[k] = patch[k]; }
    ST.invalidate();
  };
  /** Renames a style everywhere it is used. */
  ST.rename = function (doc, kind, from, to) {
    var t = doc.styles[kind];
    if (!t[from] || t[to] || !to || /^\[/.test(from)) return false;
    t[to] = t[from]; delete t[from];
    Object.keys(t).forEach(function (k) { if (t[k].basedOn === from) t[k].basedOn = to; if (t[k].nextStyle === from) t[k].nextStyle = to; });
    Object.keys(doc.stories).forEach(function (sid) {
      var s = doc.stories[sid];
      if (kind === 'para') s.paras.forEach(function (p) { if (p.ps === from) p.ps = to; });
      else s.runs.forEach(function (r) { if (r.cs === from) r.cs = to; });
    });
    ST.invalidate(); return true;
  };
  /** Deletes a style; usages fall back to `replacement` (or its parent). */
  ST.remove = function (doc, kind, name, replacement) {
    var t = doc.styles[kind];
    if (!t[name] || /^\[/.test(name)) return false;
    var repl = replacement || t[name].basedOn || (kind === 'para' ? '[Basic Paragraph]' : null);
    Object.keys(t).forEach(function (k) { if (t[k].basedOn === name) t[k].basedOn = t[name].basedOn; });
    delete t[name];
    Object.keys(doc.stories).forEach(function (sid) {
      var s = doc.stories[sid];
      if (kind === 'para') s.paras.forEach(function (p) { if (p.ps === name) p.ps = repl; });
      else { s.runs.forEach(function (r) { if (r.cs === name) r.cs = repl === '[None]' ? null : repl; }); PR.story.normalizeRuns(s); }
    });
    ST.invalidate(); return true;
  };
  /** Style usage counts (for the Styles panel). */
  ST.usage = function (doc) {
    var out = { para: {}, char: {} };
    Object.keys(doc.stories).forEach(function (sid) {
      var s = doc.stories[sid];
      s.paras.forEach(function (p) { out.para[p.ps] = (out.para[p.ps] || 0) + 1; });
      s.runs.forEach(function (r) { if (r.cs) out.char[r.cs] = (out.char[r.cs] || 0) + 1; });
    });
    return out;
  };
  /** Paragraph styles in display order: [Basic Paragraph] first, then alphabetical. */
  ST.names = function (doc, kind) {
    var t = doc.styles[kind], fixed = kind === 'para' ? '[Basic Paragraph]' : '[None]';
    return [fixed].concat(Object.keys(t).filter(function (n) { return n !== fixed; }).sort(function (a, b) { return a.localeCompare(b); }));
  };
  void M;
})();
