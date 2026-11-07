/* SlopFinderModel: the pure part of the finder (no DOM). Search (case and accent blind, every word must match), facet
 * filters (values inside one facet combine with OR, facets combine with AND), facet counts, sorting and state clean-up.
 * Classic script: sets window.SlopFinderModel, and module.exports under Node (tests/node/finder-model.test.mjs). */
(function () {
  'use strict';
  const VIEWS = ['cards', 'list', 'table'];
  /** A word from the shared tables (shared/i18n/ui/<code>/finder.js), the key without SlopI18n. */
  const T = (key, vars) => (globalThis.SlopI18n ? globalThis.SlopI18n.t(key, vars) : key);
  /** Lower case, accents removed: "Résumé" becomes "resume". */
  const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().trim();
  const words = (q) => fold(q).split(/\s+/).filter(Boolean);
  const searchFields = (spec) => (spec.searchKeys ? spec.fields.filter((f) => spec.searchKeys.includes(f.key)) : spec.fields);
  const textOf = (item, spec) => fold(searchFields(spec).map((f) => [].concat(f.get(item)).join(' \n ')).join(' \n '));
  const valuesOf = (item, facet) => [].concat(facet.values(item)).filter((v) => v != null && v !== '').map(String);

  /** True when every word of the query appears in one of the searchable fields (accent and case blind). */
  function matchesSearch(item, q, spec) {
    const ws = words(q);
    if (!ws.length) return true;
    const t = textOf(item, spec);
    return ws.every((w) => t.includes(w));
  }
  function matchesFacets(item, st, spec, skip) {
    for (const f of spec.facets || []) {
      if (f.key === skip) continue;
      const sel = (st.facets && st.facets[f.key]) || [];
      if (sel.length && !sel.some((v) => valuesOf(item, f).includes(v))) return false;
    }
    return true;
  }
  /** The items that match the search and every facet. */
  const filter = (items, st, spec) => items.filter((it) => matchesSearch(it, st.q, spec) && matchesFacets(it, st, spec, null));

  /** Per facet: every value with its count, given the search and the other facets (so counts show what a click adds). */
  function facetCounts(items, st, spec) {
    const out = {};
    for (const f of spec.facets || []) {
      const base = items.filter((it) => matchesSearch(it, st.q, spec) && matchesFacets(it, st, spec, f.key));
      const counts = new Map();
      for (const it of items) for (const v of valuesOf(it, f)) counts.set(v, 0);
      for (const it of base) for (const v of new Set(valuesOf(it, f))) counts.set(v, counts.get(v) + 1);
      const sel = (st.facets && st.facets[f.key]) || [];
      out[f.key] = [...counts]
        .map(([value, count]) => ({ value, count, selected: sel.includes(value) }))
        .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' }));
    }
    return out;
  }

  function compare(a, b) {
    const ea = a == null || a === '', eb = b == null || b === '';
    if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
  }
  /** A stable sort by a column's get(); no sort (null, or an unknown key) keeps the order given. */
  function sortItems(items, columns, sort) {
    const col = sort && (columns || []).find((c) => c.key === sort.key);
    if (!col) return items.slice();
    const dir = sort.dir === 'desc' ? -1 : 1;
    return items.map((it, i) => ({ it, i, v: col.get(it) }))
      .sort((a, b) => dir * compare(a.v, b.v) || a.i - b.i)
      .map((x) => x.it);
  }

  /** The state with defaults: no search, no facets, cards, the spec's initial sort. */
  function defaultState(spec) {
    return { q: '', facets: {}, view: spec.view || 'cards', sort: spec.sort ? { key: spec.sort.key, dir: spec.sort.dir || 'asc' } : null };
  }
  /** Whatever came in (a URL, a saved state) cleaned up: unknown views and columns are dropped, facets kept as text lists. */
  function normalizeState(raw, spec) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const st = defaultState(spec);
    if (typeof r.q === 'string') st.q = r.q.slice(0, 200);
    for (const f of spec.facets || []) {
      const v = r.facets && r.facets[f.key];
      const sel = Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? [v] : [];
      if (sel.length) st.facets[f.key] = [...new Set(sel)];
    }
    if (VIEWS.includes(r.view)) st.view = r.view;
    if (r.sort && typeof r.sort.key === 'string' && (spec.columns || []).some((c) => c.key === r.sort.key)) {
      st.sort = { key: r.sort.key, dir: r.sort.dir === 'desc' ? 'desc' : 'asc' };
    }
    return st;
  }
  const isFiltered = (st) => words(st.q).length > 0 || Object.values(st.facets || {}).some((a) => a && a.length > 0);
  function toggleFacet(st, key, value) {
    const cur = (st.facets && st.facets[key]) || [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    const facets = { ...st.facets };
    if (next.length) facets[key] = next; else delete facets[key];
    return { ...st, facets };
  }
  /** A facet as a selection list: every value is ticked by default (no entry in the state means no filter). Ticking or
   *  unticking one value sets the facet to the ticked values; all ticked again removes the entry; the last value cannot
   *  be unticked (that would hide everything). `all` is every value the facet has. */
  function setFacetValue(st, key, value, checked, all) {
    const cur = (st.facets && st.facets[key]) || all;
    const set = new Set(cur);
    if (checked) set.add(value); else set.delete(value);
    if (!set.size) return st;
    const facets = { ...st.facets };
    if (all.every((v) => set.has(v))) delete facets[key];
    else facets[key] = all.filter((v) => set.has(v));
    return { ...st, facets };
  }
  /** Drops one facet value (or the whole facet when value is null); an empty facet is removed from the state. */
  function removeFacet(st, key, value) {
    const facets = { ...st.facets };
    const cur = facets[key] || [];
    const next = value == null ? [] : cur.filter((v) => v !== value);
    if (next.length) facets[key] = next; else delete facets[key];
    return { ...st, facets };
  }
  const clearFilters = (st) => ({ ...st, q: '', facets: {} });
  /** The removable chips: the search, then each selected facet value. */
  function chips(st, spec) {
    const out = [];
    if (words(st.q).length) out.push({ kind: 'q', key: 'q', value: st.q.trim(), label: T('ui.finder.chip_search', { q: st.q.trim() }) });
    for (const f of spec.facets || []) {
      for (const v of (st.facets && st.facets[f.key]) || []) {
        out.push({ kind: 'facet', key: f.key, value: v, label: T('ui.finder.chip', { label: f.label, value: f.format ? f.format(v) : v }) });
      }
    }
    return out;
  }
  /** A header click: a new column sorts ascending, the same column flips its direction. */
  const nextSort = (sort, key) => (sort && sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'asc' });

  /** Items in rank order, highest first; a stable sort. spec.rank(item, q) gives each item its number. Without a rank
   *  function the order is kept. Used when no column sort is chosen, so featured items and search matches lead. */
  function rankItems(items, q, spec) {
    if (!spec.rank) return items.slice();
    return items.map((it, i) => ({ it, i, r: Number(spec.rank(it, q)) || 0 }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .map((x) => x.it);
  }

  const M = { VIEWS, fold, words, matchesSearch, filter, facetCounts, sortItems, rankItems, defaultState, normalizeState,
    isFiltered, toggleFacet, setFacetValue, removeFacet, clearFilters, chips, nextSort };
  if (typeof window !== 'undefined') window.SlopFinderModel = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})();
