/* SlopLabel — print/zpl: Zebra ZPL II export. Text as ^A0 scalable font (or exact ^GFA graphics),
 * barcodes as native ^BC/^BE/^B8/^BU/^B3/^BA/^B2/^BK/^BQ/^BX/^B7/^B0 commands (Code 128 with
 * explicit subset invocations from our own encoder), shapes as ^GB/^GE/^GD, images as ^GFA. */
'use strict';

const ZPL_ROT = { 0: 'N', 90: 'R', 180: 'I', 270: 'B' };
/** Bounding box in dots of a local rect of an item, offset by the slot position. */
function zplBox(it, lx, ly, lw, lh, ox, oy, dpi) {
  const pts = [[lx, ly], [lx + lw, ly], [lx, ly + lh], [lx + lw, ly + lh]].map(([x, y]) => itemToLabel(it, x, y));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: mmToDots(Math.min(...xs) + ox, dpi), y: mmToDots(Math.min(...ys) + oy, dpi), w: mmToDots(Math.max(...xs) - Math.min(...xs), dpi), h: mmToDots(Math.max(...ys) - Math.min(...ys), dpi) };
}
function fd(s) { const f = zplFieldData(s); return `${f.fh}^FD${f.data}^FS`; }
/** Code 128 symbol values → ^BC mode-N field data with >9 >: >; >5 >6 >7 >8 invocations. */
function code128ToZPL(vals) {
  const body = vals.slice(0, -2); // drop check + stop (the printer adds them)
  let set = { 103: 'A', 104: 'B', 105: 'C' }[body[0]], s = { A: '>9', B: '>:', C: '>;' }[set];
  for (let i = 1; i < body.length; i++) {
    const v = body[i];
    if (set === 'C' && v < 100) { s += String(v).padStart(2, '0'); continue; }
    if (v === 102) { s += '>8'; continue; }
    if (v === 99) { s += '>5'; set = 'C'; continue; }
    if (v === 100) { s += '>6'; set = 'B'; continue; }
    if (v === 101) { s += '>7'; set = 'A'; continue; }
    if (v === 98) { s += '>4'; const n = body[++i], other = set === 'A' ? 'B' : 'A'; s += chr128(n, other); continue; }
    s += chr128(v, set);
  }
  return s;
}
function chr128(v, set) {
  const c = set === 'A' ? (v < 64 ? v + 32 : v - 64) : v + 32;
  if (c === 62) return '><';
  return String.fromCharCode(c);
}
function zplBarcode(it, o, ox, oy, dpi, opts) {
  const g = it.geom, r = ZPL_ROT[it.rot], m = Math.max(1, mmToDots(g.module, dpi));
  const sym = g.sym, bars = mmToDots(sym.h, dpi);
  const S = SYM[o.symbology];
  const hrY = o.hr === 'below' ? 'Y' : 'N', above = o.hr === 'above' ? 'Y' : 'N';
  let cmd = null, data = g.data;
  const graphic = () => `^FO${it.gx},${it.gy}${zplGFA(rasterizeItem(opts.doc, it, dpi))}^FS\n`;
  switch (o.symbology) {
    case 'code128': case 'gs1-128': {
      const vals = g.gs1 ? code128Encode(gs1Raw(g.gs1), { gs1: true }) : code128Encode(g.data);
      cmd = g.gs1 ? `^BY${m}^BC${r},${bars},N,N,N,N` : `^BY${m}^BC${r},${bars},${hrY},${above},N,N`; data = code128ToZPL(vals);
      break;
    }
    case 'ean13': cmd = `^BY${m}^BE${r},${bars},${hrY},${above}`; data = g.data.slice(0, 12); break;
    case 'ean8': cmd = `^BY${m}^B8${r},${bars},${hrY},${above}`; data = g.data.slice(0, 7); break;
    case 'upca': cmd = `^BY${m}^BU${r},${bars},${hrY},${above},Y`; data = g.data.slice(0, 11); break;
    case 'code39': cmd = `^BY${m},${num(o.ratio || 2.5, 1)}^B3${r},${o.check === 'mod43' ? 'Y' : 'N'},${bars},${hrY},${above}`; break;
    case 'code93': cmd = `^BY${m}^BA${r},${bars},${hrY},${above},N`; break;
    case 'i2of5': cmd = `^BY${m},${num(o.ratio || 2.5, 1)}^B2${r},${bars},${hrY},${above},N`; break;
    case 'itf14': cmd = `^BY${m},${num(o.ratio || 2.5, 1)}^B2${r},${bars},${hrY},${above},N`; break;
    case 'codabar': cmd = `^BY${m},${num(o.ratio || 2.5, 1)}^BK${r},N,${bars},${hrY},${above},${g.data[0]},${g.data.slice(-1)}`; data = g.data.slice(1, -1); break;
    case 'qrcode': if (it.rot) return graphic(); cmd = `^BQN,2,${clamp(m, 1, 10)}`; data = `${o.ec || 'M'}A,${g.data}`; break;
    case 'datamatrix': if (o.dmShape === 'rect') return graphic(); cmd = `^BX${r},${m},200`; break;
    case 'gs1datamatrix': cmd = `^BX${r},${m},200,,,,_`; data = '_1' + gs1Raw(g.gs1).replace(/\x1d/g, '_1'); break;
    case 'pdf417': cmd = `^BY${m}^B7${r},${m * 3},${+o.security || 2},${+o.columns || ''}`; break;
    case 'aztec': cmd = `^B0${r},${clamp(m, 1, 10)},N,0`; break;
    default: return graphic();
  }
  if (opts.barcodes === 'graphic') return graphic();
  // origin: top-left of the symbol (bars) in label space; human-readable text added by us for Code 128
  const box = zplBox(it, sym.x, sym.y, sym.w, sym.h, ox, oy, dpi);
  let out = `^FO${box.x},${box.y}${cmd}${fd(data)}\n`;
  if (o.symbology === 'itf14' && o.bearer !== false) {
    const bt = Math.max(2 * g.module, 0.5), bb = zplBox(it, 0, sym.y - bt, g.w, sym.h + 2 * bt, ox, oy, dpi);
    out += `^FO${bb.x},${bb.y}^GB${bb.w},${bb.h},${Math.max(1, mmToDots(bt, dpi))}^FS\n`;
  }
  if (o.symbology === 'gs1-128' && o.hr !== 'none') out += zplTexts(it, ox, oy, dpi, (p) => p.t === 'text');
  return out;
}
/** Text prims as ^A0 fields, one per laid-out run. */
function zplTexts(it, ox, oy, dpi, filter = () => true) {
  let out = '';
  const r = ZPL_ROT[it.rot];
  for (const p of it.prims) {
    if (p.t !== 'text' || !filter(p)) continue;
    const F = fontDef(p.font), top = p.y - F.asc * p.size, hmm = p.size * (F.asc + F.desc);
    const box = zplBox(it, p.x, top, p.w, hmm, ox, oy, dpi);
    const h = Math.max(6, mmToDots(p.size, dpi)), w = Math.max(5, Math.round(h * (p.bold ? 0.95 : 0.85)));
    out += `^FO${box.x},${box.y}^A0${r},${h},${w}${p.color === '#fff' ? '^FR' : ''}^FB${Math.max(1, it.rot % 180 ? box.h : box.w) + 4},1,0,L,0${fd(p.text)}\n`;
  }
  return out;
}
function zplObject(it, ox, oy, dpi, opts) {
  const o = it.obj, b = zplBox(it, 0, 0, it.lw, it.lh, ox, oy, dpi);
  it.gx = b.x; it.gy = b.y;
  const graphic = () => `^FO${b.x},${b.y}${zplGFA(rasterizeItem(opts.doc, it, dpi, { dither: o.type === 'image' && o.dither !== false, threshold: o.threshold || 128 }))}^FS\n`;
  switch (o.type) {
    case 'text': case 'para': return opts.text === 'graphic' || o.zplGraphic ? graphic() : zplTexts(it, ox, oy, dpi);
    case 'barcode': return zplBarcode(it, o, ox, oy, dpi, opts);
    case 'image': return graphic();
    case 'rect': {
      const p = it.prims[0], t = p.fill === '#000' ? Math.min(b.w, b.h) : Math.max(1, mmToDots(p.sw, dpi));
      if (p.fill === '#fff' && !p.sw) return '';
      const rr = Math.round(clamp((p.r || 0) / (Math.min(it.lw, it.lh) / 2), 0, 1) * 8);
      return `^FO${b.x},${b.y}^GB${Math.max(1, b.w)},${Math.max(1, b.h)},${t},${p.fill === '#fff' ? 'W' : 'B'},${rr}^FS\n`;
    }
    case 'ellipse': {
      const p = it.prims[0], t = p.fill === '#000' ? Math.ceil(Math.min(b.w, b.h) / 2) : Math.max(1, mmToDots(p.sw, dpi));
      return `^FO${b.x},${b.y}^GE${Math.max(1, b.w)},${Math.max(1, b.h)},${t},B^FS\n`;
    }
    case 'line': {
      const p = it.prims[0];
      if (p.t === 'rect') { const lb = zplBox(it, p.x, p.y, p.w, p.h, ox, oy, dpi); return `^FO${lb.x},${lb.y}^GB${Math.max(1, lb.w)},${Math.max(1, lb.h)},${Math.max(1, Math.min(lb.w, lb.h))}^FS\n`; }
      const lx = itemToLabel(it, p.x1, p.y1), rx = itemToLabel(it, p.x2, p.y2);
      const lean = (rx[0] - lx[0]) * (rx[1] - lx[1]) > 0 ? 'L' : 'R';
      return `^FO${b.x},${b.y}^GD${Math.max(1, b.w)},${Math.max(1, b.h)},${Math.max(1, mmToDots(p.sw, dpi))},B,${lean}^FS\n`;
    }
    case 'inverse': return `^FO${b.x},${b.y}^GB${Math.max(1, b.w)},${Math.max(1, b.h)},${Math.max(1, Math.min(b.w, b.h))}^FR^FS\n`;
  }
  return '';
}
/** Full ZPL for a print job. scenes[i] belongs to job label i; labels sharing `key` are identical copies (^PQ). */
function buildZPL(doc, scenes, { keys = null, text = 'font', barcodes = 'native', start = 0 } = {}) {
  const dpi = doc.dpi, P = doc.printer || {};
  const { stock, pages } = layoutPages(doc, scenes.length, 0);
  let out = `~SD${clamp(P.darkness == null ? 15 : +P.darkness, 0, 30)}\n`;
  const opts = { doc, text, barcodes };
  for (let pi = 0; pi < pages.length; pi++) {
    const pg = pages[pi];
    let qty = 1;
    // merge identical consecutive single-label pages into one format with ^PQ
    if (keys && stock.cols === 1) while (pi + qty < pages.length && keys[pages[pi + qty].slots[0].label] === keys[pg.slots[0].label]) qty++;
    let s = '^XA\n^CI28\n';
    s += `^PW${mmToDots(stock.pageW, dpi)}\n^LL${mmToDots(doc.label.h, dpi)}\n^LH${(P.labelHome || [0, 0]).map((v) => mmToDots(+v || 0, dpi)).join(',')}\n`;
    s += `^MN${{ gap: 'Y', mark: 'M', continuous: 'N' }[P.media] || 'Y'}^MT${P.method === 'transfer' ? 'T' : 'D'}^PR${clamp(+P.speed || 4, 1, 14)}^PO${P.rotate180 ? 'I' : 'N'}\n`;
    for (const slot of pg.slots) for (const it of scenes[slot.label]) if (!it.error) s += zplObject(it, slot.x, slot.y, dpi, opts);
    s += `^PQ${qty},0,1,Y\n^XZ\n`;
    out += s;
    pi += qty - 1;
  }
  return out;
}
