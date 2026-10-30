/* Slop Tables engine: dependency index. Records which formula cells read which cells/ranges
   (recorded dynamically while evaluating, so INDIRECT/OFFSET/names are covered too).
   Single cells are a hash lookup; ranges are bucketed into 64-col × 256-row tiles (very large ranges
   go to a per-sheet "wide" list). A dependent id is "sheetId:key". */
const BC = 64, BR = 256, MAX_TILES = 24;

export class DepIndex {
  constructor() { this.clear(); }
  clear() {
    this.single = new Map(); // "sid:key" → Set(depId)
    this.tiles = new Map();  // "sid:tr:tc" → Set(entry)
    this.wide = new Map();   // sid → Set(entry)
    this.byDep = new Map();  // depId → [handles]
  }
  /** Replace the precedents of depId. reads: [{sid, r1,c1,r2,c2}] */
  set(depId, reads) {
    this.remove(depId);
    if (!reads.length) return;
    const hs = [];
    const seen = new Set();
    for (const rd of reads) {
      const sig = rd.sid + ':' + rd.r1 + ':' + rd.c1 + ':' + rd.r2 + ':' + rd.c2;
      if (seen.has(sig)) continue;
      seen.add(sig);
      if (rd.r1 === rd.r2 && rd.c1 === rd.c2) {
        const k = rd.sid + ':' + (rd.r1 * 16384 + rd.c1);
        let s = this.single.get(k); if (!s) this.single.set(k, (s = new Set()));
        s.add(depId); hs.push({ set: s, item: depId });
        continue;
      }
      const e = { r1: rd.r1, c1: rd.c1, r2: rd.r2, c2: rd.c2, dep: depId };
      const tr1 = (rd.r1 / BR) | 0, tr2 = (rd.r2 / BR) | 0, tc1 = (rd.c1 / BC) | 0, tc2 = (rd.c2 / BC) | 0;
      if ((tr2 - tr1 + 1) * (tc2 - tc1 + 1) > MAX_TILES) {
        let s = this.wide.get(rd.sid); if (!s) this.wide.set(rd.sid, (s = new Set()));
        s.add(e); hs.push({ set: s, item: e });
      } else {
        for (let tr = tr1; tr <= tr2; tr++) for (let tc = tc1; tc <= tc2; tc++) {
          const k = rd.sid + ':' + tr + ':' + tc;
          let s = this.tiles.get(k); if (!s) this.tiles.set(k, (s = new Set()));
          s.add(e); hs.push({ set: s, item: e });
        }
      }
    }
    this.byDep.set(depId, hs);
  }
  remove(depId) {
    const hs = this.byDep.get(depId);
    if (!hs) return;
    for (const h of hs) h.set.delete(h.item);
    this.byDep.delete(depId);
  }
  /** Dependents of one cell. */
  of(sid, r, c, out = new Set()) {
    const s = this.single.get(sid + ':' + (r * 16384 + c));
    if (s) for (const d of s) out.add(d);
    const t = this.tiles.get(sid + ':' + ((r / BR) | 0) + ':' + ((c / BC) | 0));
    if (t) for (const e of t) if (r >= e.r1 && r <= e.r2 && c >= e.c1 && c <= e.c2) out.add(e.dep);
    const w = this.wide.get(sid);
    if (w) for (const e of w) if (r >= e.r1 && r <= e.r2 && c >= e.c1 && c <= e.c2) out.add(e.dep);
    return out;
  }
  /** Dependents of anything inside a rectangle. */
  ofRect(sid, r1, c1, r2, c2, out = new Set()) {
    if ((r2 - r1 + 1) * (c2 - c1 + 1) <= 64) { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.of(sid, r, c, out); return out; }
    const hit = (e) => e.r1 <= r2 && e.r2 >= r1 && e.c1 <= c2 && e.c2 >= c1;
    for (const [k, s] of this.single) {
      const i = k.indexOf(':');
      if (+k.slice(0, i) !== sid) continue;
      const kk = +k.slice(i + 1), r = Math.floor(kk / 16384), c = kk % 16384;
      if (r >= r1 && r <= r2 && c >= c1 && c <= c2) for (const d of s) out.add(d);
    }
    for (const [k, s] of this.tiles) if (k.startsWith(sid + ':')) for (const e of s) if (hit(e)) out.add(e.dep);
    const w = this.wide.get(sid);
    if (w) for (const e of w) if (hit(e)) out.add(e.dep);
    return out;
  }
}
