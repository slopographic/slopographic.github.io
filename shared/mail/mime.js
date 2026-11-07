/* Slop EML: MIME parsing. Pure (no DOM, no network). Classic script; exposes window.EmlMime. Needs codec.js first.
 * EmlMime.parse(bytes) reads an .eml file (a Uint8Array) and returns:
 *   headers      [{ name, value }] in file order, values decoded (RFC 2047)
 *   text, html   the first plain-text and the first HTML body (decoded to text), or null
 *   attachments  [{ index, name, type, size, bytes, cid, inline, malformed }] in file order
 *   cids         Map of Content-ID (without <>) to an attachment, for cid: images
 *   warnings     notes on what could not be read as written (malformed headers, parts, boundaries)
 * A broken part never throws: it is kept as an attachment (its bytes are still saveable) with malformed set. */
(function () {
  'use strict';
  const K = window.EmlCodec;
  const M = (window.EmlMime = {});
  const MAX_DEPTH = 24;

  /** Head and body of a message or part (bin strings). A message with no blank line is all head. */
  M.splitHeaders = function (s) {
    const lead = /^\r?\n/.exec(s);
    if (lead) return { head: '', body: s.slice(lead[0].length) };
    const m = /\r?\n\r?\n/.exec(s);
    return m ? { head: s.slice(0, m.index), body: s.slice(m.index + m[0].length) } : { head: s, body: '' };
  };
  /** Raw header lines, unfolded (a line that starts with a space or tab continues the one before). Bad lines are skipped and noted. */
  M.parseHeaders = function (head) {
    const list = [], warnings = [];
    let cur = null;
    for (const line of head.split(/\r?\n/)) {
      if (!line) continue;
      if ((line[0] === ' ' || line[0] === '\t') && cur) { cur.raw += ' ' + line.trim(); continue; }
      const i = line.indexOf(':');
      if (i <= 0 || /\s/.test(line.slice(0, i).trim())) { warnings.push('Skipped a header line with no name: ' + line.slice(0, 60)); cur = null; continue; }
      cur = { name: line.slice(0, i).trim(), raw: line.slice(i + 1).trim() };
      list.push(cur);
    }
    return { list, warnings };
  };
  /** The first header with this name (case-insensitive), decoded, or ''. */
  M.header = function (headers, name) {
    const n = name.toLowerCase();
    const h = headers.find((x) => x.name.toLowerCase() === n);
    return h ? h.value : '';
  };

  /** Body bytes from the transfer encoding. Unknown encodings are read as 8-bit. */
  function transfer(body, cte) {
    if (cte === 'base64') return K.base64ToBytes(body);
    if (cte === 'quoted-printable') return K.qpToBytes(body, false);
    return K.binToBytes(body);
  }
  const cleanId = (v) => String(v || '').trim().replace(/^<|>$/g, '');

  /** Splits a multipart body on its boundary lines. Returns the part texts, and whether the closing boundary was seen. */
  M.splitMultipart = function (body, boundary) {
    const delim = '--' + boundary;
    const marks = [];
    let closed = false;
    for (let p = body.indexOf(delim); p >= 0 && !closed; p = body.indexOf(delim, p + 1)) {
      if (p > 0 && body[p - 1] !== '\n') continue;
      const eol = body.indexOf('\n', p + delim.length);
      const tail = body.slice(p + delim.length, eol < 0 ? body.length : eol).replace(/\r$/, '');
      const m = /^(--)?[ \t]*$/.exec(tail);
      if (!m) continue;
      marks.push({ start: p, after: eol < 0 ? body.length : eol + 1 });
      closed = !!m[1];
    }
    const parts = [];
    for (let i = 0; i < marks.length; i++) {
      if (closed && i === marks.length - 1) break;
      const end = i + 1 < marks.length ? marks[i + 1].start : body.length;
      parts.push(body.slice(marks[i].after, end).replace(/\r?\n$/, ''));
    }
    return { parts, closed, found: marks.length > 0 };
  };

  /** One message or part, from its bin string. Returns a node; never throws. */
  function entity(s, depth, warnings) {
    const node = { headers: [], type: 'text/plain', params: {}, disposition: '', dparams: {}, cid: '', name: '', malformed: false, children: [], body: null };
    try {
      const { head, body } = M.splitHeaders(s);
      const ph = M.parseHeaders(head);
      node.headers = ph.list.map((h) => ({ name: h.name, value: K.decodeWords(h.raw) }));
      ph.warnings.forEach((w) => warnings.push(w));
      const ct = K.parseParams(M.header(node.headers, 'Content-Type') || 'text/plain');
      node.type = /^[\w.+-]+\/[\w.+-]+$/.test(ct.value) ? ct.value : 'application/octet-stream';
      if (node.type !== ct.value && ct.value) { warnings.push('Unreadable Content-Type "' + ct.value.slice(0, 40) + '"'); node.malformed = true; }
      node.params = ct.params;
      const cd = K.parseParams(M.header(node.headers, 'Content-Disposition'));
      node.disposition = cd.value;
      node.dparams = cd.params;
      node.cid = cleanId(M.header(node.headers, 'Content-ID'));
      node.name = cd.params.filename || ct.params.name || '';
      const cte = (M.header(node.headers, 'Content-Transfer-Encoding') || '7bit').trim().toLowerCase();

      if (node.type.startsWith('multipart/')) {
        const sp = node.params.boundary ? M.splitMultipart(body, node.params.boundary) : { parts: [], found: false };
        if (depth >= MAX_DEPTH) { warnings.push('Nesting is too deep; the rest is kept as one part'); node.malformed = true; node.body = transfer(body, cte); }
        else if (!sp.found) {
          warnings.push('Multipart without a usable boundary; the body is read as text');
          node.malformed = true; node.type = 'text/plain'; node.body = transfer(body, cte);
        } else {
          if (!sp.closed) { warnings.push('The closing boundary is missing'); node.malformed = true; }
          node.children = sp.parts.filter((p) => p.trim()).map((p) => entity(p, depth + 1, warnings));
        }
      } else {
        node.body = transfer(body, cte);
      }
    } catch (e) {
      warnings.push('A part could not be read: ' + (e && e.message || e));
      node.malformed = true;
      node.type = 'application/octet-stream';
      node.children = [];
      node.body = K.binToBytes(String(s));
    }
    return node;
  }

  const EXT = { jpeg: 'jpg', plain: 'txt', html: 'html', rfc822: 'eml', 'octet-stream': 'bin', 'svg+xml': 'svg', 'vnd.ms-excel': 'xls' };
  const cleanName = (s) => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180);
  const textOf = (leaf) => K.decodeText(leaf.body, leaf.params.charset).replace(/\r\n?/g, '\n');

  /** Parses the bytes of an .eml file into the parts a viewer needs. */
  M.parse = function (bytes) {
    const warnings = [];
    const root = entity(K.bytesToBin(bytes), 0, warnings);
    const leaves = [];
    (function walk(n) { if (n.children.length) n.children.forEach(walk); else leaves.push(n); })(root);
    let text = null, html = null;
    const attachments = [];
    for (const leaf of leaves) {
      const isBody = (leaf.type === 'text/plain' || leaf.type === 'text/html') && leaf.disposition !== 'attachment';
      if (isBody) {
        if (leaf.type === 'text/plain' && text === null) text = textOf(leaf);
        if (leaf.type === 'text/html' && html === null) html = textOf(leaf);
        continue;
      }
      const i = attachments.length;
      const sub = (leaf.type.split('/')[1] || '').toLowerCase();
      const fallback = 'attachment ' + (i + 1) + (EXT[sub] ? '.' + EXT[sub] : sub && sub !== 'octet-stream' ? '.' + sub.replace(/[^a-z0-9]/g, '') : '.bin');
      attachments.push({
        index: i, name: cleanName(leaf.name) || fallback, type: leaf.type, size: leaf.body.length, bytes: leaf.body,
        cid: leaf.cid, inline: !!leaf.cid || leaf.disposition === 'inline', malformed: leaf.malformed,
      });
    }
    const cids = new Map();
    attachments.forEach((a) => { if (a.cid && !cids.has(a.cid)) cids.set(a.cid, a); });
    if (!root.headers.length) warnings.push('The file has no headers; it may not be an email');
    return { headers: root.headers, text, html, attachments, cids, warnings };
  };

  /** The usual address and date headers, for the header panel and the PDF. */
  M.summary = function (msg) {
    const h = (n) => M.header(msg.headers, n);
    return { from: h('From'), to: h('To'), cc: h('Cc'), bcc: h('Bcc'), date: h('Date'), subject: h('Subject') };
  };

  /** Remote images in an HTML body (src, srcset or background pointing at http, https or //). Counted, not loaded. */
  M.remoteRefs = function (html) {
    const re = /(?:\bsrc(?:set)?|\bbackground)\s*=\s*["']?\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//gi;
    return (String(html || '').match(re) || []).length;
  };
  /** cid: references in an HTML body. */
  M.cidRefs = function (html) {
    return (String(html || '').match(/(?:\bsrc|\bbackground)\s*=\s*["']?cid:|url\(\s*["']?cid:/gi) || []).length;
  };
  /** The HTML with each cid: image in src, background or url() replaced by a data: URI of its attachment. Returns { html, replaced }. */
  M.embedCids = function (html, cids) {
    let replaced = 0;
    const out = String(html || '').replace(/((?:\bsrc|\bbackground)\s*=\s*["']?|url\(\s*["']?)cid:([^"'\s)>]+)/gi, (m, pre, ref) => {
      let a = cids.get(ref);
      if (!a) { try { a = cids.get(decodeURIComponent(ref)); } catch (e) { a = null; } }
      if (!a || !/^[\w.+-]+\/[\w.+-]+$/.test(a.type)) return m;
      replaced++;
      return pre + 'data:' + a.type + ';base64,' + btoa(K.bytesToBin(a.bytes));
    });
    return { html: out, replaced };
  };
})();
