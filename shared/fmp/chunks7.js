/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.chunks.decode7(bytes, start, end) -> { chunks, error }: the chunk decoder for Pro 7 and later (fmptools'
   process_block_v7 in block.c; chunk kinds and the result are described in chunks.js). The first byte is the code:
     0x00-0x08, 0x10-0x15, 0x18-0x1D, 0x23  data (some carry a key first, some a trailing part that is skipped),
     0x01-0x06, 0x09-0x0E  a key and a value (the key is one byte, or two "path integer" bytes from 0x09),
     0x07, 0x0F  a numbered segment,   0x16, 0x17, 0x1E, 0x1F  a key of bytes and a value,
     0x20, 0x28, 0x30, 0x38  push (1, 2, 3 or n bytes),   0x3D, 0x40  pop,   0x80, 0x88  nothing,
   and with the top two bits set (0xC0-0xFF) the same chunk as the code with them cleared, followed by a pop.
   Pure (Node too). */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const C = F.chunks;
  const { PUSH, POP, DATA, REF, LREF, SEG, u16 } = C;
  /** A "path integer" of two bytes: the top bit of the first is ignored, and 0x80 is added. */
  const pint = (b, i) => 0x80 + ((b[i] & 0x7F) << 8) + b[i + 1];

  C.decode7 = function (b, start, end) {
    const out = [];
    let p = start, error = 0;
    while (p < end) {
      let c = b[p++];
      const pop = (c & 0xC0) === 0xC0;
      if (pop) c &= 0x3F;
      let t = DATA, ref = 0, seg = 0, ko = 0, kn = 0, o = 0, n = 0, q = 0;
      if (c === 0x00) {
        if (p >= end || b[p] === 0) break; // zero padding to the end of the sector
        o = p; n = 1; q = p + 1;
      } else if (c <= 0x05) {
        t = REF; ref = b[p]; o = p + 1; n = c === 1 ? 1 : 2 * (c - 1); q = o + n;
      } else if (c === 0x06) {
        t = REF; ref = b[p]; n = b[p + 1]; o = p + 2; q = o + n;
      } else if (c === 0x07) {
        t = SEG; seg = b[p]; n = u16(b, p + 1); o = p + 3; q = o + n;
      } else if (c === 0x08) {
        o = p; n = 2; q = p + 2;
      } else if (c === 0x0E && b[p] === 0xFF) {
        o = p; n = 6; q = p + 6;
      } else if (c <= 0x0D) {
        t = REF; ref = pint(b, p); o = p + 2; n = c === 0x09 ? 1 : 2 * (c - 9); q = o + n;
      } else if (c === 0x0E) {
        t = REF; ref = pint(b, p); n = b[p + 2]; o = p + 3; q = o + n;
      } else if (c === 0x0F) {
        t = SEG; seg = pint(b, p); n = u16(b, p + 2); o = p + 4; q = o + n;
      } else if (c === 0x10) {
        o = p; n = 3; q = p + 3;
      } else if (c <= 0x15) {
        o = p; n = c === 0x11 ? 4 : 3 + 2 * (c - 0x11); q = p + n;
      } else if (c === 0x16) {
        t = LREF; ko = p; kn = 3; n = b[p + 3]; o = p + 4; q = o + n;
      } else if (c === 0x17) {
        t = LREF; ko = p; kn = 3; n = u16(b, p + 3); o = p + 5; q = o + n;
      } else if (c === 0x18 || c === 0x23) {
        n = b[p]; o = p + 1; q = o + n;
      } else if (c === 0x1B && b[p] === 0) { // a key and four bytes
        t = REF; ref = b[p + 1]; o = p + 2; n = 4; q = o + n;
      } else if (c >= 0x19 && c <= 0x1D) { // the value, then a trailing part that is skipped
        n = b[p]; o = p + 1; q = o + n + (c === 0x19 ? 1 : 2 * (c - 0x19));
      } else if (c === 0x1E) {
        t = LREF; kn = b[p]; ko = p + 1; n = b[ko + kn]; o = ko + kn + 1; q = o + n;
      } else if (c === 0x1F) {
        t = LREF; kn = b[p]; ko = p + 1; n = u16(b, ko + kn); o = ko + kn + 2; q = o + n;
      } else if (c === 0x20) {
        t = PUSH;
        if (b[p] === 0xFE) { o = p + 1; n = 8; } else { o = p; n = 1; }
        q = o + n;
      } else if (c === 0x28) {
        t = PUSH; o = p; n = 2; q = p + 2;
      } else if (c === 0x30) {
        t = PUSH; o = p; n = 3; q = p + 3;
      } else if (c === 0x38) {
        t = PUSH; n = b[p]; o = p + 1; q = o + n;
      } else if (c === 0x3D || c === 0x40) {
        t = POP; q = p;
      } else if (c === 0x80 || c === 0x88) {
        continue; // seen once in a leaf sector of a real file; nothing to read
      } else { error = 2; break; }
      if (!(q <= end) || !(ko + kn <= end)) { error = 1; break; }
      out.push({ t, code: c, ref, seg, ko, kn, o, n, pv: 0 });
      if (pop) out.push(C.mk(POP, 0x40, 0, 0, 0));
      p = q;
    }
    return { chunks: out, error };
  };
})(typeof window !== 'undefined' ? window : globalThis);
