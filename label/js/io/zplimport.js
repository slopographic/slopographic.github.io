/* SlopLabel — io/zplimport: build a label from ZPL II (migrating from ZebraDesigner / NiceLabel / raw
 * templates). Parses the first ^XA…^XZ format: ^FO ^FT ^LH ^PW ^LL ^CF ^A ^FB ^FD ^FS ^FH ^FR ^FN ^SN
 * ^BY ^BC ^BE ^B8 ^BU ^B3 ^BA ^B2 ^BK ^BQ ^BX ^B7 ^B0 ^GB ^GE ^GC ^GD ^GF ^PQ. Also used for ZPL preview. */
'use strict';

/** Split ZPL into [{c:'FO', a:'10,20'}] commands; ^FD data runs to the next ^FS (or control char). */
function tokenizeZPL(src) {
  const s = String(src).replace(/\r/g, ''), out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch !== '^' && ch !== '~') { i++; continue; }
    const c = s.substr(i + 1, 2).toUpperCase();
    if (c === 'FD' || c === 'FV') { const e = s.indexOf('^FS', i + 3); const end = e < 0 ? s.length : e; out.push({ c: 'FD', a: s.slice(i + 3, end) }); i = end; continue; }
    if (c === 'FX') { const e = s.indexOf('^', i + 3); i = e < 0 ? s.length : e; continue; }
    if (c[0] === 'A' && c !== 'A@') { // ^A0N,30,30  → font letter is part of the command
      let j = i + 3; while (j < s.length && s[j] !== '^' && s[j] !== '~') j++;
      out.push({ c: 'A', a: c[1] + s.slice(i + 3, j).replace(/\n/g, '') }); i = j; continue;
    }
    let j = i + 3; while (j < s.length && s[j] !== '^' && s[j] !== '~') j++;
    out.push({ c, a: s.slice(i + 3, j).replace(/\n/g, '').trim() });
    i = j;
  }
  return out;
}
function unFH(data, esc) {
  if (!esc) return data;
  const bytes = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i] === esc && /^[0-9A-Fa-f]{2}$/.test(data.substr(i + 1, 2))) { bytes.push(parseInt(data.substr(i + 1, 2), 16)); i += 2; }
    else for (const b of new TextEncoder().encode(data[i])) bytes.push(b);
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
/** ^BC mode-N invocation codes → plain text (\x1d for FNC1); returns {text, gs1}. */
function zplCode128Text(d) {
  let set = 'B', out = '', gs1 = false;
  for (let i = 0; i < d.length; i++) {
    if (d[i] === '>' && i + 1 < d.length) {
      const k = d[++i];
      if (k === '<') { out += '>'; continue; }
      if (k === '9') { set = 'A'; continue; } if (k === ':') { set = 'B'; continue; } if (k === ';') { set = 'C'; continue; }
      if (k === '5') { set = 'C'; continue; } if (k === '6') { set = 'B'; continue; } if (k === '7') { set = 'A'; continue; }
      if (k === '8') { if (!out.length) gs1 = true; else out += '\x1d'; continue; }
      continue;
    }
    if (set === 'C' && /\d/.test(d[i])) { out += d.substr(i, 2); i++; continue; }
    out += d[i];
  }
  return { text: out, gs1 };
}
const ZPL_ORI = { N: 0, R: 90, I: 180, B: 270 };
/** Parse ZPL into a new document. opts: { dpi } */
async function importZPL(src, { dpi = 203 } = {}) {
  const T = tokenizeZPL(src);
  if (!T.some((t) => t.c === 'XA')) throw new Error('No ^XA … ^XZ label format found');
  const mm = (d) => round((+d || 0) * 25.4 / dpi, 3);
  const doc = newDoc({ name: 'Imported ZPL', unit: 'mm', dpi });
  doc.objects = [];
  let W = 0, H = 0, lh = [0, 0], cf = { f: '0', h: 30, w: 0 }, by = { w: 2, r: 3, h: 10 };
  let f = null; // current field
  const reset = () => { f = { x: 0, y: 0, ft: false, font: null, fb: null, bc: null, data: '', fh: null, fr: false, fn: null, gfx: null, sn: null }; };
  reset();
  let started = false, done = false, qty = 1;
  const varByField = new Map();
  for (const t of T) {
    if (done) break;
    const a = t.a.split(',');
    switch (t.c) {
      case 'XA': started = true; break;
      case 'XZ': if (started) done = true; break;
      case 'PW': W = +a[0] || W; break;
      case 'LL': H = +a[0] || H; break;
      case 'LH': lh = [+a[0] || 0, +a[1] || 0]; break;
      case 'CF': cf = { f: a[0] || cf.f, h: +a[1] || cf.h, w: +a[2] || 0 }; break;
      case 'BY': by = { w: +a[0] || by.w, r: +a[1] || by.r, h: +a[2] || by.h }; break;
      case 'FO': case 'FT': f.x = (+a[0] || 0) + lh[0]; f.y = (+a[1] || 0) + lh[1]; f.ft = t.c === 'FT'; break;
      case 'A': f.font = { f: t.a[0], o: ZPL_ORI[(a[0] || '').slice(1, 2).toUpperCase()] || 0, h: +a[1] || cf.h, w: +a[2] || 0 }; break;
      case 'FB': f.fb = { w: +a[0] || 0, lines: +a[1] || 1, just: (a[3] || 'L').toUpperCase() }; break;
      case 'FH': f.fh = a[0] || '_'; break;
      case 'FR': f.fr = true; break;
      case 'FN': f.fn = +a[0] || 1; break;
      case 'SN': f.sn = { start: a[0] || '1', inc: +a[1] || 1 }; break;
      case 'FD': f.data = t.a; break;
      case 'PQ': qty = +a[0] || 1; break;
      case 'BC': case 'BE': case 'B8': case 'BU': case 'B9': case 'B3': case 'BA': case 'B2': case 'BK': case 'BQ': case 'BX': case 'B7': case 'B0':
        f.bc = { c: t.c, a, by: { ...by } }; break;
      case 'GB': case 'GE': case 'GC': case 'GD': f.gfx = { c: t.c, a }; break;
      case 'GF': f.gfx = { c: 'GF', a: [a[0], a[1], a[2], a[3]], data: a.slice(4).join(',') }; break;
      case 'FS': {
        const o = await zplField(f, { mm, dpi, cf, by, doc });
        if (o) {
          if (f.fn || f.sn) {
            const name = f.sn ? 'Serial' : 'Field ' + f.fn;
            if (!varByField.has(name)) {
              const v = f.sn ? makeVar('counter', name, { start: parseInt(f.sn.start.replace(/\D/g, ''), 10) || 1, step: f.sn.inc, pad: f.sn.start.replace(/\D/g, '').length || 0 }) : makeVar('prompt', name, { prompt: 'Enter ' + name, def: o.content });
              doc.vars.push(v); varByField.set(name, v);
            }
            o.content = '{' + name + '}';
          }
          doc.objects.push(o);
        }
        reset();
        break;
      }
    }
  }
  if (W) doc.label.w = mm(W);
  if (H) doc.label.h = mm(H);
  if (!W || !H) {
    const b = unionBox(doc.objects.map(objBox)) || { x: 0, y: 0, w: 50, h: 25 };
    if (!W) doc.label.w = round(Math.max(10, b.x + b.w + 2), 2);
    if (!H) doc.label.h = round(Math.max(10, b.y + b.h + 2), 2);
  }
  doc.label.orientation = doc.label.h >= doc.label.w ? 'portrait' : 'landscape';
  doc.stock = { kind: 'roll', id: 'custom', name: 'Custom roll', cols: 1 };
  doc.importQty = qty;
  return doc;
}
async function zplField(f, { mm, dpi, cf, by, doc }) {
  const x = mm(f.x), y = mm(f.y);
  const data = unFH(f.data, f.fh);
  if (f.gfx) {
    const g = f.gfx, a = g.a.map((v) => +v || 0);
    if (g.c === 'GB') {
      const w = Math.max(a[2] || 1, a[0] || 1), h = Math.max(a[2] || 1, a[1] || 1), t = a[2] || 1, white = (g.a[3] || 'B').toUpperCase() === 'W';
      if (f.fr && t >= Math.min(w, h)) return makeObject('inverse', { x, y, w: mm(w), h: mm(h) });
      if (t >= Math.min(w, h) && (h <= t || w <= t)) return makeObject('line', { x, y, w: mm(w), h: mm(h), dir: w >= h ? 'h' : 'v', stroke: mm(Math.min(w, h)) });
      return makeObject('rect', { x, y, w: mm(w), h: mm(h), stroke: mm(t), fill: t * 2 >= Math.min(w, h) ? (white ? 'white' : 'black') : 'none', radius: round(((a[4] || 0) / 8) * mm(Math.min(w, h)) / 2, 3) });
    }
    if (g.c === 'GE' || g.c === 'GC') {
      const w = g.c === 'GC' ? a[0] : a[0], h = g.c === 'GC' ? a[0] : a[1], t = g.c === 'GC' ? a[1] || 1 : a[2] || 1;
      return makeObject('ellipse', { x, y, w: mm(w), h: mm(h), stroke: mm(t), fill: t * 2 >= Math.min(w, h) ? 'black' : 'none' });
    }
    if (g.c === 'GD') return makeObject('line', { x, y, w: mm(a[0] || 1), h: mm(a[1] || 1), stroke: mm(a[2] || 1), dir: (g.a[4] || 'R').toUpperCase() === 'L' ? 'd1' : 'd2' });
    if (g.c === 'GF') {
      const total = a[2] || a[1], bpr = a[3] || 1;
      let bits;
      const z = /^:(Z64|B64):(.*)$/s.exec(g.data.trim());
      if (z) bits = z[1] === 'Z64' ? await zplDecodeZ64(z[2]) : Uint8Array.from(atob(z[2].replace(/:[0-9a-f]{4}$/i, '')), (c) => c.charCodeAt(0));
      else bits = zplDecodeGFA(g.data.replace(/\s/g, ''), bpr, total);
      const h = Math.floor(total / bpr), w = bpr * 8;
      const id = uid('a');
      doc.assets[id] = bitsToDataURL(bits, bpr, w, h);
      return makeObject('image', { x, y, w: mm(w), h: mm(h), asset: id, aspect: w / h, keepAspect: true, name: 'Graphic' });
    }
  }
  if (f.bc) return zplBarcodeField(f, data, x, y, mm);
  if (!f.data && !f.font) return null;
  const font = f.font || { f: cf.f, o: 0, h: cf.h, w: cf.w };
  const hdots = font.h || 30, sizePt = round((hdots * 72) / dpi, 2);
  const isZ0 = font.f === '0';
  const props = { content: data, size: sizePt, font: isZ0 ? 'cond' : 'sans', bold: isZ0, rot: font.o, x, y, color: f.fr ? 'white' : 'black' };
  if (f.ft) props.y = round(y - mm(hdots) * 0.78, 3); // ^FT origin is the baseline
  if (f.fb && f.fb.w) {
    const w = mm(f.fb.w), h = mm(hdots * Math.max(1, f.fb.lines) * 1.15);
    Object.assign(props, { fit: 'box', wrap: f.fb.lines > 1, shrink: false, align: { C: 'center', R: 'right', J: 'left' }[f.fb.just] || 'left', lineSpacing: 1.15 });
    if (font.o === 90 || font.o === 270) Object.assign(props, { w: h, h: w }); else Object.assign(props, { w, h });
    return makeObject('text', props);
  }
  const o = makeObject('text', props);
  syncAutoSize(doc, o, () => undefined);
  o.x = x; o.y = props.y;
  return o;
}
function zplBarcodeField(f, data, x, y, mm) {
  const b = f.bc, a = b.a, ori = ZPL_ORI[(a[0] || 'N').toUpperCase()] || 0;
  const module = mm(b.by.w), hDots = (i) => +a[i] || b.by.h;
  const base = { x, y, rot: ori, module, quiet: false, snapDots: true, ratio: Math.min(3, Math.max(2, b.by.r || 3)) };
  const lin = (sym, hi, hrI, content, extra) => makeObject('barcode', Object.assign(base, { symbology: sym, barHeight: mm(hDots(hi)), hr: (a[hrI] || 'Y').toUpperCase() === 'N' ? 'none' : (a[hrI + 1] || 'N').toUpperCase() === 'Y' ? 'above' : 'below', content }, extra || {}));
  switch (b.c) {
    case 'BC': {
      const mode = (a[5] || 'N').toUpperCase();
      if (mode === 'D') return lin('gs1-128', 1, 2, data.replace(/\s/g, ''));
      const r = /^>[9:;]/.test(data) ? zplCode128Text(data) : { text: data, gs1: false };
      if (r.gs1) { try { return lin('gs1-128', 1, 2, gs1Text(gs1FromRaw(r.text)), { hr: 'below' }); } catch (e) { /* fall through */ } }
      return lin('code128', 1, 2, r.text);
    }
    case 'BE': return lin('ean13', 1, 2, data);
    case 'B8': return lin('ean8', 1, 2, data);
    case 'BU': return lin('upca', 1, 2, data);
    case 'B9': return lin('upce', 1, 2, data);
    case 'B3': return lin('code39', 2, 3, data, { check: (a[1] || 'N').toUpperCase() === 'Y' ? 'mod43' : 'auto' });
    case 'BA': return lin('code93', 1, 2, data);
    // ITF-14 bearer bars come in as their own ^GB box, so the barcode itself draws none
    case 'B2': return /^\d{14}$/.test(data) ? lin('itf14', 1, 2, data, { bearer: false }) : lin('i2of5', 1, 2, data);
    case 'BK': return lin('codabar', 2, 3, (a[5] || 'A') + data + (a[6] || 'A'));
    case 'BQ': {
      const m = /^([LMQH])?([AM])?,?(.*)$/s.exec(data) || [];
      return makeObject('barcode', Object.assign(base, { symbology: 'qrcode', module: mm(+a[2] || 2), ec: m[1] || 'M', content: m[3] != null ? m[3] : data, hr: 'none', rot: 0 }));
    }
    case 'BX': {
      const gs1 = a[6] && data.startsWith(a[6] + '1');
      let content = data;
      if (gs1) { try { content = gs1Text(gs1FromRaw(data.slice(2).split(a[6] + '1').join('\x1d'))); } catch (e) { /* keep raw */ } }
      return makeObject('barcode', Object.assign(base, { symbology: gs1 ? 'gs1datamatrix' : 'datamatrix', module: mm(+a[1] || 4), content, hr: 'none' }));
    }
    case 'B7': return makeObject('barcode', Object.assign(base, { symbology: 'pdf417', security: +a[2] || 2, columns: +a[3] || 0, content: data, hr: 'none' }));
    case 'B0': return makeObject('barcode', Object.assign(base, { symbology: 'aztec', module: mm(+a[1] || 3), content: data, hr: 'none' }));
  }
  return null;
}
