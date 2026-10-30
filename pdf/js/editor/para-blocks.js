/* Slop PDF — paragraph blocks for Edit text ▸ Paragraphs (para-mode.js). Pure (no DOM), so it is tested alone in Node
   (tests/node/pdf-para-blocks.test.mjs). Coordinates are the page's annotation space: x to the right, y down, points.
     items: [{ str, x0, x1, base, top, bottom, fs, style, family, bold, italic }]   one per text run of the page
     lines(items) → the page's lines: runs on one baseline that follow each other (a wide gap, a column gutter, starts another)
     blocks(lines) → paragraph blocks: lines of one column, one font and size (bold and italic runs may sit inside), an even
       line pitch (at most 1.5 × the line height between two lines), the same left edge (a first-line indent, the hanging
       indent of a bullet), or the same right edge or centre. A larger gap, another size or weight, a new indent, a bullet
       or a number starts a new block. Each block has its alignment (left, right, center, justify) and its line pitch.
     runsOf(block) → the block's text as one paragraph: [{ t, style }], lines joined with a space
   Right-to-left lines (Arabic, Hebrew) start at the right: their edges are mirrored, so the same rules hold. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPParaBlocks = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/g, LTR = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/g;
  const BULLET = /^\s*([•·‣◦▪▫■□●○◆◇►▸➢➤✓✔*\-–—]|\(?(\d{1,3}|[a-zA-Z]|[ivxlcdm]{1,6})[.)])(\s|$)/;

  /** True when a text is mostly right-to-left letters. */
  function isRtl(s) { const r = (String(s).match(RTL) || []).length, l = (String(s).match(LTR) || []).length; return r > 0 && r >= l; }
  /** True when a line starts with a bullet or an item number ("•", "-", "1.", "a)", "(iv)"). */
  function isBullet(s) { return BULLET.test(String(s)); }

  /** The runs of a line joined in reading order, with a space where the runs leave a gap (and neither side has one). */
  function joinRuns(items, rtl) {
    const out = [];
    items.forEach((it, i) => {
      if (i) {
        const prev = items[i - 1], gap = rtl ? prev.x0 - it.x1 : it.x0 - prev.x1;
        if (gap > 0.15 * Math.min(prev.fs, it.fs) && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) out.push({ t: ' ', style: prev.style });
      }
      out.push({ t: it.str, style: it.style });
    });
    return out;
  }
  /** The run that sets most of a line's characters (its font, family and weight stand for the line). */
  function dominant(items) {
    const n = new Map();
    items.forEach((it) => n.set(it, String(it.str).trim().length));
    return items.slice().sort((a, b) => n.get(b) - n.get(a))[0];
  }

  function lines(items) {
    const list = (items || []).filter((it) => String(it.str || '').trim() && it.x1 > it.x0)
      .slice().sort((a, b) => a.base - b.base || a.x0 - b.x0), rows = [];
    list.forEach((it) => {
      // the same baseline (a third of the size) and close enough along it: a gap wider than 1.5 em is a column gutter
      const row = rows.find((r) => Math.abs(r.base - it.base) < 0.3 * Math.min(r.fs, it.fs) &&
        it.x0 - r.x1 < 1.5 * Math.max(r.fs, it.fs) && r.x0 - it.x1 < 1.5 * Math.max(r.fs, it.fs));
      if (row) { row.items.push(it); row.x0 = Math.min(row.x0, it.x0); row.x1 = Math.max(row.x1, it.x1); row.fs = Math.max(row.fs, it.fs); }
      else rows.push({ items: [it], x0: it.x0, x1: it.x1, base: it.base, fs: it.fs });
    });
    return rows.map((r) => {
      const raw = r.items.map((i) => i.str).join(''), rtl = isRtl(raw);
      const its = r.items.slice().sort((a, b) => (rtl ? b.x0 - a.x0 : a.x0 - b.x0)), d = dominant(its);
      const runs = joinRuns(its, rtl), text = runs.map((x) => x.t).join('');
      return {
        items: its, runs, text, rtl, x0: r.x0, x1: r.x1, base: r.base, fs: d.fs,
        top: Math.min(...its.map((i) => i.top)), bottom: Math.max(...its.map((i) => i.bottom)),
        style: d.style, family: d.family || d.style, bold: !!d.bold, bullet: isBullet(text)
      };
    }).sort((a, b) => a.base - b.base || a.x0 - b.x0);
  }

  /** The start and end edges of a line in reading order: right-to-left lines are mirrored. */
  const S0 = (l, rtl) => (rtl ? -l.x1 : l.x0), S1 = (l, rtl) => (rtl ? -l.x0 : l.x1);

  /** The alignment of a block's lines. */
  function alignOf(ls, rtl) {
    if (ls.length < 2) return rtl ? 'right' : 'left';
    const tol = Math.max(1, 0.5 * ls[0].fs), body = ls.slice(1), left = S0(body[0], rtl);
    const lefts = body.every((l) => Math.abs(S0(l, rtl) - left) <= tol);
    const rightMax = Math.max(...ls.map((l) => S1(l, rtl)));
    const rights = ls.every((l) => Math.abs(S1(l, rtl) - rightMax) <= tol);
    const fullRights = ls.slice(0, -1).every((l) => Math.abs(S1(l, rtl) - rightMax) <= Math.max(0.5, 0.06 * ls[0].fs));
    const firstLeft = Math.abs(S0(ls[0], rtl) - left) <= tol || S0(ls[0], rtl) > left;
    const c0 = (ls[0].x0 + ls[0].x1) / 2, centres = ls.every((l) => Math.abs((l.x0 + l.x1) / 2 - c0) <= tol);
    const start = rtl ? 'right' : 'left', end = rtl ? 'left' : 'right';
    if (lefts && firstLeft) return ls.length >= 3 && fullRights ? 'justify' : start;
    if (rights) return end;
    if (centres) return 'center';
    return start;
  }

  /** Whether line n continues block b (its lines so far). */
  function continues(b, n) {
    const ls = b.lines, last = ls[ls.length - 1], first = ls[0], rtl = first.rtl, fs = first.fs;
    if (n.rtl !== rtl || n.bullet) return false;
    if (Math.abs(n.fs - fs) > 0.12 * fs || n.family !== first.family || n.bold !== first.bold) return false;
    const d = n.base - last.base;
    if (d < 0.8 * fs) return false;
    if (ls.length >= 2) { if (Math.abs(d - b.pitch) > 0.2 * b.pitch + 0.5) return false; }
    else if (d > 1.5 * 1.2 * fs) return false;
    if (!(n.x0 < last.x1 && n.x1 > last.x0)) return false;
    const tol = Math.max(1, 0.5 * fs), s0 = S0(n, rtl);
    const leftOk = Math.abs(s0 - b.left) <= tol;
    const c = (n.x0 + n.x1) / 2, centreOk = b.centre != null && Math.abs(c - b.centre) <= tol;
    const rightOk = Math.abs(S1(n, rtl) - b.right) <= tol;
    if (ls.length === 1) {
      // a first-line indent (the next line starts further out), or the hanging indent of a bullet's text
      if (!first.bullet && S0(first, rtl) - s0 > tol && S0(first, rtl) - s0 <= 4 * fs) return 'indent';
      if (first.bullet && s0 - S0(first, rtl) > 0.3 * fs && s0 - S0(first, rtl) <= 4 * fs) return 'hang';
      if (leftOk) return true;
      return centreOk || rightOk ? true : false;
    }
    // a block of two lines or more keeps its mode: a new indent starts the next paragraph
    if (b.leftMode) return leftOk;
    if (b.rightMode) return rightOk;
    return centreOk;
  }

  function blocks(ls) {
    const used = new Set(), out = [];
    ls.forEach((l0) => {
      if (used.has(l0)) return;
      used.add(l0);
      const b = { lines: [l0], left: S0(l0, l0.rtl), right: S1(l0, l0.rtl), centre: (l0.x0 + l0.x1) / 2, pitch: 0, leftMode: false, rightMode: false };
      for (;;) {
        const last = b.lines[b.lines.length - 1];
        // the nearest line below that shares the column (x ranges overlap)
        let next = null;
        ls.forEach((n) => { if (n.base > last.base + 0.5 && n.x0 < last.x1 && n.x1 > last.x0 && (!next || n.base < next.base)) next = n; });
        if (!next || used.has(next)) break;
        const how = continues(b, next);
        if (!how) break;
        used.add(next);
        if (b.lines.length === 1) {
          b.pitch = next.base - last.base;
          const rtl = l0.rtl, tol = Math.max(1, 0.5 * l0.fs);
          if (how === 'indent' || how === 'hang') { b.left = S0(next, rtl); b.leftMode = true; }
          else {
            b.leftMode = Math.abs(S0(next, rtl) - b.left) <= tol;
            b.rightMode = !b.leftMode && Math.abs(S1(next, rtl) - b.right) <= tol;
          }
        }
        b.lines.push(next);
        b.right = Math.max(b.right, S1(next, l0.rtl));
      }
      out.push(finish(b));
    });
    return out.sort((a, b) => a.top - b.top || a.x0 - b.x0);
  }

  function finish(b) {
    const ls = b.lines, rtl = ls[0].rtl, fs = ls[0].fs;
    return {
      lines: ls, rtl, fs, align: alignOf(ls, rtl), lh: ls.length > 1 ? (ls[ls.length - 1].base - ls[0].base) / (ls.length - 1) : 1.2 * fs,
      x0: Math.min(...ls.map((l) => l.x0)), x1: Math.max(...ls.map((l) => l.x1)), top: Math.min(...ls.map((l) => l.top)),
      bottom: Math.max(...ls.map((l) => l.bottom)), base: ls[0].base, style: ls[0].style, bullet: ls[0].bullet,
      kind: ls[0].bullet ? 'item' : 'para'
    };
  }

  /** A block's text as one paragraph of runs (one per style; the lines are joined with a space). */
  function runsOf(block) {
    const out = [];
    block.lines.forEach((l, i) => {
      if (i && out.length && !/\s$/.test(out[out.length - 1].t)) out.push({ t: ' ', style: out[out.length - 1].style });
      l.runs.forEach((r) => out.push({ t: r.t, style: r.style }));
    });
    const merged = [];
    out.forEach((r) => { const m = merged[merged.length - 1]; if (m && m.style === r.style) m.t += r.t; else merged.push({ t: r.t, style: r.style }); });
    return merged;
  }
  /** The block whose lines hold a point (with a little slack), or null. */
  function at(bs, x, y, slack) {
    const s = slack == null ? 2 : slack;
    return bs.find((b) => b.lines.some((l) => x >= l.x0 - s && x <= l.x1 + s && y >= l.top - s && y <= l.bottom + s)) || null;
  }

  return { lines, blocks, detect: (items) => blocks(lines(items)), runsOf, at, isRtl, isBullet, alignOf };
});
