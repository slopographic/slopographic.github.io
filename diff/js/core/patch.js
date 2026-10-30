/* Slop Compare: the unified diff (.patch) of two texts, as `diff -u` and `git diff` write it, and applying one. Pure.
 *   unified(result, { nameA, nameB, context }) → patch text ('' when the texts are the same)
 *     result: diffLines() of the two texts. Hunks keep `context` unchanged lines around each change (default 3); a side
 *     without a final line break gets "\ No newline at end of file" after its last line.
 *   applyPatch(text, patch) → the patched text; throws when a hunk does not fit (used by the tests to prove the round trip) */

/** The rows as single-sided lines: a 'mod' pair is its deletion then its insertion (each run's deletions first). */
function lineOps(rows) {
  const out = [];
  for (let i = 0; i < rows.length;) {
    const r = rows[i];
    if (r.t === 'eq') { out.push({ s: ' ', a: r.a, b: r.b }); i++; continue; }
    let j = i; const dels = [], ins = [];
    while (j < rows.length && rows[j].t !== 'eq') { if (rows[j].a >= 0) dels.push(rows[j].a); if (rows[j].b >= 0) ins.push(rows[j].b); j++; }
    for (const a of dels) out.push({ s: '-', a, b: -1 });
    for (const b of ins) out.push({ s: '+', a: -1, b });
    i = j;
  }
  return out;
}

export function unified(res, { nameA = 'a', nameB = 'b', context = 3 } = {}) {
  const ops = lineOps(res.rows);
  const lastA = res.a.length - 1, lastB = res.b.length - 1;
  // a line is also changed when it ends the file without a line break on one side only
  const bare = (o) => (o.a === lastA && !res.aNewline) !== (o.b === lastB && !res.bNewline);
  const k = ops.findIndex((o) => o.s === ' ' && bare(o));
  if (k >= 0) { ops.splice(k, 1, { s: '-', a: ops[k].a, b: -1 }, { s: '+', a: -1, b: ops[k].b }); regroup(ops); }
  if (!ops.some((o) => o.s !== ' ')) return '';
  const changed = ops.map((o) => o.s !== ' ');
  const out = [`--- ${nameA}`, `+++ ${nameB}`];
  let i = 0;
  while (i < ops.length) {
    if (!changed[i]) { i++; continue; }
    let start = Math.max(0, i - context), end = i;
    // extend while the next change is within 2 × context lines
    for (;;) {
      while (end < ops.length && changed[end]) end++;
      let next = end; while (next < ops.length && !changed[next]) next++;
      if (next < ops.length && next - end <= 2 * context) { end = next; continue; }
      end = Math.min(ops.length, end + context);
      break;
    }
    const part = ops.slice(start, end);
    const aStart = firstLine(ops, start, 'a'), bStart = firstLine(ops, start, 'b');
    const aLen = part.filter((o) => o.s !== '+').length, bLen = part.filter((o) => o.s !== '-').length;
    out.push(`@@ -${range(aStart, aLen)} +${range(bStart, bLen)} @@`);
    for (const o of part) {
      out.push(o.s + (o.s === '+' ? res.b[o.b] : res.a[o.a]));
      if (o.s !== '+' && o.a === lastA && !res.aNewline && o.s !== ' ') out.push('\\ No newline at end of file');
      else if (o.s !== '-' && o.b === lastB && !res.bNewline && o.s !== ' ') out.push('\\ No newline at end of file');
      else if (o.s === ' ' && o.a === lastA && !res.aNewline) out.push('\\ No newline at end of file');
    }
    i = end;
  }
  return out.join('\n') + '\n';
}

/** Each run of changed lines lists its − lines before its + lines, as diff -u does. */
function regroup(ops) {
  for (let i = 0; i < ops.length;) {
    if (ops[i].s === ' ') { i++; continue; }
    let j = i; while (j < ops.length && ops[j].s !== ' ') j++;
    const run = ops.slice(i, j);
    ops.splice(i, j - i, ...run.filter((o) => o.s === '-'), ...run.filter((o) => o.s === '+'));
    i = j;
  }
}

/** The 1-based first line of a hunk on one side: the line of the first op there that uses that side, else the line after. */
function firstLine(ops, start, side) {
  for (let k = start; k < ops.length; k++) if (ops[k][side] >= 0) return ops[k][side] + 1;
  for (let k = start - 1; k >= 0; k--) if (ops[k][side] >= 0) return ops[k][side] + 2;
  return 1;
}
const range = (s, n) => (n === 1 ? `${s}` : `${n ? s : s - 1},${n}`);

export function applyPatch(text, patch) {
  const src = String(text).replace(/\r\n?/g, '\n');
  const hadNl = src.endsWith('\n');
  const lines = src ? (hadNl ? src.slice(0, -1) : src).split('\n') : [];
  const p = String(patch).split('\n');
  const out = [];
  let at = 0;
  for (let i = 0; i < p.length; i++) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(p[i]);
    if (!m) continue;
    const from = Number(m[2] === '0' ? m[1] : m[1] - 1);
    while (at < from) out.push(lines[at++]);
    for (i++; i < p.length && !p[i].startsWith('@@'); i++) {
      const s = p[i][0], body = p[i].slice(1);
      if (s === ' ' || s === '-') { if (lines[at] !== body) throw new Error(`The patch does not fit at line ${at + 1}.`); at++; }
      if (s === ' ' || s === '+') out.push(body);
    }
    i--;
  }
  while (at < lines.length) out.push(lines[at++]);
  // the last marker decides: "\ No newline" after a '+' or ' ' line means the result has none
  const marks = p.map((l, k) => (l.startsWith('\\') ? p[k - 1][0] : null)).filter(Boolean);
  const nl = marks.some((s) => s === '+' || s === ' ') ? false : marks.includes('-') ? true : hadNl;
  return out.length ? out.join('\n') + (nl ? '\n' : '') : '';
}
