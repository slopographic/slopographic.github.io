/* SlopClean core: TIFF / EXIF structure. parse() reads every IFD (main image, EXIF, GPS, interoperability, the
 * thumbnail IFD and any further pages). rewrite() writes a new TIFF with the kept entries only: the picture data
 * (strips, tiles, the thumbnail JPEG) is copied byte for byte and only its offsets change. fields() turns the tree
 * into plain findings for the report. Classic script; sets window.SlopClean.tiff. */
(function (root) {
  'use strict';
  const C = (root.SlopClean = root.SlopClean || {});
  const { fail, need, view, ascii, trimNul } = C.bytes;
  const { describe, POINTERS } = C.tags;
  const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 };
  /** Offset tag -> the tag holding the byte counts for it. */
  const DATA = { 0x0111: 0x0117, 0x0144: 0x0145, 0x0201: 0x0202 };
  const WHERE = { ifd0: 'Main image', page: 'Another page', exif: 'Photo settings', gps: 'GPS', interop: 'Interoperability', thumb: 'Thumbnail' };
  const MAX_IFDS = 64;

  /** Numbers in an entry: integers for SHORT/LONG/IFD/BYTE, num/den pairs as floats for RATIONAL. */
  function nums(e, le) {
    const v = view(e.raw), out = [], n = e.count;
    for (let i = 0; i < n; i++) {
      const o = i * e.size;
      if (e.type === 3 || e.type === 8) out.push(v.getUint16(o, le));
      else if (e.type === 4 || e.type === 9 || e.type === 13) out.push(v.getUint32(o, le));
      else if (e.type === 1 || e.type === 6 || e.type === 7) out.push(e.raw[i]);
      else if (e.type === 5) out.push(v.getUint32(o, le) / (v.getUint32(o + 4, le) || 1));
      else if (e.type === 10) out.push(v.getInt32(o, le) / (v.getInt32(o + 4, le) || 1));
    }
    return out;
  }

  /** Read a TIFF starting at u8[start]. exifMode: the IFD after the first is a thumbnail, not another page. */
  function parse(u8, { start = 0, exifMode = false } = {}) {
    need(u8, start, 8, 'the TIFF header');
    const sig = ascii(u8, start, start + 2);
    const le = sig === 'II';
    if (!le && sig !== 'MM') fail('Damaged metadata: not a TIFF header');
    const dv = view(u8);
    if (dv.getUint16(start + 2, le) !== 42) fail('Damaged metadata: bad TIFF magic number');
    const seen = new Set();
    let made = 0;
    const readIfd = (rel, kind) => {
      if (!rel) return null;
      if (seen.has(rel)) fail('Damaged metadata: an IFD points back to itself');
      if (++made > MAX_IFDS) fail('Damaged metadata: too many IFDs');
      seen.add(rel);
      const off = start + rel;
      need(u8, off, 2, 'an IFD');
      const n = dv.getUint16(off, le);
      need(u8, off + 2, 12 * n + 4, 'an IFD');
      const node = { kind, entries: [], next: null };
      for (let i = 0; i < n; i++) {
        const e = off + 2 + 12 * i;
        const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), count = dv.getUint32(e + 4, le);
        const size = TSIZE[type] || 1, total = size * count;
        let raw;
        if (total <= 4) raw = u8.slice(e + 8, e + 8 + total);
        else {
          const vo = start + dv.getUint32(e + 8, le);
          need(u8, vo, total, 'a tag value');
          raw = u8.slice(vo, vo + total);
        }
        node.entries.push({ tag, type, count, size, raw, child: null });
      }
      node.entries.sort((a, b) => a.tag - b.tag);
      for (const e of node.entries) if (POINTERS[e.tag] !== undefined && e.count === 1) {
        e.child = readIfd(nums(e, le)[0], POINTERS[e.tag]);
      }
      const nextRel = dv.getUint32(off + 2 + 12 * n, le);
      node.next = readIfd(nextRel, kind === 'ifd0' && exifMode ? 'thumb' : 'page');
      return node;
    };
    const root = readIfd(dv.getUint32(start + 4, le), 'ifd0');
    return { le, start, src: u8, root };
  }

  /** Every node of a tree once, in order (the main IFD first). */
  function nodesOf(root) {
    const out = [], walk = (n) => {
      if (!n || out.includes(n)) return;
      out.push(n);
      for (const e of n.entries) if (e.child) walk(e.child);
      walk(n.next);
    };
    walk(root);
    return out;
  }

  /** Keep the entries and nodes the callers want. keepEntry(node, entry) and keepNode(node) return booleans. */
  function plan(node, ctx) {
    const kept = [];
    for (const e of node.entries) {
      if (POINTERS[e.tag] !== undefined) {
        const child = e.child && plan(e.child, ctx);
        if (child) kept.push({ tag: e.tag, type: 4, count: 1, size: 4, child });
        continue;
      }
      if (!ctx.keepEntry(node, e)) continue;
      const p = { tag: e.tag, type: e.type, count: e.count, size: e.size, raw: e.raw };
      if (DATA[e.tag] !== undefined) {
        const sib = node.entries.find((x) => x.tag === DATA[e.tag]);
        const offs = nums(e, ctx.le), lens = sib ? nums(sib, ctx.le) : [];
        if (offs.length !== lens.length) fail('Damaged metadata: picture data offsets and lengths disagree');
        p.blobs = offs.map((o, i) => ({ src: o, len: lens[i] }));
        p.type = 4; p.size = 4; p.count = offs.length; p.raw = null;
      }
      kept.push(p);
    }
    const next = node.next && ctx.keepNode(node.next) ? plan(node.next, ctx) : null;
    if (!kept.length && !next) return null;
    return { kind: node.kind, entries: kept, next };
  }

  /** Writes a new TIFF with the planned entries. Returns the bytes. */
  function write(tree, keepEntry, keepNode) {
    const le = tree.le;
    const ctx = { le, keepEntry, keepNode };
    const top = plan(tree.root, ctx) || { kind: 'ifd0', entries: [], next: null };
    const nodes = [];
    const collect = (p) => {
      if (!p || nodes.includes(p)) return;
      nodes.push(p);
      for (const e of p.entries) if (e.child) collect(e.child);
      collect(p.next);
    };
    collect(top);
    let pos = 8;
    for (const p of nodes) { p.off = pos; pos += 2 + 12 * p.entries.length + 4; }
    for (const p of nodes) for (const e of p.entries) {
      if (e.child) continue;
      const total = e.size * e.count;
      if (total > 4) { e.ext = pos; pos += total + (total & 1); }
    }
    const blobAt = new Map(), blobs = [];
    for (const p of nodes) for (const e of p.entries) {
      if (!e.blobs) continue;
      e.vals = e.blobs.map((b) => {
        const key = b.src + ':' + b.len;
        if (!blobAt.has(key)) {
          blobAt.set(key, pos);
          blobs.push({ src: b.src, len: b.len, dst: pos });
          pos += b.len + (b.len & 1);
        }
        return blobAt.get(key);
      });
    }
    const out = new Uint8Array(pos), dv = new DataView(out.buffer);
    out.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
    dv.setUint16(2, 42, le);
    dv.setUint32(4, top.off, le);
    for (const p of nodes) {
      const o = p.off;
      dv.setUint16(o, p.entries.length, le);
      p.entries.forEach((e, i) => {
        const eo = o + 2 + 12 * i, total = e.size * e.count;
        dv.setUint16(eo, e.tag, le); dv.setUint16(eo + 2, e.type, le); dv.setUint32(eo + 4, e.count, le);
        let bytes;
        if (e.child) { bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, e.child.off, le); }
        else if (e.vals) { bytes = new Uint8Array(4 * e.vals.length); const bv = new DataView(bytes.buffer); e.vals.forEach((v, k) => bv.setUint32(4 * k, v, le)); }
        else bytes = e.raw;
        if (total <= 4) out.set(bytes.subarray(0, total), eo + 8);
        else { dv.setUint32(eo + 8, e.ext, le); out.set(bytes, e.ext); }
      });
      dv.setUint32(o + 2 + 12 * p.entries.length, p.next ? p.next.off : 0, le);
    }
    for (const b of blobs) {
      need(tree.src, tree.start + b.src, b.len, 'picture data');
      out.set(tree.src.subarray(tree.start + b.src, tree.start + b.src + b.len), b.dst);
    }
    return out;
  }

  /** Rewrite a parsed tree. remove: the resolved category map. blockGone: XMP-style blocks go too. */
  function rewrite(tree, remove, blockGone, exifMode) {
    const keepEntry = (node, e) => {
      const d = describe(node.kind, e.tag);
      if (d.cat === 'struct') return true;
      if (C.tags.BLOCKS.has(e.tag)) return !blockGone;
      return !remove[d.cat];
    };
    const keepNode = (node) => !(exifMode && node.kind === 'thumb' && remove.thumbnail);
    return write(tree, keepEntry, keepNode);
  }

  /** Entries that carry something to show, as { kind, tag, count } (used to decide whether a block is empty). */
  function countKept(bytes, exifMode) {
    const t = parse(bytes, { exifMode });
    let n = 0;
    for (const node of nodesOf(t.root)) n += node.entries.length;
    return n;
  }

  /** Plain findings for the report: one per tag that is not picture structure. */
  function fields(tree) {
    const out = [], le = tree.le;
    const gps = nodesOf(tree.root).find((n) => n.kind === 'gps');
    if (gps) {
      const get = (t) => gps.entries.find((e) => e.tag === t);
      const lat = get(2), lon = get(4);
      if (lat && lon) {
        const deg = (e) => { const v = nums(e, le); return v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600; };
        const ref = (t) => { const e = get(t); return e ? trimNul(ascii(e.raw, 0, e.raw.length)) : ''; };
        const sgn = (v, r) => (r === 'S' || r === 'W' ? -v : v);
        out.push({ cat: 'location', label: 'GPS position', where: 'GPS',
          value: `${sgn(deg(lat), ref(1)).toFixed(5)}, ${sgn(deg(lon), ref(3)).toFixed(5)} (${ref(1) || 'N'}/${ref(3) || 'E'})` });
      }
    }
    const seen = new Set();
    const walk = (node) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      for (const e of node.entries) {
        if (POINTERS[e.tag] !== undefined) { if (e.child) walk(e.child); continue; }
        if (node.kind === 'thumb') {
          if (e.tag === 0x201) {
            const len = node.entries.find((x) => x.tag === 0x202);
            out.push({ cat: 'thumbnail', label: 'Embedded thumbnail picture', where: 'Thumbnail', value: `${len ? nums(len, le)[0] : e.count} bytes` });
          }
          continue;
        }
        const d = describe(node.kind, e.tag);
        if (d.cat === 'struct') continue;
        if (node.kind === 'gps' && [1, 2, 3, 4].includes(e.tag)) continue;
        out.push({ cat: d.cat, label: d.label, where: WHERE[node.kind] || 'Metadata', value: formatValue(e, le) });
      }
      walk(node.next);
    };
    walk(tree.root);
    return out;
  }

  function formatValue(e, le) {
    if (e.type === 2) { const s = trimNul(ascii(e.raw, 0, e.raw.length)).trim(); return s.length > 160 ? s.slice(0, 160) + '…' : (s || '(empty)'); }
    if (e.type === 5 || e.type === 10) {
      const v = nums(e, le);
      return v.length === 1 ? String(Number(v[0].toFixed(4))) : `${v.length} values`;
    }
    if (e.type === 7 || e.type === 1 || e.count > 8) return `${e.count} bytes`;
    const v = nums(e, le);
    return v.length === 1 ? String(v[0]) : v.join(', ');
  }

  C.tiff = { parse, rewrite, fields, nodesOf, nums, countKept };
})(typeof window !== 'undefined' ? window : globalThis);
