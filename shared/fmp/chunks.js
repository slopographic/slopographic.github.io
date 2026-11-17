/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.chunks: turns the payload of one sector into a list of chunks (fmptools' process_block_v3 in block.c; the
   Pro 7+ decoder is in chunks7.js). A payload is a byte-code stream of six kinds of chunk:
     PUSH / POP  move down into and back up out of a "folder" of the path (the path is how a chunk is addressed),
     DATA        plain bytes,    REF  a key (a number) with a value,    LREF  a key made of bytes with a value,
     SEG         a numbered segment of a long value.
   A chunk is { t: kind, code, ref (REF key), seg (SEG index), ko, kn (the LREF key: offset, length), o, n (the data:
   offset, length), pv (a PUSH chunk's path number) }; offsets point into the file's bytes, nothing is copied.
   decode(bytes, start, end, v7) -> { chunks, error }: error is 0, or 1 (data runs past the sector) or 2 (unknown code);
   the chunks read before the fault are kept. pathValue(bytes, chunk, v7) is a path number: 1 byte as it is, 2 bytes
   0x80 + 15 bits, 3 bytes (Pro 3 to 6: 0xC000 + 22 bits; Pro 7+: 0x80 + the last 2 bytes). Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const PUSH = 0, POP = 1, DATA = 2, REF = 3, LREF = 4, SEG = 5;
  const u16 = (b, i) => (b[i] << 8) | b[i + 1];
  const mk = (t, code, ref, o, n) => ({ t, code, ref, seg: 0, ko: 0, kn: 0, o, n, pv: 0 });

  function pathValue(b, ch, v7) {
    const o = ch.o;
    if (ch.n === 1) return b[o];
    if (ch.n === 2) return 0x80 + ((b[o] & 0x7F) << 8) + b[o + 1];
    if (ch.n === 3) return v7 ? 0x80 + (b[o + 1] << 8) + b[o + 2] : 0xC000 + ((b[o] & 0x3F) << 16) + (b[o + 1] << 8) + b[o + 2];
    return 0;
  }

  /** Pro 3 to 6: the first byte tells the kind (0x00 key 0, 0x01-0x3F long key, 0x40-0x7F key, 0x80-0xBF data, 0xC0 pop,
   *  0xC1-0xFE push, 0xFF an extended form with a two-byte length). */
  function decode3(b, start, end) {
    const out = [];
    let p = start, error = 0;
    while (p < end) {
      const c = b[p];
      let ch, q;
      if (c === 0x00) {
        ch = mk(REF, c, 0, p + 2, b[p + 1]);
      } else if (c === 0x01 && b[p + 1] === 0xFF && b[p + 2] === 0x05) {
        p += 8; // a length marker, skipped
        if (p > end) error = 1;
        continue;
      } else if (c < 0x40) {
        ch = mk(LREF, c, 0, p + 2 + c, b[p + 1 + c]);
        ch.ko = p + 1; ch.kn = c;
      } else if (c < 0x80) {
        ch = mk(REF, c, c - 0x40, p + 2, b[p + 1]);
      } else if (c < 0xC0) {
        ch = mk(DATA, c, 0, p + 1, c - 0x80);
      } else if (c === 0xC0) {
        ch = mk(POP, c, 0, p + 1, 0);
      } else if (c < 0xFF) {
        ch = mk(PUSH, c, 0, p + 1, c - 0xC0);
      } else {
        const c2 = b[p + 1];
        if (c2 >= 1 && c2 <= 0x04) { // long key, then a two-byte length
          const at = p + 2 + c2;
          ch = mk(LREF, c2, 0, at + 2, u16(b, at));
          ch.ko = p + 2; ch.kn = c2;
        } else if (c2 >= 0x40 && c2 <= 0x80) {
          ch = mk(REF, c2, c2 - 0x40, p + 4, u16(b, p + 2));
        } else { error = 1; break; } // a zero or unknown second byte: the rest of the sector is not readable
      }
      q = ch.o + ch.n;
      if (!(q <= end) || (ch.kn && !(ch.ko + ch.kn <= end))) { error = 1; break; }
      if (ch.t === LREF && ch.kn === 1) { ch.t = REF; ch.ref = b[ch.ko]; }
      out.push(ch);
      p = q;
    }
    return { chunks: out, error };
  }

  F.chunks = {
    PUSH, POP, DATA, REF, LREF, SEG, mk, pathValue, u16,
    decode(bytes, start, end, v7) {
      return v7 ? F.chunks.decode7(bytes, start, end) : decode3(bytes, start, end);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
