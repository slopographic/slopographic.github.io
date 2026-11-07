/* PhotoSlop document: compositing and selections */
'use strict';

/* ---------- compositing ---------- */
const scratch = { a: null, b: null };
function scratchCanvas(key, w, hh) {
  let c = scratch[key];
  if (!c || c.width < w || c.height < hh) { c = scratch[key] = mkCanvas(Math.max(w, c ? c.width : 0), Math.max(hh, c ? c.height : 0)); }
  const g = cx(c); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, hh);
  return c;
}
/** A mask ({canvas,x,y,def}) as an alpha canvas aligned to a w×h surface at (ox,oy). */
const maskCache = new WeakMap();
function alignedMask(mask, w, hh, ox, oy, cacheable) {
  if (cacheable && maskCache.has(mask)) { const e = maskCache.get(mask); if (e.w === w && e.h === hh && e.x === ox && e.y === oy) return e.c; }
  const c = SlopMask.align(mask, w, hh, ox, oy);
  if (cacheable) maskCache.set(mask, { c, w, h: hh, x: ox, y: oy });
  return c;
}
/** The pixels a layer contributes: its canvas, plus any live edit, with its mask applied. */
function layerSurface(L) {
  let src = L.canvas, sx = L.x, sy = L.y, w = src.width, hh = src.height;
  const lv = live && live.layerId === L.id ? live : null;
  if (lv && lv.surface) { const s = lv.surface(L); if (s) { src = s.canvas; sx = s.x; sy = s.y; w = s.w || src.width; hh = s.h || src.height; } }
  if (!L.mask || L.mask.enabled === false) return { canvas: src, x: sx, y: sy, w, h: hh };
  const liveMask = lv && lv.maskSurface ? lv.maskSurface(L) : null;
  const m = alignedMask(liveMask || L.mask, w, hh, sx, sy, !liveMask && src === L.canvas);
  const tmp = scratchCanvas('a', w, hh), g = cx(tmp);
  g.drawImage(src, 0, 0, w, hh, 0, 0, w, hh);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return { canvas: tmp, x: sx, y: sy, w, h: hh };
}
/* ---------- clipping masks ---------- */
/** The layer a clipped layer clips to: the nearest lower layer that is not itself clipped (null if none). */
function clipBase(L) {
  if (!L.clip) return null;
  const i = layerIndex(L.id);
  for (let j = i - 1; j >= 0; j--) if (!D.layers[j].clip) return D.layers[j];
  return null;
}
/** A copy of a surface on its own canvas, so later surfaces (which may share scratch canvases) cannot change it. */
function surfaceCopy(s) {
  const w = s.w || s.canvas.width, hh = s.h || s.canvas.height, c = mkCanvas(w, hh);
  cx(c).drawImage(s.canvas, 0, 0, w, hh, 0, 0, w, hh);
  return { canvas: c, x: s.x, y: s.y, w, h: hh };
}
/** Surface s kept only where the base copy b is opaque (both in document space). */
function clipWith(s, b) {
  const w = s.w || s.canvas.width, hh = s.h || s.canvas.height, c = mkCanvas(w, hh), g = cx(c);
  g.drawImage(s.canvas, 0, 0, w, hh, 0, 0, w, hh);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(b.canvas, b.x - s.x, b.y - s.y);
  return { canvas: c, x: s.x, y: s.y, w, h: hh };
}
/** The clip base's alpha as a copy (null when L is not clipped to anything). */
function clipBaseCopy(L) {
  const base = clipBase(L);
  return base ? surfaceCopy(layerSurface(base)) : null;
}

/** Composite visible layers (bottom→top) onto ctx in document space. */
function compositeInto(g, opts = {}) {
  for (let i = opts.from || 0; i < D.layers.length; i++) {
    const L = D.layers[i];
    if (!L.visible && !(opts.includeHidden)) continue;
    if (opts.only && !opts.only.includes(L)) continue;
    const base = clipBase(L);
    if (base && !base.visible && !opts.includeHidden) continue; // a clipped layer hides with its base
    const bs = base ? clipBaseCopy(L) : null; // before layerSurface(L), which may reuse the scratch canvas
    let s = fxSurface(L, layerSurface(L));
    if (bs) s = clipWith(s, bs);
    g.globalAlpha = layerAlpha(L);
    g.globalCompositeOperation = BLEND_OP[L.blend] || 'source-over';
    g.drawImage(s.canvas, 0, 0, s.w, s.h, s.x, s.y, s.w, s.h);
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (live && live.overlayDoc) live.overlayDoc(g);
}
function flattenCanvas(bg) {
  const c = mkCanvas(D.w, D.h), g = cx(c);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, D.w, D.h); }
  const keep = live; live = null; compositeInto(g); live = keep;
  return c;
}
/** A layer's pixels baked with its mask, in document space (for merge/export). */
function bakedLayer(L) {
  const keep = live; live = null;
  const bs = clipBaseCopy(L), ls = layerSurface(L);
  const s = bs ? clipWith(ls, bs) : ls; live = keep;
  const c = mkCanvas(s.w, s.h);
  cx(c).drawImage(s.canvas, 0, 0, s.w, s.h, 0, 0, s.w, s.h);
  return { canvas: c, x: s.x, y: s.y };
}

/* ---------- selection (alpha mask, document sized) ---------- */
function makeSel(maskCanvas) {
  const b = alphaBounds(maskCanvas);
  return b ? { mask: maskCanvas, bounds: b, ver: uid() } : null;
}
/** mode: replace | add | sub | int. draw(g) paints the new shape in opaque black. */
function selectShape(draw, mode = 'replace', feather = 0) {
  const shape = mkCanvas(D.w, D.h), sg = cx(shape);
  sg.fillStyle = '#000'; draw(sg);
  if (feather > 0) blurAlphaCanvas(shape, feather);
  let out;
  if (!D.sel) out = mode === 'replace' || mode === 'add' ? shape : null;
  else if (mode === 'replace') out = shape;
  else {
    out = copyCanvas(D.sel.mask); const g = cx(out);
    g.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'sub' ? 'destination-out' : 'destination-in';
    g.drawImage(shape, 0, 0);
  }
  D.sel = out ? makeSel(out) : null;
}
function selectAll() { selectShape((g) => g.fillRect(0, 0, D.w, D.h)); commit(tr('photoslop.core.step_select_all')); }
function deselect() { if (!D.sel) return; D.sel = null; commit(tr('photoslop.core.step_deselect')); }
function selectInverse() {
  const c = mkCanvas(D.w, D.h), g = cx(c);
  g.fillStyle = '#000'; g.fillRect(0, 0, D.w, D.h);
  if (D.sel) { g.globalCompositeOperation = 'destination-out'; g.drawImage(D.sel.mask, 0, 0); }
  D.sel = makeSel(c); commit(tr('photoslop.core.step_select_inverse'));
}
function featherSel(r) {
  if (!D.sel || r <= 0) return;
  const c = copyCanvas(D.sel.mask); blurAlphaCanvas(c, r);
  D.sel = makeSel(c); commit(tr('photoslop.core.step_feather'));
}
/** Grow (+) or shrink (−) the selection by r pixels. */
function growSel(r) {
  if (!D.sel || !r) return;
  const c = copyCanvas(D.sel.mask); blurAlphaCanvas(c, Math.abs(r) * 1.4);
  const g = cxr(c), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  const t = r > 0 ? 18 : 236;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= t ? 255 : 0;
  g.putImageData(img, 0, 0);
  D.sel = makeSel(c); commit(tr(r > 0 ? 'photoslop.core.step_expand' : 'photoslop.core.step_contract'));
}
/** Selection mask placed in layer space (layer canvas sized). */
function selInLayer(L, sel = D.sel) {
  const c = mkCanvas(L.canvas.width, L.canvas.height);
  cx(c).drawImage(sel.mask, -L.x, -L.y);
  return c;
}
/** out = orig·(1−s) + proc·s, all in layer space. */
function mixBySel(orig, proc, selLayer) {
  const out = copyCanvas(orig), g = cx(out);
  g.globalCompositeOperation = 'destination-out'; g.drawImage(selLayer, 0, 0);
  const t = copyCanvas(proc), tg = cx(t);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(selLayer, 0, 0);
  g.globalCompositeOperation = 'lighter'; g.drawImage(t, 0, 0);
  return out;
}
