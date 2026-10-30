/* Slop Press — a minimal PDF object writer: objects, (Flate) streams, xref table and trailer.
   Values: numbers, '/Name' strings, { ref }, { str } (literal), { hex }, { raw }, arrays, plain objects (dicts). */
(function () {
  'use strict';
  var PR = window.PR;
  var enc = new TextEncoder();

  function num(n) {
    if (!isFinite(n)) return '0';
    var s = (Math.round(n * 10000) / 10000).toString();
    if (s.indexOf('e') >= 0) s = n.toFixed(6);
    return s === '-0' ? '0' : s;
  }
  function lit(s) {
    var out = '(';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 40 || c === 41 || c === 92) out += '\\' + s[i];
      else if (c < 32 || c > 126) out += '\\' + ('00' + (c & 255).toString(8)).slice(-3);
      else out += s[i];
    }
    return out + ')';
  }
  /** Text string for document info: PDFDocEncoding when possible, else UTF-16BE with BOM. */
  function textString(s) {
    if (/^[\x20-\x7e]*$/.test(s)) return lit(s);
    var h = 'FEFF'; for (var i = 0; i < s.length; i++) h += ('0000' + s.charCodeAt(i).toString(16)).slice(-4);
    return '<' + h.toUpperCase() + '>';
  }
  function ser(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return num(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return v.charAt(0) === '/' ? '/' + v.slice(1).replace(/[^\x21-\x7e]|[#()<>[\]{}/%]/g, function (c) { return '#' + ('0' + c.charCodeAt(0).toString(16)).slice(-2); }) : lit(v);
    if (Array.isArray(v)) return '[' + v.map(ser).join(' ') + ']';
    if (v.ref) return v.ref + ' 0 R';
    if (v.str !== undefined) return lit(v.str);
    if (v.text !== undefined) return textString(v.text);
    if (v.hex !== undefined) return '<' + v.hex + '>';
    if (v.raw !== undefined) return v.raw;
    var out = '<<';
    for (var k in v) if (v[k] !== undefined) out += '/' + k + ' ' + ser(v[k]);
    return out + '>>';
  }

  function Writer() { this.objs = []; }
  Writer.prototype.alloc = function () { this.objs.push(null); return { ref: this.objs.length }; };
  Writer.prototype.set = function (r, dict, stream) { this.objs[r.ref - 1] = { dict: dict, stream: stream || null }; return r; };
  Writer.prototype.add = function (dict, stream) { return this.set(this.alloc(), dict, stream); };
  /** Adds a stream; compress: Flate it (async, resolved in finish()). */
  Writer.prototype.stream = function (dict, data, compress) {
    var bytes = typeof data === 'string' ? latin1(data) : data;
    return this.add(dict, { bytes: bytes, compress: compress !== false });
  };
  function latin1(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  Writer.latin1 = latin1;
  /** Serialises everything. Returns Promise<Uint8Array>. */
  Writer.prototype.finish = function (root, info) {
    var self = this;
    return Promise.all(this.objs.map(function (o) {
      if (!o || !o.stream || !o.stream.compress || !PR.zip || !window.CompressionStream) return Promise.resolve(null);
      return PR.zip.deflate(o.stream.bytes).then(function (z) { if (z && z.length < o.stream.bytes.length) { o.stream.bytes = z; o.dict.Filter = o.dict.Filter ? [].concat('/FlateDecode', o.dict.Filter) : '/FlateDecode'; } });
    })).then(function () {
      var chunks = [], len = 0, offs = [];
      function push(x) { var b = typeof x === 'string' ? latin1(x) : x; chunks.push(b); len += b.length; }
      push('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n');
      self.objs.forEach(function (o, i) {
        offs[i] = len;
        if (!o) { push((i + 1) + ' 0 obj\nnull\nendobj\n'); return; }
        if (o.stream) { o.dict.Length = o.stream.bytes.length; push((i + 1) + ' 0 obj\n' + ser(o.dict) + '\nstream\n'); push(o.stream.bytes); push('\nendstream\nendobj\n'); }
        else push((i + 1) + ' 0 obj\n' + ser(o.dict) + '\nendobj\n');
      });
      var xref = len, x = 'xref\n0 ' + (self.objs.length + 1) + '\n0000000000 65535 f \n';
      offs.forEach(function (o) { x += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
      push(x + 'trailer\n' + ser({ Size: self.objs.length + 1, Root: root, Info: info }) + '\nstartxref\n' + xref + '\n%%EOF\n');
      var out = new Uint8Array(len), p = 0; chunks.forEach(function (c) { out.set(c, p); p += c.length; });
      return out;
    });
  };
  PR.PDFWriter = Writer;
  PR.pdfw = { ser: ser, num: num, lit: lit, enc: enc };
})();
