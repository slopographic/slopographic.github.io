// The finder's pure logic (shared/finder/model.js): search, facets with counts, sorting, state and chips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { globalI18n } from './ui-i18n-env.mjs';

const EN = globalI18n('en');   // the chips' words, as a page has them (shared/i18n/ui/en/finder.js)
const M = createRequire(import.meta.url)('../../shared/finder/model.js');

const fields = [
  { key: 'name', get: (x) => x.name },
  { key: 'tagline', get: (x) => x.tagline },
  { key: 'keywords', get: (x) => x.keywords || [] },
];
const spec = {
  fields,
  facets: [
    { key: 'section', label: 'Section', values: (x) => x.sections },
    { key: 'status', label: 'Status', values: (x) => [x.status] },
  ],
  columns: [
    { key: 'name', get: (x) => x.name },
    { key: 'size', get: (x) => x.size },
    { key: 'open', sortable: false, get: () => '' },
  ],
};
const items = [
  { name: 'Quill Invoices', tagline: 'Gapless invoices.', keywords: ['billing'], sections: ['Business'], status: 'building', size: 3 },
  { name: 'PDF', tagline: 'Organise PDFs.', keywords: ['merge'], sections: ['Documents'], status: 'live', size: 10 },
  { name: 'Café Notes', tagline: 'Notebooks.', keywords: ['résumé'], sections: ['Documents', 'Business'], status: 'live', size: 1 },
  { name: 'Quill Isolate', tagline: 'Remove backgrounds.', keywords: ['cut-out'], sections: ['Creative'], status: 'live', size: 7 },
];
const names = (list) => list.map((x) => x.name);

test('search matches name, tagline and keywords, case and accent blind', () => {
  assert.deepEqual(names(M.filter(items, { ...M.defaultState(spec), q: 'pdf' }, spec)), ['PDF']);
  assert.deepEqual(names(M.filter(items, { ...M.defaultState(spec), q: 'BILLING' }, spec)), ['Quill Invoices']);
  assert.deepEqual(names(M.filter(items, { ...M.defaultState(spec), q: 'cafe' }, spec)), ['Café Notes']);
  assert.deepEqual(names(M.filter(items, { ...M.defaultState(spec), q: 'resume' }, spec)), ['Café Notes']);
  assert.deepEqual(names(M.filter(items, { ...M.defaultState(spec), q: 'cut-out' }, spec)), ['Quill Isolate']);
});

test('every word of the query must match somewhere, and a blank query matches all', () => {
  assert.equal(M.filter(items, { ...M.defaultState(spec), q: 'remove backgrounds' }, spec).length, 1);
  assert.equal(M.filter(items, { ...M.defaultState(spec), q: 'remove invoices' }, spec).length, 0);
  assert.equal(M.filter(items, { ...M.defaultState(spec), q: '   ' }, spec).length, items.length);
});

test('facet values inside one facet combine with OR, facets combine with AND', () => {
  let st = M.defaultState(spec);
  st = M.toggleFacet(st, 'section', 'Documents');
  st = M.toggleFacet(st, 'section', 'Creative');
  assert.deepEqual(names(M.filter(items, st, spec)), ['PDF', 'Café Notes', 'Quill Isolate']);
  st = M.toggleFacet(st, 'status', 'building');
  assert.deepEqual(names(M.filter(items, st, spec)), []);
  st = M.toggleFacet(st, 'status', 'building');
  st = M.toggleFacet(st, 'status', 'live');
  assert.deepEqual(names(M.filter(items, st, spec)), ['PDF', 'Café Notes', 'Quill Isolate']);
});

test('facet counts respect the search and the other facets, but not the facet they belong to', () => {
  let st = M.defaultState(spec);
  st = M.toggleFacet(st, 'status', 'live');
  const counts = M.facetCounts(items, st, spec);
  const section = Object.fromEntries(counts.section.map((c) => [c.value, c.count]));
  assert.deepEqual(section, { Business: 1, Creative: 1, Documents: 2 });
  const status = Object.fromEntries(counts.status.map((c) => [c.value, c.count]));
  assert.deepEqual(status, { building: 1, live: 3 }, 'status counts ignore the status selection itself');
  assert.equal(counts.status.find((c) => c.value === 'live').selected, true);
  st = { ...st, q: 'pdf' };
  assert.equal(Object.fromEntries(M.facetCounts(items, st, spec).section.map((c) => [c.value, c.count])).Documents, 1);
});

test('sorting by a column is stable, both directions, and missing values go last', () => {
  assert.deepEqual(names(M.sortItems(items, spec.columns, { key: 'name', dir: 'asc' })), ['Café Notes', 'PDF', 'Quill Invoices', 'Quill Isolate']);
  assert.deepEqual(names(M.sortItems(items, spec.columns, { key: 'size', dir: 'desc' })), ['PDF', 'Quill Isolate', 'Quill Invoices', 'Café Notes']);
  assert.deepEqual(names(M.sortItems(items, spec.columns, { key: 'open', dir: 'asc' })), names(items), 'an empty column keeps the given order');
  assert.deepEqual(names(M.sortItems(items, spec.columns, null)), names(items));
  const withGaps = [{ name: 'b', size: null }, { name: 'a', size: 2 }, { name: 'c', size: 1 }];
  assert.deepEqual(names(M.sortItems(withGaps, spec.columns, { key: 'size', dir: 'asc' })), ['c', 'a', 'b']);
});

test('nextSort: a new column starts ascending, the same column flips', () => {
  assert.deepEqual(M.nextSort(null, 'name'), { key: 'name', dir: 'asc' });
  assert.deepEqual(M.nextSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
  assert.deepEqual(M.nextSort({ key: 'name', dir: 'desc' }, 'size'), { key: 'size', dir: 'asc' });
});

test('normalizeState keeps only known views, columns and facets, and reads facets as lists', () => {
  const st = M.normalizeState({ q: 'pdf', view: 'table', sort: { key: 'name', dir: 'desc' }, facets: { section: 'Documents', status: ['live', 'live'] } }, spec);
  assert.equal(st.q, 'pdf');
  assert.equal(st.view, 'table');
  assert.deepEqual(st.sort, { key: 'name', dir: 'desc' });
  assert.deepEqual(st.facets, { section: ['Documents'], status: ['live'] });
  const bad = M.normalizeState({ view: 'grid', sort: { key: 'nope' } }, spec);
  assert.equal(bad.view, 'cards');
  assert.equal(bad.sort, null);
  assert.deepEqual(M.normalizeState(null, spec), M.defaultState(spec));
});

test('isFiltered and clearFilters keep the view and sort', () => {
  let st = { ...M.defaultState(spec), view: 'list', sort: { key: 'name', dir: 'asc' } };
  assert.equal(M.isFiltered(st), false);
  st = M.toggleFacet({ ...st, q: 'x' }, 'section', 'Business');
  assert.equal(M.isFiltered(st), true);
  const cleared = M.clearFilters(st);
  assert.equal(M.isFiltered(cleared), false);
  assert.equal(cleared.view, 'list');
  assert.deepEqual(cleared.sort, { key: 'name', dir: 'asc' });
});

test('chips list the search and each facet value, and removing one drops only that one', () => {
  let st = M.toggleFacet(M.toggleFacet({ ...M.defaultState(spec), q: ' pdf ' }, 'section', 'Documents'), 'section', 'Business');
  const list = M.chips(st, spec);
  assert.deepEqual(list.map((c) => c.label), ['Search: "pdf"', 'Section: Documents', 'Section: Business']);
  st = M.removeFacet(st, 'section', 'Documents');
  assert.deepEqual(st.facets, { section: ['Business'] });
  st = M.removeFacet(st, 'section', null);
  assert.deepEqual(st.facets, {});
});

test('ranking lists higher numbers first, keeps the order among equals, and keeps the order when there is no rank', () => {
  const items = [{ name: 'Alpha' }, { name: 'Beta', f: 1 }, { name: 'Gamma' }, { name: 'Delta', f: 1 }];
  const rank = (x, q) => (x.f ? 50 : 0) + (q && x.name.toLowerCase().includes(q) ? 100 : 0);
  assert.deepEqual(M.rankItems(items, '', { rank }).map((x) => x.name), ['Beta', 'Delta', 'Alpha', 'Gamma']);
  assert.deepEqual(M.rankItems(items, 'gam', { rank }).map((x) => x.name), ['Gamma', 'Beta', 'Delta', 'Alpha']);
  assert.deepEqual(M.rankItems(items, '', {}).map((x) => x.name), ['Alpha', 'Beta', 'Gamma', 'Delta']);
});

test('a facet is a selection list: all ticked by default, unticking narrows, all ticked again clears it, the last one stays', () => {
  const all = ['Audio', 'Images', 'PDF'];
  let st = { q: '', facets: {}, view: 'list', sort: null };
  st = M.setFacetValue(st, 'type', 'Audio', false, all);
  assert.deepEqual(st.facets.type, ['Images', 'PDF']);
  st = M.setFacetValue(st, 'type', 'PDF', false, all);
  assert.deepEqual(st.facets.type, ['Images']);
  assert.equal(M.setFacetValue(st, 'type', 'Images', false, all), st, 'the last ticked value cannot be unticked');
  st = M.setFacetValue(st, 'type', 'Audio', true, all);
  st = M.setFacetValue(st, 'type', 'PDF', true, all);
  assert.equal(st.facets.type, undefined, 'all ticked again means no filter');
});

test('chips in Swedish, and the count line\'s plural forms in English and Swedish (n = 1 and n = 2)', () => {
  const st = M.toggleFacet({ ...M.defaultState(spec), q: 'pdf' }, 'section', 'Documents');
  const SV = globalI18n('sv');
  try {
    assert.deepEqual(M.chips(st, spec).map((c) => c.label), ['Sök: ”pdf”', 'Section: Documents']);
    // the homepage's count (shared/i18n/strings.js and sv.js) and the finder's default (ui.finder.count)
    assert.deepEqual([SV.t('finder.count', { n: 1 }), SV.t('finder.count', { n: 2 }), SV.t('finder.count_of', { shown: 1, n: 2 })], ['1 app', '2 appar', '1 av 2 appar matchar']);
    assert.deepEqual([EN.t('finder.count', { n: 1 }), EN.t('finder.count', { n: 2 }), EN.t('finder.count_of', { shown: 2, n: 1 })], ['1 app', '2 apps', '2 of 1 app match']);
    assert.deepEqual([EN.t('ui.finder.count', { n: 1 }), EN.t('ui.finder.count', { n: 1234 })], ['1 item', '1,234 items']);
    assert.equal(SV.t('ui.finder.count', { n: 1234 }), '1\u00a0234 objekt');
    const RU = globalI18n('ru');   // Slavic plurals: one, few, many
    assert.deepEqual([1, 3, 5, 21].map((n) => RU.t('finder.count', { n })), ['1 приложение', '3 приложения', '5 приложений', '21 приложение']);
  } finally { globalThis.SlopI18n = EN; }
});
