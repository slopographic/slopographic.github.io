/* SlopLabel — barcode/geometry: symbol geometry in mm shared by canvas, SVG, PDF and ZPL. 2D and most linear
 * codes are encoded by the vendored bwip-js (window.bwipjs.raw); Code 128/GS1-128 use code128.js. */
'use strict';

/* ---------------- geometry ----------------
 * barcodeGeometry(obj, data) → { ok, error, w, h, rects:[{x,y,w,h}], texts:[{text,x,y,size,align,font}], sym:{x,y,w,h}, modules }
 * All in mm in the object's local (unrotated) frame; (0,0) is the top-left of the quiet zone. */
const bcCache = new Map();
function effectiveModule(o, dpi) {
  const m = Math.max(0.05, +o.module || 0.33);
  if (!o.snapDots || !dpi) return m;
  const dots = Math.max(1, Math.round((m * dpi) / 25.4));
  return (dots * 25.4) / dpi;
}
function bwipRaw(opts) {
  if (!window.bwipjs) throw new Error('Barcode engine not loaded');
  try { return window.bwipjs.raw(opts)[0]; } catch (e) {
    const msg = String((e && e.message) || e).replace(/^bwipp\.\w+#\d+:\s*/, '');
    throw new Error(msg);
  }
}
function barcodeGeometry(o, value, dpi) {
  const key = [o.symbology, value, o.module, o.barHeight, o.hr, o.hrSize, o.hrFont, o.quiet, o.check, o.ec, o.snapDots ? dpi : 0, o.ratio, o.columns, o.security, o.dmShape, o.bearer, o.qrVersion].join('\u0001');
  const hit = bcCache.get(key);
  if (hit) return hit;
  let g;
  try { g = computeGeometry(o, value, dpi); } catch (e) { g = { ok: false, error: e.message || String(e) }; }
  if (!g.ok) { g.w = Math.max(10, o.w || 20); g.h = Math.max(6, o.h || 10); }
  if (bcCache.size > 600) bcCache.delete(bcCache.keys().next().value);
  bcCache.set(key, g);
  return g;
}
function mergeRows(pixs, cols, rows, m, ox, oy, rowH) {
  // 2D matrix → rectangles: horizontal runs per row, merged vertically when a run repeats
  const rects = [], open = new Map();
  for (let r = 0; r <= rows; r++) {
    const runs = new Set();
    if (r < rows) for (let c = 0; c < cols; c++) { if (!pixs[r * cols + c]) continue; let e = c; while (e + 1 < cols && pixs[r * cols + e + 1]) e++; runs.add(c + ':' + e); c = e; }
    for (const [k, rc] of open) if (!runs.has(k)) { rects.push(rc); open.delete(k); }
    for (const k of runs) {
      if (open.has(k)) open.get(k).h += rowH;
      else { const [c0, c1] = k.split(':').map(Number); open.set(k, { x: ox + c0 * m, y: oy + r * rowH, w: (c1 - c0 + 1) * m, h: rowH }); }
    }
  }
  return rects;
}
function computeGeometry(o, value, dpi) {
  const S = SYM[o.symbology];
  if (!S) throw new Error('Unknown symbology ' + o.symbology);
  const norm = normalizeBarcode(o.symbology, value, o);
  const m = effectiveModule(o, dpi);
  const ptmm = 25.4 / 72;
  const hrMM = (+o.hrSize || 8) * ptmm;
  const showHR = o.hr && o.hr !== 'none' && S.kind === '1d';
  const ql = o.quiet ? S.quiet[0] * m : 0, qr = o.quiet ? S.quiet[1] * m : 0;
  const rects = [], texts = [];
  const font = o.hrFont || 'sans';
  if (S.kind === '2d') {
    const opts = { bcid: S.bcid, text: norm.data };
    if (o.symbology === 'qrcode' || o.symbology === 'gs1qrcode') opts.eclevel = o.ec || 'M';
    if (o.symbology === 'datamatrix' && o.dmShape === 'rect') opts.format = 'rectangle';
    if (o.symbology === 'pdf417') { if (+o.columns) opts.columns = +o.columns; opts.eclevel = +o.security || 2; }
    if (o.symbology === 'aztec' && o.ec) opts.eclevel = { L: 10, M: 23, Q: 36, H: 50 }[o.ec] || 23;
    const r = bwipRaw(opts);
    const cols = r.pixx, rows = r.pixy;
    // PDF417 rows come pre-multiplied (row height = 3 modules)
    const q = o.quiet ? S.quiet[0] * m : 0;
    const sw = cols * m, sh = rows * m;
    rects.push(...mergeRows(r.pixs, cols, rows, m, q, q, m));
    return { ok: true, w: sw + 2 * q, h: sh + 2 * q, rects, texts, sym: { x: q, y: q, w: sw, h: sh }, modules: cols, rows, data: norm.data, text: norm.text, module: m, gs1: norm.gs1 };
  }
  // ---- linear ----
  let sbs, guards = null;
  if (o.symbology === 'code128' || o.symbology === 'gs1-128') {
    const vals = norm.gs1 ? code128Encode(gs1Raw(norm.gs1), { gs1: true }) : code128Encode(norm.data);
    sbs = code128Widths(vals);
  } else {
    const opts = { bcid: S.bcid, text: norm.data };
    if (o.symbology === 'code39' && norm.check39) opts.includecheck = true;
    if (o.symbology === 'code93') opts.includecheck = true;
    if (o.symbology === 'i2of5' || o.symbology === 'codabar' || o.symbology === 'code39') { /* wide:narrow ratio */ }
    const r = bwipRaw(opts);
    sbs = r.sbs;
    if (o.symbology === 'i2of5' || o.symbology === 'itf14' || o.symbology === 'code39' || o.symbology === 'codabar') {
      // bwip uses 3:1 / 2:1 for wide elements — rescale to the requested ratio
      const ratio = clamp(+o.ratio || (o.symbology === 'codabar' ? 2.5 : 2.5), 2, 3);
      const narrow = Math.min(...sbs.filter((x) => x > 0));
      sbs = sbs.map((x) => (x > narrow * 1.2 ? ratio : 1));
    }
  }
  const H = Math.max(1, +o.barHeight || 10);
  let x = ql, bar = true, idx = 0;
  const bars = [];
  for (const wmod of sbs) {
    if (bar) bars.push({ x, w: wmod * m, i: idx++ });
    x += wmod * m; bar = !bar;
  }
  const symW = x - ql;
  const bearer = o.symbology === 'itf14' && o.bearer !== false;
  const bt = bearer ? Math.max(2 * m, 0.5) : 0; // ITF-14 bearer bar thickness
  const above = showHR && o.hr === 'above';
  const textGap = 0.4 * hrMM;
  const topOff = (above ? hrMM + textGap : 0) + bt;
  // EAN/UPC guard bars extend below the main bars
  if (S.ean) {
    const n = bars.length;
    const g = o.symbology === 'ean13' ? [0, 1, 14, 15, 28, 29] : o.symbology === 'ean8' ? [0, 1, 10, 11, 20, 21] : o.symbology === 'upca' ? [0, 1, 2, 3, 14, 15, 26, 27, 28, 29] : [0, 1, 14, 15, 16];
    guards = new Set(g.filter((k) => k < n));
  }
  const ext = showHR && guards && o.hr === 'below' ? hrMM * 0.55 : 0;
  for (const b of bars) rects.push({ x: b.x, y: topOff, w: b.w, h: H + (guards && guards.has(b.i) ? ext : 0) });
  if (bearer) {
    const bx = 0, bw = symW + ql + qr;
    rects.push({ x: bx, y: topOff - bt, w: bw, h: bt }, { x: bx, y: topOff + H, w: bw, h: bt }, { x: bx, y: topOff - bt, w: bt, h: H + 2 * bt }, { x: bx + bw - bt, y: topOff - bt, w: bt, h: H + 2 * bt });
  }
  let h = topOff + H + bt;
  if (showHR) {
    const base = above ? hrMM * 0.8 : topOff + H + bt + textGap + hrMM * 0.8;
    const t = norm.text;
    const mid = (a, b) => ql + ((a + b) / 2) * m;
    const sym = o.symbology;
    if (sym === 'ean13' && o.hr === 'below') {
      texts.push({ text: t[0], x: ql - 1.5 * m, y: base, size: hrMM, align: 'right', font });
      texts.push({ text: t.slice(1, 7), x: mid(3, 45), y: base, size: hrMM, align: 'center', font, fitW: 40 * m });
      texts.push({ text: t.slice(7), x: mid(50, 92), y: base, size: hrMM, align: 'center', font, fitW: 40 * m });
    } else if (sym === 'ean8' && o.hr === 'below') {
      texts.push({ text: t.slice(0, 4), x: mid(3, 31), y: base, size: hrMM, align: 'center', font, fitW: 26 * m });
      texts.push({ text: t.slice(4), x: mid(36, 64), y: base, size: hrMM, align: 'center', font, fitW: 26 * m });
    } else if (sym === 'upca' && o.hr === 'below') {
      texts.push({ text: t[0], x: ql - 1.5 * m, y: base, size: hrMM * 0.75, align: 'right', font });
      texts.push({ text: t.slice(1, 6), x: mid(10, 45), y: base, size: hrMM, align: 'center', font, fitW: 33 * m });
      texts.push({ text: t.slice(6, 11), x: mid(50, 85), y: base, size: hrMM, align: 'center', font, fitW: 33 * m });
      texts.push({ text: t[11], x: ql + symW + 1.5 * m, y: base, size: hrMM * 0.75, align: 'left', font });
    } else if (sym === 'upce' && o.hr === 'below') {
      texts.push({ text: t[0], x: ql - 1.5 * m, y: base, size: hrMM * 0.75, align: 'right', font });
      texts.push({ text: t.slice(1, 7), x: mid(3, 45), y: base, size: hrMM, align: 'center', font, fitW: 40 * m });
      texts.push({ text: t[7], x: ql + symW + 1.5 * m, y: base, size: hrMM * 0.75, align: 'left', font });
    } else {
      texts.push({ text: o.symbology === 'code39' ? '*' + t + '*' : t, x: ql + symW / 2, y: base, size: hrMM, align: 'center', font, fitW: symW + ql + qr });
    }
    if (!above) h = Math.max(h, base + hrMM * 0.25);
  }
  return { ok: true, w: symW + ql + qr, h, rects, texts, sym: { x: ql, y: topOff, w: symW, h: H }, modules: sbs.reduce((a, b) => a + b, 0), data: norm.data, text: norm.text, module: m, gs1: norm.gs1 };
}
