/* SlopLabel — print/pdf: a small hand-written PDF 1.4 generator. Exact page size in points, vector
 * barcodes and shapes, base-14 fonts (WinAnsi) with Tz so text widths match the layout, JPEG
 * pass-through, other images as Flate RGB + alpha soft mask, inverse boxes via /BM /Difference. */
'use strict';

const PT = 72 / 25.4;
const WIN_EXTRA = { 0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a, 0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c, 0x17e: 0x9e, 0x178: 0x9f };
/** Unicode → WinAnsi bytes, or null if a character has no WinAnsi code. */
function winAnsi(s) {
  const out = [];
  for (const ch of s) { const c = ch.codePointAt(0); if (c < 0x80 || (c >= 0xa0 && c <= 0xff)) out.push(c); else if (WIN_EXTRA[c]) out.push(WIN_EXTRA[c]); else return null; }
  return out;
}
function pdfStr(bytes) { let s = '('; for (const b of bytes) s += b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + String.fromCharCode(b) : b < 32 || b > 126 ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b); return s + ')'; }
function pdfText(s) { const b = winAnsi(s) || [...s].map((c) => (c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63)); return pdfStr(b); }
const n4 = (v) => num(v, 4);
async function deflate(u8) {
  const cs = new CompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer());
}
const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
function dataURLBytes(u) { const b = atob(u.slice(u.indexOf(',') + 1)); return latin1(b); }
function jpegInfo(u8) {
  for (let i = 2; i < u8.length - 9;) {
    if (u8[i] !== 0xff) return null;
    const m = u8[i + 1], len = (u8[i + 2] << 8) | u8[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
    i += 2 + len;
  }
  return null;
}
function pathRoundRect(x, y, w, h, r) {
  if (!(r > 0)) return `${n4(x)} ${n4(y)} ${n4(w)} ${n4(h)} re\n`;
  const k = 0.5523 * r;
  return `${n4(x + r)} ${n4(y)} m ${n4(x + w - r)} ${n4(y)} l ${n4(x + w - r + k)} ${n4(y)} ${n4(x + w)} ${n4(y + r - k)} ${n4(x + w)} ${n4(y + r)} c ${n4(x + w)} ${n4(y + h - r)} l ${n4(x + w)} ${n4(y + h - r + k)} ${n4(x + w - r + k)} ${n4(y + h)} ${n4(x + w - r)} ${n4(y + h)} c ${n4(x + r)} ${n4(y + h)} l ${n4(x + r - k)} ${n4(y + h)} ${n4(x)} ${n4(y + h - r + k)} ${n4(x)} ${n4(y + h - r)} c ${n4(x)} ${n4(y + r)} l ${n4(x)} ${n4(y + r - k)} ${n4(x + r - k)} ${n4(y)} ${n4(x + r)} ${n4(y)} c h\n`;
}
function pathEllipse(cx, cy, rx, ry) {
  const kx = 0.5523 * rx, ky = 0.5523 * ry;
  return `${n4(cx + rx)} ${n4(cy)} m ${n4(cx + rx)} ${n4(cy + ky)} ${n4(cx + kx)} ${n4(cy + ry)} ${n4(cx)} ${n4(cy + ry)} c ${n4(cx - kx)} ${n4(cy + ry)} ${n4(cx - rx)} ${n4(cy + ky)} ${n4(cx - rx)} ${n4(cy)} c ${n4(cx - rx)} ${n4(cy - ky)} ${n4(cx - kx)} ${n4(cy - ry)} ${n4(cx)} ${n4(cy - ry)} c ${n4(cx + kx)} ${n4(cy - ry)} ${n4(cx + rx)} ${n4(cy - ky)} ${n4(cx + rx)} ${n4(cy)} c h\n`;
}
const sansOf = (fam) => (fam === 'serif' ? 'serif' : fam === 'mono' ? 'mono' : 'sans');

/** Build a PDF of laid-out labels. Returns Uint8Array. */
async function buildPDF(doc, scenes, { start = 0, title = 'Labels', compress = true } = {}) {
  const { stock, pages } = layoutPages(doc, scenes.length, start);
  const fonts = new Map(), images = new Map();
  let needDiff = false, rasterSeq = 0;
  const rasters = []; // fallback images for text outside WinAnsi
  const fontRes = (name) => { if (!fonts.has(name)) fonts.set(name, '/F' + (fonts.size + 1)); return fonts.get(name); };
  const imgRes = (key) => { if (!images.has(key)) images.set(key, '/Im' + (images.size + 1)); return images.get(key); };
  function itemOps(it) {
    let s = '';
    for (const p of it.prims) {
      switch (p.t) {
        case 'bars': s += '0 g\n'; for (const r of p.rects) s += `${n4(r.x)} ${n4(r.y)} ${n4(r.w)} ${n4(r.h)} re\n`; s += 'f\n'; break;
        case 'text': {
          const name = pdfFontName(p.font, p.bold, p.italic), nat = measureMM(p.text, sansOf(p.font), p.bold, p.italic, p.size);
          const tz = nat > 0 ? (100 * p.w) / nat : 100;
          s += `${p.color === '#fff' ? '1' : '0'} g BT ${fontRes(name)} ${n4(p.size)} Tf ${n4(tz)} Tz 1 0 0 -1 ${n4(p.x)} ${n4(p.y)} Tm ${pdfText(p.text)} Tj ET\n`;
          break;
        }
        case 'rect':
          if (p.fill) s += `${p.fill === '#fff' ? '1' : '0'} g ` + pathRoundRect(p.x, p.y, p.w, p.h, p.r) + 'f\n';
          if (p.sw > 0) s += `0 G ${n4(p.sw)} w ` + pathRoundRect(p.x + p.sw / 2, p.y + p.sw / 2, p.w - p.sw, p.h - p.sw, Math.max(0, (p.r || 0) - p.sw / 2)) + 'S\n';
          break;
        case 'ellipse': {
          const path = pathEllipse(p.x + p.w / 2, p.y + p.h / 2, Math.max(0.01, p.w / 2 - p.sw / 2), Math.max(0.01, p.h / 2 - p.sw / 2));
          if (p.fill) s += `${p.fill === '#fff' ? '1' : '0'} g ` + path + 'f\n';
          if (p.sw > 0) s += `0 G ${n4(p.sw)} w ` + path + 'S\n';
          break;
        }
        case 'line': s += `0 G ${n4(p.sw)} w 0 J ${n4(p.x1)} ${n4(p.y1)} m ${n4(p.x2)} ${n4(p.y2)} l S\n`; break;
        case 'invert': needDiff = true; s += `q /GSd gs 1 g ${n4(p.x)} ${n4(p.y)} ${n4(p.w)} ${n4(p.h)} re f Q\n`; break;
        case 'image': if (doc.assets[p.asset]) s += `q ${n4(p.w)} 0 0 ${n4(-p.h)} ${n4(p.x)} ${n4(p.y + p.h)} cm ${imgRes(p.asset)} Do Q\n`; break;
      }
    }
    return s;
  }
  const contents = [];
  for (const pg of pages) {
    let s = `${n4(PT)} 0 0 ${n4(-PT)} 0 ${n4(stock.pageH * PT)} cm\n`;
    for (const slot of pg.slots) {
      s += `q 1 0 0 1 ${n4(slot.x)} ${n4(slot.y)} cm 0 0 ${n4(doc.label.w)} ${n4(doc.label.h)} re W n\n`;
      for (const it of scenes[slot.label]) {
        if (it.error) continue;
        const m = itemMatrix(it);
        const bad = it.prims.some((p) => p.t === 'text' && !winAnsi(p.text));
        if (bad) {
          // characters outside WinAnsi: embed this item as a 600 dpi image instead
          const key = 'raster' + ++rasterSeq;
          rasters.push({ key, it });
          s += `q ${n4(it.box.w)} 0 0 ${n4(-it.box.h)} ${n4(it.box.x)} ${n4(it.box.y + it.box.h)} cm ${imgRes(key)} Do Q\n`;
          continue;
        }
        s += `q ${m.map(n4).join(' ')} cm\n` + itemOps(it) + 'Q\n';
      }
      s += 'Q\n';
    }
    contents.push(s);
  }
  // ---- serialise ----
  const objs = []; // index = id-1; each { head, stream? }
  const add = (head, stream) => { objs.push({ head, stream }); return objs.length; };
  const ref = (id) => `${id} 0 R`;
  const stream = async (dict, bytes, already) => {
    if (compress && !already) { const z = await deflate(bytes); return { head: `<< ${dict} /Filter /FlateDecode /Length ${z.length} >>`, stream: z }; }
    return { head: `<< ${dict} /Length ${bytes.length} >>`, stream: bytes };
  };
  const catalogId = add(''), pagesId = add(''), resId = add(''), infoId = add('');
  const fontIds = [];
  for (const [name, res] of fonts) fontIds.push(`${res} ${ref(add(`<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`))}`);
  const imgIds = [];
  for (const [key, res] of images) {
    let id;
    const ras = rasters.find((r) => r.key === key);
    if (ras) id = await addCanvasImage(objs, add, stream, itemCanvas(doc, ras.it));
    else {
      const url = doc.assets[key];
      const bytes = dataURLBytes(url), jp = /^data:image\/jpe?g/i.test(url) ? jpegInfo(bytes) : null;
      if (jp && (jp.comps === 1 || jp.comps === 3)) { const o = await stream(`/Type /XObject /Subtype /Image /Width ${jp.w} /Height ${jp.h} /ColorSpace /${jp.comps === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, bytes, true); id = add(o.head, o.stream); }
      else { await preloadImages(doc); const img = assetImage(doc, key); id = img ? await addCanvasImage(objs, add, stream, imageCanvas(img)) : null; }
    }
    if (id) imgIds.push(`${res} ${ref(id)}`);
  }
  const pageIds = [];
  for (const c of contents) {
    const st = await stream('', latin1(c));
    const cid = add(st.head, st.stream);
    pageIds.push(add(`<< /Type /Page /Parent ${ref(pagesId)} /MediaBox [0 0 ${n4(stock.pageW * PT)} ${n4(stock.pageH * PT)}] /Resources ${ref(resId)} /Contents ${ref(cid)} >>`));
  }
  objs[catalogId - 1].head = `<< /Type /Catalog /Pages ${ref(pagesId)} >>`;
  objs[pagesId - 1].head = `<< /Type /Pages /Kids [${pageIds.map(ref).join(' ')}] /Count ${pageIds.length} >>`;
  objs[resId - 1].head = `<< /ProcSet [/PDF /Text /ImageB /ImageC] /Font << ${fontIds.join(' ')} >> /XObject << ${imgIds.join(' ')} >>${needDiff ? ' /ExtGState << /GSd << /Type /ExtGState /BM /Difference >> >>' : ''} >>`;
  const d = new Date(), p2 = (v) => String(v).padStart(2, '0');
  objs[infoId - 1].head = `<< /Title ${pdfText(title)} /Producer (SlopLabel - slopographic.com) /CreationDate (D:${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}) >>`;
  const chunks = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let off = chunks[0].length;
  const xref = [];
  objs.forEach((o, i) => {
    xref.push(off);
    const head = latin1(`${i + 1} 0 obj\n${o.head}\n`);
    chunks.push(head); off += head.length;
    if (o.stream) { const a = latin1('stream\n'), b = latin1('\nendstream\n'); chunks.push(a, o.stream, b); off += a.length + o.stream.length + b.length; }
    const e = latin1('endobj\n'); chunks.push(e); off += e.length;
  });
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of xref) x += String(o).padStart(10, '0') + ' 00000 n \n';
  x += `trailer\n<< /Size ${objs.length + 1} /Root ${ref(catalogId)} /Info ${ref(infoId)} >>\nstartxref\n${off}\n%%EOF\n`;
  chunks.push(latin1(x));
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let k = 0; for (const c of chunks) { out.set(c, k); k += c.length; }
  return out;
}
function imageCanvas(img) {
  const s = Math.min(1, 2500 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((img.naturalWidth || 300) * s)); c.height = Math.max(1, Math.round((img.naturalHeight || 300) * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function itemCanvas(doc, it) {
  const k = 600 / 25.4, c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(it.box.w * k)); c.height = Math.max(1, Math.ceil(it.box.h * k));
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, -it.box.x * k, -it.box.y * k);
  drawItems(g, [it], { doc });
  return c;
}
async function addCanvasImage(objs, add, stream, c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, n = c.width * c.height;
  const rgb = new Uint8Array(n * 3), a = new Uint8Array(n);
  let alpha = false;
  for (let i = 0; i < n; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; a[i] = d[i * 4 + 3]; if (a[i] < 255) alpha = true; }
  let smask = '';
  if (alpha) { const sm = await stream(`/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceGray /BitsPerComponent 8`, a); smask = ` /SMask ${add(sm.head, sm.stream)} 0 R`; }
  const im = await stream(`/Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${smask}`, rgb);
  return add(im.head, im.stream);
}
