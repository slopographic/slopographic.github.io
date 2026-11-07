/* PhotoSlop tools: healing brush (source + blend) and spot healing brush (automatic ring source).
 *
 * Both paint one buffered stroke (startBufferedStroke / finishBufferedStroke), so a stroke is one
 * history step and respects the selection and the layer's opacity, as the clone stamp does.
 *
 * Blend, per dab (doc space), for the pixels under the brush:
 *   high = source − normalised blur_small(source)      the source's texture, without its brightness
 *   low  = normalised blur_large(target), where the target counts only pixels just outside the brush
 *          (weights = alpha, the brush interior is excluded), so the surroundings' brightness and colour
 *          are extended smoothly under the brush (normalised convolution)
 *   healed = low + high
 * The blur is three box passes (≈ gaussian). Spot healing uses the same blend with the source taken
 * from the clean ring just outside the brush, mirrored across the brush edge (each pixel inside takes the
 * clean pixel that lies the same distance beyond the edge along its radius). */
'use strict';

const HEAL_ICON = ICON('M3 21l7-7M14 4l6 6-9 9-6-6zM8 12l4 4');
const SPOT_ICON = ICON('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8');

/** Three box passes of radius r over each Float32 channel (in place, w×w window). */
function blurStack(arrs, w, r) {
  const tmp = new Float32Array(w * w);
  for (const a of arrs) for (let p = 0; p < 3; p++) { boxH(a, tmp, w, w, r); boxV(tmp, a, w, w, r); }
}

/** One dab: the healed colours of the dab's square (d×d), with alpha 255 where the target has ring pixels. */
function healPatch(st, x, y) {
  const { rad, dab, tgt, src, spot } = st, d = dab.width;
  const kL = clamp(Math.round(rad * 0.5), 1, 40), kH = Math.max(1, Math.round(rad * 0.15));
  const P = 3 * kL + 2, W = d + 2 * P, n = W * W;
  const X = Math.round(x - d / 2), Y = Math.round(y - d / 2), X0 = X - P, Y0 = Y - P;
  const t = cxr(tgt).getImageData(X0, Y0, W, W).data;

  // Low frequency: alpha-weighted target colour outside the brush, normalised-blurred.
  const wA = new Float32Array(n), cR = new Float32Array(n), cG = new Float32Array(n), cB = new Float32Array(n);
  let sw = 0, sr = 0, sg = 0, sb = 0;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, q = k * 4, a = t[q + 3] / 255;
    if (!a || Math.hypot(X0 + i + 0.5 - x, Y0 + j + 0.5 - y) < rad) continue;
    wA[k] = a; cR[k] = t[q] * a; cG[k] = t[q + 1] * a; cB[k] = t[q + 2] * a;
    sw += a; sr += cR[k]; sg += cG[k]; sb += cB[k];
  }
  if (sw < 1e-3) return null; // nothing clean to blend with (empty layer or edge)
  const fR = sr / sw, fG = sg / sw, fB = sb / sw; // fallback when the blur finds no ring within reach
  blurStack([wA, cR, cG, cB], W, kL);

  // High frequency: the source (or, for spot healing, the mirrored ring), minus its own small blur.
  const sA = new Float32Array(n), rawR = new Float32Array(n), rawG = new Float32Array(n), rawB = new Float32Array(n);
  const pR = new Float32Array(n), pG = new Float32Array(n), pB = new Float32Array(n);
  const sImg = spot ? null : cxr(src).getImageData(X0 + st.ox, Y0 + st.oy, W, W).data;
  const from = spot ? t : sImg;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    let qx = i, qy = j;
    if (spot) {
      const px = X0 + i + 0.5 - x, py = Y0 + j + 0.5 - y;
      let dist = Math.hypot(px, py), dx = px, dy = py;
      if (dist < rad) {
        if (dist < 1e-6) { dx = 1; dy = 0; dist = 1; }
        const m = (2 * rad - dist) / dist;
        qx = Math.floor(x + dx * m - X0); qy = Math.floor(y + dy * m - Y0);
        if (qx < 0 || qy < 0 || qx >= W || qy >= W) continue;
      }
    }
    const q = (qy * W + qx) * 4, k = j * W + i, a = from[q + 3] / 255;
    if (!a) continue;
    sA[k] = a; rawR[k] = from[q]; rawG[k] = from[q + 1]; rawB[k] = from[q + 2];
    pR[k] = from[q] * a; pG[k] = from[q + 1] * a; pB[k] = from[q + 2] * a;
  }
  const mR = pR.slice(), mG = pG.slice(), mB = pB.slice(), mA = sA.slice();
  blurStack([mA, mR, mG, mB], W, kH);

  // Healed colours for the dab's own square.
  const out = new ImageData(d, d), od = out.data;
  for (let j = 0; j < d; j++) for (let i = 0; i < d; i++) {
    const k = (j + P) * W + (i + P), o = (j * d + i) * 4;
    let lr = fR, lg = fG, lb = fB;
    if (wA[k] > 1e-3) { lr = cR[k] / wA[k]; lg = cG[k] / wA[k]; lb = cB[k] / wA[k]; }
    let hr = 0, hg = 0, hb = 0;
    if (mA[k] > 1e-3 && sA[k] > 0) { hr = rawR[k] - mR[k] / mA[k]; hg = rawG[k] - mG[k] / mA[k]; hb = rawB[k] - mB[k] / mA[k]; }
    od[o] = clamp(lr + hr, 0, 255); od[o + 1] = clamp(lg + hg, 0, 255); od[o + 2] = clamp(lb + hb, 0, 255); od[o + 3] = 255;
  }
  return { img: out, X, Y };
}

/** Stamp one dab into the stroke buffer. */
function healStamp(S, st, x, y) {
  const p = healPatch(st, x, y);
  S.cur = { x, y };
  if (!p) return;
  st.tg.clearRect(0, 0, st.tmp.width, st.tmp.height);
  st.tg.putImageData(p.img, 0, 0);
  st.tg.globalCompositeOperation = 'destination-in'; st.tg.drawImage(st.dab, 0, 0); st.tg.globalCompositeOperation = 'source-over';
  S.g.drawImage(st.tmp, p.X, p.Y);
}

/** Healing tools: `spot` true = automatic source from the clean ring. */
function healTool(def) {
  return defTool(Object.assign({
    coalesce: true,
    brushCursor() { return this.opt().size; },
    down(p, e) {
      const spot = !!this.spot, o = this.opt();
      if (!spot && takeSource(this, p, e, 'heal')) return;
      if (!spot && !this.src) { toast(tr('photoslop.tool.need_heal_source')); return; }
      const L = editableLayer(); if (!L) { this.s = null; return; }
      const Lc = coverDoc(L);
      if (!spot && (!o.aligned || !this.off)) this.off = { x: this.src.x - p.x, y: this.src.y - p.y };
      const tgt = docCanvasOf(Lc);
      const dab = dabCanvas(o.size, o.hardness, '#000000'), tmp = mkCanvas(dab.width, dab.height);
      const st = {
        spot, rad: o.size / 2, dab, tmp, tg: cx(tmp), tgt,
        src: spot ? null : (o.sampleAll ? flattenCanvas() : tgt),
        ox: spot ? 0 : Math.round(this.off.x), oy: spot ? 0 : Math.round(this.off.y),
      };
      const S = this.s = startBufferedStroke(Lc, { opacity: o.opacity });
      S.cur = p;
      S.stroker = new Stroker(() => Math.max(1, o.size * 0.2), (x, y) => healStamp(S, st, x, y));
      S.stroker.begin(p); dirty(true);
    },
    move(p) { if (this.s) { this.s.stroker.to(p); dirty(true); } },
    up() { const S = this.s; this.s = null; if (S) finishBufferedStroke(S, this.short); },
    cancel() { this.s = null; live = null; dirty(true); },
  }, def));
}

healTool({ id: 'heal', nk: 'heal', key: 'J', icon: HEAL_ICON, opt: () => T.heal,
  overlay(g) {
    if (!this.src) return;
    const c = this.s && this.off ? { x: this.s.cur.x + this.off.x, y: this.s.cur.y + this.off.y } : this.off && V.cursor ? { x: V.cursor.x + this.off.x, y: V.cursor.y + this.off.y } : this.src;
    const s = toScreen(c.x, c.y), r = (T.heal.size * V.zoom) / 2;
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(s.x, s.y, Math.max(3, r), 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.beginPath(); g.moveTo(s.x - 6, s.y); g.lineTo(s.x + 6, s.y); g.moveTo(s.x, s.y - 6); g.lineTo(s.x, s.y + 6); g.stroke();
  } });
healTool({ id: 'spot', nk: 'spot', key: 'J', icon: SPOT_ICON, opt: () => T.spot, spot: true });
