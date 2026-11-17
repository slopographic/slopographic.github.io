/* SlopPatterns: finds sensitive or structured patterns in text (IP addresses, keys and tokens, emails, URLs, ...).
 * Pure (no DOM, no network). Two classic scripts, loaded in this order: patterns.js (the engine, this file) and
 * patterns-kinds.js (the table of kinds). Under Node, require('./patterns.js') loads both. See shared/patterns/HANDOFF.md.
 *   SlopPatterns.KINDS            [{ id, group, secret, label }] in display order (filled by patterns-kinds.js)
 *   SlopPatterns.scan(text, { kinds?, limit?: 5000, validate?: true }) -> [{ kind, start, end, text }], by start, never overlapping
 *   SlopPatterns.count(text, opts) -> { kindId: n }       SlopPatterns.byId(id) -> kind | null
 *   SlopPatterns.regex(id) -> { source, flags } | null     SlopPatterns.mask(id, matchText) -> string
 *   SlopPatterns.ipClass(ip) -> 'private' | 'loopback' | 'link-local' | 'multicast' | 'reserved' | 'public' | null
 * How it stays fast: every kind is one regular expression with no nested quantifiers, anchored by a lookbehind so a
 * long run of look-alike characters is tried once, not from every position; checks (checksums, ranges) run on the
 * few hits. The kinds are read as streams, merged by start, and cut off at `limit`. */
(function (root) {
  'use strict';
  const S = (root.SlopPatterns = root.SlopPatterns || {});
  const KINDS = (S.KINDS = S.KINDS || []);
  KINDS.length = 0; // a script loaded twice starts its table again
  const DEFS = [];
  const BY_ID = Object.create(null);
  const DEFAULT_LIMIT = 5000;
  const CLUSTER_CAP = 256; // candidates resolved together; a longer chain of overlaps is cut here (never slow)

  // ---- IP addresses ----
  /** [a, b, c, d] for a dotted quad with octets 0-255 and no leading zeros, else null. */
  function parse4(s) {
    const p = String(s).split('.');
    if (p.length !== 4) return null;
    const n = [];
    for (let i = 0; i < 4; i++) {
      if (!/^(?:0|[1-9]\d{0,2})$/.test(p[i]) || +p[i] > 255) return null;
      n.push(+p[i]);
    }
    return n;
  }

  /** The eight 16-bit groups of an IPv6 address (full, "::" compressed, IPv4 tail), or null when it is not one. */
  function expand6(s) {
    const halves = String(s).split('::');
    if (halves.length > 2) return null;
    const nums = [[], []];
    for (let k = 0; k < halves.length; k++) {
      const p = halves[k] === '' ? [] : halves[k].split(':');
      for (let i = 0; i < p.length; i++) {
        const v4 = i === p.length - 1 && (k === 1 || halves.length === 1) && p[i].indexOf('.') >= 0 ? parse4(p[i]) : null;
        if (v4) nums[k].push(v4[0] * 256 + v4[1], v4[2] * 256 + v4[3]);
        else if (/^[0-9a-f]{1,4}$/i.test(p[i])) nums[k].push(parseInt(p[i], 16));
        else return null;
      }
    }
    const have = nums[0].length + nums[1].length;
    if (halves.length === 1) return have === 8 ? nums[0] : null;
    if (have > 7) return null;
    return nums[0].concat(new Array(8 - have).fill(0), nums[1]);
  }

  function class4(a) {
    const x = a[0], y = a[1], z = a[2];
    if (x === 127) return 'loopback';
    if (x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127)) return 'private';
    if (x === 169 && y === 254) return 'link-local';
    if (x >= 224 && x <= 239) return 'multicast';
    if (x === 0 || x >= 240 || (x === 192 && y === 0 && (z === 0 || z === 2)) || (x === 192 && y === 88 && z === 99) ||
      (x === 198 && (y === 18 || y === 19 || (y === 51 && z === 100))) || (x === 203 && y === 0 && z === 113)) return 'reserved';
    return 'public';
  }

  function class6(g) {
    const head = g[0] + g[1] + g[2] + g[3] + g[4] === 0;
    if (head && g[5] === 0xffff) return class4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]); // IPv4-mapped
    if (head && g[5] === 0) return g[6] === 0 && g[7] === 1 ? 'loopback' : 'reserved'; // ::1, "::" and the old IPv4-compatible forms
    if ((g[0] & 0xffc0) === 0xfe80) return 'link-local';
    if ((g[0] >> 8) === 0xff) return 'multicast';
    if ((g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfec0) return 'private'; // unique local, old site-local
    if ((g[0] === 0x2001 && g[1] === 0x0db8) || (g[0] === 0x0100 && g[1] + g[2] + g[3] === 0)) return 'reserved'; // documentation, discard
    return 'public';
  }

  /** 'private' | 'loopback' | 'link-local' | 'multicast' | 'reserved' | 'public' for an IPv4 or IPv6 address, else null. */
  function ipClass(ip) {
    const s = String(ip == null ? '' : ip).trim().replace(/^\[/, '').replace(/\]$/, '');
    const v4 = parse4(s);
    if (v4) return class4(v4);
    const pct = s.indexOf('%');
    const v6 = expand6(pct < 0 ? s : s.slice(0, pct));
    return v6 ? class6(v6) : null;
  }

  // ---- registry ----
  /** Registers a kind (patterns-kinds.js). def: { id, group, secret, label, pri, source, flags?, find?, g?, check? }.
   * pri: who wins an overlap (higher). source: the scanning regex; find: what regex(id) offers, when it can be better
   * (default source); g: capture groups holding the reported part (needs the d flag); check(str, strict, m, text, start)
   * -> the length of str to keep (0 = reject). */
  function define(def) {
    const d = Object.assign({}, def);
    d.flags = d.flags || '';
    d.sf = 'g' + (d.g ? 'd' : '') + d.flags;
    d.pub = { id: d.id, group: d.group, secret: !!d.secret, label: d.label };
    const old = BY_ID[d.id];
    if (old) {
      d.ord = old.ord;
      DEFS[old.ord] = d;
      KINDS[old.ord] = d.pub;
    } else {
      d.ord = DEFS.length;
      DEFS.push(d);
      KINDS.push(d.pub);
    }
    BY_ID[d.id] = d;
    return d.pub;
  }

  const byId = (id) => (BY_ID[id] ? BY_ID[id].pub : null);
  function regex(id) {
    const d = BY_ID[id];
    return d ? { source: d.find || d.source, flags: d.flags } : null;
  }

  // ---- scanning ----
  /** Moves a cursor to its next accepted hit (c.next), or null at the end of the text. */
  function pull(c, text, strict) {
    const d = c.d, re = c.re;
    c.next = null;
    if (c.done) return;
    let m;
    while ((m = re.exec(text))) {
      let s = m.index, str = m[0];
      if (d.g) {
        let gi = null;
        for (let i = 0; i < d.g.length && !gi; i++) gi = m.indices[d.g[i]];
        if (!gi) { re.lastIndex = m.index + 1; continue; }
        s = gi[0];
        str = text.slice(gi[0], gi[1]);
      }
      const n = d.check ? d.check(str, strict, m, text, s) : str.length;
      if (n > 0) {
        c.next = { kind: d.id, start: s, end: s + n, text: n === str.length ? str : str.slice(0, n), pri: d.pri, ord: d.ord };
        return;
      }
      re.lastIndex = m.index + 1; // rejected: look again just after its start
    }
    c.done = true;
  }

  /** From overlapping hits keep the most specific (priority, then the longer), never two that overlap. */
  function resolve(g) {
    if (g.length < 2) return g;
    const order = g.slice().sort((a, b) => b.pri - a.pri || (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.ord - b.ord);
    const kept = [];
    for (let i = 0; i < order.length; i++) {
      const h = order[i];
      if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  function scan(text, opts) {
    text = text == null ? '' : String(text);
    const o = opts || {};
    const limit = typeof o.limit === 'number' && o.limit >= 0 ? o.limit : DEFAULT_LIMIT;
    const strict = o.validate !== false;
    const want = Array.isArray(o.kinds) ? o.kinds : null;
    const out = [];
    if (!text || !limit) return out;
    const cs = [];
    for (let i = 0; i < DEFS.length; i++) {
      const d = DEFS[i];
      if (!want || want.indexOf(d.id) >= 0) cs.push({ d, re: new RegExp(d.source, d.sf), next: null, done: false });
    }
    for (const c of cs) pull(c, text, strict);
    let floor = 0;
    for (;;) {
      let first = null;
      for (const c of cs) if (c.next && (!first || c.next.start < first.next.start)) first = c;
      if (!first) return out;
      // Gather the hits that overlap one another (a chain of them), then keep the most specific.
      const group = [];
      let end = 0;
      const take = (c) => { const h = c.next; group.push(h); if (h.end > end) end = h.end; pull(c, text, strict); };
      take(first);
      for (let moved = true; moved && group.length < CLUSTER_CAP;) {
        moved = false;
        for (const c of cs) while (c.next && c.next.start < end && group.length < CLUSTER_CAP) { take(c); moved = true; }
      }
      const kept = resolve(group);
      for (let i = 0; i < kept.length; i++) {
        const h = kept[i];
        if (h.start < floor) continue;
        floor = h.end;
        out.push({ kind: h.kind, start: h.start, end: h.end, text: h.text });
        if (out.length >= limit) return out;
      }
    }
  }

  function count(text, opts) {
    const r = {};
    const hits = scan(text, opts);
    for (let i = 0; i < hits.length; i++) r[hits[i].kind] = (r[hits[i].kind] || 0) + 1;
    return r;
  }

  /** The redacted form of a match: a secret keeps its first 4 and last 2 characters ('…' when it is too short to
   * hide anything), every other kind becomes '[id]'. */
  function mask(id, matchText) {
    const d = BY_ID[id];
    if (!d || !d.secret) return '[' + id + ']';
    const a = Array.from(String(matchText == null ? '' : matchText));
    return a.length >= 12 ? a.slice(0, 4).join('') + '…' + a.slice(-2).join('') : '…';
  }

  Object.assign(S, { scan, count, mask, regex, byId, ipClass, define, DEFAULT_LIMIT, lib: { parse4, expand6 } });
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = S;
    require('./patterns-kinds.js');
  }
})(typeof window !== 'undefined' ? window : globalThis);
