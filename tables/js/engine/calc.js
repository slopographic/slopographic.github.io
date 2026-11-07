/* Slop Tables engine: recalculation. Changed cells mark their dependents dirty (transitively), then
   dirty formulas are evaluated with an explicit stack: when a formula meets a dirty precedent it is
   retried after that precedent (no deep recursion). Reading a cell that is itself waiting on the
   stack is a cycle → #CIRC!. Dynamic arrays spill into empty neighbours or give #SPILL!. */
import { ERR, Bail, isErr } from './values.js';
import { Ref, key, MAX_ROWS, MAX_COLS } from './refs.js';
import { DepIndex } from './deps.js';
import { Ctx, Lambda } from './evaluator.js';

export class Calc {
  constructor(wb) {
    this.wb = wb; this.deps = new DepIndex();
    this.pending = []; // [{sheet, r1,c1,r2,c2}] value changes
    this.formulas = new Set(); // ids of formula cells set since last recalc
    this.volatile = new Set();
    this.evals = 0; this.stack = null; this.counts = null;
  }
  id(sheet, k) { return sheet.id + ':' + k; }
  resolve(id) {
    const i = id.indexOf(':'), sheet = this.wb.sheetById(+id.slice(0, i));
    if (!sheet) return null;
    const k = +id.slice(i + 1), cell = sheet.cells.get(k);
    return cell && cell.f ? { sheet, k, cell, r: Math.floor(k / MAX_COLS), c: k % MAX_COLS } : null;
  }
  changed(sheet, r1, c1, r2 = r1, c2 = c1) { this.pending.push({ sheet, r1, c1, r2, c2 }); }
  formulaSet(sheet, r, c, cell) {
    const id = this.id(sheet, key(r, c));
    cell.dirty = true; this.formulas.add(id);
    if (cell.vol) this.volatile.add(id); else this.volatile.delete(id);
  }
  formulaRemoved(sheet, r, c) {
    const k = key(r, c), id = this.id(sheet, k);
    this.deps.remove(id); this.volatile.delete(id); this.formulas.delete(id);
    this.clearSpill(sheet, k, true);
  }
  /** Mark everything that depends on the given areas dirty. Returns newly dirtied ids. */
  markFrom(areas, out = []) {
    const q = areas.slice();
    while (q.length) {
      const a = q.pop();
      const ids = a.r1 === a.r2 && a.c1 === a.c2 ? this.deps.of(a.sheet.id, a.r1, a.c1) : this.deps.ofRect(a.sheet.id, a.r1, a.c1, a.r2, a.c2);
      for (const id of ids) {
        const x = this.resolve(id);
        if (!x || x.cell.dirty) continue;
        x.cell.dirty = true; out.push(id);
        q.push(this.areaOf(x.sheet, x.k));
      }
    }
    return out;
  }
  areaOf(sheet, k) {
    const r = Math.floor(k / MAX_COLS), c = k % MAX_COLS, sp = sheet.spills.get(k);
    return sp ? { sheet, r1: r, c1: c, r2: r + sp.rows - 1, c2: c + sp.cols - 1 } : { sheet, r1: r, c1: c, r2: r, c2: c };
  }
  /** Mark every formula dirty (load, structural edits, name changes). */
  dirtyAll() {
    this.deps.clear(); this.volatile.clear();
    for (const sh of this.wb.sheets) for (const [k, cell] of sh.cells) if (cell.f) { cell.dirty = true; const id = this.id(sh, k); this.formulas.add(id); if (cell.vol) this.volatile.add(id); }
  }
  recalc() {
    const work = [...this.formulas];
    const areas = this.pending.slice();
    for (const id of this.formulas) { const x = this.resolve(id); if (x) areas.push(this.areaOf(x.sheet, x.k)); }
    for (const id of this.volatile) { const x = this.resolve(id); if (x) { if (!x.cell.dirty) { x.cell.dirty = true; work.push(id); } areas.push(this.areaOf(x.sheet, x.k)); } }
    this.pending = []; this.formulas = new Set();
    this.markFrom(areas, work);
    this.stack = work.reverse(); this.counts = new Map();
    let n = 0;
    while (this.stack.length) {
      const id = this.stack[this.stack.length - 1];
      const x = this.resolve(id);
      if (!x || !x.cell.dirty) { this.stack.pop(); continue; }
      const cnt = (this.counts.get(id) || 0) + 1;
      this.counts.set(id, cnt);
      if (cnt > 200) { this.finish(x, ERR.CIRC, null); this.stack.pop(); continue; }
      const missing = this.evalCell(x);
      if (missing) { for (const m of missing) this.stack.push(m); continue; }
      this.stack.pop(); n++;
    }
    this.stack = null;
    return n;
  }
  evalCell(x) {
    const { sheet, r, c, cell } = x;
    const ctx = new Ctx(this, sheet, r, c);
    cell.gray = true; this.evals++;
    let v;
    try {
      v = cell.ast ? ctx.ev(cell.ast) : ERR.NAME;
      if (v instanceof Ref) v = v.single ? ctx.read(v.sheet, v.r1, v.c1) : this.readRange(ctx, v, true);
      else if (v && v.refs) v = ERR.VALUE;
    } catch (e) {
      if (e instanceof Bail) v = e.err;
      else if (e instanceof RangeError) v = ERR.NUM;
      else { console.error(e); v = ERR.VALUE; }
    }
    if (ctx.missing.length) return [...new Set(ctx.missing.map((m) => this.id(m[0], m[1])))];
    cell.gray = false;
    if (v instanceof Lambda) v = ERR.CALC;
    if (v === undefined) v = null;
    this.finish(x, v, ctx);
    return null;
  }
  finish(x, v, ctx) {
    const { sheet, k, cell, r, c } = x;
    cell.gray = false; cell.dirty = false;
    cell.fh = ctx ? ctx.fmt : null;
    this.deps.remove(this.id(sheet, k));
    const reads = ctx ? ctx.reads : [];
    if (Array.isArray(v) && v.length === 1 && v[0].length === 1) v = v[0][0];
    if (Array.isArray(v) && (!v.length || !v[0].length)) v = ERR.CALC;
    if (Array.isArray(v)) v = this.spill(sheet, k, r, c, v, reads);
    else this.clearSpill(sheet, k, false);
    if (v === null && cell.f) v = 0; // a formula pointing at a blank shows 0
    cell.v = v;
    this.deps.set(this.id(sheet, k), reads.map((a) => ({ sid: a.sid, r1: a.r1, c1: a.c1, r2: a.r2, c2: a.c2 })));
  }
  clearSpill(sheet, k, notify) {
    const sp = sheet.spills.get(k);
    if (!sp) return;
    for (let i = 0; i < sp.rows; i++) for (let j = 0; j < sp.cols; j++) sheet.spillOwner.delete(key(sp.r + i, sp.c + j));
    sheet.spills.delete(k);
    const area = { sheet, r1: sp.r, c1: sp.c, r2: sp.r + sp.rows - 1, c2: sp.c + sp.cols - 1 };
    if (notify) this.pending.push(area); else this.later(area, k);
  }
  /** After a spill changed shape during a recalc, dirty readers of the area and run them too. */
  later(area, selfK) {
    if (!this.stack) { this.pending.push(area); return; }
    const ids = this.markFrom([area]).filter((id) => id !== this.id(area.sheet, selfK));
    for (const id of ids) this.stack.push(id);
  }
  spill(sheet, k, r, c, arr, reads) {
    const rows = arr.length, cols = arr[0].length;
    const old = sheet.spills.get(k);
    let blocked = r + rows > MAX_ROWS || c + cols > MAX_COLS;
    for (let i = 0; i < rows && !blocked; i++) for (let j = 0; j < cols; j++) {
      if (!i && !j) continue;
      const kk = key(r + i, c + j), t = sheet.cells.get(kk);
      if (t && (t.f || (t.v !== null && t.v !== undefined))) { blocked = true; break; }
      const o = sheet.spillOwner.get(kk);
      if (o !== undefined && o !== k) { blocked = true; break; }
      if (sheet.mergeAt(r + i, c + j)) { blocked = true; break; }
    }
    reads.push({ sid: sheet.id, r1: r, c1: c + 1, r2: r, c2: Math.min(c + cols - 1, MAX_COLS - 1) });
    if (rows > 1) reads.push({ sid: sheet.id, r1: r + 1, c1: c, r2: Math.min(r + rows - 1, MAX_ROWS - 1), c2: Math.min(c + cols - 1, MAX_COLS - 1) });
    if (cols === 1) reads.splice(reads.length - 2, 1);
    if (!blocked && old && old.rows === rows && old.cols === cols) { old.data = arr; return arr[0][0]; }
    this.clearSpill(sheet, k, false);
    if (blocked) return ERR.SPILL;
    sheet.spills.set(k, { r, c, rows, cols, data: arr });
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (i || j) sheet.spillOwner.set(key(r + i, c + j), k);
    sheet.maxR = Math.max(sheet.maxR, r + rows - 1); sheet.maxC = Math.max(sheet.maxC, c + cols - 1);
    this.later({ sheet, r1: r, c1: c, r2: r + rows - 1, c2: c + cols - 1 }, k);
    return arr[0][0];
  }
  spillRef(ctx, sheet, r, c) {
    const k = key(r, c), cell = sheet.cells.get(k);
    ctx.read(sheet, r, c);
    if (!cell || !cell.f || cell.dirty) return cell && cell.f && cell.dirty ? new Ref(sheet, r, c) : null;
    const sp = sheet.spills.get(k);
    return sp ? new Ref(sheet, r, c, r + sp.rows - 1, c + sp.cols - 1) : null;
  }
  /** Value of one cell for a formula (records the read; defers dirty precedents). */
  readCell(ctx, sheet, r, c) {
    ctx.reads.push({ sid: sheet.id, r1: r, c1: c, r2: r, c2: c });
    return this.peek(ctx, sheet, key(r, c));
  }
  peek(ctx, sheet, k) {
    const cell = sheet.cells.get(k);
    if (cell && cell.f) {
      if (cell.dirty) { if (cell.gray) return ERR.CIRC; ctx.missing.push([sheet, k]); return null; }
      return cell.v;
    }
    if (cell && cell.v !== null && cell.v !== undefined) return cell.v;
    const a = sheet.spillOwner.get(k);
    if (a !== undefined) {
      const an = sheet.cells.get(a);
      if (an && an.dirty) { if (an.gray) return ERR.CIRC; ctx.missing.push([sheet, a]); return null; }
      const sp = sheet.spills.get(a);
      return sp.data[Math.floor(k / MAX_COLS) - sp.r][k % MAX_COLS - sp.c];
    }
    return null;
  }
  /** 2D values of a range; whole rows/columns are clamped to the used area of the workbook. */
  readRange(ctx, ref) {
    const sheet = ref.sheet;
    ctx.reads.push({ sid: sheet.id, r1: ref.r1, c1: ref.c1, r2: ref.r2, c2: ref.c2 });
    const lim = this.wb.limits();
    const r2 = Math.max(ref.r1, Math.min(ref.r2, lim.r)), c2 = Math.max(ref.c1, Math.min(ref.c2, lim.c));
    const R = r2 - ref.r1 + 1, C = c2 - ref.c1 + 1;
    if (R * C > 4e7) throw new Bail(ERR.NUM);
    const out = new Array(R);
    for (let i = 0; i < R; i++) out[i] = new Array(C).fill(null);
    if (R * C <= Math.max(4096, sheet.cells.size)) {
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) out[i][j] = this.peek(ctx, sheet, key(ref.r1 + i, ref.c1 + j));
      return out;
    }
    sheet.eachIn(ref.r1, ref.c1, r2, c2, (r, c) => { out[r - ref.r1][c - ref.c1] = this.peek(ctx, sheet, key(r, c)); });
    for (const [ak, sp] of sheet.spills) {
      if (sp.r > r2 || sp.c > c2 || sp.r + sp.rows - 1 < ref.r1 || sp.c + sp.cols - 1 < ref.c1) continue;
      for (let i = 0; i < sp.rows; i++) for (let j = 0; j < sp.cols; j++) {
        const rr = sp.r + i, cc = sp.c + j;
        if ((i || j) && rr >= ref.r1 && rr <= r2 && cc >= ref.c1 && cc <= c2) out[rr - ref.r1][cc - ref.c1] = this.peek(ctx, sheet, key(rr, cc));
      }
    }
    return out;
  }
}
export { isErr };
