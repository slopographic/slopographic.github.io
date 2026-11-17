/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.sectors: the file header and the sectors (fmptools' read_header, new_block_from_sector, fmp_file_from_stream and
   first_leaf_block in fmp.c and block.c). A file is a header sector then N body sectors of 1024 bytes (Pro 3 to 6; the
   first body sector is skipped, the real ones start at byte 2048) or 4096 bytes (Pro 7 and later, marked "HBAM7"). Each
   sector holds a payload and the ids of the sectors before and after it; the leaves of the B-tree (level 0) are chained
   through those ids, possibly out of file order ("shuffled"). Files with "HBAMe" are encrypted at rest and not readable.
   header(bytes) -> info | { error }      table(bytes, info) -> sectors | { error }      leafChain(sectors, info) -> [index]
   An error is one of the codes of SlopFmp.open: 'not-filemaker', 'encrypted', 'unsupported', 'corrupt'. Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const MAGIC = [0x00, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x05, 0x00, 0x02, 0x00, 0x02, 0xC0];
  const u16 = (b, i) => (b[i] << 8) | b[i + 1];
  const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (b, from, to) => String.fromCharCode.apply(null, Array.prototype.slice.call(b, from, to));

  /** The layout of a file from its first 1024 bytes: { v7, version, sectorSize, headLen, prev, next, lenAt, first,
   *  versionString } (version: 0 for Pro 3 to 6, 7 or 12 for the newer files), or { error }. */
  function header(bytes) {
    if (!bytes || bytes.length < MAGIC.length) return { error: 'not-filemaker' };
    for (let i = 0; i < MAGIC.length; i++) if (bytes[i] !== MAGIC[i]) return { error: 'not-filemaker' };
    if (bytes.length < 1024) return { error: 'corrupt' };
    const tag = ascii(bytes, 15, 20);
    const vlen = Math.min(bytes[541], 9); // a Pascal string such as "Pro 12.0"
    const info = { versionString: ascii(bytes, 542, 542 + vlen) };
    if (tag.slice(0, 4) === 'HBAM') {
      if (tag[4] === 'e') return { error: 'encrypted' };
      if (tag[4] !== '7') return { error: 'unsupported' };
      return Object.assign(info, { v7: true, version: bytes[521] === 0x1E ? 12 : 7, sectorSize: 4096, headLen: 20, prev: 4, next: 8, lenAt: -1, first: 4096 });
    }
    return Object.assign(info, { v7: false, version: 0, sectorSize: 1024, headLen: 14, prev: 2, next: 6, lenAt: 12, first: 2048 });
  }

  /** One sector at a byte offset: its links and where its payload lies; null when the payload length is impossible. */
  function sector(bytes, at, info) {
    let len = info.sectorSize - info.headLen;
    if (info.lenAt >= 0) len = u16(bytes, at + info.lenAt);
    if (len > info.sectorSize - info.headLen) return null;
    return {
      level: info.v7 ? u16(bytes, at + 12) : bytes[at + 1],
      prev: u32(bytes, at + info.prev), next: u32(bytes, at + info.next),
      off: at + info.headLen, len,
    };
  }

  /** Every body sector, from the count in the first one (which must agree with the size of the file). fileOrder: count the
   *  sectors from the size of the file instead (for files whose sectors were rewritten in chain order). */
  function table(bytes, info, fileOrder) {
    const size = info.sectorSize;
    if (bytes.length < info.first + size) return { error: 'corrupt' };
    const head = sector(bytes, info.first, info);
    if (!head || (head.next === 0 && !fileOrder)) return { error: 'corrupt' };
    const count = fileOrder ? bytes.length / size - (info.v7 ? 1 : 2) : head.next;
    if (!(count > 0) || count % 1 || (count + 1 + (info.v7 ? 0 : 1)) * size !== bytes.length) return { error: 'corrupt' };
    const out = { count, level: new Uint16Array(count), prev: new Uint32Array(count), next: new Uint32Array(count), off: new Uint32Array(count), len: new Uint16Array(count), bad: new Uint8Array(count) };
    for (let i = 0; i < count; i++) {
      const s = sector(bytes, info.first + i * size, info);
      if (!s) { out.bad[i] = 1; continue; } // one damaged sector does not stop the others
      out.level[i] = s.level; out.prev[i] = s.prev; out.next[i] = s.next; out.off[i] = s.off; out.len[i] = s.len;
    }
    return out;
  }

  /** The leaf sectors in reading order (as indexes into the table; sector id = index + 1). The chain starts at sector 2,
   *  or, in newer files where that is an index sector, at the leaf that has no predecessor. Each sector is read once. */
  function leafChain(t, info) {
    let id = 2;
    if (info.v7) {
      for (let i = 1; i < t.count; i++) if (!t.bad[i] && t.level[i] === 0 && t.prev[i] === 0) { id = i + 1; break; }
    }
    const seen = new Uint8Array(t.count), chain = [];
    while (id !== 0 && id - 1 < t.count && !seen[id - 1]) {
      seen[id - 1] = 1;
      if (!t.bad[id - 1]) chain.push(id - 1);
      id = t.next[id - 1];
    }
    return chain;
  }

  F.sectors = { header, table, leafChain };
})(typeof window !== 'undefined' ? window : globalThis);
