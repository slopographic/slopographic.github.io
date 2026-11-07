/* SlopGuides notation: a GuideGuide-style grid language. Needs engine.js first.
 *
 *   |            a guide
 *   ~            a wildcard: wildcards share the leftover space equally
 *   10px 5% 2mm  a fixed space (px, %, mm, cm, in, pt; plain numbers use the panel's unit)
 *   (…)*4        repeat a group 4 times;  |*3 or ~*2 repeat one item
 *   (…)*         fill: repeat a fixed-size group as many times as fit
 *   $a = |~|     a variable (one per line), used as $a or $a*3
 *   ( v ) ( h )  options at the end of a line: v = columns (default), h = rows,
 *                p = whole pixels (fair remainder); ( hp, 10px, 20px ) also insets the start and end.
 * Each line is a separate grid, so one line can make columns and the next rows. */
(function (root) {
  'use strict';
  const SG = root.SlopGuides = root.SlopGuides || {};
  const tr = (k, v) => (root.SlopI18n ? root.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/guides.js

  const HELP = [
    ['|', 'ui.guides.help_guide'],   // [syntax, the key of its meaning] (shared/i18n/ui/<code>/guides.js)
    ['~', 'ui.guides.help_wild'],
    ['10px  5%  2mm  1in  12pt', 'ui.guides.help_fixed'],
    ['(| ~ |)*4', 'ui.guides.help_repeat'],
    ['(|20px|)*', 'ui.guides.help_fill'],
    ['$c = | ~ |', 'ui.guides.help_var'],
    ['( v ) ( h ) ( hp, 10px, 10px )', 'ui.guides.help_opts'],
  ];

  function tokenize(src) {
    const toks = [], re = /\s*(?:(\$[a-z_][\w]*)|(-?(?:\d+\.?\d*|\.\d+)\s*(?:px|%|mm|cm|in|pt)?)|([|~()*=,])|([a-z]+))/iy;
    let i = 0;
    while (i < src.length) {
      if (/\s/.test(src[i])) { i++; continue; }
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) throw new Error(tr('ui.guides.err_unexpected_at', { text: src[i], col: String(i + 1) }));
      if (m[1]) toks.push({ t: 'var', v: m[1] });
      else if (m[2]) toks.push({ t: 'len', v: m[2].replace(/\s+/g, '') });
      else if (m[3]) toks.push({ t: m[3] });
      else toks.push({ t: 'word', v: m[4].toLowerCase() });
      i = re.lastIndex;
    }
    return toks;
  }

  /** Parse a sequence until `)` or the end. Items: { k: 'g' } | { k: 'w' } | { k: 'f', len } | { k: 'grp', items, n } ; n = Infinity for fill. */
  function parseSeq(toks, pos, vars, depth) {
    const items = [];
    let opts = null;
    while (pos.i < toks.length) {
      const tk = toks[pos.i];
      if (tk.t === ')') { if (!depth) throw new Error(tr('ui.guides.err_unmatched')); break; }
      pos.i++;
      let item;
      if (tk.t === '|') item = { k: 'g' };
      else if (tk.t === '~') item = { k: 'w' };
      else if (tk.t === 'len') item = { k: 'f', len: tk.v };
      else if (tk.t === 'var') {
        if (!vars[tk.v]) throw new Error(tr('ui.guides.err_variable', { name: tk.v }));
        item = { k: 'grp', items: vars[tk.v], n: 1 };
      } else if (tk.t === '(') {
        if (toks[pos.i] && toks[pos.i].t === 'word') { opts = parseOpts(toks, pos); continue; }
        const inner = parseSeq(toks, pos, vars, depth + 1);
        if (!toks[pos.i] || toks[pos.i].t !== ')') throw new Error(tr('ui.guides.err_missing'));
        pos.i++;
        item = { k: 'grp', items: inner.items, n: 1 };
      } else throw new Error(tr('ui.guides.err_unexpected', { text: tk.v || tk.t }));
      if (opts) throw new Error(tr('ui.guides.err_opts_end'));
      if (toks[pos.i] && toks[pos.i].t === '*') {
        pos.i++;
        const nt = toks[pos.i];
        if (nt && nt.t === 'len' && /^\d+$/.test(nt.v)) { pos.i++; item = { k: 'grp', items: [item], n: +nt.v }; }
        else item = { k: 'grp', items: [item], n: Infinity };
      }
      items.push(item);
    }
    return { items, opts };
  }
  function parseOpts(toks, pos) {
    const flags = toks[pos.i++].v, opts = { dir: 'v', pixel: false, start: null, end: null };
    for (const ch of flags) {
      if (ch === 'v' || ch === 'h') opts.dir = ch;
      else if (ch === 'p') opts.pixel = true;
      else throw new Error(tr('ui.guides.err_option', { text: ch }));
    }
    const lens = [];
    while (toks[pos.i] && toks[pos.i].t === ',') {
      pos.i++;
      if (toks[pos.i] && toks[pos.i].t === 'len') lens.push(toks[pos.i++].v); else lens.push(null);
    }
    if (!toks[pos.i] || toks[pos.i].t !== ')') throw new Error(tr('ui.guides.err_missing_opts'));
    pos.i++;
    opts.start = lens[0] || null; opts.end = lens[1] || null;
    return opts;
  }

  /** Parse the whole text: { lines: [{ items, opts, src, n }], errors: [{ line, msg }] }. */
  function parse(text) {
    const vars = Object.create(null), lines = [], errors = [];
    String(text || '').split(/\r?\n|;/).forEach((raw, n) => {
      const src = raw.replace(/#.*$/, '').trim();
      if (!src) return;
      try {
        const vm = src.match(/^(\$[a-z_]\w*)\s*=(.*)$/i);
        const toks = tokenize(vm ? vm[2] : src), pos = { i: 0 };
        const r = parseSeq(toks, pos, vars, 0);
        if (pos.i < toks.length) throw new Error(tr('ui.guides.err_unmatched'));
        if (vm) vars[vm[1]] = r.items;
        else lines.push({ items: r.items, opts: r.opts || { dir: 'v', pixel: false }, src, n: n + 1 });
      } catch (e) { errors.push({ line: n + 1, msg: e.message }); }
    });
    return { lines, errors };
  }

  /** Expand groups into a flat list; a fill group becomes { k: 'fill', items } (resolved later). */
  function flatten(items, out, fills) {
    for (const it of items) {
      if (it.k !== 'grp') { out.push(it); continue; }
      if (it.n === Infinity) { const inner = []; flatten(it.items, inner, fills); out.push({ k: 'fill', items: inner }); fills.n++; continue; }
      for (let r = 0; r < Math.min(it.n, 2000); r++) flatten(it.items, out, fills);
    }
    return out;
  }

  /** Guides for one parsed line inside rect. */
  function evalLine(line, rect, { unit = 'px', dpi = 72, snap = 'off' } = {}) {
    const o = line.opts, horiz = o.dir === 'h';
    let start = horiz ? rect.y : rect.x, len = horiz ? rect.h : rect.w;
    const px = (l, ref) => SG.toPx(l, { ref, dpi, unit });
    const full = len, s0 = o.start ? px(o.start, full) : 0, e0 = o.end ? px(o.end, full) : 0;
    start += s0; len = Math.max(0, len - s0 - e0);
    const pixel = o.pixel || snap !== 'off';
    const fills = { n: 0 };
    let flat = flatten(line.items, [], fills);
    if (fills.n > 1) throw new Error(tr('ui.guides.err_one_fill'));
    const size = (it) => (it.k === 'f' ? (pixel ? Math.round(px(it.len, len)) : px(it.len, len)) : 0);
    const fixedOf = (list) => list.reduce((a, it) => a + size(it), 0);
    if (fills.n) {
      const fi = flat.findIndex((it) => it.k === 'fill'), grp = flat[fi].items;
      if (grp.some((it) => it.k === 'w')) throw new Error(tr('ui.guides.err_fill_wild'));
      const unitLen = fixedOf(grp), rest = flat.filter((it) => it.k !== 'fill');
      const n = unitLen > 0 ? Math.max(0, Math.floor((len - fixedOf(rest) + 1e-6) / unitLen)) : 0;
      const exp = []; for (let r = 0; r < Math.min(n, 2000); r++) exp.push(...grp);
      flat = flat.slice(0, fi).concat(exp, flat.slice(fi + 1));
    }
    const wild = flat.filter((it) => it.k === 'w').length;
    const left = Math.max(0, len - fixedOf(flat));
    let ws;
    if (pixel) { start = Math.round(start); ws = SG.distribute(Math.max(0, Math.round(start + len) - start - fixedOf(flat)), wild); }
    else ws = new Array(wild).fill(wild ? left / wild : 0);
    const out = [];
    let x = start, wi = 0;
    for (const it of flat) {
      if (it.k === 'g') out.push({ o: horiz ? 'h' : 'v', pos: pixel ? Math.round(x) : x });
      else if (it.k === 'w') x += ws[wi++];
      else x += size(it);
    }
    return out;
  }

  /** Text → { guides, errors }. opts: { unit, dpi, snap }. */
  function notation(text, rect, opts) {
    const p = parse(text), out = [], errors = p.errors.slice();
    for (const line of p.lines) {
      try { out.push(...evalLine(line, rect, opts)); } catch (e) { errors.push({ line: line.n, msg: e.message }); }
    }
    return { guides: SG.normalize(out), errors };
  }

  /** The notation for a Form setup (columns and rows), so the Notation tab can start from it. */
  function formToNotation(f = {}) {
    const m = f.margins || {}, lines = [];
    const side = (v) => (v != null && String(v).trim() !== '' && parseFloat(v) ? String(v).trim().replace(/^(-?[\d.]+)$/, '$1' + (f.unit || 'px')) : '');
    const axis = (spec, a, b, dir) => {
      const n = Math.floor(+spec.count || 0), size = side(spec.width || spec.height), gut = side(spec.gutter);
      if (!n && !a && !b) return;
      const track = size || '~', parts = [];
      if (a) parts.push(a, '|');
      if (size && n) parts.push('~');
      if (n) {
        parts.push('|', track, '|');
        if (n > 1) parts.push(gut ? `(${gut} | ${track} |)*${n - 1}` : `(${track} |)*${n - 1}`);
      } else parts.push('~');
      if (size && n) parts.push('~');
      if (b) parts.push('|', b);
      lines.push(parts.join(' ').replace(/\| \|/g, '|').replace(/\s+/g, ' ') + ` ( ${dir}${f.snap && f.snap !== 'off' ? 'p' : ''} )`);
    };
    axis(f.cols || {}, side(m.left), side(m.right), 'v');
    axis(f.rows || {}, side(m.top), side(m.bottom), 'h');
    return lines.join('\n');
  }

  Object.assign(SG, { NOTATION_HELP: HELP, parseNotation: parse, notation, formToNotation });
  if (typeof module === 'object' && module.exports) module.exports = SG;
})(typeof window !== 'undefined' ? window : globalThis);
