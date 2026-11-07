/* PhotoSlop tools: free transform */
'use strict';

/* ---------- Free Transform (Ctrl+T) ---------- */
/** interp: the resampling for the layer's pixels (nearest | bilinear | bicubic); it persists between transforms.
    lock: the proportion lock, on by default and kept for this page session only. Shift inverts it for one drag. */
const TRANSFORM = { active: false, interp: 'bicubic', lock: true };
/** The history label of a quick transform (photoslop.tool.quick_<op>). */
const quickLabel = (op) => tr('photoslop.tool.quick_' + String(op).toLowerCase());
function startTransform() {
  if (TRANSFORM.active) return;
  let L = activeLayer(); if (!L) return;
  if (L.locked) { toast(tr('photoslop.tool.locked')); return; }
  if (!L.visible) { toast(tr('photoslop.tool.show_layer_first')); return; }
  if (TE.el) endTypeEdit();
  if (L.text || L.shape) L = rasterizeText(L, true);
  let float, rest = null, b;
  if (D.sel) {
    const sel = selInLayer(L);
    float = copyCanvas(L.canvas); const fg = cx(float); fg.globalCompositeOperation = 'destination-in'; fg.drawImage(sel, 0, 0);
    rest = copyCanvas(L.canvas); const rg = cx(rest); rg.globalCompositeOperation = 'destination-out'; rg.drawImage(sel, 0, 0);
    b = alphaBounds(float);
  } else { float = L.canvas; b = alphaBounds(float); }
  if (!b) { toast(tr('photoslop.tool.nothing_to_transform')); return; }
  const crop = mkCanvas(b.w, b.h); cx(crop).drawImage(float, -b.x, -b.y);
  const x = L.x + b.x, y = L.y + b.y;
  Object.assign(TRANSFORM, { active: true, L, float: crop, rest, x, y, w: b.w, h: b.h, cx: x + b.w / 2, cy: y + b.h / 2, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, sel: D.sel, drag: null });
  live = { layerId: L.id, hideSel: true, surface: (LL) => transformSurface(LL) };
  emit('tool'); dirty(true);
}
function tfMatrix(tf = TRANSFORM) {
  // doc point = C' + R·S·(p − C)
  const c = Math.cos(tf.rot), s = Math.sin(tf.rot);
  const a = c * tf.sx, b = s * tf.sx, cc = -s * tf.sy, d = c * tf.sy;
  const ex = tf.cx + tf.tx - (a * tf.cx + cc * tf.cy), fy = tf.cy + tf.ty - (b * tf.cx + d * tf.cy);
  return new DOMMatrix([a, b, cc, d, ex, fy]);
}
function tfCorners() {
  const m = tfMatrix(), t = TRANSFORM, pts = [[t.x, t.y], [t.x + t.w, t.y], [t.x + t.w, t.y + t.h], [t.x, t.y + t.h]];
  return pts.map(([x, y]) => { const p = m.transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; });
}
function transformSurface(L) {
  const t = TRANSFORM, cs = tfCorners();
  const xs = cs.map((p) => p.x).concat([L.x, L.x + L.canvas.width]), ys = cs.map((p) => p.y).concat([L.y, L.y + L.canvas.height]);
  const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys)), x1 = Math.ceil(Math.max(...xs)), y1 = Math.ceil(Math.max(...ys));
  const c = scratchCanvas('b', x1 - x0, y1 - y0), g = cx(c);
  if (t.rest) g.drawImage(t.rest, L.x - x0, L.y - y0);
  g.save(); g.setTransform(new DOMMatrix([1, 0, 0, 1, -x0, -y0]).multiply(tfMatrix()));
  setInterp(g, t.interp); g.drawImage(t.float, t.x, t.y); g.restore();
  return { canvas: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
function commitTransform(label) {
  const t = TRANSFORM; if (!t.active) return;
  const L = D.layers.find((l) => l.id === t.L.id);
  live = null; t.active = false;
  if (!L) return;
  const s = transformSurface(L), c = mkCanvas(s.w, s.h); cx(c).drawImage(s.canvas, 0, 0);
  const m = tfMatrix();
  let mask = L.mask;
  if (mask && !t.rest) {
    const mc = mkCanvas(s.w, s.h), mg = cx(mc);
    if (mask.def) { mg.fillStyle = '#000'; mg.fillRect(0, 0, s.w, s.h); }
    mg.setTransform(new DOMMatrix([1, 0, 0, 1, -s.x, -s.y]).multiply(m));
    if (mask.def) { mg.globalCompositeOperation = 'destination-out'; mg.fillRect(mask.x, mask.y, mask.canvas.width, mask.canvas.height); mg.globalCompositeOperation = 'source-over'; }
    mg.drawImage(mask.canvas, mask.x, mask.y);
    mask = Object.assign({}, mask, { canvas: mc, x: s.x, y: s.y });
  }
  patchLayer(L.id, { canvas: c, x: s.x, y: s.y, mask });
  if (t.sel) { const sm = mkCanvas(D.w, D.h), sg = cx(sm); sg.setTransform(m); sg.drawImage(t.sel.mask, 0, 0); D.sel = makeSel(sm); }
  commit(typeof label === 'string' ? label : TRANSFORM_TOOL.name);
  emit('tool');
}
function cancelTransform() { if (!TRANSFORM.active) return; TRANSFORM.active = false; live = null; emit('tool'); dirty(true); }
/** The source ratio of the transform: the pixels' own proportions when this Free Transform started (TRANSFORM.w : h). */
const tfSource = () => ({ src: { w: TRANSFORM.w, h: TRANSFORM.h } });
/** Restore original aspect ratio is on when a transform runs and its source has a ratio. */
const tfCanRestore = () => TRANSFORM.active && SlopAspect.ratio(tfSource()) !== null;
/** Sets the box back to the source's proportions in one move: the width stays (a top or bottom handle keeps the height),
    and the top-left corner stays put. The change joins the open transform, so Enter commits it as one step. */
function restoreAspect(handle) {
  if (!tfCanRestore()) return;
  const t = TRANSFORM, cur = { w: t.w * Math.abs(t.sx), h: t.h * Math.abs(t.sy) };
  const keep = handle && handle.hy && !handle.hx ? 'h' : 'w';
  const want = SlopAspect.restore(cur, tfSource(), keep);
  const before = tfCorners()[0];
  t.sx = (t.sx < 0 ? -1 : 1) * Math.max(0.002, want.w / t.w);
  t.sy = (t.sy < 0 ? -1 : 1) * Math.max(0.002, want.h / t.h);
  const after = tfCorners()[0];
  t.tx += before.x - after.x; t.ty += before.y - after.y;
  dirty(true); emit('transform');
}
/** The proportion lock as a chain-link toggle for the options bars (Move and Free Transform). Shows the session setting. */
function lockButton() {
  const b = h('button', { class: 'btn', type: 'button', 'aria-label': tr('photoslop.tool.proportion_lock'), html: LINK_ICON });
  const show = () => { b.classList.toggle('primary', TRANSFORM.lock); b.setAttribute('aria-pressed', String(TRANSFORM.lock)); b.title = tr(TRANSFORM.lock ? 'photoslop.tool.proportion_lock_on' : 'photoslop.tool.proportion_lock_off'); };
  b.addEventListener('click', () => { TRANSFORM.lock = !TRANSFORM.lock; show(); });
  show();
  return b;
}
/** Sets W (axis 'x') or H ('y') from a percentage in the Free Transform bar. With the lock on, the other side follows. */
function tfScale(axis, pct) {
  const t = TRANSFORM, f = Math.max(0.002, (Number.isFinite(pct) ? pct : 100) / 100);
  if (axis === 'x' || t.lock) t.sx = f;
  if (axis === 'y' || t.lock) t.sy = f;
  emit('transform'); dirty(true);
}
function transformLayerQuick(kind) {
  // Flip / rotate the active layer (or selection) about its centre, committed immediately.
  startTransform(); if (!TRANSFORM.active) return;
  if (kind === 'flipH') TRANSFORM.sx = -1; else if (kind === 'flipV') TRANSFORM.sy = -1;
  else if (kind === 'cw') TRANSFORM.rot = Math.PI / 2; else if (kind === 'ccw') TRANSFORM.rot = -Math.PI / 2; else if (kind === '180') TRANSFORM.rot = Math.PI;
  // Quick turns and flips keep every pixel exact, so they use nearest neighbour whatever the interpolation choice is.
  const keep = TRANSFORM.interp; TRANSFORM.interp = 'nearest';
  commitTransform(quickLabel(kind));
  TRANSFORM.interp = keep;
}
/* Box geometry in screen space, shared with the idle box (tools/transform-idle.js). cs = corners tl, tr, br, bl. */
const boxMid = (cs, i) => ({ x: (cs[i].x + cs[(i + 1) % 4].x) / 2, y: (cs[i].y + cs[(i + 1) % 4].y) / 2 });
/** The scale handle under screen point s: { hx, hy } (each -1, 0 or 1), or null. */
/** A handle's grab radius in screen px: r for a mouse, at least 22 for a finger and 12 for a pen (shared/input). */
function handleR(r) { const T = window.SlopTouch; return T && T.hit && T.last && T.last !== 'mouse' ? T.hit({ pointerType: T.last }, r) : r; }
function boxHandle(cs, s) {
  const H = [[cs[0], -1, -1], [boxMid(cs, 0), 0, -1], [cs[1], 1, -1], [boxMid(cs, 1), 1, 0], [cs[2], 1, 1], [boxMid(cs, 2), 0, 1], [cs[3], -1, 1], [boxMid(cs, 3), -1, 0]];
  const R = handleR(9);
  let best = null, bd = R;   // the nearest handle (a finger's grab areas overlap on a small box)
  for (const [q, hx, hy] of H) { const d = Math.hypot(q.x - s.x, q.y - s.y); if (d < bd) { bd = d; best = { hx, hy }; } }
  return best;
}
/** The rotate knob: 24 px out from the middle of the top edge, along the box's normal. */
function boxKnob(cs) {
  const m = boxMid(cs, 0), c = { x: (cs[0].x + cs[2].x) / 2, y: (cs[0].y + cs[2].y) / 2 }, d = Math.hypot(m.x - c.x, m.y - c.y) || 1;
  return { x: m.x + ((m.x - c.x) / d) * 24, y: m.y + ((m.y - c.y) / d) * 24 };
}
function drawBox(g, cs) {
  g.strokeStyle = '#1e90ff'; g.lineWidth = 1; g.beginPath(); cs.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.stroke();
  for (const q of cs.concat([0, 1, 2, 3].map((i) => boxMid(cs, i)))) { g.fillStyle = '#fff'; g.fillRect(q.x - 4, q.y - 4, 8, 8); g.strokeRect(q.x - 4 + 0.5, q.y - 4 + 0.5, 7, 7); }
}
function drawKnob(g, cs) {
  const m = boxMid(cs, 0), k = boxKnob(cs);
  g.strokeStyle = '#1e90ff'; g.lineWidth = 1; g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(k.x, k.y); g.stroke();
  g.beginPath(); g.arc(k.x, k.y, 5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.stroke();
}
function handleCursor(h) { return h.move ? 'move' : h.rotate ? 'alias' : h.hx * h.hy > 0 ? 'nwse-resize' : h.hx * h.hy < 0 ? 'nesw-resize' : h.hx ? 'ew-resize' : 'ns-resize'; }

const TRANSFORM_TOOL = {
  id: 'transform', get name() { return tr('photoslop.tool.free_transform'); }, get short() { return this.name; },
  handleAt(p) {
    const cs = tfCorners().map((q) => toScreen(q.x, q.y)), s = toScreen(p.x, p.y);
    const h = boxHandle(cs, s); if (h) return h;
    // inside?
    let inside = false;
    for (let i = 0, j = 3; i < 4; j = i++) { const a = cs[i], b = cs[j]; if ((a.y > s.y) !== (b.y > s.y) && s.x < ((b.x - a.x) * (s.y - a.y)) / (b.y - a.y) + a.x) inside = !inside; }
    return inside ? { move: true } : { rotate: true };
  },
  down(p) { const t = TRANSFORM; t.drag = { h: this.handleAt(p), start: p, tx: t.tx, ty: t.ty, sx: t.sx, sy: t.sy, rot: t.rot, a0: Math.atan2(p.y - (t.cy + t.ty), p.x - (t.cx + t.tx)) }; },
  move(p, e) {
    const t = TRANSFORM, d = t.drag; if (!d) return;
    if (d.h.move) {
      const cs = tfCorners(), dx0 = t.tx - d.tx, dy0 = t.ty - d.ty, xs = cs.map((q) => q.x - dx0), ys = cs.map((q) => q.y - dy0);
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      const sn = snapDelta(box, p.x - d.start.x, p.y - d.start.y);
      t.tx = d.tx + sn.dx; t.ty = d.ty + sn.dy;
    }
    else if (d.h.rotate) { let a = d.rot + Math.atan2(p.y - (t.cy + t.ty), p.x - (t.cx + t.tx)) - d.a0; if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12); t.rot = a; }
    else {
      const { hx, hy } = d.h, c = Math.cos(d.rot), s = Math.sin(d.rot);
      const Cx = t.cx + d.tx, Cy = t.cy + d.ty;
      // pointer in the box's local (unrotated) frame
      const lx = c * (p.x - Cx) + s * (p.y - Cy), ly = -s * (p.x - Cx) + c * (p.y - Cy);
      const hw = (t.w * d.sx) / 2, hh = (t.h * d.sy) / 2;
      // The lock is on by default; Shift inverts it for this drag. Locked: both sides scale by one factor.
      const lock = t.lock !== !!e.shiftKey;
      let nsx = d.sx, nsy = d.sy;
      if (e.altKey) { if (hx) nsx = (lx * hx * 2) / t.w; if (hy) nsy = (ly * hy * 2) / t.h; }
      else { if (hx) nsx = ((lx + hx * hw) * hx) / t.w; if (hy) nsy = ((ly + hy * hh) * hy) / t.h; }
      if (lock) {
        if (hx && hy) {
          const k = Math.max(Math.abs(nsx / d.sx), Math.abs(nsy / d.sy));
          nsx = d.sx * k * Math.sign(nsx / d.sx || 1); nsy = d.sy * k * Math.sign(nsy / d.sy || 1);
        } else if (hx) { const k = Math.abs(nsx / d.sx); nsx = d.sx * k * Math.sign(nsx / d.sx || 1); nsy = d.sy * k; }
        else if (hy) { const k = Math.abs(nsy / d.sy); nsy = d.sy * k * Math.sign(nsy / d.sy || 1); nsx = d.sx * k; }
      }
      // The edge opposite the dragged handle stays put (Alt keeps the centre); a locked edge pulls the box about its far midpoint.
      let ncx = 0, ncy = 0;
      if (!e.altKey) { if (hx) ncx = -hx * hw + (hx * t.w * nsx) / 2; if (hy) ncy = -hy * hh + (hy * t.h * nsy) / 2; }
      t.sx = Math.abs(nsx) < 0.002 ? 0.002 * Math.sign(nsx || 1) : nsx; t.sy = Math.abs(nsy) < 0.002 ? 0.002 * Math.sign(nsy || 1) : nsy;
      t.tx = d.tx + c * ncx - s * ncy; t.ty = d.ty + s * ncx + c * ncy;
    }
    dirty(true); emit('transform');
  },
  up() { TRANSFORM.drag = null; },
  hover(p) { V.el.style.cursor = handleCursor(this.handleAt(p)); },
  dblclick() { commitTransform(); },
  onKey(e) { if (e.key === 'Enter') { commitTransform(); return true; } if (e.key === 'Escape') { cancelTransform(); return true; } return false; },
  cancel() { TRANSFORM.drag = null; },
  overlay(g) {
    if (!TRANSFORM.active) return;
    const cs = tfCorners().map((q) => toScreen(q.x, q.y));
    drawBox(g, cs); drawKnob(g, cs);
    const c = toScreen(TRANSFORM.cx + TRANSFORM.tx, TRANSFORM.cy + TRANSFORM.ty);
    g.strokeStyle = '#1e90ff';
    g.beginPath(); g.arc(c.x, c.y, 4, 0, Math.PI * 2); g.stroke();
  },
};
