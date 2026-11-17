/* SlopFmp.xml: the XML files FileMaker writes. This file is original work (the fmptools code reads only the binary
   format); it follows the layout of FileMaker's own exports.
   FMPXMLRESULT (Export Records as XML: a table): <METADATA><FIELD NAME TYPE/>...</METADATA>, then
   <RESULTSET><ROW><COL><DATA>text</DATA>...</COL>...</ROW>...</RESULTSET>; a repeating field has several <DATA> in one
   <COL>, joined here with the group separator (0x1D) as the binary reader does. <fmxmlsnippet> (script, layout or field
   copy) and <FMPReport> (the Database Design Report) are only recognised.
   A small tolerant text scanner, no DOM, so it runs in Node too: entities, CDATA and attribute quotes of both kinds are
   understood; unknown tags are skipped. Rows are found by one scan for "<ROW" and read when a page asks for them.
   decode(bytes) -> text      sniff(text) -> 'fmpxmlresult' | 'fmxmlsnippet' | 'ddr' | null
   sniffBytes(bytes) -> the same, from the first bytes of a file      open(bytes, opts) -> reader (as reader.js) */
(function (root) {
  'use strict';
  const F = (root.SlopFmp = root.SlopFmp || {});
  const SEP = '\x1D';
  const KINDS = { fmpxmlresult: 'fmpxmlresult', fmxmlsnippet: 'fmxmlsnippet', fmpreport: 'ddr' };

  /** Bytes to text: UTF-8 (BOM allowed), UTF-16 with a BOM, else the encoding the XML declaration names. */
  function decode(bytes) {
    let enc = 'utf-8', at = 0;
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) at = 3;
    else if (bytes[0] === 0xFF && bytes[1] === 0xFE) { enc = 'utf-16le'; at = 2; }
    else if (bytes[0] === 0xFE && bytes[1] === 0xFF) { enc = 'utf-16be'; at = 2; }
    else {
      const m = /^[^>]{0,200}encoding\s*=\s*["']([\w.:-]+)["']/i.exec(String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 0, 256)));
      if (m && !/^utf-?8$/i.test(m[1])) enc = m[1];
    }
    try { return new TextDecoder(enc).decode(at ? bytes.subarray(at) : bytes); }
    catch (e) { return new TextDecoder('utf-8').decode(bytes.subarray(at)); } // an encoding this browser does not know
  }

  /** The kind of FileMaker XML a text is, from its first element, or null. */
  function sniff(text) {
    const m = /<(?![?!])\s*([A-Za-z_][\w:.-]*)/.exec(String(text).slice(0, 4096));
    return m ? KINDS[m[1].toLowerCase()] || null : null;
  }
  const sniffBytes = (bytes) => sniff(decode(bytes.subarray(0, 4096)));

  /** Text with entities resolved and CDATA taken as it is, in one pass (so CDATA is never decoded twice). */
  function unescape(s) {
    if (s.indexOf('&') < 0 && s.indexOf('<![CDATA[') < 0) return s;
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>|&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, cdata, ent) => {
      if (cdata !== undefined) return cdata;
      if (ent[0] !== '#') return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[ent];
      const n = ent[1] === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return n > 0 && n <= 0x10FFFF && (n < 0xD800 || n > 0xDFFF) ? String.fromCodePoint(n) : '�';
    });
  }

  /** The attributes of a tag's text: { NAME: 'x', ... } (names upper-cased). */
  function attrs(s) {
    const out = {};
    const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = re.exec(s))) out[m[1].toUpperCase()] = unescape(m[2] !== undefined ? m[2] : m[3]);
    return out;
  }

  /** The cells of one row: text from the start of "<ROW" to its end. */
  function cells(text, start) {
    let end = text.indexOf('</ROW>', start);
    if (end < 0) end = text.length;
    const row = text.slice(start, end), out = [];
    const col = /<COL\b[^>]*?(?:\/>|>([\s\S]*?)<\/COL>)/g;
    let m;
    while ((m = col.exec(row))) {
      const vals = [];
      if (m[1]) {
        const data = /<DATA\b[^>]*?(?:\/>|>([\s\S]*?)<\/DATA>)/g;
        let d;
        while ((d = data.exec(m[1]))) vals.push(d[1] === undefined ? '' : unescape(d[1]));
      }
      out.push(vals.join(SEP));
    }
    return out;
  }

  /** Reads an FMPXMLRESULT: the same shape as reader.openBinary's result (tables, rows, close, warnings). */
  function open(bytes, opts) {
    const text = decode(bytes);
    const db = /<DATABASE\b([^>]*)>/.exec(text);
    const dbAttrs = db ? attrs(db[1]) : {};
    const mStart = text.indexOf('<METADATA'), mEnd = text.indexOf('</METADATA>');
    const meta = mStart >= 0 ? text.slice(mStart, mEnd < 0 ? text.length : mEnd) : '';
    const columns = [];
    const fieldRe = /<FIELD\b([^>]*?)\/?>/g;
    let f;
    while ((f = fieldRe.exec(meta))) {
      const a = attrs(f[1]);
      const col = { name: a.NAME || 'Field ' + (columns.length + 1), index: columns.length + 1 };
      if (a.TYPE) col.type = a.TYPE.toLowerCase();
      columns.push(col);
    }
    const index = [];
    const rowRe = /<ROW(?=[\s/>])/g;
    let r = text.indexOf('<RESULTSET');
    rowRe.lastIndex = r < 0 ? 0 : r;
    while ((r = rowRe.exec(text))) index.push(r.index);
    if (!columns.length && index.length) { // no metadata: as many columns as the first row has
      const n = cells(text, index[0]).length;
      for (let i = 1; i <= n; i++) columns.push({ name: 'Field ' + i, index: i });
    }
    const base = String(opts.name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
    const name = String(dbAttrs.NAME || '').replace(/\.[^.]*$/, '') || dbAttrs.LAYOUT || base || 'Table 1';
    const R = { v7: false, closed: false, warnings: 0, tables: [{ id: '1', name, columns, rowCount: index.length }] };
    R.rows = async (id, from, count) => {
      from = Math.max(0, Math.floor(from) || 0);
      const end = Math.min(index.length, from + Math.max(0, Math.floor(count) || 0));
      const out = [];
      if (R.closed) return out;
      for (let i = from; i < end; i++) {
        const row = cells(text, index[i]);
        while (row.length < columns.length) row.push('');
        out.push(row.slice(0, columns.length));
      }
      return out;
    };
    R.close = () => { R.closed = true; index.length = 0; };
    return R;
  }

  F.xml = { decode, sniff, sniffBytes, unescape, attrs, open };
})(typeof window !== 'undefined' ? window : globalThis);
