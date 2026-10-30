/* Slop Slides: draws a scene (see scene.js) onto a 2D canvas context. Shadows and blur are converted to device
   pixels, text is drawn with kerning off so glyph advances match the TTF metrics used for layout. */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util, F = SS.fonts;
  var R = SS.canvasRender = {};
  var images = new Map();

  /** Image element for a media id; calls onload listeners (for a re-render) once decoded. */
  R.image = function (deck, id, onload) {
    var rec = deck && deck.media && deck.media[id];
    if (!rec) return null;
    var key = id + ':' + rec.data.length, hit = images.get(key);
    if (hit) { if (!hit.ok && onload) hit.cbs.push(onload); return hit.ok ? hit.img : null; }
    var img = new Image(), e = { img: img, ok: false, cbs: onload ? [onload] : [] };
    images.set(key, e);
    img.onload = function () { e.ok = true; e.cbs.splice(0).forEach(function (f) { f(); }); };
    img.onerror = function () { e.cbs.length = 0; };
    img.src = rec.data;
    return null;
  };
  /** Resolves when every image used by `deck` is decoded (for export). */
  R.preload = function (deck) {
    return Promise.all(Object.keys(deck.media || {}).filter(function (k) { return /^image\//.test(deck.media[k].mime); }).map(function (k) {
      return new Promise(function (res) { var im = R.image(deck, k, res); if (im) res(); setTimeout(res, 4000); });
    }));
  };

  function applyPath(ctx, path) {
    ctx.beginPath();
    path.forEach(function (c) {
      if (c[0] === 'M') ctx.moveTo(c[1], c[2]); else if (c[0] === 'L') ctx.lineTo(c[1], c[2]);
      else if (c[0] === 'C') ctx.bezierCurveTo(c[1], c[2], c[3], c[4], c[5], c[6]); else ctx.closePath();
    });
  }
  function style(ctx, p) {
    if (p.type === 'solid') return U.rgba(p.color, p.alpha);
    var g = p.type === 'linear' ? ctx.createLinearGradient(p.x0, p.y0, p.x1, p.y1) : ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, p.r);
    p.stops.forEach(function (s) { g.addColorStop(s[0], U.rgba(s[1], p.alpha)); });
    return g;
  }
  function devScale(ctx) { var t = ctx.getTransform(); return Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1; }
  R.dash = function (d, w) { return d === 'dash' ? [w * 4, w * 2.5] : d === 'dot' ? [w * 0.01, w * 2] : []; };

  function drawPath(ctx, n) {
    applyPath(ctx, n.path);
    if (n.shadow && (n.fill || n.stroke)) {
      // shadow blur/offset live in device pixels and ignore the transform: offsets stay slide-aligned
      var k = devScale(ctx);
      ctx.shadowColor = U.rgba(n.shadow.color, n.shadow.alpha);
      ctx.shadowBlur = n.shadow.blur * k;
      ctx.shadowOffsetX = n.shadow.dx * k; ctx.shadowOffsetY = n.shadow.dy * k;
    }
    if (n.fill) { ctx.fillStyle = style(ctx, n.fill); ctx.fill(n.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'); }
    if (n.shadow && n.fill) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
    if (n.stroke) {
      ctx.strokeStyle = U.rgba(n.stroke.color, n.stroke.alpha);
      ctx.lineWidth = n.stroke.width;
      ctx.setLineDash(R.dash(n.stroke.dash, n.stroke.width));
      ctx.lineCap = n.stroke.dash === 'dot' ? 'round' : (n.stroke.cap || 'butt');
      ctx.lineJoin = n.stroke.join || 'miter';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (n.shadow) { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; }
  }
  function drawText(ctx, n) {
    ctx.save();
    ctx.font = F.css(n.face, n.size);
    if ('fontKerning' in ctx) ctx.fontKerning = 'none';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (n.ls || 0) + 'px';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = U.rgba(n.color, n.alpha == null ? 1 : n.alpha);
    ctx.translate(n.x, n.y);
    if (n.face.synthItalic) ctx.transform(1, 0, -0.2, 1, 0, 0);
    if (n.reveal != null) { ctx.beginPath(); ctx.rect(-2, -n.size * 2, n.reveal + 2, n.size * 3); ctx.clip(); }
    ctx.fillText(n.text, 0, 0);
    if (n.face.synthBold) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = n.size * 0.035; ctx.strokeText(n.text, 0, 0); }
    ctx.restore();
  }
  function drawImage(ctx, n, env) {
    var img = R.image(env.deck, n.media, env.onImage);
    if (!img) { ctx.fillStyle = 'rgba(128,128,128,.25)'; ctx.fillRect(n.x, n.y, n.w, n.h); return; }
    var iw = img.naturalWidth, ih = img.naturalHeight, c = n.crop || {};
    var sx = (c.l || 0) * iw, sy = (c.t || 0) * ih, sw = iw * (1 - (c.l || 0) - (c.r || 0)), sh = ih * (1 - (c.t || 0) - (c.b || 0));
    if (n.cover) { var k = Math.max(n.w / iw, n.h / ih); sw = n.w / k; sh = n.h / k; sx = (iw - sw) / 2; sy = (ih - sh) / 2; }
    if (sw <= 0 || sh <= 0) return;
    ctx.drawImage(img, sx, sy, sw, sh, n.x, n.y, n.w, n.h);
  }
  function drawNode(ctx, n, env) {
    if (n.k === 'group') {
      if (n.opacity === 0) return;
      ctx.save();
      var m = n.m || [1, 0, 0, 1, 0, 0];
      ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (n.opacity != null && n.opacity < 1) ctx.globalAlpha *= n.opacity;
      if (n.clip) { applyPath(ctx, n.clip); ctx.clip(); }
      if (n.reveal) { ctx.beginPath(); ctx.rect(n.reveal.x, n.reveal.y, n.reveal.w, n.reveal.h); ctx.clip(); }
      if (n.typewriter != null) env = Object.assign({}, env, { chars: { left: n.typewriter } });
      n.children.forEach(function (c) { drawNode(ctx, c, env); });
      ctx.restore();
    } else if (n.k === 'path') drawPath(ctx, n);
    else if (n.k === 'text') {
      if (env.chars) {
        if (env.chars.left <= 0) return;
        var t = n.text;
        if (t.length > env.chars.left) { n = Object.assign({}, n, { text: t.slice(0, env.chars.left) }); env.chars.left = 0; } else env.chars.left -= t.length;
      }
      drawText(ctx, n);
    } else if (n.k === 'image') drawImage(ctx, n, env);
  }
  /** Draws a whole scene. ctx must already map slide points to pixels. */
  R.draw = function (ctx, scene, env) {
    env = env || {};
    scene.items.forEach(function (n) { drawNode(ctx, n, env); });
  };
  /** Renders a slide into a canvas at `width` css px (thumbnails, exports). Returns the canvas. */
  R.slideToCanvas = function (deck, slide, width, opts) {
    opts = opts || {};
    var cv = opts.canvas || document.createElement('canvas'), k = width / deck.size.w, dpr = opts.dpr || 1;
    cv.width = Math.round(width * dpr); cv.height = Math.round(deck.size.h * k * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
    ctx.clearRect(0, 0, deck.size.w, deck.size.h);
    var scene = SS.scene.slide(deck, slide, Object.assign({ index: deck.slides.indexOf(slide) }, opts.scene || {}));
    R.draw(ctx, scene, { deck: deck, onImage: opts.onImage });
    return cv;
  };
  R.applyPath = applyPath;
})();
