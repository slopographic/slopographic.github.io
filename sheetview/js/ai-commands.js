/* Slop Sheets viewer for the assistant: SlopCmd commands with arguments (shared/commands/args.js), imported on demand by
 * SlopCmd.prepare() (main.js): new_workbook (a new tab from rows), add_rows and add_sheet (into the open tab), open_file
 * (from Slop Drive), select_sheet, sort_column, filter_rows, clear_filters and export_rows (CSV, TSV or XLSX of the visible
 * or all rows, to Slop Drive and/or a download, through export.js). Columns are named by header text, letter or number. */
import { exportBlob } from './export.js';
import { emptyFilter } from '../../shared/sheets/query.js';
import { sheetFromGrid } from '../../shared/sheets/csv.js';
import { sheetName as cleanName } from '../../shared/sheets/write.js';

export function install(store, openFile) {
  const C = window.SlopCmd;
  if (!C || C.get('sheetview.ai.sort-column')) return;
  const list = [];
  const add = C.aiAdder('sheetview', list);   // shared/commands/commands.js
  const COL = { name: 'column', type: 'string', required: true, maxLength: 120, description: 'header text, a letter (B) or a number from 1' };
  const need = () => { if (!store.doc()) throw new Error('Open a spreadsheet first (open_file)'); return store.sheet(); };
  const width = (sh) => Math.max(0, ...sh.rows.map((r) => r.length));
  function col(q) {
    const sh = need(), s = String(q).trim(), head = store.head() ? (sh.rows[0] || []) : [];
    const byHead = head.findIndex((h) => String(h == null ? '' : h).trim().toLowerCase() === s.toLowerCase());
    if (byHead >= 0) return byHead;
    if (/^\d+$/.test(s) && +s >= 1 && +s <= width(sh)) return +s - 1;
    if (/^[A-Z]{1,3}$/i.test(s)) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; if (n <= width(sh)) return n - 1; }
    throw new Error(`No column “${q}”${head.length ? ` (the headers are ${head.filter((h) => h != null && h !== '').join(', ')})` : ''}`);
  }
  const shown = () => store.order().length - store.head();
  const ROWS = { name: 'rows', type: 'array', required: true, maxItems: 5000, items: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 2000 } },
    description: 'rows of cell text, e.g. [["Name","Price"],["Tea","3.50"]]; numbers are read as numbers' };
  const grid = (rows) => rows.map((r) => (Array.isArray(r) ? r : [r]).map((x) => String(x ?? '')));
  const sheetName = (s, n) => cleanName(s || 'Sheet' + n, new Set());

  add('new_workbook', 'New spreadsheet', [{ name: 'name', type: 'string', maxLength: 120, default: 'Untitled', description: 'file name, without extension' },
    { name: 'sheet', type: 'string', maxLength: 31, description: 'name of the first sheet (default Sheet1)' }, Object.assign({}, ROWS, { required: false, description: 'optional first rows (the header first): ' + ROWS.description })], (a) => {
    const name = String(a.name || 'Untitled').replace(/\.(xlsx|csv|tsv|ods)$/i, '').trim() || 'Untitled';
    store.addDoc({ name, format: 'xlsx', sheets: [sheetFromGrid(sheetName(a.sheet, 1), grid(a.rows || []))] }, { name: name + '.xlsx' });
    return `New spreadsheet “${name}” open in a new tab with ${store.sheet().height} row(s).`;
  }, { description: 'Open a new spreadsheet in a new tab, empty or with the given rows. Save it with export_rows.' });
  add('add_rows', 'Add rows', [ROWS], (a) => {
    const sh = need(), n = a.rows.length;
    store.appendRows(grid(a.rows));
    return `Added ${n} row(s) to “${sh.name}”: ${sh.height} rows now, ${shown()} shown.`;
  }, { description: 'Append rows at the bottom of the sheet on show. Sort and filters still apply.' });
  add('add_sheet', 'Add a sheet', [{ name: 'name', type: 'string', maxLength: 31, description: 'sheet name' }, Object.assign({}, ROWS, { required: false })], (a) => {
    const d = store.doc(); need();
    const nm = sheetName(a.name, d.sheets.length + 1);
    if (d.sheets.some((s) => s.name.toLowerCase() === nm.toLowerCase())) throw new Error(`There is already a sheet “${nm}”`);
    store.addSheet(sheetFromGrid(nm, grid(a.rows || [])));
    return `Added sheet “${nm}” (${store.sheet().height} rows) and showing it.`;
  }, { description: 'Add a sheet to the open spreadsheet, empty or with rows, and show it.' });

  add('open_file', 'Open a spreadsheet from Slop Drive', [{ name: 'file', type: 'string', required: true, maxLength: 300, description: 'Slop Drive name or id (.xlsx, .csv, .tsv, .ods)' }],
    async (a) => {
      const file = await (await window.SlopCmd.sources()).driveAsFile(a.file);   // shared/commands/sources.js: by id or name
      await openFile(file);
      const d = store.doc();
      return `Opened ${file.name}: ${d.sheets.length} sheet(s), ${need().rows.length} rows in “${need().name}”.`;
    });
  add('select_sheet', 'Show a sheet', [{ name: 'sheet', type: 'string', required: true, maxLength: 120, description: 'sheet name or number' }], (a) => {
    const d = store.doc(); need();
    const i = /^\d+$/.test(a.sheet) ? +a.sheet - 1 : d.sheets.findIndex((s) => s.name.toLowerCase() === a.sheet.toLowerCase());
    if (i < 0 || i >= d.sheets.length) throw new Error(`No sheet “${a.sheet}” (sheets: ${d.sheets.map((s) => s.name).join(', ')})`);
    store.selectSheet(i);
    return `Showing “${d.sheets[i].name}”.`;
  });
  add('sort_column', 'Sort by a column', [COL, { name: 'order', type: 'enum', values: ['asc', 'desc', 'none'], default: 'asc' }], (a) => {
    const c = col(a.column), v = store.view();
    v.sort = a.order === 'none' ? null : { col: c, dir: a.order === 'desc' ? -1 : 1 };
    v.version++; v.cache = null;
    store.selectSheet(store.doc().sheet);   // redraws
    return a.order === 'none' ? 'Sort cleared.' : `Sorted by column ${c + 1}, ${a.order === 'desc' ? 'descending' : 'ascending'}.`;
  });
  add('filter_rows', 'Filter rows', [COL, { name: 'contains', type: 'string', maxLength: 200, description: 'keep rows whose cell has this text' },
    { name: 'op', type: 'enum', values: ['>', '<'], description: 'compare numbers' }, { name: 'value', type: 'number', description: 'the number for op' },
    { name: 'values', type: 'array', items: { type: 'string' }, maxItems: 500, description: 'keep only cells equal to one of these' }], (a) => {
    const c = col(a.column), f = Object.assign(emptyFilter(), store.filterOf(c));
    if (a.contains != null) f.contains = a.contains;
    if (a.op) { if (a.value == null) throw new Error('Give value with op'); f.op = a.op; f.num = a.value; }
    if (a.values) f.values = new Set(a.values.map(String));
    store.setFilter(c, f);
    return `Filtered column ${c + 1}: ${shown()} row(s) shown.`;
  });
  add('clear_filters', 'Clear sort and filters', [], () => { need(); store.clearView(); return `Cleared; ${shown()} row(s) shown.`; });
  add('export_rows', 'Export rows', [{ name: 'format', type: 'enum', values: ['csv', 'tsv', 'xlsx'], default: 'csv' }, { name: 'scope', type: 'enum', values: ['visible', 'all'], default: 'visible', description: 'visible: after filters and sort' },
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }], async (a) => {
    need();
    const { blob, name } = await exportBlob(a.format, a.scope, { doc: store.doc(), sheet: store.sheet(), order: store.order() }), out = [];
    if (a.to !== 'download') out.push(`Saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'sheetview' })})`);
    if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save the visible (filtered and sorted) or all rows as CSV, TSV or XLSX to Slop Drive and/or a download.' });

  C.register(list);
  C.provide({
    state: () => { const d = store.doc(); if (!d) return { app: 'Slop Sheets', open: null };
      const sh = store.sheet(); return { app: 'Slop Sheets', file: d.fileName, sheets: d.sheets.map((s) => s.name), sheet: sh.name, rows: sh.rows.length, shown: shown(),
        headers: store.head() ? (sh.rows[0] || []).slice(0, 40) : null, firstRows: store.order().slice(0, 8).map((i) => sh.rows[i].slice(0, 12)) }; },
    checkpoint: () => { const v = store.view(); const snap = v ? { sort: v.sort, filters: new Map(v.filters) } : null;
      return () => { const w = store.view(); if (w && snap) { w.sort = snap.sort; w.filters = snap.filters; w.version++; w.cache = null; store.selectSheet(store.doc().sheet); } return true; }; },
  });
}
