/* Slop Font: what the glyph editor draws. The metric lines with their names and values (ascender, cap height, x-height,
 * baseline, descender), the advance box with the side bearings, the grid when zoomed in, the glyph filled the way the
 * font will fill it (contours oriented: core/paths.js orient), its outline, its points (a square is a corner, a circle
 * a smooth point; the first point of a contour is larger) and the handles of the selected contours, then the current
 * tool's own marks (pen preview, rubber band). Colours are the page's --fc-* tokens. Classic script.
 *   FC.editorDraw.render(ctx, { w, h, cam, contours, glyph, project, sel, tool }) */
(function (g) {
  'use strict';
  const P = () => g.SlopFont.paths, G = () => g.SVGeom;
  function colors(el) {
    const cs = getComputedStyle(el);
    const v = (k, d) => (cs.getPropertyValue(k) || '').trim() || d;
    return { bg: v('--fc-canvas', '#fff'), fg: v('--fc-ink', '#111'), line: v('--fc-guide', '#99a'), base: v('--fc-base', '#556'), accent: v('--fc-point', '#2563eb'),
      dim: v('--fc-dim', '#667'), box: v('--fc-box', 'rgba(127,127,127,.08)') };
  }
  function trace(ctx, contours, cam) {
    ctx.beginPath();
    for (const c of contours) {
      const p = c.pts;
      if (p.length < 2) continue;
      const s = (x, y) => [cam.ox + x * cam.z, cam.oy - y * cam.z];
      ctx.moveTo(...s(p[0].x, p[0].y));
      const n = p.length, last = c.closed === false ? n - 1 : n;
      for (let i = 0; i < last; i++) {
        const a = p[i], b = p[(i + 1) % n];
        if (a.ox === a.x && a.oy === a.y && b.ix === b.x && b.iy === b.y) ctx.lineTo(...s(b.x, b.y));
        else ctx.bezierCurveTo(...s(a.ox, a.oy), ...s(b.ix, b.iy), ...s(b.x, b.y));
      }
      if (c.closed !== false) ctx.closePath();
    }
  }
  function lines(ctx, o, C) {
    const { w, h, cam, project: p, glyph } = o, m = p.metrics, Y = (y) => Math.round(cam.oy - y * cam.z) + 0.5, X = (x) => Math.round(cam.ox + x * cam.z) + 0.5;
    ctx.fillStyle = C.box;
    ctx.fillRect(X(0), Y(m.ascender), glyph.advance * cam.z, (m.ascender - m.descender) * cam.z);
    const grid = (g.FC.state.settings().grid || 10);
    if (grid * cam.z >= 8) {
      ctx.strokeStyle = C.box; ctx.lineWidth = 1; ctx.beginPath();
      const f0 = g.FC.editor.toFont(0, h), f1 = g.FC.editor.toFont(w, 0);
      for (let x = Math.ceil(f0.x / grid) * grid; x <= f1.x; x += grid) { ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); }
      for (let y = Math.ceil(f0.y / grid) * grid; y <= f1.y; y += grid) { ctx.moveTo(0, Y(y)); ctx.lineTo(w, Y(y)); }
      ctx.stroke();
    }
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'bottom';
    const t = (k) => (g.FC && g.FC.t ? g.FC.t(k) : k);
    const rows = [[t('fontcreator.metric.ascender'), m.ascender], [t('fontcreator.metric.capHeight'), m.capHeight], [t('fontcreator.metric.xHeight'), m.xHeight], [t('fontcreator.metric.baseline'), 0], [t('fontcreator.metric.descender'), m.descender]];
    for (const [name, v] of rows) {
      ctx.strokeStyle = v === 0 ? C.base : C.line; ctx.lineWidth = v === 0 ? 1.5 : 1;
      ctx.setLineDash(v === 0 ? [] : [4, 4]);
      ctx.beginPath(); ctx.moveTo(0, Y(v)); ctx.lineTo(w, Y(v)); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.fillText(`${name} ${v}`, 6, Y(v) - 2);
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = C.base; ctx.lineWidth = 1;
    for (const x of [0, glyph.advance]) { ctx.beginPath(); ctx.moveTo(X(x), 0); ctx.lineTo(X(x), h); ctx.stroke(); }
    const sd = g.SlopFont.model.sides({ advance: glyph.advance, contours: o.contours });
    ctx.fillStyle = C.dim; ctx.textBaseline = 'top';
    ctx.fillText(sd.box ? g.FC.t('fontcreator.ops.width_sides', { w: glyph.advance, l: sd.lsb, r: sd.rsb }) : g.FC.t('fontcreator.ops.width', { w: glyph.advance }), X(0) + 4, Y(m.descender) + 4);
  }
  function points(ctx, o, C) {
    const { cam, contours, sel } = o, r = (g.matchMedia && g.matchMedia('(pointer: coarse)').matches) ? 5 : 3.5;
    const S = (x, y) => [cam.ox + x * cam.z, cam.oy - y * cam.z];
    contours.forEach((c, ci) => {
      const active = sel.contours.has(ci) || c.pts.some((_, i) => sel.points.has(ci + ':' + i));
      c.pts.forEach((a, i) => {
        const on = sel.points.has(ci + ':' + i), [x, y] = S(a.x, a.y);
        if (active || on) {
          ctx.strokeStyle = C.dim; ctx.lineWidth = 1;
          for (const [hx, hy] of [[a.ix, a.iy], [a.ox, a.oy]]) {
            if (hx === a.x && hy === a.y) continue;
            const [sx, sy] = S(hx, hy);
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx, sy); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, r - 0.5, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke();
          }
        }
        const smooth = G().isSmooth ? G().isSmooth(a) : false, rr = i === 0 ? r + 1.5 : r;
        ctx.beginPath();
        if (smooth) ctx.arc(x, y, rr, 0, 7); else ctx.rect(x - rr, y - rr, rr * 2, rr * 2);
        ctx.fillStyle = on ? C.accent : C.bg; ctx.fill();
        ctx.strokeStyle = active || on ? C.accent : C.fg; ctx.lineWidth = 1.5; ctx.stroke();
      });
    });
  }
  function render(ctx, o) {
    const C = colors(ctx.canvas);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, o.w, o.h);
    lines(ctx, o, C);
    const cs = o.contours.filter((c) => c.pts.length > 1);
    if (cs.length) {
      let shown = cs;
      try { shown = P().orient(cs); } catch (e) { shown = cs; }
      trace(ctx, shown, o.cam);
      ctx.globalAlpha = 0.22; ctx.fillStyle = C.fg; ctx.fill('nonzero'); ctx.globalAlpha = 1;
      trace(ctx, cs, o.cam);
      ctx.strokeStyle = C.fg; ctx.lineWidth = 1.5; ctx.stroke();
    }
    points(ctx, o, C);
    if (o.tool && o.tool.overlay) o.tool.overlay(ctx, o, C);
  }
  g.FC.editorDraw = { render, trace, colors };
})(window);
