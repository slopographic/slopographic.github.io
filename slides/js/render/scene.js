/* Slop Slides: the scene model. A slide becomes a display list of nodes that both the canvas renderer and the
   PDF writer draw, so screen, slideshow, thumbnails and print are the same picture.
   Nodes: group {m, opacity, clip, children, id} · path {path, fill, stroke, shadow} · text {x, y, text, face, size, color}
          image {media, x, y, w, h, crop} · media (video/audio poster). Paints: solid | linear | radial. */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, TH = SS.themes, SH = SS.shapes, X = SS.textLayout;
  var S = SS.scene = {};

  S.paint = function (theme, fill, w, h) {
    if (!fill || fill.type === 'none') return null;
    if (fill.type === 'linear' || fill.type === 'radial') {
      var cols = (fill.colors || []).map(function (c) { return TH.color(theme, c, 'accent1'); });
      var stops = cols.map(function (c, i) { return [cols.length > 1 ? i / (cols.length - 1) : 0, c]; });
      if (fill.type === 'radial') {
        var cx = (fill.cx == null ? 0.5 : fill.cx) * w, cy = (fill.cy == null ? 0.5 : fill.cy) * h;
        return { type: 'radial', stops: stops, cx: cx, cy: cy, r: Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)), alpha: fill.alpha == null ? 1 : fill.alpha };
      }
      var a = ((fill.angle == null ? 90 : fill.angle) - 90) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
      var half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
      return { type: 'linear', stops: stops, x0: w / 2 - dx * half, y0: h / 2 - dy * half, x1: w / 2 + dx * half, y1: h / 2 + dy * half, alpha: fill.alpha == null ? 1 : fill.alpha };
    }
    var c = TH.color(theme, fill.color, 'accent1');
    return c ? { type: 'solid', color: c, alpha: fill.alpha == null ? 1 : fill.alpha } : null;
  };
  S.stroke = function (theme, st) {
    if (!st || !(st.width > 0) || st.color === 'none') return null;
    return { color: TH.color(theme, st.color, 'text'), width: st.width, dash: st.dash || 'solid', alpha: st.alpha == null ? 1 : st.alpha };
  };
  function shadow(theme, sh) { return sh ? { color: TH.color(theme, sh.color || '#000000'), alpha: sh.opacity == null ? 0.35 : sh.opacity, blur: sh.blur == null ? 12 : sh.blur, dx: sh.dx || 0, dy: sh.dy == null ? 6 : sh.dy } : null; }

  /** Text nodes for a laid-out text block (object-local coordinates). */
  S.textNodes = function (lay, alpha) {
    var out = [];
    lay.bullets.forEach(function (b) { out.push({ k: 'text', x: b.x, y: b.base, text: b.text, face: b.face, size: b.size, color: b.color, alpha: alpha }); });
    lay.lines.forEach(function (l) {
      l.runs.forEach(function (r) {
        out.push({ k: 'text', x: r.x, y: l.base, text: r.text, face: r.face, size: r.size, color: r.color, alpha: alpha, ls: r.ls, link: r.link, w: r.w });
        if (r.u || r.s || r.link) {
          var tw = SS.fonts.measure(r.face, r.text.replace(/\s+$/, ''), r.size, r.ls), lw = Math.max(0.6, r.size / 16);
          var yy = r.s ? l.base - r.size * 0.3 : l.base + r.size * 0.11;
          out.push({ k: 'path', path: [['M', r.x, yy], ['L', r.x + tw, yy]], stroke: { color: r.color, width: lw, alpha: alpha == null ? 1 : alpha } });
        }
      });
    });
    return out;
  };

  function textOf(o, theme, box, opts) {
    var empty = SS.objects.isEmpty(o) || (o.text && !SS.objects.plain(o.text).length);
    if (empty && o.placeholder && opts.editor && !opts.noPrompts) {
      var pr = Object.assign({}, o, { x: 0, y: 0, w: box.w, h: box.h, text: Object.assign({}, o.text, { paras: [Object.assign({}, o.text.paras[0], { runs: [{ t: SS.util.promptText(o.prompt || 'Click to add text') }] })] }) }); // i18n-ignore (the English hint is the key)
      return { nodes: S.textNodes(X.layout(pr, theme), 0.42), lay: null };
    }
    if (empty) return { nodes: [], lay: null };
    var lay = X.layout(Object.assign({}, o, { w: box.w, h: box.h }), theme);
    return { nodes: S.textNodes(lay), lay: lay };
  }

  /** Display node for one object (group with its transform). opts: { editor, hide: {id:true}, state: fn(o) → {opacity, m, clip} } */
  S.object = function (deck, theme, o, opts) {
    opts = opts || {};
    var kids = [], st = opts.state ? opts.state(o) : null;
    if (opts.hide && opts.hide[o.id] === 'all') return null;
    if (o.type === 'shape' || o.type === 'text') {
      var line = SS.objects.isLine(o), path = o.type === 'shape' ? SH.path(o.shape, o.w, o.h, o.radius) : SH.rect(o.w, o.h);
      var fill = line ? null : S.paint(theme, o.fill, o.w, o.h), stroke = S.stroke(theme, o.stroke);
      if (fill || stroke) kids.push({ k: 'path', path: path, fill: fill, stroke: stroke, shadow: shadow(theme, o.shadow) });
      if (line && stroke) {
        if (o.stroke.tail === 'arrow') kids.push({ k: 'path', path: SH.arrowHead(0, 0, o.w, o.h, stroke.width), fill: { type: 'solid', color: stroke.color, alpha: stroke.alpha } });
        if (o.stroke.head === 'arrow') kids.push({ k: 'path', path: SH.arrowHead(o.w, o.h, 0, 0, stroke.width), fill: { type: 'solid', color: stroke.color, alpha: stroke.alpha } });
      }
      if (o.text && !(opts.hide && opts.hide[o.id])) {
        var tb = o.type === 'shape' ? SH.textBox(o.shape, o.w, o.h) : { x: 0, y: 0, w: o.w, h: o.h };
        var t = textOf(o, theme, tb, opts);
        if (t.nodes.length) kids.push(tb.x || tb.y ? { k: 'group', m: U.mat.translate(tb.x, tb.y), children: t.nodes } : { k: 'group', m: U.mat.id(), children: t.nodes, text: true, lay: t.lay });
      }
    } else if (o.type === 'image') {
      kids = S.imageNodes(deck, theme, o, opts);
    } else if (o.type === 'table') {
      kids = SS.tableScene.nodes(theme, o);
    } else if (o.type === 'chart') {
      kids = SS.chartScene.nodes(theme, o);
    } else if (o.type === 'media') {
      kids = S.mediaNodes(deck, theme, o);
    } else if (o.type === 'group') {
      var ch = o.ch || { x: o.x, y: o.y, w: o.w, h: o.h };
      var inner = o.children.map(function (c) { return S.object(deck, theme, c, opts); }).filter(Boolean);
      kids.push({ k: 'group', m: U.mat.mul(U.mat.scale(o.w / (ch.w || 1), o.h / (ch.h || 1)), U.mat.translate(-ch.x, -ch.y)), children: inner });
    }
    var m = U.mat.forObject(o);
    if (st && st.m) m = U.mat.mul(st.m, m);
    var op = (o.opacity == null ? 1 : o.opacity) * (st && st.opacity != null ? st.opacity : 1);
    return { k: 'group', id: o.id, m: m, opacity: op, children: kids, clip: st && st.clip, reveal: st && st.reveal, w: o.w, h: o.h };
  };

  S.imageNodes = function (deck, theme, o, opts) {
    var kids = [], mask = o.mask && o.mask !== 'none' ? SH.path(o.mask, o.w, o.h, o.radius) : null;
    if (!o.media) {
      if (opts.editor && !opts.noPrompts) {
        kids.push({ k: 'path', path: SH.rect(o.w, o.h), fill: { type: 'solid', color: theme.colors.bg2, alpha: 0.9 }, stroke: { color: theme.colors.text2, width: 1.5, dash: 'dash', alpha: 0.5 } });
        var cx = o.w / 2, cy = o.h / 2, s = Math.min(o.w, o.h) * 0.12;
        kids.push({ k: 'path', path: SH.roundRect(s * 2, s * 1.5, s * 0.2).map(function (c) { return c.map(function (v, i) { return i ? v + (i % 2 ? cx - s : cy - s * 0.95) : v; }); }), stroke: { color: theme.colors.text2, width: 2, alpha: 0.6 } });
        kids.push({ k: 'path', path: SH.ellipse(s * 0.5, s * 0.5, cx + s * 0.25, cy - s * 0.6), fill: { type: 'solid', color: theme.colors.text2, alpha: 0.6 } });
        kids.push({ k: 'path', path: [['M', cx - s * 0.8, cy + s * 0.5], ['L', cx - s * 0.2, cy - s * 0.15], ['L', cx + s * 0.25, cy + s * 0.25], ['L', cx + s * 0.5, cy], ['L', cx + s * 0.85, cy + s * 0.5], ['Z']], fill: { type: 'solid', color: theme.colors.text2, alpha: 0.6 } });
      }
      return kids;
    }
    var c = o.crop || { l: 0, t: 0, r: 0, b: 0 };
    var img = { k: 'image', media: o.media, x: 0, y: 0, w: o.w, h: o.h, crop: c };
    if (o.shadow) kids.push({ k: 'path', path: mask || SH.rect(o.w, o.h), fill: { type: 'solid', color: '#000000', alpha: 0.001 }, shadow: shadow(theme, o.shadow) });
    kids.push(mask ? { k: 'group', m: U.mat.id(), clip: mask, children: [img] } : img);
    var stroke = S.stroke(theme, o.stroke);
    if (stroke) kids.push({ k: 'path', path: mask || SH.rect(o.w, o.h), stroke: stroke });
    return kids;
  };
  S.mediaNodes = function (deck, theme, o) {
    var kids = [], r = Math.min(o.w, o.h);
    if (o.poster) kids.push({ k: 'image', media: o.poster, x: 0, y: 0, w: o.w, h: o.h, crop: { l: 0, t: 0, r: 0, b: 0 } });
    else kids.push({ k: 'path', path: SH.roundRect(o.w, o.h, r * 0.06), fill: { type: 'linear', stops: [[0, '#26262c'], [1, '#111114']], x0: 0, y0: 0, x1: 0, y1: o.h, alpha: 1 } });
    var b = Math.min(r * 0.32, 72), cx = o.w / 2, cy = o.h / 2;
    kids.push({ k: 'path', path: SH.ellipse(b, b, cx - b / 2, cy - b / 2), fill: { type: 'solid', color: '#ffffff', alpha: 0.88 } });
    if (o.kind === 'audio') kids.push({ k: 'path', path: [['M', cx - b * 0.2, cy - b * 0.12], ['L', cx - b * 0.05, cy - b * 0.12], ['L', cx + b * 0.15, cy - b * 0.28], ['L', cx + b * 0.15, cy + b * 0.28], ['L', cx - b * 0.05, cy + b * 0.12], ['L', cx - b * 0.2, cy + b * 0.12], ['Z']], fill: { type: 'solid', color: '#111114', alpha: 1 } });
    else kids.push({ k: 'path', path: [['M', cx - b * 0.12, cy - b * 0.2], ['L', cx + b * 0.2, cy], ['L', cx - b * 0.12, cy + b * 0.2], ['Z']], fill: { type: 'solid', color: '#111114', alpha: 1 } });
    return kids;
  };

  /** Background nodes for a slide. */
  S.background = function (deck, theme, slide) {
    var bg = TH.background(theme, slide), w = deck.size.w, h = deck.size.h, out = [];
    if (bg.type === 'image' && bg.media) {
      out.push({ k: 'path', path: SH.rect(w, h), fill: { type: 'solid', color: theme.colors.bg, alpha: 1 } });
      out.push({ k: 'image', media: bg.media, x: 0, y: 0, w: w, h: h, crop: { l: 0, t: 0, r: 0, b: 0 }, cover: true });
      if (bg.dim) out.push({ k: 'path', path: SH.rect(w, h), fill: { type: 'solid', color: '#000000', alpha: bg.dim } });
      return out;
    }
    var p = S.paint(theme, bg.type === 'solid' ? { type: 'solid', color: bg.colors ? bg.colors[0] : bg.color } : bg, w, h);
    out.push({ k: 'path', path: SH.rect(w, h), fill: p || { type: 'solid', color: theme.colors.bg, alpha: 1 } });
    return out;
  };

  /** Full slide scene. opts: { editor, hide, state, index (0-based slide number), noPrompts } */
  S.slide = function (deck, slide, opts) {
    opts = opts || {};
    var theme = TH.of(deck), items = S.background(deck, theme, slide);
    if (theme.titleAccent && slide.layout !== 'title' && slide.layout !== 'blank' && slide.layout !== 'image-caption') {
      var t = slide.objects.filter(function (o) { return o.placeholder === 'title'; })[0];
      if (t) items.push({ k: 'path', path: SH.roundRect(40, 5, 2.5).map(function (c) { return c.map(function (v, i) { return i ? v + (i % 2 ? t.x + 7.2 : Math.max(8, t.y - 4)) : v; }); }), fill: { type: 'solid', color: theme.colors.accent1, alpha: 1 } });
    }
    slide.objects.forEach(function (o) { var n = S.object(deck, theme, o, opts); if (n) items.push(n); });
    var ms = deck.master || {}, fs = deck.size.h / 540 * 12;
    if (ms.footer) items.push({ k: 'text', x: deck.size.w * 0.07, y: deck.size.h - fs * 1.8, text: ms.footer, face: SS.fonts.face(theme.fonts.body), size: fs, color: theme.colors.text2 });
    if (ms.showNumber && opts.index != null) {
      var num = String(opts.index + 1), face = SS.fonts.face(theme.fonts.body), wN = SS.fonts.measure(face, num, fs);
      items.push({ k: 'text', x: deck.size.w * 0.93 - wN, y: deck.size.h - fs * 1.8, text: num, face: face, size: fs, color: theme.colors.text2 });
    }
    return { w: deck.size.w, h: deck.size.h, items: items };
  };
})();
