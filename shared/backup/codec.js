/* SlopBackupCodec: turns structured-clone values (what IndexedDB stores) into plain JSON and back.
 * Binary data (Blob, File, ArrayBuffer, typed arrays, ImageData) is moved out into a list of blobs that
 * the backup writes as separate ZIP entries, so nothing is base64-inflated. Classic script.
 *   const blobs = []; const json = encode(value, blobs);   // blobs[i] = Blob, json refers to them by index
 *   const value = decode(json, (ref) => Uint8Array)          // get the bytes for a ref */
(function () {
  'use strict';
  if (window.SlopBackupCodec) return;
  const TYPED = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];
  const tag = (o) => Object.prototype.toString.call(o).slice(8, -1);

  function encode(v, blobs, seen = new Set()) {
    if (v === undefined) return { $: 'undef' };
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? (Object.is(v, -0) ? { $: 'num', v: '-0' } : v) : { $: 'num', v: String(v) };
    if (typeof v === 'bigint') return { $: 'big', v: v.toString() };
    if (typeof v !== 'object') return null; // functions/symbols cannot be stored in IndexedDB anyway
    if (seen.has(v)) return null;
    const ref = (data) => blobs.push(data) - 1;
    const T = tag(v); // tags, not instanceof, so values from another frame work too
    if (T === 'File') return { $: 'file', ref: ref(v), type: v.type, name: v.name, lastModified: v.lastModified };
    if (T === 'Blob') return { $: 'blob', ref: ref(v), type: v.type };
    if (T === 'ArrayBuffer') return { $: 'ab', ref: ref(new Blob([v])) };
    if (ArrayBuffer.isView(v)) {
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
      return { $: 'ta', t: tag(v), ref: ref(new Blob([bytes])) };
    }
    if (T === 'ImageData') return { $: 'img', w: v.width, h: v.height, ref: ref(new Blob([v.data.slice()])) };
    if (T === 'Date') return { $: 'date', v: v.getTime() };
    if (T === 'RegExp') return { $: 're', s: v.source, f: v.flags };
    seen.add(v);
    try {
      if (T === 'Map') return { $: 'map', v: [...v].map(([k, x]) => [encode(k, blobs, seen), encode(x, blobs, seen)]) };
      if (T === 'Set') return { $: 'set', v: [...v].map((x) => encode(x, blobs, seen)) };
      if (Array.isArray(v)) return v.map((x) => encode(x, blobs, seen));
      if (['Boolean', 'Number', 'String'].includes(T)) return { $: 'box', t: tag(v), v: v.valueOf() };
      const o = {};
      for (const k of Object.keys(v)) o[k] = encode(v[k], blobs, seen);
      return '$' in o ? { $: 'obj', v: o } : o;
    } finally { seen.delete(v); }
  }

  function decode(j, bytesOf) {
    if (j === null || typeof j !== 'object') return j;
    if (Array.isArray(j)) return j.map((x) => decode(x, bytesOf));
    const plain = (o) => { const out = {}; for (const k of Object.keys(o)) out[k] = decode(o[k], bytesOf); return out; };
    switch (j.$) {
      case undefined: return plain(j);
      case 'obj': return plain(j.v);
      case 'undef': return undefined;
      case 'num': return Number(j.v);
      case 'big': return BigInt(j.v);
      case 'file': return new File([bytesOf(j.ref)], j.name, { type: j.type, lastModified: j.lastModified });
      case 'blob': return new Blob([bytesOf(j.ref)], { type: j.type });
      case 'ab': { const b = bytesOf(j.ref); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
      case 'ta': {
        const b = bytesOf(j.ref), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        if (j.t === 'DataView') return new DataView(buf);
        const C = TYPED.includes(j.t) ? window[j.t] : Uint8Array;
        return new C(buf);
      }
      case 'img': { const b = bytesOf(j.ref); return new ImageData(new Uint8ClampedArray(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), j.w, j.h); }
      case 'date': return new Date(j.v);
      case 're': return new RegExp(j.s, j.f);
      case 'map': return new Map(j.v.map(([k, x]) => [decode(k, bytesOf), decode(x, bytesOf)]));
      case 'set': return new Set(j.v.map((x) => decode(x, bytesOf)));
      case 'box': return Object(j.v);
      default: return plain(j);
    }
  }
  window.SlopBackupCodec = { encode, decode };
})();
