/* Slop Press for the assistant: the work behind the AI commands (ui/ai-commands.js), with Press's own core: PR.model (create,
   item), PR.items.add, PR.story (insert, remove, formatChars, formatParas), PR.pages (insertPages, deletePages),
   PR.place.image, PR.history.commit (one undo step), PR.io.openDoc, PR.engine (overset). Lengths are points (1/72 in).
   Loaded on demand (SlopCmd.prepare, ui/actions.js) before ai-commands.js. Exposes PR.aiPress:
     docOptions(a)            M.create options from command arguments (preset or width/height, pages, margins, columns)
     pageIdx(n)               the page index for a 1-based page number (the current page when empty)
     findItem(q)              an item by id or name (or the selection when empty): { item, items, page }
     colour(v)                '#rrggbb', 'cmyk(c,m,y,k)', a swatch name or a colour name → a Press colour
     makeItem(doc, pi, spec)  adds one item from a spec to page pi (pictures from Slop Drive or this site); resolves the item
     note(doc, it)            ' Warning: …' when the item runs past the page or its text does not fit, else '' */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, M = PR.model, I = PR.items, ST = PR.story;
  var X = PR.aiPress = {};
  X.TYPES = ['text', 'image', 'rect', 'ellipse', 'line', 'polygon'];

  X.docOptions = function (a) {
    var p = U.PRESETS.filter(function (x) { return x.id === a.preset; })[0] || U.PRESETS[0];
    var w = a.width || p.w, h = a.height || p.h;
    if (a.landscape && h > w) { var t = w; w = h; h = t; }
    var o = { name: a.name || 'Untitled', w: w, h: h, pages: a.pages || 1, facing: !!a.facing };
    if (a.margin != null) o.margins = { top: a.margin, bottom: a.margin, inside: a.margin, outside: a.margin };
    if (a.columns != null || a.gutter != null) o.columns = { count: a.columns || 1, gutter: a.gutter != null ? a.gutter : 12 };
    return o;
  };
  X.pageIdx = function (n) {
    var d = S.doc, i = n == null ? S.page : n - 1;
    if (i < 0 || i >= d.pages.length) throw new Error('There is no page ' + n + ' (the document has ' + d.pages.length + ')');
    return i;
  };
  X.findItem = function (q) {
    var d = S.doc;
    if (q == null || q === '') {
      var sel = PR.selected()[0];
      if (!sel) throw new Error('Name the item (its id or name from app_state), or select one');
      return M.findItem(d, sel.id);
    }
    var hit = M.findItem(d, String(q));
    if (hit) return hit;
    var s = String(q).toLowerCase(), out = null;
    M.containers(d).forEach(function (c) { c.items.forEach(function (it) { if (!out && String(it.name || '').toLowerCase() === s) out = M.findItem(d, it.id); }); });
    if (!out) throw new Error('No item “' + q + '” in this document');
    return out;
  };
  X.colour = function (v) {
    if (v == null || v === '') return undefined;
    var s = String(v).trim();
    if (/^none$/i.test(s)) return null;
    if (/^cmyk\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*\)$/i.test(s)) return s.toLowerCase().replace(/\s+/g, '');
    var sw = (S.doc.swatches || []).filter(function (x) { return x.name.toLowerCase() === s.toLowerCase(); })[0];
    if (sw) return sw.color;
    var c = window.SlopCmdArgs && SlopCmdArgs.toColor(s);
    if (!c) throw new Error('“' + s + '” is not a colour: use #rrggbb, cmyk(c,m,y,k) or a swatch name');
    return c.slice(0, 7);
  };

  /** Character overrides (font, font_style, size, color, tracking) and paragraph overrides (align, leading) from a spec. */
  X.charOv = function (a) {
    var o = {};
    if (a.font) { if (PR.fonts.list().indexOf(a.font) < 0) throw new Error('No font “' + a.font + '”. Fonts: ' + PR.fonts.list().join(', ')); o.font = a.font; }
    if (a.font_style) o.fontStyle = a.font_style;
    if (a.size) o.size = a.size;
    if (a.color) o.color = X.colour(a.color);
    if (a.tracking != null) o.tracking = a.tracking;
    return o;
  };
  X.paraOv = function (a) {
    var o = {};
    if (a.align) o.align = a.align;
    if (a.leading) o.leading = a.leading;
    return o;
  };
  /** Formats a whole story (or [from, to)) with a paragraph style and overrides. */
  X.formatStory = function (doc, st, a, from, to) {
    var a0 = from || 0, b0 = to == null ? st.text.length : to;
    if (a.style) { if (!doc.styles.para[a.style]) throw new Error('No paragraph style “' + a.style + '”. Styles: ' + Object.keys(doc.styles.para).join(', ')); ST.formatParas(st, a0, b0, { ps: a.style }); }
    if (a.char_style) { if (!doc.styles.char[a.char_style]) throw new Error('No character style “' + a.char_style + '”'); ST.formatChars(st, a0, b0, { cs: a.char_style }); }
    var co = X.charOv(a), po = X.paraOv(a);
    if (Object.keys(co).length && b0 > a0) ST.formatChars(st, a0, b0, co);
    if (Object.keys(po).length) ST.formatParas(st, a0, b0, po);
  };

  function box(doc, spec, w, h) {
    var o = { w: spec.w || spec.width || w, h: spec.h || spec.height || h };
    o.x = spec.x == null ? (doc.size.w - o.w) / 2 : spec.x;
    o.y = spec.y == null ? (doc.size.h - o.h) / 2 : spec.y;
    return o;
  }
  X.makeItem = function (doc, pi, spec) {
    var type = spec.type || (spec.text != null ? 'text' : spec.file || spec.url ? 'image' : 'rect');
    if (X.TYPES.indexOf(type) < 0) throw new Error('Unknown item type “' + type + '” (' + X.TYPES.join(', ') + ')');
    if (spec.style && !doc.styles.para[spec.style]) throw new Error('No paragraph style “' + spec.style + '”. Styles: ' + Object.keys(doc.styles.para).join(', '));
    var items = doc.pages[pi].items, b = box(doc, spec, type === 'text' ? Math.min(360, doc.size.w * 0.8) : 200, type === 'text' ? 120 : type === 'line' ? 0 : 150);
    var extra = { name: String(spec.name || '').slice(0, 80) };
    if (spec.rotation) extra.rot = spec.rotation;
    if (spec.opacity != null) extra.opacity = spec.opacity > 1 ? spec.opacity / 100 : spec.opacity;
    if (type === 'text') { extra.cols = spec.columns || 1; if (spec.valign) extra.valign = spec.valign; }
    if (type === 'polygon' && spec.sides) extra.sides = spec.sides;
    if (spec.radius) extra.radius = spec.radius;
    var it = M.item(type, b.x, b.y, b.w, b.h, extra);
    if (spec.fill !== undefined) it.fill = X.colour(spec.fill);
    if (spec.stroke !== undefined) it.stroke = X.colour(spec.stroke);
    if (spec.stroke_width != null) it.sw = spec.stroke_width;
    if (type !== 'image') {
      I.add(doc, items, it, type === 'text' ? { text: String(spec.text || ''), ps: spec.style && doc.styles.para[spec.style] ? spec.style : 'Body' } : {});
      if (type === 'text') X.formatStory(doc, doc.stories[it.story], spec);
      return Promise.resolve(it);
    }
    if (!window.SlopCmdSources) return Promise.reject(new Error('Pictures cannot be loaded on this page'));
    return SlopCmdSources.picture({ file: spec.file, url: spec.url }).then(function (p) {
      if (!spec.h && !spec.height) { it.h = it.w * p.h / p.w; if (spec.y == null) it.y = (doc.size.h - it.h) / 2; }
      var aid = U.uid('A'); doc.assets[aid] = p.dataUrl; it.asset = aid; it.name = it.name || p.name.replace(/\.[^.]+$/, '');
      I.add(doc, items, it);
      return it;
    });
  };

  X.note = function (doc, it) {
    var out = [], W = doc.size.w, H = doc.size.h;
    var cut = { left: -it.x, right: it.x + it.w - W, top: -it.y, bottom: it.y + it.h - H };
    var sides = Object.keys(cut).filter(function (k) { return cut[k] > 0.5; }).map(function (k) { return Math.round(cut[k]) + ' pt past the ' + k + ' edge'; });
    if (sides.length) out.push('it runs off the ' + Math.round(W) + ' × ' + Math.round(H) + ' pt page (' + sides.join(', ') + ')');
    if (it.type === 'text' && S.doc === doc) {
      var f = M.findItem(doc, it.id), pi = f && f.page ? doc.pages.indexOf(f.page) : null;
      try { if (PR.engine.overset(it, pi)) out.push('its text does not fit the frame (overset): make the frame bigger, the text smaller, or thread another frame'); } catch (e) { /* layout not ready */ }
    }
    return out.length ? ' Warning: ' + out.join('; ') + '.' : '';
  };
  X.describe = function (it) { return it.type + (it.name ? ' “' + it.name + '”' : '') + ' (id ' + it.id + ') at ' + Math.round(it.x) + ', ' + Math.round(it.y) + ', ' + Math.round(it.w) + ' × ' + Math.round(it.h) + ' pt'; };
  void U;
})();
