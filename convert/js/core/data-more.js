/* More data and text conversions, added to CONVERSIONS in catalog.js:
 *   xlsx-to-csv, xlsx-to-json, ods-to-xlsx, json-to-xlsx   spreadsheets, read by the shared reader (shared/sheets/read.js, the
 *                                      one Slop Tables and the vCard conversions use) and written by the shared writer
 *                                      (shared/sheets/write.js); the JSON side is sheet-json.js
 *   json-to-yaml, yaml-to-json, json-to-toml, toml-to-json, json-to-xml, json-format   structured.js
 *   srt-to-vtt, vtt-to-srt, subs-shift  subtitles.js
 * Exports DATA_MORE. */
import { read } from '../../../shared/sheets/read.js';
import { csvBlob } from '../../../shared/sheets/csv.js';
import { toXlsxBlob, exportSheet } from '../../../shared/sheets/write.js';
import { sheetRecords, tablesFromJson, workbookOf } from './sheet-json.js';
import { parseJson, formatJson, jsonToYaml, yamlToJson, jsonToToml, tomlToJson, jsonToXml } from './structured.js';
import { convertSubs } from './subtitles.js';
import { decodeText } from './text.js';
import { stemOf as base } from '../io/files.js';
import { tr } from './i18n.js';
/** A select choice [value, label] whose label is read in the current language. */
const ch = (v, label) => Object.defineProperty([v], 1, { get: label, enumerable: true });
/** A copy of an option with its getters kept (a spread would read the label once, in the language of that moment). */
const like = (o, more) => Object.defineProperties(Object.defineProperties({}, Object.getOwnPropertyDescriptors(o)), Object.getOwnPropertyDescriptors(more));

const textOf = async (f) => decodeText(new Uint8Array(await f.file.arrayBuffer()));
const out = (name, data, type) => ({ name, blob: new Blob([data], { type }) });
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Sheet'; // i18n-ignore: a file name

/** The workbook's sheets, the first or all of them (those with any cell). */
async function sheetsOf(f, which) {
  const book = await read(f.file, { name: f.name });
  const all = book.sheets.filter((s) => s.height > 0);
  if (!all.length) throw new Error(tr('convert.data.no_cells'));
  return which === 'all' ? all : all.slice(0, 1);
}

async function sheetToCsv(files, o = {}) {
  const f = files[0], sheets = await sheetsOf(f, o.sheet);
  const delim = o.delimiter === 'tab' ? '\t' : o.delimiter || ',';
  const many = sheets.length > 1;
  return sheets.map((s) => ({ name: many ? `${base(f.name)} - ${safe(s.name)}.csv` : `${base(f.name)}.csv`, blob: csvBlob(s, null, delim, { bom: o.bom !== false }) }));
}
async function sheetToJson(files, o = {}) {
  const f = files[0], sheets = await sheetsOf(f, o.sheet);
  const header = o.header !== false;
  const value = o.sheet === 'all' ? Object.fromEntries(sheets.map((s) => [s.name, sheetRecords(s, { header })])) : sheetRecords(sheets[0], { header });
  return [out(`${base(f.name)}.json`, JSON.stringify(value, null, 2) + '\n', 'application/json')];
}
async function odsToXlsx(files) {
  const f = files[0], book = await read(f.file, { name: f.name });
  return [{ name: `${base(f.name)}.xlsx`, blob: await toXlsxBlob(book.sheets.map((s) => exportSheet(s))) }];
}
async function jsonToXlsx(files) {
  const f = files[0], tables = tablesFromJson(parseJson(await textOf(f)));
  const r = [{ name: `${base(f.name)}.xlsx`, blob: await toXlsxBlob(workbookOf(tables)) }];
  r.preview = tables[0].rows.slice(0, 400).map((row) => row.map((v) => (v === null ? '' : String(v))).join('\t')).join('\n');   // the after panel
  return r;
}

const text = (fn, ext, type) => async (files, o = {}) => {
  const f = files[0], r = await fn(await textOf(f), o);
  const res = [out(`${base(f.name)}.${ext}`, typeof r === 'string' ? r : r.text, type)];
  if (r && r.dropped) res.info = tr('convert.data.nulls_dropped', { n: r.dropped });
  return res;
};

const SHEET = { key: 'sheet', type: 'select', get label() { return tr('convert.data.sheets'); }, value: 'first', options: [ch('first', () => tr('convert.data.the_first_sheet')), ch('all', () => tr('convert.data.every_sheet'))], get hint() { return tr('convert.data.every_sheet_one_csv_file_per'); } };
export const INDENT = { key: 'indent', type: 'select', get label() { return tr('convert.data.indent'); }, value: '2', options: [ch('2', () => tr('convert.data.2_spaces')), ch('4', () => tr('convert.data.4_spaces')), ch('tab', () => tr('convert.data.tabs')), ch('0', () => tr('convert.data.none_minified_one_line'))] };
export const SHIFT = { key: 'shift', type: 'number', get label() { return tr('convert.data.shift_the_timing_seconds'); }, min: -36000, max: 36000, step: 0.001, value: 0, get hint() { return tr('convert.data.a_positive_number_shows_every_subtitle'); } };
const SHEETS_KW = ['excel', 'spreadsheet', 'sheet'];

export const DATA_MORE = [
  { id: 'xlsx-to-csv', get label() { return tr('convert.data.spreadsheet_to_csv'); }, group: 'Data', from: ['xlsx', 'ods'], ext: 'csv', mode: 'each', keywords: [...SHEETS_KW, 'xlsx', 'ods'], options: [SHEET, // i18n-ignore: group is an id (groupLabel)
    { key: 'delimiter', type: 'select', get label() { return tr('convert.data.separator'); }, value: ',', options: [ch(',', () => tr('convert.data.comma')), ch(';', () => tr('convert.data.semicolon')), ch('tab', () => tr('convert.data.tab'))] },
    { key: 'bom', type: 'checkbox', get label() { return tr('convert.data.mark_the_file_as_utf_8'); }, value: true }], run: sheetToCsv },
  { id: 'xlsx-to-json', get label() { return tr('convert.data.spreadsheet_to_json'); }, group: 'Data', from: ['xlsx', 'ods'], ext: 'json', mode: 'each', keywords: [...SHEETS_KW, 'xlsx', 'ods'], options: [SHEET, // i18n-ignore: group is an id (groupLabel)
    { key: 'header', type: 'checkbox', get label() { return tr('convert.data.first_row_has_column_names'); }, value: true, get hint() { return tr('convert.data.on_one_object_per_row_off'); } }], run: sheetToJson },
  { id: 'ods-to-xlsx', get label() { return tr('convert.data.ods_to_xlsx'); }, group: 'Data', from: ['ods'], ext: 'xlsx', mode: 'each', keywords: ['excel', 'libreoffice', 'openoffice'], options: [], run: odsToXlsx }, // i18n-ignore: group is an id (groupLabel)
  { id: 'json-to-xlsx', get label() { return tr('convert.data.json_to_xlsx'); }, group: 'Data', from: ['json'], ext: 'xlsx', mode: 'each', keywords: ['excel', 'spreadsheet'], options: [], run: jsonToXlsx }, // i18n-ignore: group is an id (groupLabel)
  { id: 'json-to-yaml', get label() { return tr('convert.data.json_to_yaml'); }, group: 'Data', from: ['json'], ext: 'yaml', mode: 'each', keywords: ['yml'], options: [], run: text((t) => jsonToYaml(t), 'yaml', 'application/yaml') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'yaml-to-json', get label() { return tr('convert.data.yaml_to_json'); }, group: 'Data', from: ['yaml'], ext: 'json', mode: 'each', keywords: ['yml'], options: [INDENT], run: text((t, o) => yamlToJson(t, o), 'json', 'application/json') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'json-to-toml', get label() { return tr('convert.data.json_to_toml'); }, group: 'Data', from: ['json'], ext: 'toml', mode: 'each', keywords: ['config'], options: [], run: text((t) => jsonToToml(t), 'toml', 'application/toml') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'toml-to-json', get label() { return tr('convert.data.toml_to_json'); }, group: 'Data', from: ['toml'], ext: 'json', mode: 'each', keywords: ['config'], options: [INDENT], run: text((t, o) => tomlToJson(t, o), 'json', 'application/json') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'json-to-xml', get label() { return tr('convert.data.json_to_xml'); }, group: 'Data', from: ['json'], ext: 'xml', mode: 'each', options: [{ key: 'root', type: 'text', get label() { return tr('convert.data.root_element_name'); }, value: 'root', placeholder: 'root' }], run: text((t, o) => jsonToXml(t, o), 'xml', 'application/xml') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'json-format', get label() { return tr('convert.data.format_json_pretty_or_minified'); }, group: 'Data', from: ['json'], ext: 'json', mode: 'each', keywords: ['beautify', 'pretty', 'minify', 'validate'], options: [INDENT], // i18n-ignore: group is an id (groupLabel)
    run: async (files, o = {}) => { const f = files[0]; return [out(`${base(f.name)}-${o.indent === '0' ? 'min' : 'pretty'}.json`, formatJson(await textOf(f), o), 'application/json')]; } },
  { id: 'srt-to-vtt', get label() { return tr('convert.data.srt_to_vtt'); }, group: 'Subtitles', from: ['srt'], ext: 'vtt', mode: 'each', keywords: ['subtitles', 'webvtt', 'captions'], options: [SHIFT], run: text((t, o) => convertSubs(t, 'vtt', o), 'vtt', 'text/vtt') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'vtt-to-srt', get label() { return tr('convert.data.vtt_to_srt'); }, group: 'Subtitles', from: ['vtt'], ext: 'srt', mode: 'each', keywords: ['subtitles', 'subrip', 'captions'], options: [SHIFT], run: text((t, o) => convertSubs(t, 'srt', o), 'srt', 'application/x-subrip') }, // i18n-ignore: group is an id (groupLabel)
  { id: 'subs-shift', get label() { return tr('convert.data.shift_subtitle_timing'); }, group: 'Subtitles', from: ['srt', 'vtt'], ext: 'srt', mode: 'each', keywords: ['sync', 'delay', 'offset', 'subtitles'], options: [like(SHIFT, { value: 1 })], // i18n-ignore: group is an id (groupLabel)
    run: async (files, o = {}) => {
      const f = files[0], vtt = f.kind === 'vtt';
      return [out(`${base(f.name)}-shifted.${vtt ? 'vtt' : 'srt'}`, convertSubs(await textOf(f), vtt ? 'vtt' : 'srt', o), vtt ? 'text/vtt' : 'application/x-subrip')];
    } },
];
