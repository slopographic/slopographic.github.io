/* Slop Compare: the one sequence diff (Myers' O(ND) algorithm), used for lines, words, JSON arrays and CSV rows. Pure.
 *   diffSeq(a, b, eq?, { maxCost }) → { ops: [{ op: 'eq' | 'del' | 'ins', a, b }], exact }
 *     a and b are arrays; eq(x, y) compares two items (default ===). Each op names the index it uses in a and/or b (-1 when
 *     none). The common start and end are matched first (cheap), then Myers finds the shortest edit script of the middle.
 *     When the middle needs more than maxCost edits (two very different files), it is given as one block of deletions and
 *     insertions instead, and exact is false: the result is still correct, only not the smallest. */
export const MAX_COST = 6000;

export function diffSeq(a, b, eq = (x, y) => x === y, { maxCost = MAX_COST } = {}) {
  const ops = [];
  let s = 0;
  while (s < a.length && s < b.length && eq(a[s], b[s])) { ops.push({ op: 'eq', a: s, b: s }); s++; }
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && eq(a[ea - 1], b[eb - 1])) { ea--; eb--; }
  const exact = middle(a, b, s, ea, s, eb, eq, maxCost, ops);
  for (let i = ea, j = eb; i < a.length; i++, j++) ops.push({ op: 'eq', a: i, b: j });
  return { ops, exact };
}

/** The edit script of a[a0..a1) against b[b0..b1), appended to ops. False when it gave up on the smallest one. */
function middle(a, b, a0, a1, b0, b1, eq, maxCost, ops) {
  const n = a1 - a0, m = b1 - b0;
  if (!n && !m) return true;
  if (!n || !m) { block(a0, a1, b0, b1, ops); return true; }
  const max = n + m, off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= max; d++) {
    if (d > maxCost) { block(a0, a1, b0, b1, ops); return false; }
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[a0 + x], b[b0 + y])) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    if (found >= 0) break;
  }
  // walk back through the saved rows: each row d holds v for k in [-d-1, d+1]
  const out = [];
  let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const row = trace[d], at = (k) => row[k + d + 1];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const pk = down ? k + 1 : k - 1, px = at(pk), py = px - pk;
    while (x > px && y > py) { x--; y--; out.push({ op: 'eq', a: a0 + x, b: b0 + y }); }
    if (down) { y--; out.push({ op: 'ins', a: -1, b: b0 + y }); } else { x--; out.push({ op: 'del', a: a0 + x, b: -1 }); }
  }
  while (x > 0 && y > 0) { x--; y--; out.push({ op: 'eq', a: a0 + x, b: b0 + y }); }
  for (let i = out.length - 1; i >= 0; i--) ops.push(out[i]);
  return true;
}

function block(a0, a1, b0, b1, ops) {
  for (let i = a0; i < a1; i++) ops.push({ op: 'del', a: i, b: -1 });
  for (let j = b0; j < b1; j++) ops.push({ op: 'ins', a: -1, b: j });
}

/** Groups the ops into runs: [{ eq: true, ops }] and [{ eq: false, dels: [indexes in a], ins: [indexes in b] }]. */
export function runs(ops) {
  const out = [];
  for (const o of ops) {
    const last = out[out.length - 1];
    if (o.op === 'eq') { if (last && last.eq) last.ops.push(o); else out.push({ eq: true, ops: [o] }); continue; }
    const r = last && !last.eq ? last : (out.push({ eq: false, dels: [], ins: [] }), out[out.length - 1]);
    if (o.op === 'del') r.dels.push(o.a); else r.ins.push(o.b);
  }
  return out;
}
