/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.scsu: the Standard Compression Scheme for Unicode (UTR #6) that FileMaker Pro 7 and later use for text, as
   fmptools' scsu.c reads it, with the quirks it has (kept so that values match the C tool):
   - tab becomes a space; CR, LF and VT become a line feed (a CR LF pair gives two: the C code's CRLF branch never fires);
   - other control codes become U+FFFD, and a NUL (after a quote or window code) is dropped;
   - a window-define byte of 0x00 selects the offset 0xAC00 (the table in offset_table() has no case for it);
   - a truncated sequence at the end stops the decoding and keeps what was read.
   decode(bytes, mask, start, end): bytes are read as (byte ^ mask) (FileMaker 7+ stores text XOR 0x5A, so mask is 0x5A,
   or 0 for plain SCSU); leading spaces are dropped. Returns a JS string. Pure (no DOM, no network); also runs in Node. */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const SQ0 = 0x01, SQ7 = 0x08, SDX = 0x0B, SQU = 0x0E, SCU = 0x0F, SC0 = 0x10, SC7 = 0x17, SD0 = 0x18, SD7 = 0x1F;
  const UC0 = 0xE0, UC7 = 0xE7, UD0 = 0xE8, UD7 = 0xEF, UQU = 0xF0, UDX = 0xF1;
  /** The static windows (0 is the quoting range); the dynamic windows start as these and are redefined by the text. */
  const STATIC = [0x0000, 0x0080, 0x0100, 0x0300, 0x2000, 0x2080, 0x2100, 0x3000];
  const DYNAMIC = [0x0080, 0x00C0, 0x0400, 0x0600, 0x0900, 0x3040, 0x30A0, 0xFF00];
  const SPECIAL = { 0xF9: 0xC0, 0xFA: 0x0250, 0xFB: 0x0370, 0xFC: 0x0530, 0xFD: 0x3040, 0xFE: 0x30A0, 0xFF: 0xFF60 };

  /** The window offset a define byte stands for (UTR #6 table 5). The C code keeps this in a uint16. */
  function offsetTable(x) {
    if (x > 0 && x < 0x68) return x * 0x80;
    if (x < 0xA8) return (x * 0x80 + 0xAC00) & 0xFFFF;
    return SPECIAL[x] || 0;
  }
  /** The offset of an extended window (SDX, UDX): 0x10000 plus 0x80 times the 13 bits that follow the window number. */
  const extendedOffset = (h, l) => 0x10000 + 0x80 * (((h & 0x1F) << 8) + l);

  /** Code units to a string, in slices so a long value cannot overflow the argument limit. */
  function units(out) {
    let s = '';
    for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode.apply(null, out.slice(i, i + 8192));
    return s;
  }

  F.scsu = {
    decode(bytes, mask, start, end) {
      mask = mask || 0;
      let i = start || 0;
      const stop = end == null ? bytes.length : Math.min(end, bytes.length);
      while (i < stop && (bytes[i] ^ mask) === 0x20) i++; // leading spaces are removed from every value and name
      const win = DYNAMIC.slice();
      const out = [];
      let shift = 0, unicode = false, hi = 0, active = 0;
      while (i < stop) {
        const c = bytes[i++] ^ mask;
        let u = 0;
        const left = stop - i;
        if (unicode) {
          if (c === UQU) {
            if (left < 2) break;
            u = ((bytes[i] ^ mask) << 8) + (bytes[i + 1] ^ mask); i += 2;
          } else if (c >= UC0 && c <= UC7) { active = c - UC0; unicode = false; continue; }
          else if (c >= UD0 && c <= UD7) {
            if (left < 1) break;
            active = c - UD0; win[active] = offsetTable(bytes[i++] ^ mask); unicode = false; continue;
          } else if (c === UDX) {
            if (left < 2) break;
            const h = bytes[i] ^ mask, l = bytes[i + 1] ^ mask;
            active = (h & 0xE0) >> 5; win[active] = extendedOffset(h, l); i += 2; unicode = false; continue;
          } else {
            if (left < 1) break;
            u = (c << 8) + (bytes[i++] ^ mask);
          }
        } else if (shift) {
          // SQn quotes one character: 0x00-0x7F from the static window, 0x80-0xFF from the dynamic window.
          const w = shift - SQ0;
          u = c < 0x80 ? STATIC[w] + c : win[w] + (c - 0x80);
          shift = 0;
        } else if (c === SCU) { unicode = true; continue; }
        else if (c === SQU) {
          if (left < 2) break;
          u = ((bytes[i] ^ mask) << 8) + (bytes[i + 1] ^ mask); i += 2;
        } else if (c >= SQ0 && c <= SQ7) { shift = c; continue; }
        else if (c >= SC0 && c <= SC7) { active = c - SC0; continue; }
        else if (c >= SD0 && c <= SD7) {
          if (left < 1) break;
          active = c - SD0; win[active] = offsetTable(bytes[i++] ^ mask); continue;
        } else if (c === SDX) {
          if (left < 2) break;
          const h = bytes[i] ^ mask, l = bytes[i + 1] ^ mask;
          active = (h & 0xE0) >> 5; win[active] = extendedOffset(h, l); i += 2; continue;
        } else if (c === 0x09) u = 0x20;
        else if (c === 0x0A || c === 0x0D) u = 0x0A;
        else if (c >= 0x20 && c <= 0x7F) u = c;
        else if (c >= 0x80) u = win[active] + (c - 0x80);
        else u = 0xFFFD;

        // A UTF-16 surrogate pair: the high half is held until the low half arrives.
        if (u >= 0xDC00 && u <= 0xDFFF) u = 0x10000 + (hi << 10) + (u & 0x3FF);
        else if (u >= 0xD800 && u <= 0xDBFF) { hi = u & 0x3FF; continue; }
        hi = 0;
        if (u >= 0x10000) { u -= 0x10000; out.push(0xD800 + (u >> 10), 0xDC00 + (u & 0x3FF)); }
        else if (u > 0) out.push(u);
      }
      return units(out);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
