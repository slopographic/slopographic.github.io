/* Slop Slides: PPTX import, part 3 of 4: the shape tree. p:sp (text boxes, placeholders and preset shapes), p:cxnSp
   (lines and connectors), p:pic (pictures, with crop), p:grpSp (groups keep their child frame), p:graphicFrame (tables
   become table objects; charts, SmartArt and embedded objects are counted and left out) and mc:AlternateContent (its
   fallback). A placeholder takes its frame, geometry, fill, outline, text styles and body settings from the layout and
   master placeholder it matches (by index, then by type). Fills come from spPr, else the shape style's fillRef; text
   colour from the style's fontRef. Exposes SS.pptxIn.objects(tree, ctx). */
(function () {
  'use strict';
  var SS = window.SS, I = SS.pptxIn, O = SS.objects, U = SS.util, M = SS.model;
  var PH_KIND = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body', obj: 'body', pic: 'pic' };
  var IMAGES = /^image\/(png|jpeg|gif|webp|svg\+xml)$/;
  var truthy = function (v) { return v === '1' || v === 'true'; };

  /** { type, idx } of a placeholder (nvPr/ph), or null. */
  I.phOf = function (nvPr) {
    var ph = I.p(nvPr, 'ph');
    return ph ? { type: I.att(ph, 'type') || 'obj', idx: I.att(ph, 'idx') } : null;
  };
  function nvOf(el) { return I.p(el, 'nvSpPr') || I.p(el, 'nvPicPr') || I.p(el, 'nvCxnSpPr') || I.p(el, 'nvGrpSpPr') || I.p(el, 'nvGraphicFramePr'); }
  function first(list, fn) { for (var i = list.length - 1; i >= 0; i--) { var v = fn(list[i]); if (v != null) return v; } return null; }

  /** A picture from a relationship id: the deck's media id, or null for a format a browser cannot show (EMF, WMF, TIFF). */
  I.mediaOf = function (rid, ctx, name) {
    var rel = rid && ctx.rels[rid];
    if (!rel || rel.external) return null;
    if (ctx.mediaIds[rel.target] !== undefined) return ctx.mediaIds[rel.target];
    var u8 = ctx.files.get(rel.target), mime = u8 ? U.sniffMime(u8) : '';
    if (u8 && mime === 'application/octet-stream' && /\.svg$/i.test(rel.target)) mime = 'image/svg+xml';
    var id = u8 && IMAGES.test(mime) ? M.addMedia(ctx.deck, U.u8ToDataUrl(u8, mime), name || rel.target.replace(/^.*\//, '')) : null;
    if (!id) ctx.report.pictures++;
    ctx.mediaIds[rel.target] = id;
    return id;
  };
  function crop(blipFill) {
    var r = I.a(blipFill, 'srcRect'), c = { l: 0, t: 0, r: 0, b: 0 };
    if (r) Object.keys(c).forEach(function (k) { c[k] = Math.max(0, Math.min(0.95, I.num(r, k, 0) / 100000)); });
    return c;
  }
  function base(el, fr) {
    var c = I.p(nvOf(el), 'cNvPr');
    return { name: (c && I.att(c, 'name')) || '', x: fr.x, y: fr.y, w: Math.max(fr.w, 0), h: Math.max(fr.h, 0), rot: fr.rot || 0 };
  }
  function hidden(el) { return truthy(I.att(I.p(nvOf(el), 'cNvPr'), 'hidden')); }

  function chains(ph, inh, ctx) {
    var kind = ph ? (PH_KIND[ph.type] === 'title' ? 'title' : PH_KIND[ph.type] ? 'body' : 'other') : null;
    var lst = [kind ? ctx.txStyles[kind] : ctx.defaultText], body = [];
    inh.forEach(function (s) { var tx = I.p(s, 'txBody'); lst.push(I.a(tx, 'lstStyle')); body.push(I.a(tx, 'bodyPr')); });
    return { lst: lst, body: body };
  }
  function textDefaults(style) {
    var fr = I.a(style, 'fontRef'), c = fr && I.color(fr, this);
    var d = {};
    if (c) d.color = c.ref;
    if (fr && I.att(fr, 'idx') === 'major') d.font = 'heading';
    return d;
  }

  function sp(el, ctx, isCxn) {
    var nvPr = I.p(nvOf(el), 'nvPr'), ph = I.phOf(nvPr);
    if (ph && ctx.skipPh) return null;
    var inh = ph ? ctx.inherit(ph) : [], spPr = I.p(el, 'spPr'), all = inh.map(function (s) { return I.p(s, 'spPr'); }).concat([spPr]);
    var fr = first(all, function (s) { return I.xfrm(I.a(s, 'xfrm')); });
    if (!fr) return null;
    var geom = first(all, function (s) { return I.a(s, 'prstGeom'); }), cust = !geom && I.a(spPr, 'custGeom');
    var prst = geom ? I.att(geom, 'prst') : cust ? 'custom' : 'rect', style = I.p(el, 'style');
    var fill = first(all, function (s) { return I.fill(s, ctx); });
    var fillRef = I.a(style, 'fillRef');
    if (fill === null && fillRef && I.num(fillRef, 'idx', 0) > 0) { var fc = I.color(fillRef, ctx); if (fc) fill = { type: 'solid', color: fc.ref }; }
    var stroke = I.line(first(all, function (s) { return I.a(s, 'ln'); }), ctx, I.a(style, 'lnRef'));
    var b = base(el, fr), kind = I.PRST[prst];
    if (!kind) { kind = 'rect'; ctx.report.approx++; }
    if (fill && fill.type === 'blip') {
      var bl = I.a(fill.el, 'blip'), mid = I.mediaOf(I.rid(bl), ctx, b.name);
      if (!mid) return null;
      return O.make('image', Object.assign(b, { media: mid, crop: crop(fill.el), mask: kind === 'rect' ? 'none' : kind, radius: I.adj(geom, 0.16667), stroke: stroke }));
    }
    var isLine = kind === 'line' || isCxn, tx = I.p(el, 'txBody'), noFill = !fill || fill.type === 'none';
    var hasText = tx && I.plainText(tx).trim() !== '';
    var textual = !isLine && (truthy(I.att(I.p(nvOf(el), 'cNvSpPr'), 'txBox')) || (ph && kind === 'rect') || (kind === 'rect' && noFill && !stroke));
    var t = (tx && !isLine) ? (function () { var c = chains(ph, inh, ctx); return I.text(tx, c.lst, c.body, ctx, textDefaults.call(ctx, style)); })() : null;
    var o;
    if (textual) {
      if (!hasText && noFill && !stroke && !ph) return null;
      o = O.make('text', Object.assign(b, t ? { style: t.style } : {}, { text: t ? t.text : O.defaultText(''), fill: noFill ? null : fill, stroke: stroke }));
    } else if (isLine) {
      var st = stroke || { color: 'text', width: 1, dash: 'solid' };
      o = O.make('shape', Object.assign(b, { shape: st.tail === 'arrow' || st.head === 'arrow' ? 'arrowLine' : 'line', stroke: st, flipH: fr.flipH, flipV: fr.flipV }));
    } else {
      o = O.make('shape', Object.assign(b, { shape: kind, radius: I.adj(geom, 0.16667), fill: fill || { type: 'none' }, stroke: stroke }, t ? { style: t.style, text: t.text } : {}));
      if (!hasText) { o.flipH = fr.flipH; o.flipV = fr.flipV; }
    }
    if (ph && PH_KIND[ph.type] && PH_KIND[ph.type] !== 'pic') {
      var k = PH_KIND[ph.type] === 'body' && ctx.used.body ? 'body2' : PH_KIND[ph.type];
      if (!ctx.used[k]) { ctx.used[k] = true; o.placeholder = k; }
    }
    return o;
  }

  function pic(el, ctx) {
    var nvPr = I.p(nvOf(el), 'nvPr'), ph = I.phOf(nvPr);
    if (ph && ctx.skipPh) return null;
    if (I.a(nvPr, 'videoFile') || I.a(nvPr, 'audioFile') || I.a(nvPr, 'quickTimeFile') || mediaExt(nvPr)) ctx.report.media++;
    var inh = ph ? ctx.inherit(ph) : [], spPr = I.p(el, 'spPr');
    var fr = first(inh.map(function (s) { return I.p(s, 'spPr'); }).concat([spPr]), function (s) { return I.xfrm(I.a(s, 'xfrm')); });
    if (!fr) return null;
    var bf = I.p(el, 'blipFill'), b = base(el, fr), id = I.mediaOf(I.rid(I.a(bf, 'blip')), ctx, b.name);
    if (!id) return null;
    var geom = I.a(spPr, 'prstGeom'), kind = geom && I.PRST[I.att(geom, 'prst')];
    return O.make('image', Object.assign(b, { media: id, crop: crop(bf), mask: kind && kind !== 'rect' ? kind : 'none', radius: I.adj(geom, 0.16667),
      stroke: I.line(I.a(spPr, 'ln'), ctx, null), flipH: fr.flipH, flipV: fr.flipV }));
  }
  /** Video and audio keep their poster picture (and are counted); newer files name the media part in the extension list. */
  function mediaExt(nvPr) {
    var ext = I.a(nvPr, 'extLst');
    return !!ext && ext.getElementsByTagNameNS('*', 'media').length > 0;
  }

  function grp(el, ctx) {
    var kids = I.objects(el, ctx);
    if (!kids.length) return null;
    var fr = I.xfrm(I.a(I.p(el, 'grpSpPr'), 'xfrm')) || Object.assign(O.union(kids), { rot: 0 });
    var b = base(el, fr);
    return O.make('group', Object.assign(b, { children: kids, ch: fr.ch || { x: fr.x, y: fr.y, w: fr.w, h: fr.h } }));
  }

  /** Re-expresses a cell's runs against the table's style (so each cell keeps its own size, weight and colour). */
  function rebase(t, ts) {
    t.text.paras.forEach(function (p) {
      if (!p.align && t.style.align !== ts.align) p.align = t.style.align;
      p.runs.forEach(function (r) {
        var size = r.size || t.style.size, bold = r.b != null ? r.b : t.style.bold, it = r.i != null ? r.i : t.style.italic, col = r.color || t.style.color, f = r.font || t.style.font;
        if (size !== ts.size) r.size = size; else delete r.size;
        if (bold) r.b = true; else delete r.b;
        if (it) r.i = true; else delete r.i;
        if (col !== 'text' && col !== ts.color) r.color = col; else delete r.color;
        if (f !== ts.font) r.font = f; else delete r.font;
      });
    });
    return t.text;
  }
  function table(tbl, b, ctx) {
    var colW = I.as(I.a(tbl, 'tblGrid'), 'gridCol').map(function (c) { return I.pt(I.num(c, 'w', 0)); });
    var rows = I.as(tbl, 'tr'), rowH = rows.map(function (r) { return Math.max(8, I.pt(I.num(r, 'h', 0))); });
    if (!colW.length || !rows.length) return null;
    var ts = null;
    var cells = rows.map(function (r) {
      var list = I.as(r, 'tc').map(function (tc) {
        var tx = I.a(tc, 'txBody'), tcPr = I.a(tc, 'tcPr'), merged = truthy(I.att(tc, 'hMerge')) || truthy(I.att(tc, 'vMerge'));
        var t = tx && !merged ? I.text(tx, [ctx.defaultText], [], ctx, {}) : null;
        if (t && !ts) ts = { font: t.style.font, size: t.style.size, color: 'text', align: 'l', lineHeight: 1.15, bold: false, italic: false };
        var cell = { text: t ? rebase(t, ts) : O.defaultText('') }, f = I.fill(tcPr, ctx);
        if (f && f.type === 'solid') cell.fill = f.color;
        var an = I.att(tcPr, 'anchor');
        if (an) cell.valign = { t: 'top', ctr: 'middle', b: 'bottom' }[an] || 'middle';
        return cell;
      });
      while (list.length < colW.length) list.push({ text: O.defaultText('') });
      return list.slice(0, colW.length);
    });
    var tp = I.a(tbl, 'tblPr'), h = rowH.reduce(function (s, v) { return s + v; }, 0);
    return O.make('table', Object.assign(b, { w: b.w || colW.reduce(function (s, v) { return s + v; }, 0), h: Math.max(b.h, h), cells: cells, colW: colW, rowH: rowH,
      header: truthy(I.att(tp, 'firstRow')), banded: truthy(I.att(tp, 'bandRow')) }, ts ? { style: ts } : {}));
  }
  function frame(el, ctx) {
    var gd = I.a(I.a(el, 'graphic'), 'graphicData'), uri = I.att(gd, 'uri') || '';
    var fr = I.xfrm(I.p(el, 'xfrm'));
    if (/drawingml\/2006\/table$/.test(uri) && fr) return table(I.a(gd, 'tbl'), base(el, fr), ctx);
    if (/\/chart$/.test(uri)) ctx.report.charts++;
    else if (/\/diagram$/.test(uri)) ctx.report.smartart++;
    else if (/\/ole$/.test(uri)) ctx.report.ole++;
    else ctx.report.other++;
    return null;
  }

  /** The objects of a shape tree (p:spTree or p:grpSp), in drawing order. */
  I.objects = function (tree, ctx) {
    var out = [];
    I.lib.kids(tree).forEach(function (el) {
      var n = el.localName, o = null;
      if (n === 'AlternateContent') { // i18n-ignore
        var alt = I.lib.kids(el, '*', 'Fallback')[0] || I.lib.kids(el, '*', 'Choice')[0]; // i18n-ignore
        if (alt) out.push.apply(out, I.objects(alt, ctx));
        return;
      }
      if (/^(sp|pic|cxnSp|grpSp|graphicFrame)$/.test(n) && hidden(el)) return;
      if (n === 'sp') o = sp(el, ctx, false);
      else if (n === 'cxnSp') o = sp(el, ctx, true);
      else if (n === 'pic') o = pic(el, ctx);
      else if (n === 'grpSp') o = grp(el, ctx);
      else if (n === 'graphicFrame') o = frame(el, ctx);
      else if (n === 'contentPart') ctx.report.other++;
      if (o) out.push(o);
    });
    return out;
  };
})();
