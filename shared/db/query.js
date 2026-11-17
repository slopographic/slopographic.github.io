/* SlopDb query logic: pure, no IndexedDB and no DOM, so the browser code (db.js) and the node tests share it.
 *   where: [[field, op, value], ...]   op: = != < <= > >= in contains starts
 *     A row value that is an array matches when one of its items matches (for != : when no item equals the value).
 *     contains and starts ignore case. in takes an array of values. Compare < > only numbers with numbers, text with text.
 *     A dotted field ('a.b') reads a nested value.
 *   join(left, right, { on: [leftField, rightField], type: 'inner' | 'left', prefix, ci })
 *     prefix puts every right field under that name (customer_name); without it, right fields fill only the names the
 *     left row does not have. ci compares text keys ignoring case and spaces at the ends.
 *   aggregate(rows, { by, sum, avg, count })  by: a field or a list of fields (none = one total row).
 *     Output: the by fields, count, sum_<field>, avg_<field> (avg is null when no value is a number).
 *   rangeSpec / planIndex: how an index can narrow a query on the first where clause (db.js reads them).
 * Classic script: sets window.SlopDbQuery, and module.exports under Node (tests/node/db-query.test.mjs). */
(function (root) {
  'use strict';
  const OPS = ['=', '!=', '<', '<=', '>', '>=', 'in', 'contains', 'starts'];
  const isNil = (v) => v === undefined || v === null;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /** The value at a field, or a dotted path, or undefined. */
  function get(row, path) {
    if (!row || typeof path !== 'string') return undefined;
    if (!path.includes('.')) return row[path];
    let v = row;
    for (const k of path.split('.')) { if (isNil(v)) return undefined; v = v[k]; }
    return v;
  }

  /** Order of two values of one kind: numbers, or text (by code unit, so ISO dates sort right). NaN when they cannot be compared. */
  function order(a, b) {
    if (isNum(a) && isNum(b)) return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    return NaN;
  }

  /** One value against one condition. */
  function one(v, op, t) {
    switch (op) {
      case '=': return v === t;
      case '!=': return v !== t;
      case 'in': return Array.isArray(t) && t.includes(v);
      case 'contains': return !isNil(v) && String(v).toLowerCase().includes(String(t).toLowerCase());
      case 'starts': return !isNil(v) && String(v).toLowerCase().startsWith(String(t).toLowerCase());
      default: break;
    }
    if (isNil(v) || isNil(t)) return false;
    const c = order(v, t);
    if (op === '<') return c < 0;
    if (op === '<=') return c <= 0;
    if (op === '>') return c > 0;
    return c >= 0;
  }

  /** Does a row value match one condition? An array value matches when one of its items does. */
  function matches(v, op, t) {
    if (Array.isArray(v) && op === '!=') return !v.includes(t);
    if (Array.isArray(v)) return v.some((x) => one(x, op, t));
    return one(v, op, t);
  }

  /** Throws a TypeError for a where list that is not [field, op, value] clauses. Returns it. */
  function checkWhere(where) {
    if (!Array.isArray(where)) throw new TypeError('where must be a list of [field, op, value]');
    for (const c of where) {
      if (!Array.isArray(c) || c.length !== 3 || typeof c[0] !== 'string' || !OPS.includes(c[1])) {
        throw new TypeError(`bad condition ${JSON.stringify(c)}`);
      }
    }
    return where;
  }

  /** The rows that match every clause (a new array). */
  function filterRows(rows, where = []) {
    if (!where.length) return rows.slice();
    return rows.filter((r) => where.every(([f, op, t]) => matches(get(r, f), op, t)));
  }

  /** Text and numbers compare in their own way. */
  function cmpAny(a, b) {
    if (isNum(a) && isNum(b)) return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }

  /** A stable sort by one field. Empty values go last in both directions. No field keeps the order given. */
  function sortRows(rows, field, desc) {
    if (!field) return rows.slice();
    const dir = desc ? -1 : 1;
    return rows.map((r, i) => ({ r, i, v: get(r, field) })).sort((a, b) => {
      const na = isNil(a.v), nb = isNil(b.v);
      if (na || nb) return na === nb ? a.i - b.i : na ? 1 : -1;
      return dir * cmpAny(a.v, b.v) || a.i - b.i;
    }).map((x) => x.r);
  }

  /** A slice: offset rows skipped, then at most limit rows. */
  function page(rows, offset = 0, limit) {
    const s = rows.slice(offset > 0 ? offset : 0);
    return Number.isFinite(limit) && limit >= 0 ? s.slice(0, limit) : s;
  }

  /** The whole query on rows already in memory: where, then orderBy and desc, then offset and limit. */
  function run(rows, o = {}) {
    checkWhere(o.where || []);
    return page(sortRows(filterRows(rows, o.where || []), o.orderBy, o.desc), o.offset, o.limit);
  }

  const keyText = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v);

  /** Joins two lists of rows on one field each. A left join keeps every left row; an inner join drops the ones without a match. */
  function join(left, right, o = {}) {
    const [lf, rf] = o.on || [];
    const key = (v) => (o.ci ? keyText(v) : v);
    const index = new Map();
    for (const r of right) {
      const k = get(r, rf);
      if (isNil(k)) continue;
      const list = index.get(key(k));
      if (list) list.push(r); else index.set(key(k), [r]);
    }
    const out = [];
    for (const l of left) {
      const k = get(l, lf);
      const hits = isNil(k) ? undefined : index.get(key(k));
      if (!hits) { if (o.type === 'left') out.push({ ...l }); continue; }
      for (const r of hits) out.push(merge(l, r, o.prefix));
    }
    return out;
  }

  function merge(l, r, prefix) {
    const m = { ...l };
    for (const [k, v] of Object.entries(r)) {
      if (prefix) m[prefix + k] = v;
      else if (!(k in m)) m[k] = v;
    }
    return m;
  }

  const num = (v) => (isNum(v) ? v : null);

  /** Groups rows and totals each group. */
  function aggregate(rows, o = {}) {
    const by = o.by == null ? [] : [].concat(o.by);
    const sums = [].concat(o.sum || []), avgs = [].concat(o.avg || []);
    const groups = new Map();
    const fresh = (keys) => ({ keys, count: 0, sum: {}, avg: {}, avgN: {} });
    for (const r of rows) {
      const keys = by.map((f) => get(r, f));
      const gk = JSON.stringify(keys.map((v) => (v === undefined ? null : v)));
      let g = groups.get(gk);
      if (!g) { g = fresh(keys); groups.set(gk, g); }
      g.count += 1;
      for (const f of sums) g.sum[f] = (g.sum[f] || 0) + (num(get(r, f)) || 0);
      for (const f of avgs) {
        const v = num(get(r, f));
        if (v === null) continue;
        g.avg[f] = (g.avg[f] || 0) + v;
        g.avgN[f] = (g.avgN[f] || 0) + 1;
      }
    }
    if (!by.length && !groups.size) groups.set('[]', fresh([]));
    return [...groups.values()].map((g) => {
      const row = {};
      by.forEach((f, i) => { row[f] = g.keys[i]; });
      if (o.count) row.count = g.count;
      for (const f of sums) row[`sum_${f}`] = g.sum[f] || 0;
      for (const f of avgs) row[`avg_${f}`] = g.avgN[f] ? g.avg[f] / g.avgN[f] : null;
      return row;
    });
  }

  /** The key range an index needs for one condition, as plain data (db.js turns it into an IDBKeyRange), or null. */
  function rangeSpec(op, t) {
    if (typeof t !== 'string' && !isNum(t)) return null;
    if (op === '=') return { only: t };
    if (op === '<') return { upper: t, open: true };
    if (op === '<=') return { upper: t, open: false };
    if (op === '>') return { lower: t, open: true };
    if (op === '>=') return { lower: t, open: false };
    return null;
  }

  /** Which index narrows the query: the first where clause only, on a field an index keys by. Null means scan. */
  function planIndex(where, indexes) {
    const c = where && where[0];
    if (!c) return null;
    const ix = (indexes || []).find((i) => i.keyPath === c[0]);
    const range = ix ? rangeSpec(c[1], c[2]) : null;
    return range ? { index: ix.name, range } : null;
  }

  const Q = { OPS, get, matches, checkWhere, filterRows, cmpAny, sortRows, page, run, join, aggregate, rangeSpec, planIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = Q;
  else root.SlopDbQuery = Q;
})(typeof window !== 'undefined' ? window : globalThis);
