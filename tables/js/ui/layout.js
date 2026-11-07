/* Grid geometry. An Axis maps index ↔ offset with a default size and sparse overrides (binary search,
   so 1,048,576 rows cost nothing extra). Hidden rows and columns have size 0. */
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';

const lowerBound = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };

export class Axis {
  /** n indices, default size def, sizes: Map(index → px) for the indices that differ. */
  constructor(n, def, sizes) {
    this.n = n; this.def = def; this.sizes = sizes;
    this.keys = [...sizes.keys()].sort((a, b) => a - b);
    this.cum = [];
    let acc = 0;
    for (const k of this.keys) { acc += sizes.get(k) - def; this.cum.push(acc); }
    this.total = n * def + acc;
  }
  size(i) { return this.sizes.has(i) ? this.sizes.get(i) : this.def; }
  /** Offset of the top edge of index i. */
  top(i) { const k = lowerBound(this.keys, i); return i * this.def + (k ? this.cum[k - 1] : 0); }
  /** Index whose span contains offset pos (clamped to the axis). */
  at(pos) {
    let lo = 0, hi = this.n - 1;
    if (pos <= 0) return 0;
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (this.top(mid) <= pos) lo = mid; else hi = mid - 1; }
    return lo;
  }
}

/** Axes for a sheet. */
export function axesFor(sh) {
  const rows = new Map(), cols = new Map();
  for (const [r, p] of sh.rows) { const s = p.hidden || p.filtered ? 0 : p.h || sh.defH; if (s !== sh.defH) rows.set(r, s); }
  for (const [c, p] of sh.cols) { const s = p.hidden ? 0 : p.w || sh.defW; if (s !== sh.defW) cols.set(c, s); }
  return { R: new Axis(MAX_ROWS, sh.defH, rows), C: new Axis(MAX_COLS, sh.defW, cols) };
}
