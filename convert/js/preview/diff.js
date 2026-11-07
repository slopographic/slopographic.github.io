/* Cheap line diff for the preview: which lines of the input (a) and of the output (b) are not part of their
 * longest common subsequence. The common start and end are trimmed first, so a typical edit is cheap.
 * Returns { a: Set, b: Set } of changed indices, or null when the middle is too big to compare. Pure. */
export function changedLines(a, b, cap = 2e6) {
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
  const n = A.length, m = B.length;
  if (n * m > cap) return null;
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = A[i] === B[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const ca = new Set(), cb = new Set();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) ca.add(s + i++);
    else cb.add(s + j++);
  }
  while (i < n) ca.add(s + i++);
  while (j < m) cb.add(s + j++);
  return { a: ca, b: cb };
}
