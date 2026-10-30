/* Slop Press — document model: documents, layers, masters, pages, items and stories.
   A document is plain JSON (it is what .slpress files and autosave store):
   { version, name, unit, size:{w,h}, facing, startPage, margins:{top,bottom,inside,outside},
     columns:{count,gutter}, bleed:{top,bottom,inside,outside}, slug:{…}, baseline:{start,step,show},
     layers:[{id,name,color,visible,locked}], masters:[{id,prefix,name,basedOn,pages:[{items,guides}]}],
     pages:[{id,master,items,guides}], stories:{id:{text,runs,paras}}, styles:{para,char},
     swatches:[{name,color}], assets:{id:dataURL}, fonts:[{family,style,asset}] }  — all lengths in points. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util;
  var M = PR.model = {};

  M.PAGE_NUM = '\uE000'; // special character: current page number marker
  M.LAYER_COLORS = ['#4f8cff', '#ff4f6e', '#3fcf8e', '#f5a623', '#a970ff', '#00c2d1', '#ff7ac6'];

  M.defaultParaStyles = function () {
    return {
      '[Basic Paragraph]': { font: 'Liberation Sans', fontStyle: 'Regular', size: 10, leading: 'auto', tracking: 0, align: 'left', color: '#1a1a1a',
        spaceBefore: 0, spaceAfter: 0, indentLeft: 0, indentRight: 0, indentFirst: 0, dropLines: 0, dropChars: 1,
        ruleAbove: null, ruleBelow: null, keepNext: false, keepLines: false, keepFirst: 1, keepLast: 1,
        hyphenate: true, composer: 'kp', gridAlign: false, caps: 'normal', baselineShift: 0, underline: false, strike: false },
      'Body': { basedOn: '[Basic Paragraph]', font: 'Times', size: 10.5, leading: 14, align: 'justify', indentFirst: 12 },
      'Body First': { basedOn: 'Body', indentFirst: 0 },
      'Heading 1': { basedOn: '[Basic Paragraph]', font: 'Liberation Sans', fontStyle: 'Bold', size: 28, leading: 32, tracking: -10, spaceAfter: 10, keepNext: true, hyphenate: false, nextStyle: 'Body First' },
      'Heading 2': { basedOn: 'Heading 1', size: 16, leading: 20, tracking: 0, spaceBefore: 12, spaceAfter: 6 },
      'Caption': { basedOn: '[Basic Paragraph]', fontStyle: 'Italic', size: 8, leading: 10, color: '#555555' },
      'Pull Quote': { basedOn: '[Basic Paragraph]', font: 'Georgia', fontStyle: 'Italic', size: 18, leading: 24, align: 'center',
        ruleAbove: { weight: 1.5, color: '#1a1a1a', offset: 10 }, ruleBelow: { weight: 1.5, color: '#1a1a1a', offset: 10 }, spaceBefore: 12, spaceAfter: 12, hyphenate: false },
      'Folio': { basedOn: '[Basic Paragraph]', size: 8, leading: 10, tracking: 40 }
    };
  };
  M.defaultCharStyles = function () {
    return {
      '[None]': {},
      'Emphasis': { fontStyle: 'Italic' },
      'Strong': { fontStyle: 'Bold' },
      'Small Caps': { caps: 'allcaps', size: 8, tracking: 60 },
      'Accent': { color: '#e0245e' }
    };
  };
  M.defaultSwatches = function () {
    return [{ name: '[Paper]', color: '#ffffff' }, { name: '[Black]', color: 'cmyk(0,0,0,100)' }, { name: 'Ink', color: '#1a1a1a' },   // i18n-ignore: swatch names in the document
      { name: 'Slop Lime', color: '#d4ff3a' }, { name: 'Magenta', color: 'cmyk(0,100,0,0)' }, { name: 'Cyan', color: 'cmyk(100,0,0,0)' },   // i18n-ignore: swatch names in the document
      { name: 'Yellow', color: 'cmyk(0,0,100,0)' }, { name: 'Red', color: '#e0245e' }, { name: 'Blue', color: '#2f6fed' },   // i18n-ignore: swatch names in the document
      { name: 'Sea', color: '#0f8a8a' }, { name: 'Sand', color: '#efe6d2' }, { name: 'Grey 20', color: '#cccccc' }];   // i18n-ignore: swatch names in the document
  };

  /* ---------- factories ---------- */
  M.layer = function (name, i) { return { id: U.uid('L'), name: name || 'Layer 1', color: M.LAYER_COLORS[(i || 0) % M.LAYER_COLORS.length], visible: true, locked: false }; };
  M.master = function (doc, prefix, name) {
    var pages = doc.facing ? [{ items: [], guides: [] }, { items: [], guides: [] }] : [{ items: [], guides: [] }];
    return { id: U.uid('M'), prefix: prefix || 'A', name: name || 'Master', basedOn: null, pages: pages };
  };
  M.page = function (masterId) { return { id: U.uid('P'), master: masterId === undefined ? null : masterId, items: [], guides: [] }; };
  M.story = function (text, ps) {
    text = text || '';
    var n = text.split('\n').length, paras = [];
    for (var i = 0; i < n; i++) paras.push({ ps: ps || '[Basic Paragraph]', ov: {} });
    return { id: U.uid('S'), text: text, runs: [{ n: text.length, cs: null, ov: {} }], paras: paras };
  };
  /** Item factory. type: text | image | rect | ellipse | line | polygon. */
  M.item = function (type, x, y, w, h, extra) {
    var it = { id: U.uid('F'), type: type, layer: null, x: x, y: y, w: w, h: h, rot: 0, opacity: 1,
      fill: null, stroke: null, sw: 1, radius: 0, wrap: { type: 'none', off: 6 }, locked: false, name: '' };
    if (type === 'rect' || type === 'ellipse' || type === 'polygon') { it.fill = '#cccccc'; }
    if (type === 'line') { it.stroke = '#1a1a1a'; it.dir = 0; }
    if (type === 'polygon') { it.sides = 6; it.inset = 0; }
    if (type === 'image') { it.asset = null; it.fit = 'fill'; it.sc = 1; it.ox = 0; it.oy = 0; }
    if (type === 'text') { it.story = null; it.next = null; it.prev = null; it.cols = 1; it.gutter = 12; it.inset = 0; it.valign = 'top'; }
    return U.assign(it, extra);
  };

  /** A new blank document. opts: { name, w, h, unit, facing, pages, margins, columns, bleed } */
  M.create = function (o) {
    o = o || {};
    var mm = U.UNITS.mm;
    var doc = {
      version: 1, name: o.name || 'Untitled', unit: o.unit || 'mm',
      size: { w: o.w || 595.276, h: o.h || 841.89 }, facing: o.facing !== false, startPage: o.startPage || 1,
      margins: U.assign({ top: 15 * mm, bottom: 18 * mm, inside: 15 * mm, outside: 15 * mm }, o.margins),
      columns: U.assign({ count: 2, gutter: 5 * mm }, o.columns),
      bleed: U.assign({ top: 3 * mm, bottom: 3 * mm, inside: 3 * mm, outside: 3 * mm }, o.bleed),
      slug: U.assign({ top: 0, bottom: 0, inside: 0, outside: 0 }, o.slug),
      baseline: { start: 15 * mm, step: 14, show: false },
      layers: [M.layer('Layer 1', 0)],
      masters: [], pages: [], stories: {},
      styles: { para: M.defaultParaStyles(), char: M.defaultCharStyles() },
      swatches: M.defaultSwatches(), assets: {}, fonts: []
    };
    var a = M.master(doc, 'A', 'Master');
    doc.masters.push(a);
    var n = Math.max(1, o.pages || 1);
    for (var i = 0; i < n; i++) doc.pages.push(M.page(a.id));
    return doc;
  };

  /* ---------- lookup ---------- */
  M.findMaster = function (doc, id) { for (var i = 0; i < doc.masters.length; i++) if (doc.masters[i].id === id) return doc.masters[i]; return null; };
  M.findPage = function (doc, id) { for (var i = 0; i < doc.pages.length; i++) if (doc.pages[i].id === id) return doc.pages[i]; return null; };
  M.findLayer = function (doc, id) { for (var i = 0; i < doc.layers.length; i++) if (doc.layers[i].id === id) return doc.layers[i]; return doc.layers[0]; };
  /** Every container of items: pages, then each master page. Returns [{ items, page, master, side }]. */
  M.containers = function (doc) {
    var out = doc.pages.map(function (p, i) { return { items: p.items, page: p, index: i }; });
    doc.masters.forEach(function (m) { m.pages.forEach(function (mp, s) { out.push({ items: mp.items, master: m, side: s, mp: mp }); }); });
    return out;
  };
  /** Finds an item anywhere: { item, items (its array), page|master, index }. */
  M.findItem = function (doc, id) {
    var cs = M.containers(doc);
    for (var c = 0; c < cs.length; c++) {
      var arr = cs[c].items;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return { item: arr[i], items: arr, page: cs[c].page || null, master: cs[c].master || null, side: cs[c].side, index: i };
    }
    return null;
  };
  /** Frames of a story in thread order. */
  M.storyFrames = function (doc, sid) {
    var head = null, all = [];
    M.containers(doc).forEach(function (c) { c.items.forEach(function (it) { if (it.type === 'text' && it.story === sid) { all.push(it); if (!it.prev) head = head || it; } }); });
    if (!head) return all;
    var out = [], seen = {}, f = head;
    while (f && !seen[f.id]) { seen[f.id] = 1; out.push(f); f = f.next ? M.findItem(doc, f.next) && M.findItem(doc, f.next).item : null; }
    return out;
  };

  /* ---------- migration / validation ---------- */
  /** Normalises a loaded document (old or partial JSON) so the rest of the app can rely on its shape. */
  M.normalize = function (doc) {
    var d = M.create({ pages: 1 });
    ['version', 'name', 'unit', 'facing', 'startPage'].forEach(function (k) { if (doc[k] !== undefined) d[k] = doc[k]; });
    ['size', 'margins', 'columns', 'bleed', 'slug', 'baseline'].forEach(function (k) { U.assign(d[k], doc[k]); });
    if (doc.layers && doc.layers.length) d.layers = doc.layers;
    if (doc.masters) d.masters = doc.masters;
    if (doc.pages && doc.pages.length) d.pages = doc.pages;
    d.stories = doc.stories || {};
    if (doc.styles) { d.styles.para = doc.styles.para || d.styles.para; d.styles.char = doc.styles.char || d.styles.char; }
    if (!d.styles.para['[Basic Paragraph]']) d.styles.para['[Basic Paragraph]'] = M.defaultParaStyles()['[Basic Paragraph]'];
    if (!d.styles.char['[None]']) d.styles.char['[None]'] = {};
    d.swatches = doc.swatches || d.swatches; d.assets = doc.assets || {}; d.fonts = doc.fonts || [];
    var lid = d.layers[0].id;
    M.containers(d).forEach(function (c) { c.items.forEach(function (it) { if (!it.layer || !d.layers.some(function (l) { return l.id === it.layer; })) it.layer = lid; if (!it.wrap) it.wrap = { type: 'none', off: 6 }; }); c.page && (c.page.guides = c.page.guides || []); });
    d.pages.forEach(function (p) { p.guides = p.guides || []; p.items = p.items || []; });
    Object.keys(d.stories).forEach(function (k) { M.fixStory(d.stories[k]); });
    return d;
  };
  /** Makes runs cover the text exactly and paragraphs match its line breaks. */
  M.fixStory = function (s) {
    s.text = s.text || ''; s.runs = (s.runs || []).filter(function (r) { return r.n > 0; });
    var total = s.runs.reduce(function (a, r) { return a + r.n; }, 0), L = s.text.length;
    if (!s.runs.length) s.runs = [{ n: L, cs: null, ov: {} }];
    else if (total < L) s.runs[s.runs.length - 1].n += L - total;
    else if (total > L) { var over = total - L; for (var i = s.runs.length - 1; i >= 0 && over > 0; i--) { var t = Math.min(over, s.runs[i].n); s.runs[i].n -= t; over -= t; } s.runs = s.runs.filter(function (r) { return r.n > 0; }); if (!s.runs.length) s.runs = [{ n: 0, cs: null, ov: {} }]; }
    s.runs.forEach(function (r) { r.ov = r.ov || {}; if (r.cs === undefined) r.cs = null; });
    var np = s.text.split('\n').length; s.paras = s.paras || [];
    while (s.paras.length < np) s.paras.push(U.clone(s.paras[s.paras.length - 1] || { ps: '[Basic Paragraph]', ov: {} }));
    s.paras.length = np;
    s.paras.forEach(function (p) { p.ov = p.ov || {}; p.ps = p.ps || '[Basic Paragraph]'; });
    return s;
  };
})();
