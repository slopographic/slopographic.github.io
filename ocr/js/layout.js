/* Slop OCR: how OCR lines become text. Pure functions (no DOM), so the page and the tests use the same rules.
 *   rowsOf(lines)               the engine's pieces ({ text, box }, any order) → text lines: pieces on one baseline (their
 *                               boxes overlap by over half the smaller height) join left to right, with one space, in one
 *                               box; rows top to bottom. A receipt's "Flat white" and "3.80" are two pieces of one row
 *   groupLines(lines)           rowsOf(lines) → groups; a gap of more than 0.9 line heights starts a group
 *   linesToText(lines)          groups joined with "\n"; groups separated by a blank line (one paragraph per group)
 *   paragraphsOf(text)          the paragraphs of an edited text: blocks separated by blank lines, lines trimmed
 *   pairBoxes(text, lines)      each non-blank text line with the box of the row it was read from (for the searchable PDF)
 *                               lines past the last box are placed under it, one line height apart */

export function rowsOf(lines) {
  const rows = [];
  const sorted = lines.filter((l) => l && l.box).slice().sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  for (const l of sorted) {
    const b = l.box;
    // Compare with the row's first piece, so a slanted page cannot chain the rows into one.
    const row = rows.find((r) => Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y) > 0.5 * Math.min(r.h, b.h));
    if (row) row.items.push(l); else rows.push({ y: b.y, h: b.h, items: [l] });
  }
  return rows.map(({ items }) => {
    items.sort((a, b) => a.box.x - b.box.x);
    const x0 = Math.min(...items.map((l) => l.box.x)), y0 = Math.min(...items.map((l) => l.box.y));
    const x1 = Math.max(...items.map((l) => l.box.x + l.box.w)), y1 = Math.max(...items.map((l) => l.box.y + l.box.h));
    const score = items.reduce((n, l) => n + (l.score ?? 1), 0) / items.length;
    return { text: items.map((l) => l.text.trim()).filter(Boolean).join(' '), score, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
  }).sort((a, b) => a.box.y - b.box.y);
}

export function groupLines(pieces) {
  const lines = rowsOf(pieces);
  if (!lines.length) return [];
  const hs = lines.map((l) => l.box.h).sort((a, b) => a - b);
  const median = hs[Math.floor(hs.length / 2)] || 1;
  const groups = [[lines[0]]];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].box, cur = lines[i].box;
    const gap = cur.y - (prev.y + prev.h);
    if (gap > 0.9 * median) groups.push([lines[i]]);
    else groups[groups.length - 1].push(lines[i]);
  }
  return groups;
}

export function linesToText(lines) {
  return groupLines(lines)
    .map((g) => g.map((l) => l.text.trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

export function paragraphsOf(text) {
  return String(text || '')
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'))
    .filter(Boolean);
}

export function pairBoxes(text, lines) {
  const rows = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const boxes = rowsOf(lines).map((l) => l.box);
  const last = boxes[boxes.length - 1] || null;
  return rows.map((t, i) => {
    if (i < boxes.length) return { text: t, box: boxes[i] };
    if (!last) return { text: t, box: null };
    const k = i - boxes.length + 1;
    return { text: t, box: { x: last.x, y: last.y + k * last.h, w: last.w, h: last.h } };
  });
}
