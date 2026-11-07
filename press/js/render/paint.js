/* Slop Press — painting one surface (page or master page) in the view: shadow, bleed/slug, paper,
   items, margin/column/bleed guides, baseline grid and ruler guides. */
(function () {
  'use strict';
  var PR = window.PR, P = PR.pages, R = PR.render, LY = PR.layers, M = PR.model, S = PR.state, V = PR.view;
  var PT = PR.paint = {};
  PT.COLORS = { margin: '#d946ef', column: '#8b5cf6', bleed: '#ef4444', slug: '#3b82f6', baseline: 'rgba(59,130,246,.35)', guide: '#06b6d4', guideSel: '#0ea5e9' };

  function masterChainItems(m, side) {
    var chain = [], seen = {}, cur = m.basedOn ? M.findMaster(S.doc, m.basedOn) : null;
    while (cur && !seen[cur.id]) { seen[cur.id] = 1; chain.unshift(cur); cur = cur.basedOn ? M.findMaster(S.doc, cur.basedOn) : null; }
    var out = [];
    chain.forEach(function (mm) { out = out.concat(mm.pages[Math.min(side, mm.pages.length - 1)].items); });
    return out;
  }

  PT.surface = function (ctx, s) {
    var doc = S.doc, z = V.zoom, w = s.w, h = s.h, b = P.bleedSide(doc, s.side), sl = P.slug(doc, s.side);
    ctx.save();
    ctx.translate(s.x, s.y);
    // shadow + paper
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(3 / z, 3 / z, w, h);
    var preview = V.preview;
    if (preview) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    }
    // items
    ctx.save();
    if (preview) { ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); }
    var zz = { zoom: z * V.dpr, frames: !preview && V.show.frames };
    if (s.pageIdx != null) {
      var masterSet = {};
      P.masterItems(doc, s.pageIdx).forEach(function (it) { masterSet[it.id] = 1; });
      R.pageItems(doc, s.pageIdx).forEach(function (it) {
        R.item(ctx, doc, it, { pageIdx: masterSet[it.id] ? s.pageIdx : null, zoom: zz.zoom, frames: zz.frames, edge: masterSet[it.id] ? 'rgba(120,130,150,.35)' : null });
      });
    } else {
      LY.sorted(doc, masterChainItems(s.master, s.mside)).concat(LY.sorted(doc, s.items)).filter(function (it) { return LY.visible(doc, it); })
        .forEach(function (it) { R.item(ctx, doc, it, { zoom: zz.zoom, frames: zz.frames }); });
    }
    ctx.restore();
    if (!preview && V.show.guides) PT.guides(ctx, s, b, sl);
    ctx.restore();
  };

  function hline(ctx, x0, x1, y) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  function vline(ctx, x, y0, y1) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  PT.guides = function (ctx, s, b, sl) {
    var doc = S.doc, z = V.zoom, w = s.w, h = s.h, px = 1 / z;
    ctx.lineWidth = px;
    // bleed + slug
    if (b.top || b.bottom || b.left || b.right) { ctx.strokeStyle = PT.COLORS.bleed; ctx.strokeRect(-b.left, -b.top, w + b.left + b.right, h + b.top + b.bottom); }
    if (sl.top || sl.bottom || sl.left || sl.right) { ctx.strokeStyle = PT.COLORS.slug; ctx.setLineDash([4 * px, 3 * px]); ctx.strokeRect(-sl.left, -sl.top, w + sl.left + sl.right, h + sl.top + sl.bottom); ctx.setLineDash([]); }
    // baseline grid
    if (V.show.baseline && doc.baseline.step > 0 && doc.baseline.step * z > 3) {
      ctx.strokeStyle = PT.COLORS.baseline; ctx.beginPath();
      for (var y = doc.baseline.start; y <= h; y += doc.baseline.step) hline(ctx, 0, w, y);
      ctx.stroke();
    }
    // margins + columns
    var m = P.marginsSide(doc, s.side), cols = P.columns(doc, s.side);
    ctx.strokeStyle = PT.COLORS.margin; ctx.strokeRect(m.left, m.top, w - m.left - m.right, h - m.top - m.bottom);
    if (cols.length > 1) {
      ctx.strokeStyle = PT.COLORS.column; ctx.beginPath();
      cols.forEach(function (c, k) { if (k) vline(ctx, c.x, m.top, h - m.bottom); if (k < cols.length - 1) vline(ctx, c.x + c.w, m.top, h - m.bottom); });
      ctx.stroke();
    }
    // ruler guides
    (s.guides || []).forEach(function (g, gi) {
      ctx.strokeStyle = PR.guides && PR.guides.selected === s.key + ':' + gi ? PT.COLORS.guideSel : PT.COLORS.guide;
      ctx.beginPath();
      if (g.axis === 'x') vline(ctx, g.pos, -b.top - 40, h + b.bottom + 40); else hline(ctx, -b.left - 40, w + b.right + 40, g.pos);
      ctx.stroke();
    });
    // page label under the page
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = (11 / z) + 'px system-ui, sans-serif';
    var lbl = s.pageIdx != null ? P.label(doc, s.pageIdx) + (doc.pages[s.pageIdx].master ? '  ·  ' + (M.findMaster(doc, doc.pages[s.pageIdx].master) || { prefix: '' }).prefix : '') : (s.mside || doc.facing ? PR.util.t(s.mside ? 'press.app.master_right' : 'press.app.master_left', { name: s.master.prefix + '-' + s.master.name }) : s.master.prefix + '-' + s.master.name);
    ctx.textAlign = s.side === 'left' ? 'left' : s.side === 'right' ? 'right' : 'center';
    ctx.fillText(lbl, s.side === 'left' ? 0 : s.side === 'right' ? w : w / 2, h + b.bottom + 14 / z);
    ctx.textAlign = 'left';
  };
})();
