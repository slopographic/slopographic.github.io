/* Ported from fmptools, (c) 2020 Evan Miller, MIT licence (see LICENSE-fmptools.txt in this folder).
   SlopFmp.charset: the text conversion of fmptools' convert() in fmp.c. FileMaker Pro 3 to 6 files hold text in the
   machine's own encoding (MacRoman in practice; the C tool asks iconv for MACINTOSH); FileMaker Pro 7 and later hold SCSU
   (see scsu.js) with every byte XOR 0x5A. Every value and name has its leading spaces removed, and (as in a C string) a
   MacRoman value ends at its first NUL byte.
   text(bytes, start, length, v7) -> string.   macRoman(bytes, start, end) -> string. Pure; also runs in Node. */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  /** MacRoman 0x80-0xFF as UTF-16 code units (4 hex digits each; the same table iconv and the WHATWG "macintosh" use). */
  const HIGH = (
    '00c400c500c700c900d100d600dc00e100e000e200e400e300e500e700e900e8' +
    '00ea00eb00ed00ec00ee00ef00f100f300f200f400f600f500fa00f900fb00fc' +
    '202000b000a200a300a7202200b600df00ae00a9212200b400a8226000c600d8' +
    '221e00b12264226500a500b522022211220f03c0222b00aa00ba03a900e600f8' +
    '00bf00a100ac221a01922248220600ab00bb202600a000c000c300d501520153' +
    '20132014201c201d2018201900f725ca00ff0178204420ac2039203afb01fb02' +
    '202100b7201a201e203000c200ca00c100cb00c800cd00ce00cf00cc00d300d4' +
    'f8ff00d200da00db00d9013102c602dc00af02d802d902da00b802dd02db02c7'
  );
  const TABLE = [];
  for (let i = 0; i < 128; i++) TABLE.push(String.fromCharCode(parseInt(HIGH.substr(i * 4, 4), 16)));

  function macRoman(bytes, start, end) {
    let s = '';
    for (let i = start; i < end; i++) {
      const b = bytes[i];
      if (b === 0) break; // a C string ends here
      s += b < 0x80 ? String.fromCharCode(b) : TABLE[b - 0x80];
    }
    return s;
  }

  F.charset = {
    macRoman,
    /** One value or name: bytes [start, start + length) of a file, in the encoding of its FileMaker version. */
    text(bytes, start, length, v7) {
      const end = start + length;
      if (v7) return F.scsu.decode(bytes, 0x5A, start, end);
      let i = start;
      while (i < end && bytes[i] === 0x20) i++;
      return macRoman(bytes, i, end);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
