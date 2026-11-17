/* Slop EML: byte and text codecs for mail. Pure (no DOM, no network). Classic script; exposes window.EmlCodec.
 * Strings here are "bin" strings: one character per byte (0 to 255), as the file is read before any decoding.
 *   bytesToBin / binToBytes      Uint8Array <-> bin string
 *   decodeText(bytes, charset)   TextDecoder for any label the browser knows; UTF-8, then windows-1252 as fallbacks
 *   decodeWords(value)           RFC 2047 encoded words (=?charset?B|Q?text?=) and raw 8-bit header text
 *   base64ToBytes, qpToBytes     Content-Transfer-Encoding (tolerant: bad characters are skipped or kept)
 *   parseParams(value)           "type/sub; a=b; c=\"d\"" with RFC 2231 continuations and percent-encoded values
 *   splitAddresses, parseDate    address lists and Date headers, for display */
(function () {
  'use strict';
  const C = (window.EmlCodec = {});

  C.bytesToBin = function (u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return s;
  };
  C.binToBytes = function (s) {
    const u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
    return u;
  };

  /** A charset label, lower case and unquoted ('' when none). */
  const norm = (cs) => String(cs || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  /** windows-1252 for bytes 0x80 to 0x9F. Browsers map them; the table makes the result the same in every runtime. */
  const CP1252 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ';
  const fix = (s, enc) => (enc === 'windows-1252' ? s.replace(/[\x80-\x9f]/g, (c) => CP1252[c.charCodeAt(0) - 0x80]) : s);
  /** Decodes bytes. A declared charset the browser knows is used (ISO-8859-1 reads as windows-1252, as browsers do);
   *  otherwise strict UTF-8, then windows-1252. */
  C.decodeText = function (u8, charset) {
    const label = norm(charset);
    if (label) {
      try { const d = new TextDecoder(label); return fix(d.decode(u8), d.encoding); } catch (e) { /* unknown label */ }
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { /* not UTF-8 */ }
    return fix(new TextDecoder('windows-1252').decode(u8), 'windows-1252');
  };

  /* ---------- base64 and quoted-printable ---------- */
  const B64 = new Int16Array(256).fill(-1);
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('').forEach((ch, i) => { B64[ch.charCodeAt(0)] = i; });
  B64[45] = 62; B64[95] = 63; // '-' and '_' (URL-safe alphabet, sometimes seen in mail)
  /** Base64 to bytes. Whitespace and other stray characters are skipped; '=' ends the data. */
  C.base64ToBytes = function (s) {
    const out = new Uint8Array(Math.floor(s.length * 3 / 4) + 3);
    let n = 0, acc = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 61) break;
      const v = c < 256 ? B64[c] : -1;
      if (v < 0) continue;
      acc = ((acc << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) { bits -= 8; out[n++] = (acc >> bits) & 255; }
    }
    return out.slice(0, n);
  };
  const hexVal = (c) => (c >= 48 && c <= 57) ? c - 48 : (c >= 65 && c <= 70) ? c - 55 : (c >= 97 && c <= 102) ? c - 87 : -1;
  /** Quoted-printable to bytes. Soft line breaks vanish, =XX becomes a byte, a bad =XX stays as text. In encoded words
   *  (q = true) an underscore is a space. Trailing spaces before a line break are dropped, as the format asks. */
  C.qpToBytes = function (s, q = false) {
    const out = new Uint8Array(s.length);
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 61) {
        if (s.charAt(i + 1) === '\n') { i += 1; continue; }
        if (s.charAt(i + 1) === '\r' && s.charAt(i + 2) === '\n') { i += 2; continue; }
        if (i + 1 >= s.length) break;
        const h = hexVal(s.charCodeAt(i + 1)), l = hexVal(s.charCodeAt(i + 2));
        if (h >= 0 && l >= 0) { out[n++] = h * 16 + l; i += 2; } else out[n++] = c;
      } else if (c === 10 || c === 13) {
        while (n > 0 && (out[n - 1] === 32 || out[n - 1] === 9)) n--;
        out[n++] = c;
      } else if (q && c === 95) out[n++] = 32;
      else out[n++] = c & 255;
    }
    return out.slice(0, n);
  };

  /* ---------- text in headers (RFC 2047) ---------- */
  const EW = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
  /** Raw 8-bit text in a header or a name: UTF-8 when it reads as UTF-8, else windows-1252. */
  const raw = (s) => (/[\x80-\xff]/.test(s) ? C.decodeText(C.binToBytes(s), '') : s);
  function word(cs, enc, txt) {
    const bytes = /^b$/i.test(enc) ? C.base64ToBytes(txt) : C.qpToBytes(txt, true);
    return C.decodeText(bytes, cs.split('*')[0]);
  }
  /** A header value (bin string) to text: encoded words decoded, adjacent words joined without the space between them. */
  C.decodeWords = function (value) {
    const s = String(value || '');
    let out = '', pos = 0, prevWord = false, m;
    EW.lastIndex = 0;
    while ((m = EW.exec(s))) {
      const gap = s.slice(pos, m.index);
      if (!(prevWord && /^\s*$/.test(gap))) out += raw(gap);
      out += word(m[1], m[2], m[3]);
      pos = EW.lastIndex;
      prevWord = true;
    }
    return out + raw(s.slice(pos));
  };

  /* ---------- parameters (RFC 2045, RFC 2231) ---------- */
  /** Splits on a character outside quotes. */
  function splitTop(s, sep) {
    const parts = [];
    let cur = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q && ch === '\\' && i + 1 < s.length) { cur += ch + s[++i]; continue; }
      if (ch === '"') q = !q;
      if (ch === sep && !q) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts;
  }
  function unquote(v) {
    v = v.trim();
    if (v[0] !== '"') return v;
    const end = v.lastIndexOf('"') > 0 ? v.lastIndexOf('"') : v.length;
    return v.slice(1, end).replace(/\\(.)/g, '$1');
  }
  /** Percent-decoded bytes of an RFC 2231 value; other characters are their own byte. */
  function pctBytes(v) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const h = v[i] === '%' ? hexVal(v.charCodeAt(i + 1)) : -1;
      const l = h >= 0 ? hexVal(v.charCodeAt(i + 2)) : -1;
      if (l >= 0) { out.push(h * 16 + l); i += 2; } else out.push(v.charCodeAt(i) & 255);
    }
    return out;
  }
  /** "text/plain; charset=utf-8; name*0*=UTF-8''a%20b; name*1=.txt" -> { value, params }. Values are decoded text. */
  C.parseParams = function (value) {
    const parts = splitTop(String(value || ''), ';');
    const head = (parts.shift() || '').trim().toLowerCase();
    const plain = {}, groups = {};
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq <= 0) continue;
      const name = p.slice(0, eq).trim().toLowerCase();
      const v = unquote(p.slice(eq + 1));
      const m = /^([^*]+?)(?:\*(\d+))?(\*)?$/.exec(name);
      if (!m) continue;
      if (m[2] === undefined && !m[3]) { if (!(m[1] in plain)) plain[m[1]] = C.decodeWords(v); continue; }
      (groups[m[1]] = groups[m[1]] || []).push({ idx: m[2] === undefined ? 0 : +m[2], enc: !!m[3], v });
    }
    for (const base of Object.keys(groups)) {
      const segs = groups[base].sort((a, b) => a.idx - b.idx);
      let charset = '', bytes = [];
      for (const sg of segs) {
        let v = sg.v;
        if (sg.enc) {
          const q = sg.idx === 0 ? /^([^']*)'[^']*'/.exec(v) : null;
          if (q) { charset = q[1]; v = v.slice(q[0].length); }
          bytes = bytes.concat(pctBytes(v));
        } else bytes = bytes.concat(Array.from(C.binToBytes(v)));
      }
      plain[base] = C.decodeText(Uint8Array.from(bytes), charset);
    }
    return { value: head, params: plain };
  };

  /* ---------- addresses and dates ---------- */
  /** An address list ("A <a@x>, \"B, C\" <b@x>") to its entries, commas inside quotes, brackets or comments kept. */
  C.splitAddresses = function (s) {
    const out = [];
    let cur = '', q = false, depth = 0;
    for (let i = 0; i < String(s || '').length; i++) {
      const ch = s[i];
      if (ch === '\\' && q) { cur += ch + (s[++i] || ''); continue; }
      if (ch === '"') q = !q;
      else if (!q && (ch === '<' || ch === '(')) depth++;
      else if (!q && (ch === '>' || ch === ')') && depth > 0) depth--;
      if (ch === ',' && !q && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  /** A Date header to a Date, or null when it does not read as one. */
  C.parseDate = function (s) {
    const t = Date.parse(String(s || '').replace(/\s+/g, ' ').trim());
    return Number.isNaN(t) ? null : new Date(t);
  };
})();
