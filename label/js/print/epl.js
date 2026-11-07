/* SlopLabel — print/epl: EPL2 (older Zebra/Eltron) and TSPL (TSC, Xprinter, many generic thermal
 * printers) export. Native text/barcodes for the common cases, 1-bit bitmaps for everything else. */
'use strict';

const TSPL_BC = { code128: '128', ean13: 'EAN13', ean8: 'EAN8', upca: 'UPCA', upce: 'UPCE', code39: '39', code93: '93', i2of5: '25', itf14: 'ITF14', codabar: 'CODA' };
const EPL_BC = { code128: '1', ean13: 'E30', ean8: 'E80', upca: 'UA0', upce: 'UE0', code39: '3', code93: '9', i2of5: '2', codabar: 'K' };
const ROT_IDX = { 0: 0, 90: 1, 180: 2, 270: 3 };
function invBits(bm) { const b = new Uint8Array(bm.bits.length); for (let i = 0; i < b.length; i++) b[i] = ~bm.bits[i] & 255; return b; }
/** Writer that mixes text lines and raw bytes. */
function byteWriter() {
  const parts = [];
  return { line(s) { parts.push(new TextEncoder().encode(s + '\r\n')); }, raw(u8) { parts.push(u8); }, bytes() { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let k = 0; for (const p of parts) { out.set(p, k); k += p.length; } return out; } };
}
const q = (s, epl) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, epl ? '\\"' : '\\["]') + '"';

function tsplItem(w, it, ox, oy, dpi, doc) {
  const o = it.obj, b = zplBox(it, 0, 0, it.lw, it.lh, ox, oy, dpi), r = it.rot;
  const bitmap = () => { const bm = rasterizeItem(doc, it, dpi, { dither: o.type === 'image' }); w.line(`BITMAP ${b.x},${b.y},${bm.bpr},${bm.h},0,`); w.raw(invBits(bm)); w.line(''); };
  if (o.type === 'text' || o.type === 'para') {
    for (const p of it.prims) if (p.t === 'text') {
      const F = fontDef(p.font), tb = zplBox(it, p.x, p.y - F.asc * p.size, p.w, p.size, ox, oy, dpi), pt = Math.max(4, Math.round(p.size * 72 / 25.4));
      w.line(`TEXT ${tb.x},${tb.y},"0",${r},${pt},${pt},${q(p.text)}`);
    }
    return;
  }
  if (o.type === 'barcode') {
    const g = it.geom, m = Math.max(1, mmToDots(g.module, dpi)), sb = zplBox(it, g.sym.x, g.sym.y, g.sym.w, g.sym.h, ox, oy, dpi);
    if (TSPL_BC[o.symbology] && !g.gs1) { const ratio = Math.round(m * (o.ratio || 2.5)); w.line(`BARCODE ${sb.x},${sb.y},"${TSPL_BC[o.symbology]}",${mmToDots(g.sym.h, dpi)},${o.hr === 'none' ? 0 : 2},${r},${m},${['code39', 'i2of5', 'itf14', 'codabar'].includes(o.symbology) ? ratio : m},${q(g.data)}`); return; }
    if (o.symbology === 'qrcode') { w.line(`QRCODE ${sb.x},${sb.y},${o.ec || 'M'},${m},A,${r},${q(g.data)}`); return; }
    if (o.symbology === 'datamatrix' && !r) { w.line(`DMATRIX ${sb.x},${sb.y},${sb.w + m},${sb.h + m},x${m},${q(g.data)}`); return; }
    return bitmap();
  }
  const p = it.prims[0];
  if (o.type === 'rect' && !p.fill && !p.r) { w.line(`BOX ${b.x},${b.y},${b.x + b.w},${b.y + b.h},${Math.max(1, mmToDots(p.sw, dpi))}`); return; }
  if (o.type === 'rect' && p.fill === '#000' && !p.r) { w.line(`BAR ${b.x},${b.y},${b.w},${b.h}`); return; }
  if (o.type === 'line' && p.t === 'rect') { const lb = zplBox(it, p.x, p.y, p.w, p.h, ox, oy, dpi); w.line(`BAR ${lb.x},${lb.y},${Math.max(1, lb.w)},${Math.max(1, lb.h)}`); return; }
  if (o.type === 'ellipse' && !p.fill) { w.line(`ELLIPSE ${b.x},${b.y},${b.w},${b.h},${Math.max(1, mmToDots(p.sw, dpi))}`); return; }
  if (o.type === 'inverse') { w.line(`REVERSE ${b.x},${b.y},${b.w},${b.h}`); return; }
  bitmap();
}
function buildTSPL(doc, scenes) {
  const dpi = doc.dpi, P = doc.printer || {}, w = byteWriter(), { stock, pages } = layoutPages(doc, scenes.length, 0);
  w.line(`SIZE ${num(stock.pageW, 2)} mm,${num(doc.label.h, 2)} mm`);
  w.line(P.media === 'continuous' ? 'GAP 0 mm,0 mm' : P.media === 'mark' ? `BLINE ${num(doc.label.gap || 3, 2)} mm,0 mm` : `GAP ${num(doc.label.gap || 3, 2)} mm,0 mm`);
  w.line(`DIRECTION ${P.rotate180 ? 1 : 0},0`); w.line('REFERENCE 0,0'); w.line(`DENSITY ${clamp(Math.round((P.darkness == null ? 15 : +P.darkness) / 2), 0, 15)}`); w.line(`SPEED ${clamp(+P.speed || 4, 1, 12)}`); w.line('CODEPAGE UTF-8');
  for (const pg of pages) {
    w.line('CLS');
    for (const s of pg.slots) for (const it of scenes[s.label]) if (!it.error) tsplItem(w, it, s.x, s.y, dpi, doc);
    w.line('PRINT 1,1');
  }
  return w.bytes();
}
function eplFont(hdots, dpi) {
  const H = dpi >= 300 ? [20, 28, 36, 44, 80] : [12, 16, 20, 24, 48];
  let best = [1, 1], err = Infinity;
  H.forEach((fh, i) => { for (let m = 1; m <= 8; m++) { const e = Math.abs(fh * m - hdots); if (e < err) { err = e; best = [i + 1, m]; } } });
  return best;
}
function eplItem(w, it, ox, oy, dpi, doc) {
  const o = it.obj, b = zplBox(it, 0, 0, it.lw, it.lh, ox, oy, dpi), r = ROT_IDX[it.rot];
  const bitmap = () => { const bm = rasterizeItem(doc, it, dpi, { dither: o.type === 'image' }); w.raw(new TextEncoder().encode(`GW${b.x},${b.y},${bm.bpr},${bm.h},`)); w.raw(invBits(bm)); w.line(''); };
  if (o.type === 'text' || o.type === 'para') {
    for (const p of it.prims) if (p.t === 'text') {
      const F = fontDef(p.font), tb = zplBox(it, p.x, p.y - F.asc * p.size, p.w, p.size, ox, oy, dpi), [fn, m] = eplFont(mmToDots(p.size * 0.8, dpi), dpi);
      w.line(`A${tb.x},${tb.y},${r},${fn},${m},${m},${p.color === '#fff' ? 'R' : 'N'},${q(p.text, true)}`);
    }
    return;
  }
  if (o.type === 'barcode') {
    const g = it.geom, m = Math.max(1, mmToDots(g.module, dpi)), sb = zplBox(it, g.sym.x, g.sym.y, g.sym.w, g.sym.h, ox, oy, dpi);
    if (EPL_BC[o.symbology] && !g.gs1) { w.line(`B${sb.x},${sb.y},${r},${EPL_BC[o.symbology]},${m},${Math.round(m * (o.ratio || 2.5))},${mmToDots(g.sym.h, dpi)},${o.hr === 'none' ? 'N' : 'B'},${q(o.symbology === 'ean13' ? g.data.slice(0, 12) : o.symbology === 'ean8' ? g.data.slice(0, 7) : o.symbology === 'upca' ? g.data.slice(0, 11) : g.data, true)}`); return; }
    if (o.symbology === 'qrcode' && !r) { w.line(`b${sb.x},${sb.y},Q,m2,s${clamp(m, 1, 99)},e${o.ec || 'M'},${q(g.data, true)}`); return; }
    return bitmap();
  }
  const p = it.prims[0];
  if (o.type === 'rect' && !p.fill && !p.r) { w.line(`X${b.x},${b.y},${Math.max(1, mmToDots(p.sw, dpi))},${b.x + b.w},${b.y + b.h}`); return; }
  if ((o.type === 'rect' && p.fill === '#000' && !p.r)) { w.line(`LO${b.x},${b.y},${b.w},${b.h}`); return; }
  if (o.type === 'line' && p.t === 'rect') { const lb = zplBox(it, p.x, p.y, p.w, p.h, ox, oy, dpi); w.line(`LO${lb.x},${lb.y},${Math.max(1, lb.w)},${Math.max(1, lb.h)}`); return; }
  if (o.type === 'inverse') { w.line(`LE${b.x},${b.y},${b.w},${b.h}`); return; }
  bitmap();
}
function buildEPL(doc, scenes) {
  const dpi = doc.dpi, P = doc.printer || {}, w = byteWriter(), { stock, pages } = layoutPages(doc, scenes.length, 0);
  for (const pg of pages) {
    w.line(''); w.line('N'); w.line(`q${mmToDots(stock.pageW, dpi)}`);
    w.line(P.media === 'continuous' ? `Q${mmToDots(doc.label.h, dpi)},0` : `Q${mmToDots(doc.label.h, dpi)},${P.media === 'mark' ? 'B' : ''}${mmToDots(doc.label.gap || 3, dpi)}`);
    w.line(`S${clamp(+P.speed || 4, 1, 6)}`); w.line(`D${clamp(Math.round((P.darkness == null ? 15 : +P.darkness) / 2), 0, 15)}`); w.line(P.rotate180 ? 'ZB' : 'ZT');
    for (const s of pg.slots) for (const it of scenes[s.label]) if (!it.error) eplItem(w, it, s.x, s.y, dpi, doc);
    w.line('P1,1');
  }
  return w.bytes();
}
