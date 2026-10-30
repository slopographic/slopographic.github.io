/* PhotoSlop: more file formats. TIFF (baseline + LZW/PackBits/Deflate), OpenRaster (.ora, read/write),
 * Krita (.kra, flattened), and magic-byte sniffing so files open whatever their extension says. */
'use strict';

/* ---------- ZIP reading (for .ora / .kra) ---------- */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip files');
  const ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
function zipEntries(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a valid ZIP-based file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), out = new Map();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    out.set(name, { method, csize, lho });
    p += 46 + nlen + xlen + clen;
  }
  return {
    has: (n) => out.has(n),
    names: () => [...out.keys()],
    async get(name) {
      const e = out.get(name); if (!e) return null;
      const nl = dv.getUint16(e.lho + 26, true), xl = dv.getUint16(e.lho + 28, true), start = e.lho + 30 + nl + xl;
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return data.slice();
      if (e.method === 8) return inflateRaw(data);
      throw new Error('Unsupported ZIP compression');
    },
  };
}
async function bytesToCanvas(bytes, type = 'image/png') { return fileToCanvas(new Blob([bytes], { type })); }

/* ---------- OpenRaster ---------- */
const ORA_OPS = { 'svg:src-over': 'normal', 'svg:multiply': 'multiply', 'svg:screen': 'screen', 'svg:overlay': 'overlay', 'svg:darken': 'darken', 'svg:lighten': 'lighten', 'svg:color-dodge': 'color-dodge', 'svg:color-burn': 'color-burn', 'svg:hard-light': 'hard-light', 'svg:soft-light': 'soft-light', 'svg:difference': 'difference', 'svg:exclusion': 'exclusion', 'svg:hue': 'hue', 'svg:saturation': 'saturation', 'svg:color': 'color', 'svg:luminosity': 'luminosity', 'svg:plus': 'add' };
async function readORA(buf) {
  const z = zipEntries(buf);
  const xml = new DOMParser().parseFromString(new TextDecoder().decode(await z.get('stack.xml')), 'application/xml');
  const img = xml.querySelector('image');
  const w = +img.getAttribute('w'), hh = +img.getAttribute('h');
  const layers = [];
  // stack.xml lists layers top → bottom; nested stacks are flattened in order.
  const walk = async (node, hidden, opacity) => {
    for (const el of [...node.children].reverse()) {
      const vis = el.getAttribute('visibility') !== 'hidden' && !hidden, op = (el.hasAttribute('opacity') ? +el.getAttribute('opacity') : 1) * opacity;
      if (el.tagName === 'stack') await walk(el, !vis, op);
      else if (el.tagName === 'layer' && el.getAttribute('src')) {
        const bytes = await z.get(el.getAttribute('src')); if (!bytes) continue;
        layers.push({ name: el.getAttribute('name') || 'Layer', canvas : await bytesToCanvas(bytes), x: +(el.getAttribute('x') || 0), y: +(el.getAttribute('y') || 0), visible: vis, opacity: op, blend: ORA_OPS[el.getAttribute('composite-op')] || 'normal' }); // i18n-ignore: layer names are the document's
      }
    }
  };
  await walk(xml.querySelector('image > stack') || img, false, 1);
  if (!layers.length && z.has('mergedimage.png')) layers.push({ name: tr('photoslop.layer.background'), canvas: await bytesToCanvas(await z.get('mergedimage.png')) });
  return { w: w || layers[0].canvas.width, h: hh || layers[0].canvas.height, layers };
}
async function readKRA(buf) {
  const z = zipEntries(buf);
  const bytes = await z.get('mergedimage.png');
  if (!bytes) throw new Error('This Krita file has no merged image');
  const c = await bytesToCanvas(bytes);
  toast(tr('photoslop.io.krita_flat'), 3200);
  return { w: c.width, h: c.height, layers: [{ name: tr('photoslop.layer.background'), canvas: c }] };
}
async function writeORA() {
  const enc = new TextEncoder(), esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const opOf = Object.fromEntries(Object.entries(ORA_OPS).map(([k, v]) => [v, k]));
  const files = [{ name: 'mimetype', data: enc.encode('image/openraster') }], rows = [];
  for (let i = D.layers.length - 1; i >= 0; i--) {
    const L = D.layers[i], b = bakedLayer(L), src = `data/layer${i}.png`;
    files.push({ name: src, data: new Uint8Array(await (await canvasToBlob(b.canvas)).arrayBuffer()) });
    rows.push(`    <layer name="${esc(L.name)}" src="${src}" x="${b.x}" y="${b.y}" opacity="${L.opacity.toFixed(3)}" visibility="${L.visible ? 'visible' : 'hidden'}" composite-op="${opOf[L.blend] || 'svg:src-over'}"/>`);
  }
  const flat = flattenCanvas(), k = Math.min(1, 256 / Math.max(D.w, D.h)), th = resampleCanvas(flat, Math.max(1, Math.round(D.w * k)), Math.max(1, Math.round(D.h * k)));
  files.push({ name: 'stack.xml', data: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n<image version="0.0.5" w="${D.w}" h="${D.h}">\n  <stack>\n${rows.join('\n')}\n  </stack>\n</image>\n`) });
  files.push({ name: 'mergedimage.png', data: new Uint8Array(await (await canvasToBlob(flat)).arrayBuffer()) });
  files.push({ name: 'Thumbnails/thumbnail.png', data: new Uint8Array(await (await canvasToBlob(th)).arrayBuffer()) });
  return zipStore(files);
}
async function saveORA() {
  document.body.classList.add('busy');
  try { download(await writeORA(), safeName() + '.ora'); toast(tr('photoslop.io.saved_ora', { name: safeName() })); }
  catch (e) { alertDlg(tr('photoslop.io.save_failed'), e.message); }
  document.body.classList.remove('busy');
}

/* ---------- TIFF ---------- */
function lzwDecode(src, expected) {
  const out = new Uint8Array(expected); let op = 0;
  let dict = [], bitPos = 0, width = 9, prev = null;
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict[i] = [i]; dict[256] = null; dict[257] = null; width = 9; prev = null; };
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++) { const byte = src[(bitPos >> 3)]; if (byte === undefined) return 257; v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1); bitPos++; }
    return v;
  };
  reset();
  for (;;) {
    const code = read();
    if (code === 257) break;
    if (code === 256) { reset(); continue; }
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else if (prev) entry = prev.concat([prev[0]]);
    else break;
    for (let i = 0; i < entry.length && op < expected; i++) out[op++] = entry[i];
    if (prev) dict.push(prev.concat([entry[0]]));
    prev = entry;
    if (dict.length + 1 >= 1 << width && width < 12) width++;
    if (op >= expected) break;
  }
  return out;
}
async function readTIFF(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  const le = dv.getUint16(0) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  if (u16(2) === 43) throw new Error('BigTIFF files are not supported');
  if (u16(2) !== 42) throw new Error('Not a TIFF file');
  const ifd = u32(4), n = u16(ifd), tags = {};
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4), sz = (SIZE[type] || 1) * count;
    const off = sz <= 4 ? e + 8 : u32(e + 8), vals = [];
    for (let k = 0; k < Math.min(count, 1 << 20); k++) vals.push(type === 3 || type === 8 ? u16(off + k * 2) : type === 4 || type === 9 ? u32(off + k * 4) : type === 1 || type === 2 || type === 7 || type === 6 ? u8[off + k] : u32(off + k * 4));
    tags[tag] = vals;
  }
  const W = tags[256][0], H = tags[257][0], spp = (tags[277] || [1])[0], bps = (tags[258] || [1])[0], comp = (tags[259] || [1])[0], photo = (tags[262] || [2])[0], pred = (tags[317] || [1])[0];
  if ((tags[284] || [1])[0] !== 1) throw new Error('Planar (separate-plane) TIFFs are not supported');
  if (![1, 8, 16].includes(bps)) throw new Error(`${bps}-bit TIFFs are not supported`);
  if (comp === 7 || comp === 6) throw new Error('JPEG-compressed TIFFs are not supported');
  const tiled = !!tags[322];
  const bw = tiled ? tags[322][0] : W, bh = tiled ? tags[323][0] : (tags[278] || [H])[0];
  const offs = tiled ? tags[324] : tags[273], cnts = tiled ? tags[325] : tags[279];
  const rowBytes = Math.ceil((bw * spp * bps) / 8);
  const full = new Uint8Array(Math.ceil((W * spp * bps) / 8) * H), fullRow = Math.ceil((W * spp * bps) / 8);
  const across = tiled ? Math.ceil(W / bw) : 1;
  for (let s = 0; s < offs.length; s++) {
    const raw = u8.subarray(offs[s], offs[s] + cnts[s]), expected = rowBytes * bh;
    let data;
    if (comp === 1) data = raw;
    else if (comp === 5) data = lzwDecode(raw, expected);
    else if (comp === 32773) { data = new Uint8Array(expected); unpackBits(raw, 0, raw.length, data, 0, expected); }
    else if (comp === 8 || comp === 32946) data = await inflate(raw);
    else throw new Error('Unsupported TIFF compression ' + comp);
    if (pred === 2 && bps === 8) for (let y = 0; y < bh; y++) for (let x = spp; x < bw * spp; x++) data[y * rowBytes + x] = (data[y * rowBytes + x] + data[y * rowBytes + x - spp]) & 255;
    const tx = tiled ? (s % across) * bw : 0, ty = tiled ? Math.floor(s / across) * bh : s * bh;
    for (let y = 0; y < bh && ty + y < H; y++) {
      const cols = Math.min(bw, W - tx), bytes = Math.ceil((cols * spp * bps) / 8);
      full.set(data.subarray(y * rowBytes, y * rowBytes + bytes), (ty + y) * fullRow + Math.floor((tx * spp * bps) / 8));
    }
  }
  const c = mkCanvas(W, H), g = cxr(c), img = g.createImageData(W, H), d = img.data, map = tags[320];
  const sample = (x, y, k) => {
    if (bps === 8) return full[y * fullRow + x * spp + k];
    if (bps === 16) { const o = y * fullRow + (x * spp + k) * 2; return le ? full[o + 1] : full[o]; }
    const bit = x * spp + k; return (full[y * fullRow + (bit >> 3)] >> (7 - (bit & 7))) & 1 ? 255 : 0;
  };
  const extra = spp - (photo === 2 ? 3 : photo === 5 ? 4 : 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (photo === 2) { d[i] = sample(x, y, 0); d[i + 1] = sample(x, y, 1); d[i + 2] = sample(x, y, 2); d[i + 3] = extra > 0 ? sample(x, y, 3) : 255; }
    else if (photo === 3 && map) { const v = bps === 8 ? full[y * fullRow + x] : sample(x, y, 0) ? 1 : 0, N = map.length / 3; d[i] = map[v] >> 8; d[i + 1] = map[N + v] >> 8; d[i + 2] = map[2 * N + v] >> 8; d[i + 3] = 255; }
    else if (photo === 5) { const k = 255 - sample(x, y, 3); d[i] = ((255 - sample(x, y, 0)) * k) / 255; d[i + 1] = ((255 - sample(x, y, 1)) * k) / 255; d[i + 2] = ((255 - sample(x, y, 2)) * k) / 255; d[i + 3] = 255; }
    else { let v = sample(x, y, 0); if (photo === 0) v = 255 - v; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = extra > 0 ? sample(x, y, 1) : 255; }
  }
  g.putImageData(img, 0, 0);
  return { w: W, h: H, layers: [{ name: tr('photoslop.layer.background'), canvas: c }] };
}

/* ---------- open anything ---------- */
const OPENABLE = 'image/*,.psd,.psb,.ora,.kra,.tif,.tiff,.svg,.ico,.bmp,.avif,.webp,.jfif' + (window.SlopRaw ? ',' + SlopRaw.ACCEPT : '');
async function readAnyFile(f) {
  const n = (f.name || '').toLowerCase();
  const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  const magic = String.fromCharCode(...head.slice(0, 4));
  if (magic === '8BPS' || isPSD(f)) return readPSD(await f.arrayBuffer());
  if (window.SlopRaw && await SlopRaw.isRaw(f, f.name)) return readRawFile(f);   // camera RAW: the Develop dialog (io/raw.js)
  if ((head[0] === 0x49 && head[1] === 0x49 && head[2] === 42) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 42) || /\.tiff?$/.test(n)) return readTIFF(await f.arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    if (/\.kra$/.test(n)) return readKRA(await f.arrayBuffer());
    return readORA(await f.arrayBuffer());
  }
  const c = await fileToCanvas(f).catch(() => { throw new Error(`“${f.name}” isn't an image this browser can read`); });
  return { w: c.width, h: c.height, layers: [{ name: tr('photoslop.layer.background'), canvas: c }] };
}
function flattenDocLayers(doc) {
  const c = mkCanvas(doc.w, doc.h), g = cx(c);
  for (const L of doc.layers) { if (L.visible === false) continue; g.globalAlpha = L.opacity == null ? 1 : L.opacity; g.globalCompositeOperation = BLEND_OP[L.blend] || 'source-over'; g.drawImage(L.canvas, L.x || 0, L.y || 0); }
  return c;
}
