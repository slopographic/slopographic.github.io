/* Slop Compare: two CSV (or TSV) tables compared row by row and cell by cell. Pure. The CSV reader is File convert's
 * (convert/js/core/csv.js parseCsv), so both read a file the same way.
 *   diffTable(textA, textB, { key, ignoreCase, ignoreWs }) → { columns, added, removed, key, rows, stats }
 *     The first row is the header; columns are matched by name, so moved columns are not changes (columns: every name, A's
 *     order then B's new ones; added / removed: names only on one side). key: 'auto' (a column whose values are filled and
 *     unique on both sides, preferring id, key, sku, code, email, number), a column name, or '' for none. With a key the rows
 *     are matched by it whatever their order; without one they are aligned with the sequence diff, and a deleted row next to
 *     an inserted one is a changed row.
 *     rows: [{ t: 'eq' | 'mod' | 'del' | 'ins', a: { cells } | null, b: … | null, changed: [column names], at }]
 *       at: the row's line in A, else in B (1 = the header). stats: { same, changed, added, removed, cells }
 *   tableOf(text) → { header, rows: [[cells]] }   findKey(A, B) → the key column or '' */
import { parseCsv } from '../../../convert/js/core/csv.js';
import { diffSeq, runs } from './myers.js';

const PREFER = /^(id|key|sku|code|email|e-mail|number|no\.?|ref(erence)?)$/i;

export function tableOf(text) {
  const all = parseCsv(String(text || '')).filter((r) => r.some((c) => c !== ''));
  const raw = all[0] || [], seen = new Map();
  const header = raw.map((h, i) => { const n = String(h).trim() || `Column ${i + 1}`; const c = (seen.get(n) || 0) + 1; seen.set(n, c); return c > 1 ? `${n} (${c})` : n; });
  return { header, rows: all.slice(1) };
}

function objects(t) { return t.rows.map((r, i) => ({ cells: Object.fromEntries(t.header.map((h, j) => [h, r[j] == null ? '' : r[j]])), line: i + 2 })); }

export function findKey(A, B) {
  const shared = A.header.filter((h) => B.header.includes(h));
  const unique = (t, h) => { const i = t.header.indexOf(h), s = new Set(); for (const r of t.rows) { const v = (r[i] || '').trim(); if (!v || s.has(v)) return false; s.add(v); } return t.rows.length > 0; };
  const ok = shared.filter((h) => unique(A, h) && unique(B, h));
  return ok.find((h) => PREFER.test(h)) || (ok[0] === A.header[0] ? ok[0] : '') || '';
}

export function diffTable(textA, textB, opts = {}) {
  const A = tableOf(textA), B = tableOf(textB);
  const columns = [...A.header, ...B.header.filter((h) => !A.header.includes(h))];
  const added = B.header.filter((h) => !A.header.includes(h)), removed = A.header.filter((h) => !B.header.includes(h));
  const shared = A.header.filter((h) => B.header.includes(h));
  const norm = (v) => { let s = String(v); if (opts.ignoreWs) s = s.replace(/\s+/g, ' ').trim(); if (opts.ignoreCase) s = s.toLowerCase(); return s; };
  const cellsDiffer = (x, y) => shared.filter((h) => norm(x.cells[h]) !== norm(y.cells[h]));
  const ra = objects(A), rb = objects(B);
  let key = opts.key === undefined || opts.key === 'auto' ? findKey(A, B) : opts.key;
  if (key && !(A.header.includes(key) && B.header.includes(key))) key = '';
  const rows = [];
  const pair = (x, y) => { const ch = cellsDiffer(x, y); rows.push({ t: ch.length ? 'mod' : 'eq', a: x, b: y, changed: ch, at: x.line }); };
  if (key) {
    const kv = (r) => norm(r.cells[key]);
    const inB = new Map(rb.map((r) => [kv(r), r])), inA = new Set(ra.map(kv));
    const after = new Map();   // A key → the B-only rows that follow it in B ('' = before every row)
    let prev = '';
    for (const r of rb) { const k = kv(r); if (inA.has(k)) prev = k; else { if (!after.has(prev)) after.set(prev, []); after.get(prev).push(r); } }
    const ins = (k) => { for (const r of after.get(k) || []) rows.push({ t: 'ins', a: null, b: r, changed: [], at: r.line }); };
    ins('');
    for (const r of ra) { const k = kv(r); if (inB.has(k)) pair(r, inB.get(k)); else rows.push({ t: 'del', a: r, b: null, changed: [], at: r.line }); ins(k); }
  } else {
    const line = (r) => shared.map((h) => norm(r.cells[h])).join('\u0001');
    const { ops } = diffSeq(ra.map(line), rb.map(line));
    for (const r of runs(ops)) {
      if (r.eq) { for (const o of r.ops) pair(ra[o.a], rb[o.b]); continue; }
      const n = Math.min(r.dels.length, r.ins.length);
      for (let i = 0; i < n; i++) pair(ra[r.dels[i]], rb[r.ins[i]]);
      for (let i = n; i < r.dels.length; i++) rows.push({ t: 'del', a: ra[r.dels[i]], b: null, changed: [], at: ra[r.dels[i]].line });
      for (let i = n; i < r.ins.length; i++) rows.push({ t: 'ins', a: null, b: rb[r.ins[i]], changed: [], at: rb[r.ins[i]].line });
    }
  }
  const stats = { same: 0, changed: 0, added: 0, removed: 0, cells: 0 };
  for (const r of rows) { if (r.t === 'eq') stats.same++; else if (r.t === 'mod') { stats.changed++; stats.cells += r.changed.length; } else if (r.t === 'ins') stats.added++; else stats.removed++; }
  stats.columns = added.length + removed.length;
  return { columns, added, removed, key, rows, stats };
}
