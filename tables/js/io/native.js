/* Slop Tables native file (.stab): a JSON document holding the whole workbook. Cells keep their input
   (formula text or value) and a style id into a deduplicated style table; computed values are not stored
   (they are recalculated on open). Each sheet may also hold its charts and pivot tables (objects/store.js). */
import { Workbook } from '../engine/index.js';
import { ERR, FErr, errFrom } from '../engine/values.js';
import { MAX_ROWS, MAX_COLS } from '../engine/refs.js';
import { encodeObjects, checkObjects, decodeObjects } from '../objects/store.js';
import { t } from '../i18n.js';

export const FORMAT = 'slop-tables', VERSION = 1;
export const MIME = 'application/x-slop-table', EXT = 'stab';

/** Workbook → plain object (JSON-safe). */
export function toNative(wb) {
  const sheetIndex = (id) => wb.sheets.findIndex((s) => s.id === id);
  return {
    format: FORMAT, version: VERSION, title: wb.props.title || '', active: wb.active || 0,
    styles: wb.styles,
    sheets: wb.sheets.map((sh) => ({
      name: sh.name, defW: sh.defW, defH: sh.defH, freeze: { ...sh.freeze }, merges: sh.merges.map((m) => ({ ...m })),
      cols: [...sh.cols].sort((a, b) => a[0] - b[0]), rows: [...sh.rows].sort((a, b) => a[0] - b[0]),
      cells: [...sh.cells].sort((a, b) => a[0] - b[0]).map(([k, cell]) => [Math.floor(k / 16384), k % 16384, encodeCell(cell)])
        .filter(([, , rec]) => Object.keys(rec).length),
      ...encodeObjects(sh),
    })),
    names: [...wb.names.values()].map((d) => ({ name: d.name, ref: d.ref, scope: d.scope ? sheetIndex(d.scope) : null })),
  };
}

function encodeCell(cell) {
  const rec = {};
  if (cell.f !== undefined) rec.f = cell.f;
  else if (cell.v instanceof FErr) rec.e = cell.v.code;
  else if (cell.v !== null && cell.v !== undefined) rec.v = cell.v;
  if (cell.s) rec.s = cell.s;
  return rec;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v < hi;
const damaged = (what) => new Error(t('tables.file.damaged', { what }));
const CELL_VALUE = (v) => v === null || v === undefined || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v));

/** Structural check of a workbook object: the one validator for .stab files and for templates. Throws
   an Error saying what is wrong, and never changes anything. Use it before fromNative. */
export function checkNative(obj) {
  if (!isObj(obj) || obj.format !== FORMAT) throw new Error(t('tables.file.not_ours'));
  if (obj.version !== undefined && !(isInt(obj.version, 1, VERSION + 1))) throw new Error(t('tables.file.newer'));
  if (obj.title !== undefined && typeof obj.title !== 'string') throw damaged('title');
  if (obj.active !== undefined && !isInt(obj.active, 0, 256)) throw damaged('active sheet');
  if (obj.styles !== undefined && (!Array.isArray(obj.styles) || !obj.styles.every(isObj))) throw damaged('styles');
  if (!Array.isArray(obj.sheets) || obj.sheets.length < 1 || obj.sheets.length > 255) throw damaged('sheets');
  obj.sheets.forEach((so, i) => {
    const where = 'sheet ' + (i + 1);
    if (!isObj(so)) throw damaged(where);
    if (so.name !== undefined && typeof so.name !== 'string') throw damaged(where + ' name');
    if (so.cells !== undefined && !Array.isArray(so.cells)) throw damaged(where + ' cells');
    for (const e of so.cells || []) {
      if (!Array.isArray(e) || e.length !== 3 || !isInt(e[0], 0, MAX_ROWS) || !isInt(e[1], 0, MAX_COLS) || !isObj(e[2])) throw damaged(where + ' cell');
      const rec = e[2];
      if (rec.f !== undefined && (typeof rec.f !== 'string' || rec.f.length > 8192)) throw damaged(where + ' formula');
      if (rec.e !== undefined && typeof rec.e !== 'string') throw damaged(where + ' error');
      if (rec.v !== undefined && !CELL_VALUE(rec.v)) throw damaged(where + ' value');
      if (rec.s !== undefined && !isInt(rec.s, 0, 1e6)) throw damaged(where + ' style');
    }
    for (const list of [so.cols, so.rows]) {
      if (list !== undefined && (!Array.isArray(list) || !list.every((x) => Array.isArray(x) && isInt(x[0], 0, Math.max(MAX_ROWS, MAX_COLS)) && isObj(x[1])))) throw damaged(where + ' sizes');
    }
    checkObjects(so, where, damaged);
    if (so.merges !== undefined && (!Array.isArray(so.merges) || !so.merges.every((m) => isObj(m) && isInt(m.r1, 0, MAX_ROWS) && isInt(m.c1, 0, MAX_COLS) && isInt(m.r2, 0, MAX_ROWS) && isInt(m.c2, 0, MAX_COLS)))) throw damaged(where + ' merges');
  });
  if (obj.names !== undefined && (!Array.isArray(obj.names) || !obj.names.every((d) => isObj(d) && typeof d.name === 'string' && typeof d.ref === 'string'))) throw damaged('names');
  return obj;
}

/** Plain object → Workbook. Throws if the object is not a valid Slop Tables file (see checkNative). */
export function fromNative(obj) {
  checkNative(obj);
  const wb = new Workbook({ sheets: 0 });
  wb.auto = false;
  const smap = [0];
  for (let i = 1; i < (obj.styles || []).length; i++) smap[i] = wb.styleId(obj.styles[i]);
  const mapStyle = (s) => (s && smap[s]) || 0;
  const used = new Set();
  obj.sheets.forEach((so, i) => {
    let name = String(so.name || 'Sheet' + (i + 1)).slice(0, 31);
    if (used.has(name.toLowerCase())) name = 'Sheet' + (i + 1);
    used.add(name.toLowerCase());
    const sh = wb.addSheet(name);
    sh.defW = so.defW || sh.defW; sh.defH = so.defH || sh.defH;
    sh.freeze = { r: so.freeze?.r || 0, c: so.freeze?.c || 0 };
    sh.merges = (so.merges || []).map((m) => ({ ...m }));
    decodeObjects(sh, so);
    for (const [c, p] of so.cols || []) { p.s = mapStyle(p.s); sh.cols.set(c, p); }
    for (const [r, p] of so.rows || []) { p.s = mapStyle(p.s); sh.rows.set(r, p); }
    for (const [r, c, rec] of so.cells || []) {
      const cell = sh.ensure(r, c);
      if (rec.s) cell.s = mapStyle(rec.s);
      if (rec.f !== undefined) wb.setFormula(sh, r, c, rec.f, { lenient: true });
      else if (rec.e !== undefined) cell.v = errFrom(rec.e) || ERR.VALUE;
      else if (rec.v !== undefined) cell.v = rec.v;
    }
  });
  for (const d of obj.names || []) {
    try { wb.defineName(d.name, d.ref, d.scope !== null && d.scope !== undefined ? wb.sheets[d.scope] : null); } catch (e) { /* skip bad names */ }
  }
  wb.props.title = obj.title || '';
  wb.auto = true;
  wb.recalcAll();
  wb.active = Math.min(obj.active || 0, wb.sheets.length - 1);
  return wb;
}

export const toBlob = (wb) => new Blob([JSON.stringify(toNative(wb))], { type: MIME });
export async function fromBlob(blob) { return fromNative(JSON.parse(await blob.text())); }
