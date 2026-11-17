/* Slop PDF — a page content stream as operators. Pure (no DOM), so it is tested alone in Node
   (tests/node/pdf-content-strip.test.mjs). The content is a latin1 string (one character per byte).
     lex(s) → [{ op, args, s, e }]: each operator with its operands; s is where the first operand starts (the operator
       itself when it has none) and e is just past the operator, so s..e is the operator's whole text in the stream.
   Operand values: numbers are numbers; a name is { name }, a string (literal or hex) { str } (its bytes as a latin1
   string), an array is an Array, a dictionary { dict }, true/false/null are { kw }. An inline image (BI … ID data EI)
   is one operator 'BI' with no operands. Comments are skipped. content-strip.js reads the operators. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopPdfLex = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var WS = { 0: 1, 9: 1, 10: 1, 12: 1, 13: 1, 32: 1 };
  var DELIM = { 40: 1, 41: 1, 60: 1, 62: 1, 91: 1, 93: 1, 123: 1, 125: 1, 47: 1, 37: 1 };
  var NUM = /^[+-]?(\d+\.?\d*|\.\d+)$/;

  function isWs(c) { return WS[c] === 1; }
  function isDelim(c) { return DELIM[c] === 1; }

  /** Reads a literal string starting at s[i] === '(' → { v, i } (i past the closing paren). */
  function literal(s, i) {
    var depth = 1, out = '';
    i++;
    while (i < s.length) {
      var ch = s[i];
      if (ch === '\\') {
        var nx = s[i + 1];
        if (nx === undefined) { i++; break; }
        var map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
        if (map[nx] !== undefined) { out += map[nx]; i += 2; continue; }
        if (nx === '\r') { i += s[i + 2] === '\n' ? 3 : 2; continue; } // a line continuation
        if (nx === '\n') { i += 2; continue; }
        if (nx >= '0' && nx <= '7') {
          var oct = nx, j = i + 2;
          while (oct.length < 3 && s[j] >= '0' && s[j] <= '7') oct += s[j++];
          out += String.fromCharCode(parseInt(oct, 8) & 255); i = j; continue;
        }
        out += nx; i += 2; continue;
      }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (!depth) { i++; break; } }
      out += ch; i++;
    }
    return { v: out, i: i };
  }
  /** Reads a hex string starting at s[i] === '<' → { v, i }. */
  function hex(s, i) {
    var j = s.indexOf('>', i), digits = s.slice(i + 1, j < 0 ? s.length : j).replace(/[^0-9A-Fa-f]/g, ''), out = '';
    if (digits.length % 2) digits += '0';
    for (var k = 0; k < digits.length; k += 2) out += String.fromCharCode(parseInt(digits.substr(k, 2), 16));
    return { v: out, i: j < 0 ? s.length : j + 1 };
  }
  /** The end of a regular token (a run of characters that are neither white space nor delimiters). */
  function wordEnd(s, i) {
    while (i < s.length && !isWs(s.charCodeAt(i)) && !isDelim(s.charCodeAt(i))) i++;
    return i;
  }
  /** Skips an inline image's data: from just past 'ID' to just past the 'EI' that ends it. */
  function skipImage(s, i) {
    i++; // the single white-space byte after ID
    while (i < s.length) {
      var at = s.indexOf('EI', i);
      if (at < 0) return s.length;
      var before = s.charCodeAt(at - 1), after = s.charCodeAt(at + 2);
      if (isWs(before) && (at + 2 >= s.length || isWs(after) || isDelim(after))) return at + 2;
      i = at + 2;
    }
    return s.length;
  }

  /** The operators of a content string. */
  function lex(s) {
    var ops = [], stack = [], frames = [], i = 0, argStart = -1;
    function push(v, at) {
      if (frames.length) frames[frames.length - 1].v.push(v);
      else { if (!stack.length) argStart = at; stack.push(v); }
    }
    while (i < s.length) {
      var c = s.charCodeAt(i), start = i;
      if (isWs(c)) { i++; continue; }
      if (c === 37) { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++; continue; } // % comment
      if (c === 40) { var lt = literal(s, i); i = lt.i; push({ str: lt.v }, start); continue; }
      if (c === 60 && s[i + 1] === '<') { frames.push({ dict: true, v: [], at: start }); i += 2; continue; }
      if (c === 62 && s[i + 1] === '>') {
        i += 2;
        var fd = frames.pop();
        if (!fd) continue;
        var d = {};
        for (var k = 0; k + 1 < fd.v.length; k += 2) if (fd.v[k] && fd.v[k].name != null) d[fd.v[k].name] = fd.v[k + 1];
        push({ dict: d }, fd.at); continue;
      }
      if (c === 60) { var hx = hex(s, i); i = hx.i; push({ str: hx.v }, start); continue; }
      if (c === 91) { frames.push({ dict: false, v: [], at: start }); i++; continue; }
      if (c === 93) { i++; var fa = frames.pop(); if (fa) push(fa.v, fa.at); continue; }
      if (c === 47) { var ne = wordEnd(s, i + 1); push({ name: s.slice(i + 1, ne).replace(/#([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); }) }, start); i = ne; continue; }
      if (c === 123 || c === 125 || c === 41 || c === 62) { i++; continue; } // stray delimiters (PostScript braces)
      var we = wordEnd(s, i), w = s.slice(i, we);
      i = we;
      if (NUM.test(w)) { push(parseFloat(w), start); continue; }
      if (w === 'true' || w === 'false' || w === 'null') { push({ kw: w }, start); continue; }
      if (frames.length) { frames[frames.length - 1].v.push({ kw: w }); continue; } // a keyword inside an array: kept, not run
      if (w === 'BI') {
        var id = s.indexOf('ID', i);
        while (id >= 0 && !(isWs(s.charCodeAt(id - 1)) && (isWs(s.charCodeAt(id + 2)) || id + 2 >= s.length))) id = s.indexOf('ID', id + 2);
        i = id < 0 ? s.length : skipImage(s, id + 2);
        ops.push({ op: 'BI', args: [], s: stack.length ? argStart : start, e: i });
        stack = []; continue;
      }
      ops.push({ op: w, args: stack, s: stack.length ? argStart : start, e: i });
      stack = [];
    }
    return ops;
  }

  /** A string's bytes as a hex string operand. */
  function hexOf(bytes) {
    var out = '<';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes.charCodeAt(i).toString(16)).slice(-2);
    return out + '>';
  }
  /** A number as content text: fixed point (no exponent), trailing zeros dropped. */
  function num(v) {
    var t = (Math.round(v * 1e4) / 1e4).toFixed(4).replace(/\.?0+$/, '');
    return t === '-0' ? '0' : t;
  }

  return { lex: lex, hexOf: hexOf, num: num };
});
