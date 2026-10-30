/* PhotoSlop: Photoshop .psd writer and reader, written from the Adobe file format spec.
 * Writes 8-bit RGB with transparency: real layers (names, opacity, blend modes,
 * visibility, layer masks) plus a merged composite, RLE (PackBits) compressed.
 * Reads 8/16-bit RGB, Grayscale and CMYK; raw, RLE and ZIP channels; groups are flattened into plain layers. */
'use strict';

function psdName(s) {
  // Pascal string fallback for old readers; the real (Unicode) name goes in 'luni'.
  return s.replace(/[^\x20-\x7e]/g, '?').slice(0, 255);
}
function rleChannel(data, w, hh, offset) {
  // data: RGBA bytes; offset picks the channel. Returns [rowCounts(u16[]), packed bytes].
  const counts = new Array(hh), out = [], row = new Uint8Array(w);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) row[x] = data[(y * w + x) * 4 + offset];
    const before = out.length;
    packBits(row, 0, w, out);
    counts[y] = out.length - before;
  }
  return [counts, Uint8Array.from(out)];
}
function encodeChannels(canvas, rect, withAlpha, maskGray) {
  const { x, y, w, h: hh } = rect;
  if (w <= 0 || hh <= 0) return [];
  const img = cxr(canvas).getImageData(x, y, w, hh).data;
  const list = withAlpha ? [[-1, 3], [0, 0], [1, 1], [2, 2]] : maskGray ? [[-2, 0]] : [[0, 0], [1, 1], [2, 2]];
  return list.map(([id, off]) => {
    const [counts, bytes] = rleChannel(img, w, hh, off);
    return { id, counts, bytes, len: 2 + hh * 2 + bytes.length };
  });
}
/** Mask canvases store their value as alpha; PSD wants a grey channel. */
function maskToGray(maskCanvas) {
  const c = mkCanvas(maskCanvas.width, maskCanvas.height), g = cxr(c);
  const src = cxr(maskCanvas).getImageData(0, 0, c.width, c.height), d = src.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = d[i + 3]; d[i + 3] = 255; }
  g.putImageData(src, 0, 0);
  return c;
}

function writePSD() {
  const W = new Writer(Math.max(1 << 20, D.w * D.h * 3));
  const layers = D.layers;
  // Header
  W.ascii('8BPS'); W.u16(1); W.zeros(6); W.u16(4); W.u32(D.h); W.u32(D.w); W.u16(8); W.u16(3);
  W.u32(0); // colour mode data
  // Image resources: 72 ppi resolution info
  const endRes = W.lenMark();
  W.ascii('8BIM'); W.u16(1005); W.u16(0); W.u32(16);
  W.u32(72 << 16); W.u16(1); W.u16(1); W.u32(72 << 16); W.u16(1); W.u16(1);
  psdWriteGuides(W); wmWritePSD(W);
  endRes();
  // Layer and mask information
  const endLM = W.lenMark();
  const endLI = W.lenMark();
  W.i16(-layers.length); // negative: first alpha channel of the merged image is its transparency
  const prepared = layers.map((L) => {
    const b = alphaBounds(L.canvas);
    const rect = b || { x: 0, y: 0, w: 0, h: 0 };
    const ch = b ? encodeChannels(L.canvas, rect, true) : [-1, 0, 1, 2].map((id) => ({ id, counts: [], bytes: new Uint8Array(0), len: 2 }));
    let mask = null;
    if (L.mask) {
      const m = L.mask, gray = maskToGray(m.canvas);
      const mc = encodeChannels(gray, { x: 0, y: 0, w: m.canvas.width, h: m.canvas.height }, false, true)[0];
      mask = { top: m.y, left: m.x, bottom: m.y + m.canvas.height, right: m.x + m.canvas.width, def: m.def ? 0 : 255, disabled: m.enabled === false, ch: mc };
    }
    return { L, top: L.y + rect.y, left: L.x + rect.x, bottom: L.y + rect.y + rect.h, right: L.x + rect.x + rect.w, ch, mask };
  });
  for (const P of prepared) {
    const { L } = P;
    W.i32(P.top); W.i32(P.left); W.i32(P.bottom); W.i32(P.right);
    const chans = P.mask ? P.ch.concat([P.mask.ch]) : P.ch;
    W.u16(chans.length);
    for (const c of chans) { W.i16(c.id); W.u32(c.len); }
    W.ascii('8BIM'); W.ascii(BLEND_PSD[L.blend] || 'norm');
    W.u8(Math.round(clamp(L.opacity, 0, 1) * 255)); W.u8(L.clip ? 1 : 0);
    W.u8((L.visible ? 0 : 2) | (L.locked ? 1 : 0)); W.u8(0);
    const endExtra = W.lenMark();
    if (P.mask) {
      W.u32(20); W.i32(P.mask.top); W.i32(P.mask.left); W.i32(P.mask.bottom); W.i32(P.mask.right);
      W.u8(P.mask.def); W.u8(P.mask.disabled ? 2 : 0); W.u16(0);
    } else W.u32(0);
    W.u32(40); for (let i = 0; i < 10; i++) W.u32(0x0000ffff); // blending ranges: everything blends
    const nm = psdName(L.name), start = W.p;
    W.u8(nm.length); W.ascii(nm);
    while ((W.p - start) % 4) W.u8(0);
    // Unicode layer name
    W.ascii('8BIM'); W.ascii('luni');
    const endU = W.lenMark();
    W.u32(L.name.length); for (let i = 0; i < L.name.length; i++) W.u16(L.name.charCodeAt(i));
    endU(4);
    psdWriteMeta(W, L);
    endExtra();
  }
  for (const P of prepared) {
    const chans = P.mask ? P.ch.concat([P.mask.ch]) : P.ch;
    for (const c of chans) { W.u16(1); for (const n of c.counts) W.u16(n); W.bytes(c.bytes); }
  }
  endLI(4);
  W.u32(0); // global layer mask info
  endLM();
  // Merged image, RLE: all row counts for every channel first, then the data.
  const flat = flattenCanvas();
  const img = cxr(flat).getImageData(0, 0, D.w, D.h).data;
  const chans = [0, 1, 2, 3].map((off) => rleChannel(img, D.w, D.h, off));
  W.u16(1);
  for (const [counts] of chans) for (const n of counts) W.u16(n);
  for (const [, bytes] of chans) W.bytes(bytes);
  return W.out();
}

/* ---------- reading ---------- */
let macDecoder = null;
function macRoman(bytes) {
  // Pascal layer names are MacRoman; files without a 'luni' block rely on them.
  try { macDecoder = macDecoder || new TextDecoder('macintosh'); return macDecoder.decode(bytes); }
  catch (e) { let s = ''; for (const b of bytes) s += b < 128 ? String.fromCharCode(b) : '?'; return s; }
}
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unzip PSD channels');
  const ds = new DecompressionStream('deflate');
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
/** Decode one channel's samples into an 8-bit plane. */
async function readChannelData(R, end, w, hh, depth, compression) {
  const bps = depth / 8, n = w * hh, plane = new Uint8Array(n);
  if (w <= 0 || hh <= 0) { R.p = end; return plane; }
  let raw;
  if (compression === 0) raw = R.bytes(n * bps);
  else if (compression === 1) {
    const counts = [];
    for (let y = 0; y < hh; y++) counts.push(R.u16());
    raw = new Uint8Array(n * bps);
    let p = R.p;
    for (let y = 0; y < hh; y++) { unpackBits(R.buf, p, p + counts[y], raw, y * w * bps, w * bps); p += counts[y]; }
    R.p = p;
  } else if (compression === 2 || compression === 3) {
    raw = await inflate(R.bytes(end - R.p));
    if (compression === 3) {
      if (bps === 1) for (let y = 0; y < hh; y++) for (let x = 1; x < w; x++) raw[y * w + x] = (raw[y * w + x] + raw[y * w + x - 1]) & 255;
      else if (bps === 2) for (let y = 0; y < hh; y++) for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 2, j = i - 2;
        const v = ((raw[i] << 8) | raw[i + 1]) + ((raw[j] << 8) | raw[j + 1]);
        raw[i] = (v >> 8) & 255; raw[i + 1] = v & 255;
      }
    }
  } else throw new Error('Unknown PSD compression ' + compression);
  if (bps === 1) plane.set(raw.subarray(0, n));
  else if (bps === 2) for (let i = 0; i < n; i++) plane[i] = raw[i * 2];
  else for (let i = 0; i < n; i++) plane[i] = clamp(Math.round(new DataView(raw.buffer, raw.byteOffset + i * 4, 4).getFloat32(0) * 255), 0, 255);
  if (end != null) R.p = end;
  return plane;
}
function planesToCanvas(w, hh, mode, planes) {
  const c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data, n = w * hh;
  const A = planes[-1], R0 = planes[0], G0 = planes[1], B0 = planes[2], K = planes[3];
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (mode === 1) d[j] = d[j + 1] = d[j + 2] = R0 ? R0[i] : 0;
    else if (mode === 4) {
      const k = K ? K[i] / 255 : 1; // PSD stores CMYK inverted: 255 = no ink
      d[j] = (R0 ? R0[i] : 255) * k; d[j + 1] = (G0 ? G0[i] : 255) * k; d[j + 2] = (B0 ? B0[i] : 255) * k;
    } else { d[j] = R0 ? R0[i] : 0; d[j + 1] = G0 ? G0[i] : 0; d[j + 2] = B0 ? B0[i] : 0; }
    d[j + 3] = A ? A[i] : 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function grayToMask(w, hh, plane) {
  const c = mkCanvas(w, hh), g = cxr(c), img = g.createImageData(w, hh), d = img.data;
  for (let i = 0; i < w * hh; i++) d[i * 4 + 3] = plane[i];
  g.putImageData(img, 0, 0);
  return c;
}
async function readLayerInfo(R, end, depth, mode) {
  let count = R.i16();
  const mergedAlpha = count < 0; count = Math.abs(count);
  const recs = [];
  for (let i = 0; i < count; i++) {
    const r = { top: R.i32(), left: R.i32(), bottom: R.i32(), right: R.i32(), chans: [] };
    const nch = R.u16();
    for (let k = 0; k < nch; k++) r.chans.push({ id: R.i16(), len: R.u32() });
    R.ascii(4); r.blend = R.ascii(4); r.opacity = R.u8() / 255; r.clip = R.u8(); r.flags = R.u8(); R.u8();
    const exLen = R.u32(), exEnd = R.p + exLen;
    const mLen = R.u32(), mEnd = R.p + mLen;
    if (mLen >= 20) { r.mask = { top: R.i32(), left: R.i32(), bottom: R.i32(), right: R.i32(), def: R.u8(), flags: R.u8() }; }
    R.p = mEnd;
    const brLen = R.u32(); R.skip(brLen);
    const nStart = R.p, nLen = R.u8(); r.name = macRoman(R.bytes(nLen));
    R.p = nStart + Math.ceil((nLen + 1) / 4) * 4;
    while (R.p + 12 <= exEnd) {
      const sig = R.ascii(4);
      if (sig !== '8BIM' && sig !== '8B64') break;
      const key = R.ascii(4), len = R.u32(), dEnd = R.p + len;
      if (key === 'luni') { const n = R.u32(); let s = ''; for (let k = 0; k < n && R.p + 2 <= dEnd; k++) s += String.fromCharCode(R.u16()); r.name = s.replace(/\0+$/, ''); }
      else if (key === 'lsct' || key === 'lsdk') r.section = R.u32();
      else if (key === 'SLmd') r.meta = psdReadMeta(R, dEnd);
      R.p = dEnd;
    }
    R.p = exEnd;
    recs.push(r);
  }
  for (const r of recs) {
    const w = r.right - r.left, hh = r.bottom - r.top, planes = {};
    for (const c of r.chans) {
      const cEnd = R.p + c.len;
      if (c.len < 2) { R.p = cEnd; continue; }
      const comp = R.u16();
      const isMask = c.id === -2 || c.id === -3;
      const mw = isMask && r.mask ? r.mask.right - r.mask.left : w, mh = isMask && r.mask ? r.mask.bottom - r.mask.top : hh;
      const plane = await readChannelData(R, cEnd, mw, mh, depth, comp);
      if (c.id === -2) r.maskPlane = plane; else if (c.id >= -1 && c.id <= 3) planes[c.id] = plane;
    }
    r.canvas = w > 0 && hh > 0 ? planesToCanvas(w, hh, mode, planes) : null;
  }
  R.p = end;
  return { recs, mergedAlpha };
}
async function readPSD(buf) {
  const R = new Reader(buf);
  if (R.ascii(4) !== '8BPS') throw new Error('Not a Photoshop file');
  const version = R.u16();
  if (version !== 1) throw new Error('Large-document .psb files are not supported');
  R.skip(6);
  const channels = R.u16(), hh = R.u32(), w = R.u32(), depth = R.u16(), mode = R.u16();
  if (![8, 16, 32].includes(depth)) throw new Error(`${depth}-bit PSDs are not supported`);
  if (![1, 3, 4].includes(mode)) throw new Error('Only RGB, Grayscale and CMYK PSDs are supported');
  R.skip(R.u32()); // colour mode data
  const resLen = R.u32(), wm = wmReadPSD(R, R.p + resLen), guides = psdReadGuides(R, R.p + resLen); // image resources: only guides are used
  const lmLen = R.u32(), lmEnd = R.p + lmLen;
  let info = null;
  if (lmLen > 0) {
    const liLen = R.u32(), liEnd = R.p + liLen;
    if (liLen > 0) info = await readLayerInfo(R, liEnd, depth, mode);
    R.p = liEnd;
    if (!info && R.p + 4 <= lmEnd) {
      // 16/32-bit files keep their layers in a global 'Lr16'/'Lr32' block.
      R.skip(R.u32());
      while (R.p + 12 <= lmEnd) {
        const sig = R.ascii(4); if (sig !== '8BIM' && sig !== '8B64') break;
        const key = R.ascii(4), len = R.u32(), dEnd = R.p + len;
        if (key === 'Lr16' || key === 'Lr32' || key === 'Layr') { info = await readLayerInfo(R, dEnd, depth, mode); } // i18n-ignore: PSD block keys and layer names are file content
        R.p = dEnd + (len % 4 ? 4 - (len % 4) : 0);
        if (R.p > lmEnd) break;
      }
    }
  }
  R.p = lmEnd;
  const layers = [];
  if (info && info.recs.length) {
    // Records run bottom → top. Group headers come after their children; their end markers before.
    const stack = [];
    for (const r of info.recs) {
      if (r.section === 3) { stack.push([]); continue; }
      if (r.section === 1 || r.section === 2) {
        const kids = stack.pop() || [];
        for (const L of kids) { if (r.flags & 2) L.visible = false; L.opacity *= r.opacity; }
        (stack.length ? stack[stack.length - 1] : layers).push(...kids);
        continue;
      }
      const L = { name: r.name || 'Layer', canvas: r.canvas || mkCanvas(1, 1), x: r.canvas ? r.left : 0, y: r.canvas ? r.top : 0, visible: !(r.flags & 2), opacity: r.opacity, blend: PSD_BLEND[r.blend] || 'normal', locked: false, mask: null, clip: !!r.clip }; // i18n-ignore: PSD block keys and layer names are file content
      if (r.meta) Object.assign(L, r.meta);
      if (!r.canvas) cx(L.canvas).clearRect(0, 0, 1, 1);
      if (r.mask && r.maskPlane && r.mask.right > r.mask.left) {
        L.mask = { canvas: grayToMask(r.mask.right - r.mask.left, r.mask.bottom - r.mask.top, r.maskPlane), x: r.mask.left, y: r.mask.top, def: r.mask.def === 0, enabled: !(r.mask.flags & 2) };
      }
      (stack.length ? stack[stack.length - 1] : layers).push(L);
    }
    while (stack.length) layers.push(...stack.pop());
  }
  if (!layers.length) {
    // Flat PSD: use the merged image.
    const comp = R.u16(), planes = {}, n = channels;
    const ids = mode === 1 ? [0, -1] : mode === 4 ? [0, 1, 2, 3, -1] : [0, 1, 2, -1];
    if (comp === 1) {
      const counts = []; for (let i = 0; i < n * hh; i++) counts.push(R.u16());
      let p = R.p;
      for (let c = 0; c < n; c++) {
        const plane = new Uint8Array(w * hh), raw = new Uint8Array(w * hh * (depth / 8));
        for (let y = 0; y < hh; y++) { unpackBits(R.buf, p, p + counts[c * hh + y], raw, y * w * (depth / 8), w * (depth / 8)); p += counts[c * hh + y]; }
        if (depth === 8) plane.set(raw); else for (let i = 0; i < w * hh; i++) plane[i] = raw[i * (depth / 8)];
        if (c < ids.length) planes[ids[c]] = plane;
      }
    } else if (comp === 0) {
      for (let c = 0; c < n; c++) {
        const plane = await readChannelData(R, null, w, hh, depth, 0);
        if (c < ids.length) planes[ids[c]] = plane;
      }
    } else throw new Error('Unsupported merged-image compression');
    if (!(info && info.mergedAlpha) && channels <= (mode === 1 ? 1 : mode === 4 ? 4 : 3)) delete planes[-1];
    layers.push({ name: tr('photoslop.layer.background'), canvas: planesToCanvas(w, hh, mode, planes), x: 0, y: 0, visible: true, opacity: 1, blend: 'normal', locked: false, mask: null }); // the composite of a PSD without layers
  }
  return { w, h: hh, layers, guides, wm };
}
