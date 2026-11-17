/* Slop Contacts: text helpers: HTML escaping for the views (html), and for the vCard and CSV code escapes, folding,
 * quoted-printable and octets.
 * Classic script, no dependencies. Adds SlopContacts.text. */
(function () {
  'use strict';
  const SC = (window.SlopContacts = window.SlopContacts || {});
  const enc = new TextEncoder();
  const octets = (s) => enc.encode(s).length;

  /** Fold one logical line into physical lines of at most 75 octets each (continuations start with a space).
   *  Splits between code points, so a UTF-8 sequence is never cut. Returns the lines joined with CRLF. */
  function fold(line) {
    const parts = [];
    let cur = '', n = 0, limit = 75;
    for (const ch of String(line)) {
      const w = octets(ch);
      if (n + w > limit) { parts.push(cur); cur = ''; n = 0; limit = 74; }
      cur += ch; n += w;
    }
    parts.push(cur);
    return parts.map((p, i) => (i ? ' ' + p : p)).join('\r\n');
  }

  /** vCard text escaping: backslash, semicolon, comma and newlines. */
  const escVal = (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
  /** Reverse of escVal (also accepts \N). */
  const unescVal = (s) => String(s || '').replace(/\\(.)/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));
  /** Split on an unescaped separator; the parts keep their escapes (unescape each with unescVal). */
  function splitUnescaped(s, sep) {
    const out = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) { cur += c + s[i + 1]; i++; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** Bytes to text in the given charset; falls back to UTF-8, then Latin-1. */
  function decodeBytes(bytes, charset) {
    const u8 = Uint8Array.from(bytes);
    const attempt = (label) => new TextDecoder(label, { fatal: true }).decode(u8);
    try { return attempt(charset || 'utf-8'); } catch (e) { /* unknown or wrong charset */ }
    try { return attempt('utf-8'); } catch (e) { return new TextDecoder('iso-8859-1').decode(u8); }
  }
  /** Quoted-printable (vCard 2.1): =XX bytes, soft line breaks (= at end of line) removed. */
  function qpDecode(s, charset) {
    const chars = Array.from(String(s || '')), bytes = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (c === '=') {
        const hex = (chars[i + 1] || '') + (chars[i + 2] || '');
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; continue; }
        if (chars[i + 1] === '\r') { i += chars[i + 2] === '\n' ? 2 : 1; continue; }
        if (chars[i + 1] === '\n') { i += 1; continue; }
        bytes.push(61);
        continue;
      }
      for (const b of enc.encode(c)) bytes.push(b);
    }
    return decodeBytes(bytes, charset);
  }

  /** Trim and collapse runs of white space to one space (single-line fields). */
  const tidy = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  /** Notes keep their line breaks; only spaces are collapsed. */
  const tidyNote = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').trim();
  const uniq = (a) => [...new Set(a)];

  /** Text made safe inside HTML (element text and attribute values): & < > " ' as entities; null and undefined as ''. */
  const html = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  SC.text = { html, octets, fold, escVal, unescVal, splitUnescaped, qpDecode, decodeBytes, tidy, tidyNote, uniq };
})();
