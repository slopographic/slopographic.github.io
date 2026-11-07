/* Slop Tables' headless operation (registry: shared/ops/registry.js):
 *   table-data-to-spreadsheet   table data → a spreadsheet, built by Slop Tables' own engine (tables/js/io/build.js:
 *                               the cells typed as a person would, formulas computed, the header row bold) and written by
 *                               its own XLSX writer (tables/js/io/xlsx.js) or as .stab or CSV.
 * The input is a .json file ({ sheets: [{ name, rows: [[…]] }] } or { rows }) or a .csv / .tsv / .txt table; the assistant
 * saves it to Slop Drive first. No DOM: the engine and the writer run in any page and in Node. */
import { register } from './registry.js';
import { stem } from './load.js';
import { t, opt } from './i18n.js';

// The data format, for the step's description (the assistant reads it): code, not words
const TABLE_HELP = '{ "sheets": [{ "name": "Sales", "rows": [["Item", "Qty"], ["Tea", 2], ["Total", "=SUM(B2:B2)"]] }] }';   // i18n-ignore: format

async function toSpreadsheet(files, o = {}) {
  const f = files[0], text = (await f.file.text()).replace(/^\uFEFF/, '');
  const [{ workbookFrom }, X, N, CSV] = await Promise.all([import('../../tables/js/io/build.js'), import('../../tables/js/io/xlsx.js'),
    import('../../tables/js/io/native.js'), import('../../tables/js/io/csv.js')]);
  const wb = workbookFrom(text);
  const fmt = o.format || 'xlsx', name = `${stem(f.name)}.${fmt}`;
  const blob = fmt === 'stab' ? N.toBlob(wb) : fmt === 'csv' ? new Blob([CSV.toCsv(wb.sheets[0])], { type: 'text/csv' }) : await X.toXlsx(wb);
  const out = [{ name, blob, kind: fmt }];
  out.info = t('ui.ops.tables.sheets', { n: wb.sheets.length, names: wb.sheets.map((s) => s.name).join(', ') });
  return out;
}

export const CREATE_TABLES = register([
  { id: 'table-data-to-spreadsheet', group: 'Create', from: ['json', 'csv', 'txt'], mode: 'each', ext: 'xlsx',   // i18n-ignore: a group id (search words), an app name
    get description() { return t('ui.ops.step.table_data_to_spreadsheet_desc', { format: TABLE_HELP }); },
    keywords: ['spreadsheet', 'excel', 'xlsx', 'table', 'sheet', 'workbook', 'create', 'make', 'generate', 'data', 'csv'],
    options: [opt('ui.ops.create.make', { key: 'format', type: 'select', value: 'xlsx', options: [['xlsx', 'Excel (.xlsx)'], ['stab', 'Slop Tables (.stab)'], 'csv'] })],
    run: toSpreadsheet },
], { app: 'tables', label: 'Slop Tables' });   // i18n-ignore: a group id (search words), an app name
