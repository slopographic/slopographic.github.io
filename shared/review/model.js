/* SlopReview model: the pure logic behind the review list. No DOM, so Node can test it.
 * Classic script; adds window.SlopReview.model (review.js builds the window on top of it).
 *   item      { id, label, detail?, size? (bytes), group? ('' = no group), checked }
 *   checked   a Set of item ids. Every function returns a new Set; none changes its input.
 * Exposes: normalise, initial, selectAll, selectNone, invert, toggle, summary, groups, rows, ids, bytes, plural. */
(function (g) {
  'use strict';
  const R = (g.SlopReview = g.SlopReview || {});
  const str = (v) => (v == null ? '' : String(v));

  /** Clean copies of the items. Items without an id, and repeated ids after the first, are dropped. */
  function normalise(items) {
    const seen = new Set(), out = [];
    for (const it of items || []) {
      if (!it) continue;
      const id = str(it.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const size = typeof it.size === 'number' && isFinite(it.size) && it.size >= 0 ? it.size : undefined;
      out.push({ id, label: str(it.label), detail: str(it.detail), size, group: str(it.group), checked: !!it.checked });
    }
    return out;
  }
  /** The ids that start checked (each item's own flag). */
  const initial = (items) => new Set(items.filter((i) => i.checked).map((i) => i.id));
  const selectAll = (items) => new Set(items.map((i) => i.id));
  const selectNone = () => new Set();
  /** Checked becomes unchecked and unchecked becomes checked. */
  const invert = (items, checked) => new Set(items.filter((i) => !checked.has(i.id)).map((i) => i.id));
  const toggle = (checked, id) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };
  /** The checked items, in list order (the ids a confirm resolves with). */
  const ids = (items, checked) => items.filter((i) => checked.has(i.id)).map((i) => i.id);

  /** count: checked items. total: bytes of the checked items that have a size. hasSizes: any item has a size. */
  function summary(items, checked) {
    let count = 0, total = 0, hasSizes = false;
    for (const it of items) {
      if (it.size !== undefined) hasSizes = true;
      if (!checked.has(it.id)) continue;
      count++;
      if (it.size !== undefined) total += it.size;
    }
    return { count, total, hasSizes, all: count === items.length };
  }

  /** Items split by group, in the order each group first appears. Items with no group form the group ''. */
  function groups(items) {
    const map = new Map();
    for (const it of items) {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group).push(it);
    }
    return [...map].map(([name, list]) => ({ name, items: list }));
  }

  /** The rows as drawn: a heading before each named group, then its items. Ungrouped items have no heading. */
  function rows(items) {
    const out = [];
    for (const { name, items: list } of groups(items)) {
      if (name) out.push({ type: 'group', name, count: list.length });
      for (const item of list) out.push({ type: 'item', item });
    }
    return out;
  }

  /** Bytes as a short label: 512 B, 3.4 MB. Empty for a value that is not a number. */
  function bytes(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n < 1024) return Math.round(n) + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let v = n / 1024, i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ' + units[i];
  }
  /** plural(3, 'file') is "3 files"; plural(1, 'file') is "1 file"; plural(2, 'copy', 'copies') is "2 copies". */
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  R.model = { normalise, initial, selectAll, selectNone, invert, toggle, ids, summary, groups, rows, bytes, plural };
})(window);
