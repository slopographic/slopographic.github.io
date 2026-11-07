/* Slop Font: character sets and glyph names. Pure, no DOM. A glyph's id is 'u' + its code point in hex (four digits at
 * least: 'u0041' for A), or a name for a glyph with no character ('.notdef', 'g12'). Names follow the Adobe Glyph List
 * for Basic Latin and Latin-1 ('A', 'zero', 'aring'); other characters are 'uniXXXX'.
 *   SETS                       [{ id, label, ranges: [[from, to]] }]: basic, latin1, latinA, digits, upper, lower, punct
 *   codes(setId) → [cp]        the code points of a set ('all' = basic + latin1 + latinA), in order
 *   idOf(cp) → 'u0041'         cpOf(id) → 65 or null
 *   nameOf(cp) → 'A'           the PostScript glyph name
 *   label(cp) → 'A'            what a grid cell shows ('space' for U+0020, 'nbsp' for U+00A0)
 *   hex(cp) → 'U+0041'         parseChars(text) → [cp]: the characters of a text, each once, in order */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else (root.SlopFont = root.SlopFont || {}).charset = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const BASIC = ('space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma ' + // i18n-ignore
    'hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at ' + // i18n-ignore
    'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore grave ' + // i18n-ignore
    'a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde').split(' '); // i18n-ignore
  const LATIN1 = ('uni00A0 exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft ' + // i18n-ignore
    'logicalnot uni00AD registered macron degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla ' + // i18n-ignore
    'onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown Agrave Aacute Acircumflex Atilde ' + // i18n-ignore
    'Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis Eth Ntilde Ograve ' + // i18n-ignore
    'Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls agrave ' + // i18n-ignore
    'aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex ' + // i18n-ignore
    'idieresis eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute ' + // i18n-ignore
    'thorn ydieresis').split(' '); // i18n-ignore
  const SETS = Object.freeze([
    { id: 'basic', label: 'Basic Latin (A–Z, a–z, 0–9, punctuation)', ranges: [[0x20, 0x7e]] }, // i18n-ignore
    { id: 'latin1', label: 'Latin-1 (å ä ö é ñ ß and signs)', ranges: [[0xa0, 0xff]] }, // i18n-ignore
    { id: 'latinA', label: 'Latin Extended-A (ą č ł ő ş ž…)', ranges: [[0x100, 0x17f]] }, // i18n-ignore
    { id: 'upper', label: 'Capitals A–Z', ranges: [[0x41, 0x5a]] }, // i18n-ignore
    { id: 'lower', label: 'Small letters a–z', ranges: [[0x61, 0x7a]] }, // i18n-ignore
    { id: 'digits', label: 'Digits 0–9', ranges: [[0x30, 0x39]] }, // i18n-ignore
    { id: 'punct', label: 'Punctuation and symbols', ranges: [[0x20, 0x2f], [0x3a, 0x40], [0x5b, 0x60], [0x7b, 0x7e]] }, // i18n-ignore
    { id: 'nordic', label: 'Swedish, Danish, Norwegian, Finnish (å ä ö æ ø)', ranges: [[0xc4, 0xc6], [0xd6, 0xd6], [0xd8, 0xd8], [0xe4, 0xe6], [0xf6, 0xf6], [0xf8, 0xf8]] }, // i18n-ignore
  ]);
  const ALL = ['basic', 'latin1', 'latinA'];

  function codes(setId) {
    const ids = setId === 'all' ? ALL : [setId];
    const out = [];
    for (const id of ids) {
      const s = SETS.find((x) => x.id === id);
      if (!s) throw new Error(`Unknown character set “${setId}”: use ${['all', ...SETS.map((x) => x.id)].join(', ')}`);
      for (const [a, b] of s.ranges) for (let c = a; c <= b; c++) out.push(c);
    }
    return [...new Set(out)];
  }
  const pad = (cp) => cp.toString(16).toUpperCase().padStart(4, '0');
  const idOf = (cp) => 'u' + pad(cp);
  const cpOf = (id) => (/^u[0-9A-F]{4,6}$/i.test(id || '') ? parseInt(id.slice(1), 16) : null);
  function nameOf(cp) {
    if (cp >= 0x20 && cp <= 0x7e) return BASIC[cp - 0x20];
    if (cp >= 0xa0 && cp <= 0xff) return LATIN1[cp - 0xa0];
    return (cp > 0xffff ? 'u' : 'uni') + pad(cp);
  }
  /** The code point a glyph name stands for: an AGL name of these tables, uniXXXX or uXXXXX; else null. */
  function cpOfName(name) {
    let i = BASIC.indexOf(name);
    if (i >= 0) return 0x20 + i;
    i = LATIN1.indexOf(name);
    if (i >= 0) return 0xa0 + i;
    const m = /^uni([0-9A-F]{4})$|^u([0-9A-F]{5,6})$/i.exec(name || '');
    return m ? parseInt(m[1] || m[2], 16) : null;
  }
  function label(cp) {
    if (cp == null) return '';
    if (cp === 0x20) return 'space';
    if (cp === 0xa0) return 'nbsp';
    if (cp === 0xad) return 'shy';
    return String.fromCodePoint(cp);
  }
  const hex = (cp) => 'U+' + pad(cp);
  function parseChars(text) {
    const out = [];
    for (const ch of String(text || '')) { const c = ch.codePointAt(0); if (c >= 0x20 && !out.includes(c)) out.push(c); }
    return out;
  }
  return { SETS, codes, idOf, cpOf, nameOf, cpOfName, label, hex, parseChars };
});
