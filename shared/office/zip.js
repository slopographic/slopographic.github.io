/* Slop Office ZIP: read and write ZIP archives (DOCX, XLSX, PPTX, ODT, ODS, ODP).
 * No dependencies: deflate-raw via the browser's CompressionStream/DecompressionStream.
 *
 *   readZip(blob | ArrayBuffer | Uint8Array) → Promise<Map<path, Uint8Array>>
 *   writeZip([{ path, data: Uint8Array | string, store?: boolean, date?: Date }], { compress = true })
 *     → Promise<Blob>   (application/zip; entries keep their order: put ODF "mimetype" first with store:true)
 *   readText(map, path) → string | null       utf-8 decode of one entry
 *   crc32(u8) → unsigned 32-bit CRC
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

let CRC_TABLE = null;
export function crc32(u8) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(u8, stream) {
  const out = new Response(new Blob([u8]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export const inflateRaw = (u8) => pipe(u8, new DecompressionStream('deflate-raw'));
export const deflateRaw = (u8) => pipe(u8, new CompressionStream('deflate-raw'));

async function toU8(src) {
  if (src instanceof Uint8Array) return src;
  if (src instanceof ArrayBuffer) return new Uint8Array(src);
  if (ArrayBuffer.isView(src)) return new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  if (src && typeof src.arrayBuffer === 'function') return new Uint8Array(await src.arrayBuffer());
  throw new TypeError('readZip: expected a Blob, ArrayBuffer or Uint8Array');
}

/** Read every file entry of a ZIP into a Map(path → bytes). Directories are skipped. */
export async function readZip(src) {
  const u8 = await toU8(src);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // Find the end-of-central-directory record (it may be followed by a comment up to 64 KB).
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end of central directory)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const names = [], data = new Map(), jobs = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commLen;
    if (name.endsWith('/')) continue;
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error('Corrupt ZIP local header: ' + name);
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + csize);
    names.push(name);
    if (method === 0) data.set(name, raw.slice());
    else if (method === 8) jobs.push(inflateRaw(raw).then((d) => data.set(name, d)));
    else throw new Error(`Unsupported ZIP compression method ${method} (${name})`);
  }
  await Promise.all(jobs);
  // Keep central-directory order regardless of when inflation finished.
  return new Map(names.map((n) => [n, data.get(n)]));
}

export function readText(map, path) {
  const d = map.get(path) ?? map.get(path.replace(/^\//, ''));
  return d ? dec.decode(d) : null;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Build a ZIP. Text data is utf-8 encoded. Entries are compressed unless store:true or compress:false. */
export async function writeZip(entries, { compress = true } = {}) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : (e.data instanceof Uint8Array ? e.data : await toU8(e.data));
    const name = enc.encode(e.path);
    const crc = crc32(data);
    let body = data, method = 0;
    if (compress && !e.store && data.length > 64) {
      const z = await deflateRaw(data);
      if (z.length < data.length) { body = z; method = 8; }
    }
    const { time, date } = dosTime(e.date || new Date());
    const lh = new Uint8Array(30 + name.length), l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
    l.setUint16(8, method, true); l.setUint16(10, time, true); l.setUint16(12, date, true);
    l.setUint32(14, crc, true); l.setUint32(18, body.length, true); l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true); l.setUint16(28, 0, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, method, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
    c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true); ch.set(name, 46);
    parts.push(lh, body); central.push(ch);
    offset += lh.length + body.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22), d = new DataView(end.buffer);
  d.setUint32(0, 0x06054b50, true); d.setUint16(8, entries.length, true); d.setUint16(10, entries.length, true);
  d.setUint32(12, cdSize, true); d.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
