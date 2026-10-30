/* PhotoSlop tools: brush, pencil, eraser, clone and retouch tools */
'use strict';

/* Painting */
function brushTool(def) {
  return defTool(Object.assign({
    coalesce: true,
    brushCursor() { return this.opt().size; },
    down(p, e) {
      const L = editableLayer(); if (!L) { this.s = null; return; }
      const Lc = coverDoc(L), o = this.opt(), mask = maskTarget(Lc);
      const color = mask ? '#000000' : C.fg;
      const opts = { opacity: o.opacity, erase: !!this.erase, blend: o.blend, mask: !!mask, value: mask ? luma(...hexToRgb(C.fg)) / 255 : 1 };
      if (this.erase && mask) { opts.erase = false; opts.value = 0; }
      const S = this.s = startBufferedStroke(Lc, opts);
      const usePressure = o.pressure && p.pen;
      if (this.aliased) {
        S.stroker = new Stroker(() => 1, (x, y) => { const dc = pixelDisc(o.size, color), n = Math.max(1, Math.round(o.size)); S.g.drawImage(dc, Math.round(x - n / 2), Math.round(y - n / 2)); });
      } else {
        const D2 = makeDabber(o, color, usePressure);
        S.stroker = new Stroker((pr) => D2.spacing(pr), (x, y, pr) => D2.dab(S.g, x, y, pr));
      }
      if (e.shiftKey && this.lastPoint) { S.stroker.begin(this.lastPoint); S.stroker.to(p); } else S.stroker.begin(p);
      dirty(true);
    },
    move(p) { if (this.s) { this.s.stroker.to(p); dirty(true); } },
    up(p) { const S = this.s; this.s = null; if (!S) return; this.lastPoint = p; finishBufferedStroke(S, this.short); },
    cancel() { this.s = null; live = null; dirty(true); },
  }, def));
}
brushTool({ id: 'brush', nk: 'brush', key: 'B', icon: ICON('M18.4 3.6a2 2 0 0 1 2.9 2.9L12 15.8 8.2 12zM8 13c-2.5 0-4 1.8-4 4 0 1.6-.8 2.6-2 3 4 .8 8-.5 8-4.2z'), opt: () => T.brush });
brushTool({ id: 'pencil', nk: 'pencil', key: 'B', aliased: true, icon: ICON('M16 3l5 5L8 21H3v-5zM13.5 5.5l5 5'), opt: () => Object.assign({ hardness: 1, flow: 1, spacing: 0.1, pressure: false }, T.pencil) });
brushTool({ id: 'eraser', nk: 'eraser', key: 'E', erase: true, icon: ICON('M16.2 3.8 21 8.6 10.6 19H6l-3-3zM9 10l5.6 5.6M10.6 19H21'), opt: () => T.eraser });
defTool({ id: 'clone', nk: 'clone', key: 'S', icon: ICON('M9 3h6v6l3 2v3H6v-3l3-2zM4 17h16v4H4z'),
  coalesce: true,
  brushCursor() { return T.clone.size; },
  down(p, e) {
    if (takeSource(this, p, e, 'clone')) return;
    if (!this.src) { toast(tr('photoslop.tool.need_clone_source')); return; }
    const L = editableLayer(); if (!L) return;
    const Lc = coverDoc(L), o = T.clone;
    if (!T.clone.aligned || !this.off) this.off = { x: this.src.x - p.x, y: this.src.y - p.y };
    const source = T.clone.sampleAll ? flattenCanvas() : docCanvasOf(Lc);
    const S = this.s = startBufferedStroke(Lc, { opacity: o.opacity });
    const dab = dabCanvas(o.size, o.hardness, '#000000');
    const tmp = mkCanvas(dab.width, dab.height), tg = cx(tmp);
    S.cur = p;
    S.stroker = new Stroker(() => Math.max(1, o.size * 0.1), (x, y) => {
      const d = dab.width;
      tg.globalCompositeOperation = 'copy'; tg.drawImage(source, -(x + this.off.x - d / 2), -(y + this.off.y - d / 2));
      tg.globalCompositeOperation = 'destination-in'; tg.drawImage(dab, 0, 0);
      S.g.globalAlpha = o.flow; S.g.drawImage(tmp, x - d / 2, y - d / 2);
      S.cur = { x, y };
    });
    S.stroker.begin(p); dirty(true);
  },
  move(p) { if (this.s) { this.s.stroker.to(p); dirty(true); } },
  up() { const S = this.s; this.s = null; if (S) finishBufferedStroke(S, this.short); },
  cancel() { this.s = null; live = null; },
  overlay(g) {
    if (!this.src) return;
    const c = this.s && this.off ? { x: this.s.cur.x + this.off.x, y: this.s.cur.y + this.off.y } : this.off && V.cursor ? { x: V.cursor.x + this.off.x, y: V.cursor.y + this.off.y } : this.src;
    const s = toScreen(c.x, c.y), r = (T.clone.size * V.zoom) / 2;
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.arc(s.x, s.y, Math.max(3, r), 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.beginPath(); g.moveTo(s.x - 6, s.y); g.lineTo(s.x + 6, s.y); g.moveTo(s.x, s.y - 6); g.lineTo(s.x, s.y + 6); g.stroke();
  },
});
/** Tools that edit a working copy of the layer directly (smudge, dodge/burn). */
function directTool(def) {
  return defTool(Object.assign({
    coalesce: true,
    down(p) {
      const L = editableLayer(); if (!L) { this.s = null; return; }
      if (UI.editMask) { toast(tr('photoslop.tool.need_pixels')); return; }
      const Lc = coverDoc(L), work = copyCanvas(Lc.canvas);
      const s = this.s = { L: Lc, work, g: cxr(work) };
      live = { layerId: Lc.id, surface: (LL) => ({ canvas: s.work, x: LL.x, y: LL.y }) };
      this.begin(s, p);
      s.stroker = new Stroker(() => Math.max(1, this.opt().size * 0.12), (x, y) => this.dab(s, x - Lc.x, y - Lc.y));
      s.stroker.begin(p);
      dirty(true);
    },
    move(p) { if (this.s) { this.s.stroker.to(p); dirty(true); } },
    up() {
      const s = this.s; this.s = null; if (!s) return;
      live = null;
      const L = D.layers.find((l) => l.id === s.L.id); if (!L) return;
      patchLayer(L.id, { canvas: D.sel ? mixBySel(L.canvas, s.work, selInLayer(L)) : s.work });
      commit(this.short);
    },
    cancel() { this.s = null; live = null; },
    brushCursor() { return this.opt().size; },
  }, def));
}
directTool({ id: 'smudge', nk: 'smudge', key: 'R', icon: ICON('M8 21v-6.5L5.5 8a1.5 1.5 0 0 1 2.8-1l1.7 4V4.5a1.5 1.5 0 0 1 3 0V10V3.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8c0 3.9-2.5 7-6 7z'),
  opt: () => T.smudge,
  begin(s, p) {
    const o = T.smudge, d = Math.max(2, Math.ceil(o.size));
    s.pick = mkCanvas(d, d); s.pg = cx(s.pick);
    s.pg.drawImage(s.work, -(p.x - s.L.x - d / 2), -(p.y - s.L.y - d / 2));
    s.mask = dabCanvas(o.size, o.hardness, '#000000'); s.tmp = mkCanvas(d, d); s.tg = cx(s.tmp);
  },
  dab(s, x, y) {
    const o = T.smudge, d = s.pick.width, md = s.mask.width;
    s.tg.globalCompositeOperation = 'copy'; s.tg.drawImage(s.pick, 0, 0);
    s.tg.globalCompositeOperation = 'destination-in'; s.tg.drawImage(s.mask, (d - md) / 2, (d - md) / 2);
    s.g.globalAlpha = o.strength; s.g.drawImage(s.tmp, x - d / 2, y - d / 2); s.g.globalAlpha = 1;
    s.pg.globalAlpha = 1 - o.strength * 0.85; s.pg.drawImage(s.work, -(x - d / 2), -(y - d / 2)); s.pg.globalAlpha = 1;
  } });
directTool({ id: 'dodge', nk: 'dodge', key: 'O', icon: ICON('M12 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 13v8'),
  opt: () => T.dodge,
  begin() {},
  dab(s, x, y) {
    const o = T.dodge, r = o.size / 2, x0 = Math.max(0, Math.floor(x - r)), y0 = Math.max(0, Math.floor(y - r));
    const x1 = Math.min(s.work.width, Math.ceil(x + r)), y1 = Math.min(s.work.height, Math.ceil(y + r)), w = x1 - x0, hh = y1 - y0;
    if (w <= 0 || hh <= 0) return;
    const img = s.g.getImageData(x0, y0, w, hh), d = img.data, k = o.exposure * 0.18, burn = o.mode === 'burn';
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      const dist = Math.hypot(x0 + i + 0.5 - x, y0 + j + 0.5 - y) / r; if (dist >= 1) continue;
      const f = (dist < o.hardness ? 1 : 1 - (dist - o.hardness) / (1 - o.hardness || 1)) * k, q = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) { const v = d[q + c]; d[q + c] = burn ? v * (1 - f * (0.4 + (v / 255) * 0.6)) : v + (255 - v) * f * (0.4 + (1 - v / 255) * 0.3); }
    }
    s.g.putImageData(img, x0, y0);
  } });

/** Soft falloff weight 0..1 for a pixel at distance dist (in radii). */
const falloff = (dist, hardness) => (dist >= 1 ? 0 : dist < hardness ? 1 : 1 - (dist - hardness) / (1 - hardness || 1));
function dabRegion(s, x, y, r, pad = 0) {
  const x0 = Math.max(0, Math.floor(x - r - pad)), y0 = Math.max(0, Math.floor(y - r - pad));
  const x1 = Math.min(s.work.width, Math.ceil(x + r + pad)), y1 = Math.min(s.work.height, Math.ceil(y + r + pad));
  return x1 > x0 && y1 > y0 ? { x0, y0, w: x1 - x0, h: y1 - y0 } : null;
}
function blurSharpenDab(s, x, y, o, sharpen) {
  const r = o.size / 2, pad = 6, R0 = dabRegion(s, x, y, r, pad); if (!R0) return;
  const img = s.g.getImageData(R0.x0, R0.y0, R0.w, R0.h), d = img.data;
  const bl = new ImageData(new Uint8ClampedArray(d), R0.w, R0.h);
  blurImageData(bl, sharpen ? 2.2 : 2 + o.size * 0.04);
  const b = bl.data, k = o.strength * (sharpen ? 1.6 : 0.85);
  for (let j = 0; j < R0.h; j++) for (let i = 0; i < R0.w; i++) {
    const f = falloff(Math.hypot(R0.x0 + i + 0.5 - x, R0.y0 + j + 0.5 - y) / r, o.hardness) * k; if (!f) continue;
    const q = (j * R0.w + i) * 4;
    for (let c = 0; c < 4; c++) d[q + c] = sharpen ? d[q + c] + (d[q + c] - b[q + c]) * f : d[q + c] + (b[q + c] - d[q + c]) * Math.min(1, f);
  }
  s.g.putImageData(img, R0.x0, R0.y0);
}
directTool({ id: 'blur', nk: 'blur', key: 'R', icon: ICON('M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z'), opt: () => T.blur, begin() {}, dab(s, x, y) { blurSharpenDab(s, x, y, T.blur, false); } });
directTool({ id: 'sharpen', nk: 'sharpen', key: 'R', icon: ICON('M12 3 20 20H4z'), opt: () => T.sharpen, begin() {}, dab(s, x, y) { blurSharpenDab(s, x, y, T.sharpen, true); } });
directTool({ id: 'sponge', nk: 'sponge', key: 'O', icon: ICON('M5 8c0-2 2-4 7-4s7 2 7 4v8c0 2-2 4-7 4s-7-2-7-4zM9 9h.01M14 11h.01M10 14h.01M15 16h.01'),
  opt: () => T.sponge, begin() {},
  dab(s, x, y) {
    const o = T.sponge, r = o.size / 2, R0 = dabRegion(s, x, y, r); if (!R0) return;
    const img = s.g.getImageData(R0.x0, R0.y0, R0.w, R0.h), d = img.data, sat = o.mode === 'saturate';
    for (let j = 0; j < R0.h; j++) for (let i = 0; i < R0.w; i++) {
      const f = falloff(Math.hypot(R0.x0 + i + 0.5 - x, R0.y0 + j + 0.5 - y) / r, o.hardness) * o.flow * 0.25; if (!f) continue;
      const q = (j * R0.w + i) * 4, l = luma(d[q], d[q + 1], d[q + 2]), k = sat ? 1 + f : 1 - f;
      d[q] = l + (d[q] - l) * k; d[q + 1] = l + (d[q + 1] - l) * k; d[q + 2] = l + (d[q + 2] - l) * k;
    }
    s.g.putImageData(img, R0.x0, R0.y0);
  } });
