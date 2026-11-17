/* PhotoSlop type: the text model and its renderer.
 * A type layer keeps L.text = { str, x, y, font, size, bold, italic, color, tracking, align, leading, aa, warp, runs }.
 * The character keys on the record are the base style; runs = [{ s, e, o }] override them for a range of
 * characters (rich text). align/leading/aa/warp are paragraph properties of the whole layer. */
'use strict';

const TYPE_CHAR = ['font', 'size', 'bold', 'italic', 'color', 'tracking'];
const TYPE_PARA = ['align', 'leading', 'aa', 'warp'];
const TYPE_DEFAULTS = { font: 'Archivo', size: 96, bold: true, italic: false, color: '#000000', tracking: 0, align: 'left', leading: 120, aa: 'smooth', warp: { style: 'none', bend: 0 } }; // i18n-ignore: font names
const TYPE_FONTS = ['Archivo', 'Inter Tight', 'Instrument Serif', 'JetBrains Mono', 'Impact', 'Comic Sans MS', 'Georgia', 'Times New Roman', 'Arial', 'Courier New']; // i18n-ignore: font names
const WARP_STYLES = trPairs([['none', ''], ['arc', ''], ['arch', ''], ['bulge', ''], ['flag', ''], ['wave', ''], ['rise', '']], 'photoslop.type.warp_');
const AA_MODES = trPairs([['none', ''], ['sharp', ''], ['crisp', ''], ['strong', ''], ['smooth', '']], 'photoslop.type.aa_');

function typeFont(t, z = 1) { return `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.size * z}px ${fontStack(t.font)}`; }
function fontStack(f) { return `"${f}", ${/Mono|Courier/.test(f) ? 'ui-monospace, monospace' : /Serif|Georgia|Times/.test(f) ? 'Georgia, serif' : 'system-ui, -apple-system, "Segoe UI", sans-serif'}`; }
const trackPx = (st) => ((st.tracking || 0) / 1000) * st.size;

/** A complete, independent copy of a text record (older records lack the newer keys). */
function normText(t) {
  const o = Object.assign({}, TYPE_DEFAULTS, t);
  o.warp = Object.assign({}, TYPE_DEFAULTS.warp, t && t.warp);
  o.runs = ((t && t.runs) || []).map((r) => ({ s: r.s, e: r.e, o: Object.assign({}, r.o) }));
  o.str = String(o.str || '');
  return o;
}
function baseStyle(t) { const o = {}; for (const k of TYPE_CHAR) o[k] = t[k] != null ? t[k] : TYPE_DEFAULTS[k]; return o; }
/** Per-character override objects (null = base style). */
function charOverrides(t) {
  const n = t.str.length, a = new Array(n).fill(null);
  for (const r of t.runs || []) for (let i = Math.max(0, r.s); i < Math.min(n, r.e); i++) a[i] = Object.assign({}, a[i], r.o);
  return a;
}
/** Compress per-character overrides back into runs, dropping values equal to the base. */
function packRuns(t, arr) {
  const runs = []; let cur = null;
  for (let i = 0; i < arr.length; i++) {
    let o = null;
    if (arr[i]) for (const k of TYPE_CHAR) if (arr[i][k] != null && arr[i][k] !== t[k]) (o = o || {})[k] = arr[i][k];
    if (!o) { cur = null; continue; }
    const key = JSON.stringify(o);
    if (cur && cur.k === key && cur.e === i) cur.e++;
    else runs.push((cur = { s: i, e: i + 1, o, k: key }));
  }
  return runs.map((r) => ({ s: r.s, e: r.e, o: r.o }));
}
function styleAt(t, i) { const a = charOverrides(t), n = t.str.length; const j = n ? clamp(i, 0, n - 1) : 0; return Object.assign(baseStyle(t), a[j] || {}); }
/** Apply a patch to the characters s..e; an empty or whole range restyles the whole layer. Returns a new record. */
function setTextStyle(t0, s, e, patch) {
  const t = normText(t0), n = t.str.length, ch = {}, para = {};
  for (const k in patch) (TYPE_CHAR.includes(k) ? ch : para)[k] = patch[k];
  Object.assign(t, para);
  if (para.warp) t.warp = Object.assign({}, para.warp);
  if (!Object.keys(ch).length) return t;
  const arr = charOverrides(t);
  if (s >= e || (s <= 0 && e >= n)) {
    Object.assign(t, ch);
    for (const o of arr) if (o) for (const k in ch) delete o[k];
  } else for (let i = Math.max(0, s); i < Math.min(n, e); i++) arr[i] = Object.assign({}, arr[i], ch);
  t.runs = packRuns(t, arr);
  return t;
}
/** Text record scaled with the document (Image Size). */
function scaleTextModel(t, sx, sy) {
  const k = Math.sqrt(sx * sy), o = normText(t);
  o.x = t.x * sx; o.y = t.y * sy; o.size = t.size * k;
  for (const r of o.runs) if (r.o.size) r.o.size *= k;
  return o;
}

/** Lines of uniformly styled segments, measured. */
function layoutText(t) {
  const arr = charOverrides(t), base = baseStyle(t), meas = cx(mkCanvas(1, 1));
  const lines = [{ segs: [] }]; let seg = null;
  for (let i = 0; i < t.str.length; i++) {
    const c = t.str[i];
    if (c === '\n') { lines.push({ segs: [] }); seg = null; continue; }
    const key = arr[i] ? JSON.stringify(arr[i]) : '';
    if (!seg || seg.key !== key) { seg = { text: '', key, st: Object.assign({}, base, arr[i] || {}) }; lines[lines.length - 1].segs.push(seg); }
    seg.text += c;
  }
  for (const L of lines) {
    L.w = 0; L.max = 0; L.asc = 0;
    for (const s of L.segs) {
      meas.font = typeFont(s.st); meas.letterSpacing = trackPx(s.st) + 'px';
      const m = meas.measureText(s.text);
      s.w = m.width; L.w += s.w; L.max = Math.max(L.max, s.st.size);
      L.asc = Math.max(L.asc, m.fontBoundingBoxAscent || s.st.size * 0.8);
    }
    if (!L.segs.length) { L.max = base.size; L.asc = base.size * 0.8; }
    L.h = (L.max * (t.leading || 120)) / 100;
  }
  return lines;
}
function renderTextCanvas(t0) {
  const t = normText(t0), lines = layoutText(t);
  const maxW = Math.max(1, ...lines.map((l) => l.w)), maxSize = Math.max(...lines.map((l) => l.max));
  const pad = Math.ceil(maxSize * 0.35), H = lines.reduce((a, l) => a + l.h, 0);
  let c = mkCanvas(Math.ceil(maxW + pad * 2), Math.max(1, Math.ceil(H + pad * 2))), g = cx(c);
  g.textBaseline = 'alphabetic';
  let y = pad;
  for (const L of lines) {
    let x = pad + (t.align === 'center' ? (maxW - L.w) / 2 : t.align === 'right' ? maxW - L.w : 0);
    const base = y + (L.h - L.max) / 2 + Math.min(L.asc, L.max * 0.95);
    for (const s of L.segs) { g.font = typeFont(s.st); g.letterSpacing = trackPx(s.st) + 'px'; g.fillStyle = s.st.color; g.fillText(s.text, x, base); x += s.w; }
    y += L.h;
  }
  if (t.aa && t.aa !== 'smooth') antiAlias(c, t.aa);
  const wp = warpCanvas(c, t.warp);
  return { canvas: wp.canvas, x: Math.round(t.x - pad), y: Math.round(t.y - pad - wp.top) };
}
/** Photoshop's anti-alias methods, approximated as alpha curves. */
function antiAlias(c, mode) {
  const g = cxr(c), img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  const k = { sharp: 2.2, crisp: 1.6 }[mode];
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i]; if (!a || a === 255) continue;
    d[i] = mode === 'none' ? (a >= 128 ? 255 : 0) : mode === 'strong' ? Math.min(255, a * 1.45) : clamp((a - 128) * k + 128, 0, 255);
  }
  g.putImageData(img, 0, 0);
}
/** Warp Text: each pixel column is shifted and/or stretched vertically. */
function warpCanvas(c, w) {
  if (!w || w.style === 'none' || !w.bend) return { canvas: c, top: 0 };
  const W = c.width, H = c.height, b = clamp(w.bend, -100, 100) / 100, A = b * H * 0.6;
  const top = Math.ceil(Math.abs(A) + H * 0.45 * Math.abs(b)), out = mkCanvas(W, H + top * 2), g = cx(out);
  for (let x = 0; x < W; x++) {
    const u = ((x + 0.5) / W) * 2 - 1, q = 1 - u * u;
    let dy = 0, sc = 1;
    switch (w.style) {
      case 'arc': dy = -A * q; break;
      case 'arch': dy = -A * q; sc = Math.max(0.2, 1 + 0.4 * b * q); break;
      case 'bulge': sc = Math.max(0.2, 1 + 0.8 * b * q); dy = (-(sc - 1) * H) / 2; break;
      case 'flag': dy = 0.5 * A * Math.sin(u * Math.PI); break;
      case 'wave': dy = 0.5 * A * Math.sin(u * Math.PI * 2); break;
      case 'rise': dy = -0.5 * A * u; break;
    }
    g.drawImage(c, x, 0, 1, H, x, top + dy, 1, H * sc);
  }
  return { canvas: out, top };
}
/** Load every font a record uses, so the first render already has the right glyphs. */
async function loadTextFonts(t) {
  const n = normText(t), list = [baseStyle(n)].concat(n.runs.map((r) => Object.assign(baseStyle(n), r.o)));
  try { await Promise.all(list.map((s) => document.fonts.load(typeFont(Object.assign({}, s, { size: 20 }))))); } catch (e) { /* offline: fallback font */ }
}
function textLayerAt(p) {
  for (let i = D.layers.length - 1; i >= 0; i--) { const L = D.layers[i]; if (!L.text || !L.visible) continue; if (p.x >= L.x && p.y >= L.y && p.x <= L.x + L.canvas.width && p.y <= L.y + L.canvas.height) return L; }
  return null;
}
