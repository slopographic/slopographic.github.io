/* Slop PDF — the layout of a paragraph frame (Edit text ▸ Paragraphs): text wrapped to the frame's width, aligned, and
   justified with word spacing. Pure (no DOM), tested in Node (tests/node/pdf-para-layout.test.mjs).
     layout(paras, { width, align, rtl, first, rest, measure(text, style) → points, space(style) → points })
       paras: [[{ t, s }]] paragraphs of runs (s: a style index); "\n" inside a run is a line break
       first / rest: the indent of a paragraph's first line and of its other lines (a first-line or hanging indent)
       → [{ segs: [{ x, w, t, s, rtl }], w, last, end }]   x from the frame's left edge; end: a paragraph's last line. Each word of a left-to-right line is its
       own segment (justified lines spread the words to both edges; the last line of a paragraph and a line before a break
       are not spread). A right-to-left line keeps its runs whole (SlopBidi orders them when they are drawn), from the right.
     pieces(seg, has(char, s), measure(text, s)) → [{ x, w, t, s, fb }]   a segment cut where the document's font has the
       character (fb false) or the substitute font sets it (fb true)
     parseToUnicode(cmap text) → { bytes, map: Map(code hex → text) }; reverseMap(map) → Map(char → code hex)
     parseW(W array) → Map(cid → width); WIN_ANSI: Map(code → char) for simple fonts without a ToUnicode map */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPParaLayout = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** A paragraph as words, gaps and breaks. A word may span runs of several styles (a bold letter inside it). */
  function tokens(runs, measure, space) {
    const out = [];
    let word = null;
    const flush = () => { if (word) { word.w = word.parts.reduce((a, p) => a + (p.w = measure(p.t, p.s)), 0); out.push(word); word = null; } };
    runs.forEach((r) => {
      for (const ch of String(r.t)) {
        if (ch === '\n') { flush(); out.push({ k: 'br' }); continue; }
        if (ch === ' ' || ch === '\t' || ch === ' ') { flush(); out.push({ k: 'gap', s: r.s, w: space(r.s) }); continue; }
        if (!word) word = { k: 'word', parts: [] };
        const last = word.parts[word.parts.length - 1];
        if (last && last.s === r.s) last.t += ch; else word.parts.push({ t: ch, s: r.s });
      }
    });
    flush();
    return out;
  }
  /** A word wider than the frame, cut into pieces that fit (by characters). */
  function cutWord(word, width, measure) {
    const out = [];
    let cur = { k: 'word', parts: [], w: 0 };
    word.parts.forEach((p) => {
      for (const ch of p.t) {
        const w = measure(ch, p.s);
        if (cur.w + w > width && cur.parts.length) { out.push(cur); cur = { k: 'word', parts: [], w: 0 }; }
        const last = cur.parts[cur.parts.length - 1];
        if (last && last.s === p.s) { last.t += ch; last.w += w; } else cur.parts.push({ t: ch, s: p.s, w });
        cur.w += w;
      }
    });
    if (cur.parts.length) out.push(cur);
    return out;
  }

  /** Greedy lines; widthOf(k) is the room on the k-th line of the paragraph (a first-line or hanging indent takes some). */
  function wrap(toks, widthOf, measure) {
    const lines = [];
    let line = { words: [], gaps: [], w: 0 }, gap = 0;
    const push = (last) => { lines.push(Object.assign(line, { last })); line = { words: [], gaps: [], w: 0 }; gap = 0; };
    toks.forEach((t) => {
      if (t.k === 'br') { push(true); return; }
      if (t.k === 'gap') { if (line.words.length) gap += t.w; return; }
      const room = widthOf(lines.length), words = t.w > room ? cutWord(t, room, measure) : [t];
      words.forEach((w) => {
        if (line.words.length && line.w + gap + w.w > widthOf(lines.length) + 0.01) push(false);
        if (line.words.length) { line.gaps.push(gap); line.w += gap; }
        line.words.push(w); line.w += w.w; gap = 0;
      });
    });
    push(true);
    return lines;
  }

  function place(line, o) {
    const width = o.width, n = line.words.length, segs = [];
    if (o.rtl) {
      // runs of the line, whole, from the right edge (or the left for a left-aligned right-to-left paragraph)
      let off = o.align === 'left' ? width - line.w : o.align === 'center' ? (width - line.w) / 2 : 0;
      const runs = [];
      line.words.forEach((w, i) => {
        w.parts.forEach((p) => { const r = runs[runs.length - 1]; if (r && r.s === p.s) { r.t += p.t; r.w += p.w; } else runs.push({ t: p.t, s: p.s, w: p.w }); });
        if (i < n - 1) { const r = runs[runs.length - 1]; r.t += ' '; r.w += line.gaps[i]; }
      });
      runs.forEach((r) => { segs.push({ x: width - off - r.w, w: r.w, t: r.t, s: r.s, rtl: true }); off += r.w; });
      return { segs, w: line.w, last: line.last };
    }
    const spread = o.align === 'justify' && !line.last && n > 1 ? (width - line.w) / (n - 1) : 0;
    let x = o.align === 'right' ? width - line.w : o.align === 'center' ? (width - line.w) / 2 : 0;
    line.words.forEach((w, i) => {
      w.parts.forEach((p) => { segs.push({ x, w: p.w, t: p.t, s: p.s }); x += p.w; });
      if (i < n - 1) x += line.gaps[i] + Math.max(0, spread);
    });
    return { segs, w: spread > 0 ? width : line.w, last: line.last };
  }

  function layout(paras, o) {
    const out = [], width = Math.max(1, o.width), first = o.first || 0, rest = o.rest || 0;
    const offOf = (k) => (k ? rest : first), widthOf = (k) => Math.max(1, width - offOf(k));
    (paras || []).forEach((runs) => {
      const ls = wrap(tokens(runs, o.measure, o.space), widthOf, o.measure);
      ls.forEach((l, k) => {
        // an indent is on the starting side: the left of a left-to-right line, the right of a right-to-left one
        const pl = place(l, Object.assign({}, o, { width: widthOf(k) })), off = o.rtl ? 0 : offOf(k);
        if (off) pl.segs.forEach((sg) => { sg.x += off; });
        pl.end = k === ls.length - 1;
        out.push(pl);
      });
    });
    return out;
  }

  function pieces(seg, has, measure) {
    if (seg.rtl) return [Object.assign({}, seg, { fb: true })];
    const out = [];
    let x = seg.x;
    for (const ch of String(seg.t)) {
      const fb = !has(ch, seg.s), last = out[out.length - 1];
      if (last && last.fb === fb) last.t += ch; else out.push({ t: ch, s: seg.s, fb });
    }
    out.forEach((p) => { p.x = x; p.w = measure(p.t, p.s, p.fb); x += p.w; });
    return out;
  }

  /** UTF-16BE hex as text. */
  function hexText(h) {
    let s = '';
    for (let i = 0; i + 3 < h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
    return h.length === 2 ? String.fromCharCode(parseInt(h, 16)) : s;
  }
  const pad = (n, len) => n.toString(16).toUpperCase().padStart(len, '0');
  function plusOne(h, k) { const n = parseInt(h.slice(-4), 16) + k; return h.slice(0, -4) + pad(n, 4); }

  function parseToUnicode(text) {
    const src = String(text || ''), map = new Map();
    const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(src);
    let bytes = cs ? cs[1].length / 2 : 0;
    const note = (code) => { if (!bytes) bytes = code.length / 2; };
    src.replace(/beginbfchar([\s\S]*?)endbfchar/g, (m, body) => {
      body.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g, (q, c, d) => { note(c); map.set(c.toUpperCase(), hexText(d)); return q; });
      return m;
    });
    src.replace(/beginbfrange([\s\S]*?)endbfrange/g, (m, body) => {
      body.replace(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]*>)/g, (q, lo, hi, d) => {
        note(lo);
        const a = parseInt(lo, 16), b = parseInt(hi, 16), len = lo.length;
        if (b - a > 65535) return q;
        if (d[0] === '[') { (d.match(/<([0-9a-fA-F]*)>/g) || []).forEach((x, k) => { if (a + k <= b) map.set(pad(a + k, len), hexText(x.slice(1, -1))); }); }
        else { const dh = d.slice(1, -1).toUpperCase(); for (let k = 0; k <= b - a; k++) map.set(pad(a + k, len), hexText(dh.length >= 4 ? plusOne(dh, k) : pad(parseInt(dh, 16) + k, 2))); }
        return q;
      });
      return m;
    });
    return { bytes: bytes || 2, map };
  }
  /** Each single character the font draws, with the first (lowest) code that draws it. Ligatures (fi) are left out. */
  function reverseMap(map) {
    const out = new Map();
    [...map.keys()].sort().forEach((code) => { const t = map.get(code); if (t && Array.from(t).length === 1 && !out.has(t) && t.codePointAt(0) >= 32) out.set(t, code); });
    return out;
  }
  function parseW(arr) {
    const out = new Map(), a = arr || [];
    for (let i = 0; i < a.length;) {
      const c = a[i];
      if (Array.isArray(a[i + 1])) { a[i + 1].forEach((w, k) => out.set(c + k, w)); i += 2; }
      else { for (let k = c; k <= a[i + 1] && k - c < 65536; k++) out.set(k, a[i + 2]); i += 3; }
    }
    return out;
  }
  const CP1252 = { 128: 0x20ac, 130: 0x201a, 131: 0x192, 132: 0x201e, 133: 0x2026, 134: 0x2020, 135: 0x2021, 136: 0x2c6, 137: 0x2030, 138: 0x160, 139: 0x2039, 140: 0x152, 142: 0x17d, 145: 0x2018, 146: 0x2019, 147: 0x201c, 148: 0x201d, 149: 0x2022, 150: 0x2013, 151: 0x2014, 152: 0x2dc, 153: 0x2122, 154: 0x161, 155: 0x203a, 156: 0x153, 158: 0x17e, 159: 0x178 };
  const WIN_ANSI = new Map();
  for (let c = 32; c < 256; c++) { if (c === 127 || (c > 127 && c < 160 && !CP1252[c])) continue; WIN_ANSI.set(c, String.fromCodePoint(CP1252[c] || c)); }

  return { layout, pieces, parseToUnicode, reverseMap, parseW, WIN_ANSI };
});
