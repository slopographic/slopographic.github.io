/* SlopLabel — print/zplgfx: ZPL graphic fields. ^GFA hex with Zebra ASCII compression (encode and
 * decode), :Z64: (zlib + base64) decoding, and ZPL ^FH hex escaping of field data. */
'use strict';

const HEXU = '0123456789ABCDEF';
function zplCount(n) {
  // Zebra repeat counts: G..Y = 1..19, g..z = 20..400 (multiples of 20)
  let s = '';
  while (n > 400) { s += 'z'; n -= 400; }
  if (n >= 20) { s += String.fromCharCode(102 + Math.floor(n / 20)); n %= 20; }
  if (n > 0) s += String.fromCharCode(70 + n);
  return s;
}
function bytesToHex(bits, from, len) { let s = ''; for (let i = 0; i < len; i++) { const b = bits[from + i]; s += HEXU[b >> 4] + HEXU[b & 15]; } return s; }
/** 1-bit packed rows → compressed ^GFA data (",", "!", ":" and run-length counts). */
function zplCompressGFA(bits, bpr, h) {
  let out = '', prev = null;
  for (let y = 0; y < h; y++) {
    const row = bytesToHex(bits, y * bpr, bpr);
    if (row === prev) { out += ':'; continue; }
    prev = row;
    let r = row, tail = '';
    if (/0+$/.test(r) && r.replace(/0+$/, '').length < r.length) { r = r.replace(/0+$/, ''); tail = ','; }
    else if (/F+$/.test(r) && r.replace(/F+$/, '').length < r.length - 1) { r = r.replace(/F+$/, ''); tail = '!'; }
    let i = 0, enc = '';
    while (i < r.length) {
      let j = i; while (j < r.length && r[j] === r[i]) j++;
      const n = j - i;
      enc += n > 2 ? zplCount(n) + r[i] : r.slice(i, j);
      i = j;
    }
    out += enc + tail;
    if (!enc && !tail) out += ',';
  }
  return out;
}
function zplGFA(bm) {
  const total = bm.bpr * bm.h;
  return `^GFA,${total},${total},${bm.bpr},${zplCompressGFA(bm.bits, bm.bpr, bm.h)}`;
}
/** Decode ^GF data (ASCII hex, compressed or not) into packed bits. */
function zplDecodeGFA(data, bpr, total) {
  const rows = Math.ceil(total / bpr), out = new Uint8Array(rows * bpr);
  const hexPerRow = bpr * 2;
  let row = 0, col = 0, rowHex = '', prevHex = '0'.repeat(hexPerRow), count = 0;
  const flush = () => {
    rowHex = rowHex.padEnd(hexPerRow, '0').slice(0, hexPerRow);
    for (let i = 0; i < bpr; i++) out[row * bpr + i] = parseInt(rowHex.substr(i * 2, 2), 16) || 0;
    prevHex = rowHex; rowHex = ''; row++; col = 0;
  };
  for (let i = 0; i < data.length && row < rows; i++) {
    const c = data[i];
    if (c >= 'G' && c <= 'Y') { count += c.charCodeAt(0) - 70; continue; }
    if (c >= 'g' && c <= 'z') { count += (c.charCodeAt(0) - 102) * 20; continue; }
    if (c === ',') { rowHex = rowHex.padEnd(hexPerRow, '0'); flush(); count = 0; continue; }
    if (c === '!') { rowHex = rowHex.padEnd(hexPerRow, 'F'); flush(); count = 0; continue; }
    if (c === ':') { rowHex = prevHex; flush(); count = 0; continue; }
    if (/[0-9A-Fa-f]/.test(c)) {
      rowHex += c.toUpperCase().repeat(count || 1); count = 0;
      while (rowHex.length >= hexPerRow && row < rows) { const extra = rowHex.slice(hexPerRow); rowHex = rowHex.slice(0, hexPerRow); flush(); rowHex = extra; }
    }
  }
  if (rowHex && row < rows) flush();
  return out;
}
async function zplDecodeZ64(b64) {
  const bin = atob(b64.replace(/:[0-9a-fA-F]{4}$/, '').replace(/\s/g, ''));
  const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate');
  return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer());
}
/** Packed 1-bit rows → PNG data URL (black on transparent). */
function bitsToDataURL(bits, bpr, w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext('2d'), im = g.createImageData(c.width, c.height);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bits[y * bpr + (x >> 3)] & (0x80 >> (x & 7))) im.data[(y * w + x) * 4 + 3] = 255;
  g.putImageData(im, 0, 0);
  return c.toDataURL('image/png');
}
/** Field data escaping: returns { fh, data } — ^FH\ is needed for ^ ~ \ and non-ASCII (UTF-8 with ^CI28). */
function zplFieldData(s) {
  if (!/[\^~\\\u0080-￿\x00-\x1f]/.test(s)) return { fh: '', data: s };
  let d = '';
  for (const b of new TextEncoder().encode(s)) d += b === 0x5e || b === 0x7e || b === 0x5c || b > 0x7e || b < 0x20 ? '\\' + HEXU[b >> 4] + HEXU[b & 15] : String.fromCharCode(b);
  return { fh: '^FH\\', data: d };
}
