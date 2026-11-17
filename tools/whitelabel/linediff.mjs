// A line diff (Myers' O(ND) algorithm) for the import tool: which lines of a stay in b, and where. Node only.
// Tests: tests/node/whitelabel-import.test.mjs.

/** The matching line pairs of a and b, in order: [[i, j], ...] with a[i] === b[j] (a longest common subsequence). */
export function matches(a, b) {
  // Strip the common head and tail first: most edits are small.
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const head = Array.from({ length: s }, (_, i) => [i, i]);
  const tail = Array.from({ length: a.length - ea }, (_, k) => [ea + k, eb + k]);
  return head.concat(myers(a, b, s, ea, s, eb), tail);
}

function myers(a, b, a0, a1, b0, b1) {
  const n = a1 - a0, m = b1 - b0, max = n + m;
  if (!n || !m) return [];
  const off = max + 1, v = new Int32Array(2 * max + 3), trace = [];
  v[off + 1] = 0;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[a0 + x] === b[b0 + y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m, off, a0, b0);
    }
  }
  return [];
}

function backtrack(trace, d, n, m, off, a0, b0) {
  const out = [];
  let x = n, y = m;
  for (; d > 0; d--) {
    const v = trace[d], k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? k + 1 : k - 1;
    const px = v[off + prevK], py = px - prevK;
    while (x > px && y > py) { x--; y--; out.push([a0 + x, b0 + y]); }
    x = px; y = py;
  }
  while (x > 0 && y > 0) { x--; y--; out.push([a0 + x, b0 + y]); }
  return out.reverse();
}

/** The changed regions between a and b: [{ a: [start, end), b: [start, end) }], from the matches. */
export function hunks(a, b) {
  const out = [];
  let i = 0, j = 0;
  for (const [mi, mj] of matches(a, b).concat([[a.length, b.length]])) {
    if (mi > i || mj > j) out.push({ a: [i, mi], b: [j, mj] });
    i = mi + 1; j = mj + 1;
  }
  return out;
}
