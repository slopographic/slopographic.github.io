/* Slop Tables engine: a sparse sheet. Cells live in a Map keyed by r*16384+c.
   Cell: { v: value, f?: formula text (no "="), ast?, s?: style id, fh?: format hint, dirty?, vol? } */
import { key, unkey, MAX_ROWS, MAX_COLS } from './refs.js';

let NEXT_ID = 1;
export const DEFAULT_W = 100, DEFAULT_H = 22;

export class Sheet {
  constructor(wb, name) {
    this.wb = wb; this.id = NEXT_ID++; this.name = name;
    this.cells = new Map();
    this.rows = new Map(); // r → { h, hidden, level, s }
    this.cols = new Map(); // c → { w, hidden, level, s }
    this.merges = [];      // [{r1,c1,r2,c2}]
    this.freeze = { r: 0, c: 0 };
    this.spills = new Map();     // anchor key → { r, c, rows, cols, data }
    this.spillOwner = new Map(); // cell key → anchor key
    this.maxR = -1; this.maxC = -1;
    this.tab = null; this.hidden = false; this.showGrid = true; this.zoom = 1;
    this.cf = []; this.dv = []; this.filter = null; this.comments = new Map();
    this.charts = []; this.pivots = [];
    this.print = null;
    this.defW = DEFAULT_W; this.defH = DEFAULT_H;
  }
  get(r, c) { return this.cells.get(key(r, c)); }
  /** Value at r,c including spilled values; null when blank. */
  value(r, c) {
    const k = key(r, c), cell = this.cells.get(k);
    if (cell && (cell.f || cell.v !== null && cell.v !== undefined)) return cell.v;
    const a = this.spillOwner.get(k);
    if (a !== undefined) { const sp = this.spills.get(a); return sp.data[r - sp.r][c - sp.c]; }
    return cell ? cell.v ?? null : null;
  }
  ensure(r, c) {
    const k = key(r, c);
    let cell = this.cells.get(k);
    if (!cell) { cell = { v: null }; this.cells.set(k, cell); if (r > this.maxR) this.maxR = r; if (c > this.maxC) this.maxC = c; }
    return cell;
  }
  /** Drop a cell when it holds nothing worth keeping. */
  prune(r, c) {
    const k = key(r, c), cell = this.cells.get(k);
    if (cell && !cell.f && (cell.v === null || cell.v === undefined) && !cell.s) this.cells.delete(k);
  }
  /** Recompute used bounds (after deletes). */
  bounds() {
    let mr = -1, mc = -1;
    for (const k of this.cells.keys()) { const [r, c] = unkey(k); if (r > mr) mr = r; if (c > mc) mc = c; }
    for (const sp of this.spills.values()) { mr = Math.max(mr, sp.r + sp.rows - 1); mc = Math.max(mc, sp.c + sp.cols - 1); }
    this.maxR = mr; this.maxC = mc;
    return { r: mr, c: mc };
  }
  /** Used range including content, styles and spills: {r1,c1,r2,c2} or null. */
  usedRange(withStyles = true) {
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    const take = (r, c) => { if (r < r1) r1 = r; if (c < c1) c1 = c; if (r > r2) r2 = r; if (c > c2) c2 = c; };
    for (const [k, cell] of this.cells) { if (!withStyles && !cell.f && (cell.v === null || cell.v === undefined)) continue; const [r, c] = unkey(k); take(r, c); }
    for (const sp of this.spills.values()) { take(sp.r, sp.c); take(sp.r + sp.rows - 1, sp.c + sp.cols - 1); }
    return r2 < 0 ? null : { r1, c1, r2, c2 };
  }
  colW(c) { const o = this.cols.get(c); return o && o.hidden ? 0 : (o && o.w) || this.defW; }
  rowH(r) { const o = this.rows.get(r); return o && o.hidden ? 0 : (o && o.h) || this.defH; }
  colProp(c) { let o = this.cols.get(c); if (!o) this.cols.set(c, (o = {})); return o; }
  rowProp(r) { let o = this.rows.get(r); if (!o) this.rows.set(r, (o = {})); return o; }
  isRowHidden(r) { const o = this.rows.get(r); return !!(o && (o.hidden || o.filtered)); }
  isColHidden(c) { const o = this.cols.get(c); return !!(o && o.hidden); }
  mergeAt(r, c) { for (const m of this.merges) if (r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2) return m; return null; }
  /** Iterate non-empty stored cells inside a rectangle: fn(r, c, cell). */
  eachIn(r1, c1, r2, c2, fn) {
    const area = (r2 - r1 + 1) * (c2 - c1 + 1);
    if (area > this.cells.size * 2) {
      const list = [];
      for (const [k, cell] of this.cells) { const r = Math.floor(k / MAX_COLS), c = k % MAX_COLS; if (r >= r1 && r <= r2 && c >= c1 && c <= c2) list.push([r, c, cell]); }
      list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (const [r, c, cell] of list) fn(r, c, cell);
    } else {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const cell = this.cells.get(r * MAX_COLS + c); if (cell) fn(r, c, cell); }
    }
  }
}
export { MAX_ROWS, MAX_COLS };
