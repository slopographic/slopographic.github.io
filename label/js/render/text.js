/* SlopLabel — render/text: label fonts, text measurement and line layout (wrap, align, auto-shrink,
 * **bold** / _italic_ paragraph runs). Layout is computed once in mm and reused by every output. */
'use strict';

// Metric-compatible families: Arial ≈ Helvetica ≈ Liberation Sans, so PDF base-14 fonts line up with canvas.
const FONTS = {
  sans: { name: 'Sans (Arial / Helvetica)', css: 'Arial, "Liberation Sans", Helvetica, "Helvetica Neue", sans-serif', pdf: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], asc: 0.905, desc: 0.212 },
  cond: { name: 'Condensed (Zebra 0 look)', css: '"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", "Helvetica Neue Condensed", "Nimbus Sans Narrow", sans-serif', pdf: ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique'], asc: 0.936, desc: 0.212, narrow: 0.82 },
  serif: { name: 'Serif (Times)', css: '"Times New Roman", "Liberation Serif", Times, serif', pdf: ['Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic'], asc: 0.891, desc: 0.216 },
  mono: { name: 'Mono (Courier)', css: '"Courier New", "Liberation Mono", Courier, monospace', pdf: ['Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'], asc: 0.833, desc: 0.3 },
};
const fontDef = (f) => FONTS[f] || FONTS.sans;
function cssFont(family, bold, italic, px) { return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${fontDef(family).css}`; }
function pdfFontName(family, bold, italic) { return fontDef(family).pdf[(bold ? 1 : 0) + (italic ? 2 : 0)]; }

let measureCtx = null;
const measureCache = new Map();
/** Width in mm of `text` at `sizeMM` (measured at 100px for precision). */
function measureMM(text, family, bold, italic, sizeMM) {
  if (!text) return 0;
  const key = family + (bold ? 'b' : '') + (italic ? 'i' : '') + '\u0001' + text;
  let w = measureCache.get(key);
  if (w == null) {
    if (!measureCtx) measureCtx = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
    measureCtx.font = cssFont(family, bold, italic, 100);
    w = measureCtx.measureText(text).width;
    if (family === 'cond' && !condAvailable()) w *= FONTS.cond.narrow; // drawn with horizontal squeeze when no narrow font exists
    if (measureCache.size > 5000) measureCache.clear();
    measureCache.set(key, w);
  }
  return (w / 100) * sizeMM;
}
let condOK = null;
/** Is a real narrow font installed? (otherwise we squeeze Arial horizontally) */
function condAvailable() {
  if (condOK != null) return condOK;
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = '100px ' + FONTS.cond.css; const a = measureCtx.measureText('ABCDEFGH 0123456789').width;
  measureCtx.font = '100px ' + FONTS.sans.css; const b = measureCtx.measureText('ABCDEFGH 0123456789').width;
  condOK = a < b * 0.95;
  return condOK;
}

/** Split paragraph markup into styled runs: **bold**, _italic_ (only in 'para' objects). */
function parseRuns(text, base, markup) {
  if (!markup) return [{ text, bold: !!base.bold, italic: !!base.italic }];
  const runs = [];
  let b = !!base.bold, it = !!base.italic, cur = '';
  const flush = () => { if (cur) runs.push({ text: cur, bold: b, italic: it }); cur = ''; };
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && (text[i + 1] === '*' || text[i + 1] === '_')) { cur += text[i + 1]; i++; continue; }
    if (text[i] === '*' && text[i + 1] === '*') { flush(); b = !b; i++; continue; }
    if (text[i] === '_' && (i === 0 || /[\s(]/.test(text[i - 1]) || it)) { flush(); it = !it; continue; }
    cur += text[i];
  }
  flush();
  return runs;
}

/** Lay out text inside a local box of lw × lh mm.
 *  Returns { size (pt), sizeMM, lines:[{ y, w, x, segs:[{text,bold,italic,x,w}] }], width, height, overflow }. */
function layoutText(o, text, lw, lh) {
  const markup = o.type === 'para';
  const fam = o.font || 'sans', F = fontDef(fam);
  const ls = +o.lineSpacing || 1.15;
  const grow = o.fit === 'grow';
  const wrap = !grow && !!o.wrap;
  const tryLayout = (pt) => {
    const sz = (pt * 25.4) / 72;
    const lines = [];
    for (const para of String(text).split('\n')) {
      const runs = parseRuns(para, o, markup);
      // tokens: words with their following spaces, keeping style
      const toks = [];
      for (const r of runs) for (const m of r.text.match(/\S+\s*|\s+/g) || []) toks.push({ text: m, bold: r.bold, italic: r.italic });
      let line = [], lw0 = 0;
      const push = () => { lines.push(line); line = []; lw0 = 0; };
      for (const t of toks) {
        const word = t.text.replace(/\s+$/, ''), full = measureMM(t.text, fam, t.bold, t.italic, sz), ww = measureMM(word, fam, t.bold, t.italic, sz);
        if (wrap && line.length && lw0 + ww > lw + 1e-6) push();
        if (wrap && ww > lw + 1e-6 && word.length > 1) {
          // break a long word by characters
          let chunk = '';
          for (const ch of t.text) {
            const cw = measureMM(chunk + ch, fam, t.bold, t.italic, sz);
            if (chunk && lw0 + cw > lw + 1e-6) { line.push({ text: chunk, bold: t.bold, italic: t.italic }); push(); chunk = ''; }
            chunk += ch;
          }
          if (chunk) { line.push({ text: chunk, bold: t.bold, italic: t.italic }); lw0 += measureMM(chunk, fam, t.bold, t.italic, sz); }
          continue;
        }
        line.push({ text: t.text, bold: t.bold, italic: t.italic }); lw0 += full;
      }
      lines.push(line);
    }
    // measure lines (trailing spaces don't count) and merge equal-style neighbours
    const out = lines.map((segs) => {
      const merged = [];
      for (const s of segs) { const last = merged[merged.length - 1]; if (last && last.bold === s.bold && last.italic === s.italic) last.text += s.text; else merged.push({ ...s }); }
      if (merged.length) merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');
      let x = 0;
      for (const s of merged) { s.x = x; s.w = measureMM(s.text, fam, s.bold, s.italic, sz); x += s.w; }
      return { segs: merged.filter((s) => s.text), w: x };
    });
    const height = sz * F.asc + (out.length - 1) * sz * ls + sz * F.desc;
    const width = Math.max(0, ...out.map((l) => l.w));
    return { size: pt, sizeMM: sz, lines: out, width, height };
  };
  let L = tryLayout(+o.size || 10);
  const fits = (r) => r.height <= lh + 1e-6 && r.width <= lw + 1e-6;
  if (!grow && o.shrink && !fits(L)) {
    let lo = Math.max(1, +o.minSize || 4), hi = +o.size || 10;
    let best = tryLayout(lo);
    for (let k = 0; k < 14 && hi - lo > 0.1; k++) { const mid = (lo + hi) / 2, r = tryLayout(mid); if (fits(r)) { lo = mid; best = r; } else hi = mid; }
    L = best;
  }
  const W = grow ? L.width : lw, H = grow ? L.height : lh;
  const sz = L.sizeMM;
  let y0 = sz * F.asc;
  if (!grow) { if (o.valign === 'middle') y0 += (H - L.height) / 2; else if (o.valign === 'bottom') y0 += H - L.height; }
  L.lines.forEach((ln, i) => {
    ln.y = y0 + i * sz * ls;
    ln.x = o.align === 'center' ? (W - ln.w) / 2 : o.align === 'right' ? W - ln.w : 0;
    if (o.align === 'justify' && wrap && i < L.lines.length - 1 && ln.segs.length) ln.justify = W;
  });
  L.overflow = !grow && !fits(L);
  return L;
}
