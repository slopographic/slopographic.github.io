/* Slop Press — draws pages, items and laid-out text onto any 2D context (page coordinates in points).
   Shared by the canvas view, PNG export, thumbnails and printing. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, I = PR.items, P = PR.pages, LY = PR.layers, EN = PR.engine, F = PR.fonts;
  var R = PR.render = {};

  /* ---------- images ---------- */
  var imgs = {};
  R.image = function (doc, id) {
    var url = id && doc.assets[id];
    if (!url) return null;
    var c = imgs[id];
    if (c && c.url === url) return c.ok ? c.img : null;
    var img = new Image(); c = imgs[id] = { url: url, img: img, ok: false };
    img.onload = function () { c.ok = true; PR.emit('image', id); PR.touch(); };
    img.src = url;
    return null;
  };
  R.imageReady = function (doc, id) {
    return new Promise(function (res) {
      if (R.image(doc, id)) return res(imgs[id].img);
      var c = imgs[id]; if (!c) return res(null);
      c.img.addEventListener('load', function () { res(c.img); }, { once: true }); c.img.addEventListener('error', function () { res(null); }, { once: true });
    });
  };
  /** Where the picture sits inside an image frame (frame-local points). nat: natural size in points. */
  R.imageRect = function (it, natW, natH) {
    var w = it.w, h = it.h, fit = it.fit || 'fill', sc;
    if (fit === 'stretch') return { x: 0, y: 0, w: w, h: h };
    if (fit === 'fill') sc = Math.max(w / natW, h / natH);
    else if (fit === 'fit') sc = Math.min(w / natW, h / natH);
    else sc = it.sc || 1;
    var iw = natW * sc, ih = natH * sc;
    var x = (w - iw) / 2 + (fit === 'custom' ? it.ox || 0 : 0), y = (h - ih) / 2 + (fit === 'custom' ? it.oy || 0 : 0);
    return { x: x, y: y, w: iw, h: ih };
  };
  R.natural = function (img) { return { w: (img.naturalWidth || 1) * 0.75, h: (img.naturalHeight || 1) * 0.75 }; };

  /* ---------- items ---------- */
  function applyTransform(ctx, it) {
    ctx.translate(it.x, it.y);
    if (it.rot) { ctx.translate(it.w / 2, it.h / 2); ctx.rotate(it.rot * Math.PI / 180); ctx.translate(-it.w / 2, -it.h / 2); }
  }
  R.applyTransform = applyTransform;
  /** Draws one item. o: { pageIdx (for master text), frames: show frame edges, zoom, greek } */
  R.item = function (ctx, doc, it, o) {
    o = o || {};
    ctx.save();
    applyTransform(ctx, it);
    ctx.globalAlpha *= it.opacity == null ? 1 : it.opacity;
    var path = I.path(it);
    if (it.fill && it.type !== 'line') { I.tracePath(ctx, path); ctx.fillStyle = U.css(it.fill); ctx.fill(); }
    if (it.type === 'image') drawImage(ctx, doc, it, path, o);
    if (it.type === 'text') R.text(ctx, doc, it, o);
    if (it.stroke && it.sw > 0) {
      I.tracePath(ctx, path); ctx.strokeStyle = U.css(it.stroke); ctx.lineWidth = it.sw; ctx.lineJoin = 'miter'; ctx.setLineDash(it.dash ? it.dash.map(function (d) { return d * it.sw; }) : []); ctx.stroke(); ctx.setLineDash([]);
    }
    if (o.frames && !it.stroke && (it.type === 'text' || it.type === 'image' || (!it.fill && it.type !== 'line'))) {
      ctx.strokeStyle = o.edge || 'rgba(120,130,150,.75)'; ctx.lineWidth = 1 / (o.zoom || 1);
      ctx.strokeRect(0, 0, it.w, it.h);
      if (it.type === 'image' && !doc.assets[it.asset]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(it.w, it.h); ctx.moveTo(it.w, 0); ctx.lineTo(0, it.h); ctx.stroke(); }
    }
    ctx.restore();
  };
  function drawImage(ctx, doc, it, path, o) {
    var img = R.image(doc, it.asset); if (!img) return;
    var n = R.natural(img), r = R.imageRect(it, n.w, n.h);
    ctx.save(); I.tracePath(ctx, path); ctx.clip();
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
    ctx.restore();
    void o;
  }

  /* ---------- text ---------- */
  /** Draws a text frame's lines (already in frame-local space). */
  R.text = function (ctx, doc, fr, o) {
    var lay = EN.frame(fr, o.pageIdx), zoom = o.zoom || 1;
    lay.rules.forEach(function (r) { ctx.fillStyle = U.css(r.color || '#000'); ctx.fillRect(r.x1, r.y - r.w / 2, r.x2 - r.x1, r.w); });
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    try { ctx.fontKerning = 'none'; } catch (e) { /* old browser */ }
    lay.lines.forEach(function (ln) {
      var gs = ln.g, i = 0;
      while (i < gs.length) {
        var g = gs[i];
        if (g.hidden || g.nl || (g.trail && g.c === ' ') || g.c === '\t') { i++; continue; }
        // group glyphs that sit at their natural advance with the same style
        var j = i + 1, str = g.c === '\u00A0' ? ' ' : g.c, x1 = g.x + g.w;
        while (j < gs.length) {
          var h = gs[j];
          if (h.s !== g.s || h.size !== g.size || h.hidden || h.nl || h.drop || g.drop || h.trail || Math.abs(h.x - x1) > 0.01 || h.c === '\t') break;
          str += h.c === '\u00A0' ? ' ' : h.c; x1 = h.x + h.w; j++;
        }
        var y = ln.y + (g.by || 0) - (g.s.baselineShift || 0);
        if (o.greek || g.size * zoom < 3) { ctx.fillStyle = 'rgba(120,120,120,.35)'; ctx.fillRect(g.x, y - g.size * 0.5, x1 - g.x, g.size * 0.45); }
        else {
          ctx.font = F.css(g.s.font, g.s.fontStyle, g.size);
          try { ctx.letterSpacing = (g.s.tracking || 0) * g.size / 1000 + 'px'; } catch (e) { /* unsupported */ }
          ctx.fillStyle = U.css(g.s.color || '#000');
          ctx.fillText(str, g.x, y);
        }
        if (g.s.underline || g.s.strike) {
          ctx.fillStyle = U.css(g.s.color || '#000');
          var t = Math.max(0.5, g.size / 18);
          if (g.s.underline) ctx.fillRect(g.x, y + g.size * 0.12, x1 - g.x, t);
          if (g.s.strike) ctx.fillRect(g.x, y - g.size * 0.3, x1 - g.x, t);
        }
        i = j;
      }
    });
    try { ctx.letterSpacing = '0px'; } catch (e) { /* unsupported */ }
  };

  /* ---------- pages ---------- */
  /** Items visible on page i in paint order (master items first). */
  R.pageItems = function (doc, i) {
    var page = doc.pages[i]; if (!page) return [];
    return LY.sorted(doc, P.masterItems(doc, i)).concat(LY.sorted(doc, page.items)).filter(function (it) { return LY.visible(doc, it); });
  };
  /** Draws page i (white paper + items) at the context's current transform, in page coordinates.
      o: { bleed: also paint into the bleed area, zoom, frames, greek, paper (default white) } */
  R.page = function (ctx, doc, i, o) {
    o = o || {};
    var w = doc.size.w, h = doc.size.h, b = P.bleed(doc, i);
    ctx.save();
    ctx.fillStyle = o.paper || '#ffffff';
    if (o.bleed) ctx.fillRect(-b.left, -b.top, w + b.left + b.right, h + b.top + b.bottom); else ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    if (o.bleed) ctx.rect(-b.left, -b.top, w + b.left + b.right, h + b.top + b.bottom); else if (o.clip !== false) ctx.rect(0, 0, w, h); else ctx.rect(-1e5, -1e5, 2e5, 2e5);
    ctx.clip();
    var masterSet = {};
    P.masterItems(doc, i).forEach(function (it) { masterSet[it.id] = 1; });
    R.pageItems(doc, i).forEach(function (it) { R.item(ctx, doc, it, { pageIdx: masterSet[it.id] ? i : null, zoom: o.zoom, frames: o.frames && !masterSet[it.id], greek: o.greek }); });
    ctx.restore();
  };
  /** Renders page i to a new canvas at `scale` px per point. */
  R.pageCanvas = function (doc, i, scale, o) {
    o = o || {};
    var b = o.bleed ? P.bleed(doc, i) : { left: 0, right: 0, top: 0, bottom: 0 };
    var W = doc.size.w + b.left + b.right, H = doc.size.h + b.top + b.bottom;
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * scale)); c.height = Math.max(1, Math.round(H * scale));
    var ctx = c.getContext('2d', { willReadFrequently: true }); // CPU canvas: fast readback for exports
    ctx.scale(scale, scale); ctx.translate(b.left, b.top);
    R.page(ctx, doc, i, { bleed: !!o.bleed, zoom: scale, paper: o.paper });
    return c;
  };
  /** Waits for every image the document uses (before exports). */
  R.ready = function (doc) {
    var ids = {};
    PR.model.containers(doc).forEach(function (c) { c.items.forEach(function (it) { if (it.type === 'image' && it.asset) ids[it.asset] = 1; }); });
    return Promise.all(Object.keys(ids).map(function (id) { return R.imageReady(doc, id); }));
  };
})();
