/* The watermark layout maths, one copy for every renderer: the canvas engine (core.js: pictures and video frames) and the
 * PDF mapping (spec-convert.js toPdfLayers). Pure. Adds to window.SlopWatermarkSpec (load spec.js first).
 *   short(W, H)                       the shorter side, the unit of every size
 *   itemSize(layer, W, H, measure)    { w, h } of one item: text measured with measure(text, px) at its letter height
 *                                      (the box is 1.2 times that tall); a logo is size × short wide, by its own aspect
 *   anchorBox(layer, W, H, item)      the item's top-left { x, y } at its position, with the margin and the move (dx, dy)
 *   placements(layer, W, H, item)     { rot, items: [{ cx, cy }] }: the centre of every item to draw (one, or the tiles
 *                                      that touch the frame) and the turn, degrees clockwise, about each centre
 * Tiles: a grid with a gap of 12% of the shorter side, turned with the layer about the frame's centre. */
(function (root) {
  'use strict';
  const S = root.SlopWatermarkSpec || (typeof require === 'function' ? require('./spec.js') : null);
  if (!S || S.placements) return;
  const LINE = 1.2, MIN_PX = 8, GAP = 0.12;
  const COL = { l: 0, c: 0.5, r: 1 }, ROW = { t: 0, m: 0.5, b: 1 };

  const short = (W, H) => Math.min(W, H);
  function itemSize(L, W, H, measure) {
    const s = short(W, H);
    if (L.kind === 'logo') {
      const w = s * L.size, aspect = L.logoW > 0 && L.logoH > 0 ? L.logoH / L.logoW : 1;
      return { w, h: w * aspect };
    }
    const px = Math.max(MIN_PX, s * L.size);
    return { w: measure ? measure(L.text || ' ', px) : px * 0.55 * (L.text || ' ').length, h: px * LINE, px };
  }
  function anchorBox(L, W, H, item) {
    const s = short(W, H), m = s * L.margin, col = COL[L.position.charAt(1)], row = ROW[L.position.charAt(0)];
    const x = col === 0 ? m : col === 1 ? W - m - item.w : (W - item.w) / 2;
    const y = row === 0 ? m : row === 1 ? H - m - item.h : (H - item.h) / 2;
    return { x: x + L.dx * s, y: y + L.dy * s };
  }
  function placements(L, W, H, item) {
    const rot = L.rotate || 0;
    if (!L.tile) { const p = anchorBox(L, W, H, item); return { rot, items: [{ cx: p.x + item.w / 2, cy: p.y + item.h / 2 }] }; }
    const s = short(W, H), gap = s * GAP, stepX = item.w + gap, stepY = item.h + gap, diag = Math.hypot(W, H);
    const rad = rot * Math.PI / 180, c = Math.cos(rad), sn = Math.sin(rad), reach = Math.hypot(item.w, item.h) / 2;
    const ox = W / 2 + L.dx * s, oy = H / 2 + L.dy * s, items = [];
    if (!(stepX > 0 && stepY > 0)) return { rot, items };
    for (let y = -diag / 2; y < diag / 2; y += stepY) {
      for (let x = -diag / 2; x < diag / 2; x += stepX) {
        const lx = x + item.w / 2, ly = y + item.h / 2;
        const cx = ox + lx * c - ly * sn, cy = oy + lx * sn + ly * c;
        if (cx + reach >= 0 && cx - reach <= W && cy + reach >= 0 && cy - reach <= H) items.push({ cx, cy });
      }
    }
    return { rot, items };
  }

  Object.assign(S, { LINE, MIN_PX, GAP, short, itemSize, anchorBox, placements });
})(typeof window !== 'undefined' ? window : globalThis);
