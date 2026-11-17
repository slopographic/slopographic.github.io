/* Slop Sheets viewer: the open documents and their views (sheet, sort, filters). No DOM here.
 * A document: { id, name, format, sheets, sheet (index), views: [{ sort, filters: Map<col, filter>, head, version, cache }] }.
 * head is how many rows at the top are the sheet's header (headerRows): sort and filter leave them on top.
 * Every change to a view bumps its version, and the visible rows are recomputed only when the version moves. */
import { visibleOrder } from '../../shared/sheets/query.js';
import { emptyFilter, isActiveFilter, headerRows } from '../../shared/sheets/query.js';
import { typedField } from '../../shared/sheets/csv.js';

let nextId = 1;

export function createStore(onChange = () => {}) {
  const store = { docs: [], active: -1 };
  const changed = () => onChange(store);

  const newView = (sheet) => ({ sort: null, filters: new Map(), head: headerRows(sheet), version: 0, cache: null });
  const bump = (v) => { v.version++; v.cache = null; };

  store.addDoc = (parsed, { name = parsed.name } = {}) => {
    const doc = {
      id: nextId++, name: name.replace(/\.[^.]*$/, '') || 'Untitled', fileName: name, format: parsed.format,
      sheets: parsed.sheets, sheet: 0, views: parsed.sheets.map(newView),
    };
    store.docs.push(doc);
    store.active = store.docs.length - 1;
    changed();
    return doc;
  };
  store.doc = () => store.docs[store.active] || null;
  store.sheet = () => { const d = store.doc(); return d ? d.sheets[d.sheet] : null; };
  store.view = () => { const d = store.doc(); return d ? d.views[d.sheet] : null; };

  store.selectDoc = (i) => { if (i >= 0 && i < store.docs.length) { store.active = i; changed(); } };
  store.selectSheet = (i) => {
    const d = store.doc();
    if (d && i >= 0 && i < d.sheets.length) { d.sheet = i; changed(); }
  };
  store.closeDoc = (i) => {
    if (i < 0 || i >= store.docs.length) return;
    store.docs.splice(i, 1);
    if (store.active >= store.docs.length) store.active = store.docs.length - 1;
    else if (i < store.active) store.active--;
    changed();
  };

  /** Adds a sheet (from sheetFromGrid) to the open document and shows it. */
  store.addSheet = (sheet) => {
    const d = store.doc();
    if (!d) return;
    d.sheets.push(sheet); d.views.push(newView(sheet)); d.sheet = d.sheets.length - 1;
    changed();
  };
  /** Appends rows of cell text to the bottom of the active sheet; numbers and dates are typed as a CSV file's are. */
  store.appendRows = (grid) => {
    const sh = store.sheet(), v = store.view();
    if (!sh) return;
    const width = Math.max(sh.width, ...grid.map((r) => r.length));
    const pad = (r) => { const o = r.slice(); while (o.length < width) o.push(''); return o; };
    if (width > sh.width) sh.text = sh.text.map(pad);
    for (const r of grid) { const t = pad(r.map((x) => String(x ?? ''))); sh.text.push(t); sh.rows.push(t.map(typedField)); }
    sh.width = width; sh.height = sh.text.length;
    if (sh.height >= 2 && !v.head) v.head = headerRows(sh);
    bump(v);
    changed();
  };

  /** Click on a column header: ascending, then descending, then no sort. */
  store.cycleSort = (col) => {
    const v = store.view();
    if (!v) return;
    if (!v.sort || v.sort.col !== col) v.sort = { col, dir: 1 };
    else if (v.sort.dir === 1) v.sort = { col, dir: -1 };
    else v.sort = null;
    bump(v);
    changed();
  };
  store.setFilter = (col, spec) => {
    const v = store.view();
    if (!v) return;
    if (isActiveFilter(spec)) v.filters.set(col, spec); else v.filters.delete(col);
    bump(v);
    changed();
  };
  store.clearView = () => {
    const v = store.view();
    if (!v) return;
    v.sort = null; v.filters = new Map();
    bump(v);
    changed();
  };

  /** Row indexes to show for the active sheet, after filter and sort. Cached until the view changes. */
  store.order = () => {
    const d = store.doc(), v = store.view();
    if (!d || !v) return [];
    if (!v.cache || v.cache.sheet !== d.sheets[d.sheet] || v.cache.version !== v.version) {
      v.cache = { sheet: d.sheets[d.sheet], version: v.version, order: visibleOrder(d.sheets[d.sheet], v) };
    }
    return v.cache.order;
  };
  /** Header rows at the top of the active sheet (0 or 1). */
  store.head = () => store.view()?.head ?? 0;
  store.filterOf = (col) => store.view()?.filters.get(col) ?? emptyFilter();
  return store;
}
