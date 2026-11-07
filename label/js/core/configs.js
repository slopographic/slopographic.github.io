/* SlopLabel — core/configs: label configurations. A config holds the label size and stock (including a sheet's grid of
 * columns and rows, pitch and margins), the units and print resolution, the printer settings, the default text and shape
 * style, and the data columns with their field mapping (never the rows). Pure model: no DOM, no storage.
 * validateConfig rejects anything out of range (a zero or negative size included) and a sheet grid whose labels do not fit
 * the sheet or overlap. Lengths are millimetres, as in the document. Classic script; uses units.js, stocks.js and model.js. */
'use strict';

const CONFIG_FORMAT = 'sloplabel-configs';
const CONFIG_VERSION = 1;
const CONFIG_MAX_NAME = 80;
const CONFIG_MAX_COLS = 200;
const DEFAULT_STYLE = { font: 'sans', colour: 'black', fill: 'none', stroke: 0.5 };

/** The validation helpers. Each pushes a message into errs and returns the value, or null when it is refused. */
function cfgNum(errs, path, v, min, max, int = false) {
  if (v === undefined || v === null) { errs.push(`${path} is missing`); return null; }
  if (typeof v !== 'number' || !Number.isFinite(v) || (int && !Number.isInteger(v))) { errs.push(`${path} must be a ${int ? 'whole number' : 'number'}`); return null; }
  if (v < min || v > max) { errs.push(`${path} must be from ${min} to ${max}`); return null; }
  return v;
}
function cfgEnum(errs, path, v, list) {
  if (!list.includes(v)) { errs.push(`${path} must be one of ${list.join(', ')}`); return null; }
  return v;
}
function cfgStr(errs, path, v, max) {
  if (v == null) return '';
  if (typeof v !== 'string' || v.length > max) { errs.push(`${path} must be text up to ${max} characters`); return null; }
  return v;
}

/** The sheet grid must sit on its page and its labels must not overlap (one label per slot, with gaps). */
function cfgSheetFits(errs, L, S) {
  const eps = 0.01;
  if (S.kind !== 'sheet') return;
  if (S.cols > 1 && S.hpitch < L.w - eps) errs.push('the labels across the sheet overlap (column pitch is smaller than the label width)');
  if (S.rows > 1 && S.vpitch < L.h - eps) errs.push('the labels down the sheet overlap (row pitch is smaller than the label height)');
  if (S.left + (S.cols - 1) * S.hpitch + L.w > S.pageW + eps) errs.push(`the ${S.cols} columns do not fit on the ${S.pageW} mm wide sheet`);
  if (S.top + (S.rows - 1) * S.vpitch + L.h > S.pageH + eps) errs.push(`the ${S.rows} rows do not fit on the ${S.pageH} mm high sheet`);
}

/** Checks a config object. → { ok, body (the cleaned copy, only when ok), errors: [message] }. */
function validateConfig(raw) {
  const errs = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, body: null, errors: ['The config is not an object'] };
  const L0 = raw.label && typeof raw.label === 'object' ? raw.label : {};
  const label = {
    w: cfgNum(errs, 'label.w', L0.w, 0.01, 2000),
    h: cfgNum(errs, 'label.h', L0.h, 0.01, 2000),
    radius: cfgNum(errs, 'label.radius', L0.radius == null ? 0 : L0.radius, 0, 1000),
    gap: cfgNum(errs, 'label.gap', L0.gap == null ? 0 : L0.gap, 0, 100),
    orientation: cfgEnum(errs, 'label.orientation', L0.orientation == null ? 'landscape' : L0.orientation, ['portrait', 'landscape']),
  };
  if (label.w && label.h && label.radius != null && label.radius > Math.min(label.w, label.h) / 2 + 0.01) errs.push('label.radius cannot be more than half the smaller side');
  const margin = raw.margin == null ? [1.5, 1.5, 1.5, 1.5] : raw.margin;
  if (!Array.isArray(margin) || margin.length !== 4) errs.push('margin must be four numbers (top, right, bottom, left)');
  const mOk = Array.isArray(margin) && margin.length === 4 ? margin.map((m, i) => cfgNum(errs, `margin[${i}]`, m, 0, 100)) : null;
  const S0 = raw.stock && typeof raw.stock === 'object' ? raw.stock : {};
  const kind = cfgEnum(errs, 'stock.kind', S0.kind || 'roll', ['roll', 'sheet']);
  const sheet = kind === 'sheet';
  const stock = {
    kind,
    id: cfgStr(errs, 'stock.id', S0.id, 60) || '',
    name: cfgStr(errs, 'stock.name', S0.name, 120) || '',
    cols: cfgNum(errs, 'stock.cols', S0.cols == null ? 1 : S0.cols, 1, 100, true),
    rows: cfgNum(errs, 'stock.rows', S0.rows == null ? 1 : S0.rows, 1, 100, true),
    left: cfgNum(errs, 'stock.left', S0.left == null ? 0 : S0.left, 0, 1000),
    top: cfgNum(errs, 'stock.top', S0.top == null ? 0 : S0.top, 0, 1000),
    hpitch: cfgNum(errs, 'stock.hpitch', S0.hpitch == null ? (label.w || 0) : S0.hpitch, sheet ? 0.01 : 0, 2000),
    vpitch: cfgNum(errs, 'stock.vpitch', S0.vpitch == null ? (label.h || 0) : S0.vpitch, sheet ? 0.01 : 0, 2000),
    pageW: sheet ? cfgNum(errs, 'stock.pageW', S0.pageW, 0.01, 2000) : 0,
    pageH: sheet ? cfgNum(errs, 'stock.pageH', S0.pageH, 0.01, 2000) : 0,
  };
  if (sheet && label.w && label.h && stock.pageW && stock.pageH && stock.cols && stock.rows) cfgSheetFits(errs, Object.assign({}, label), stock);
  const unit = cfgEnum(errs, 'unit', raw.unit || 'mm', CFG_UNITS_LIST);
  const dpi = cfgEnum(errs, 'dpi', raw.dpi || 203, CFG_DPI_LIST);
  const P0 = raw.printer && typeof raw.printer === 'object' ? raw.printer : {};
  const printer = {
    darkness: cfgNum(errs, 'printer.darkness', P0.darkness == null ? 15 : P0.darkness, 0, 30, true),
    speed: cfgNum(errs, 'printer.speed', P0.speed == null ? 4 : P0.speed, 1, 14, true),
    media: cfgEnum(errs, 'printer.media', P0.media || 'gap', ['gap', 'mark', 'continuous']),
    method: cfgEnum(errs, 'printer.method', P0.method || 'direct', ['direct', 'transfer']),
    rotate180: !!P0.rotate180,
  };
  const Y0 = raw.style && typeof raw.style === 'object' ? raw.style : {};
  const style = {
    font: cfgEnum(errs, 'style.font', Y0.font || DEFAULT_STYLE.font, ['sans', 'serif', 'mono']),
    colour: cfgEnum(errs, 'style.colour', Y0.colour || DEFAULT_STYLE.colour, ['black', 'white']),
    fill: cfgEnum(errs, 'style.fill', Y0.fill || DEFAULT_STYLE.fill, ['none', 'black', 'white']),
    stroke: cfgNum(errs, 'style.stroke', Y0.stroke == null ? DEFAULT_STYLE.stroke : Y0.stroke, 0, 20),
  };
  let data = null;
  if (raw.data != null) {
    const D0 = raw.data;
    if (typeof D0 !== 'object' || !Array.isArray(D0.columns) || D0.columns.length > CONFIG_MAX_COLS) errs.push('data.columns must be a list of column names');
    else {
      const columns = D0.columns.map((c, i) => cfgStr(errs, `data.columns[${i}]`, c, 120) || '');
      const map = {};
      for (const [k, v] of Object.entries(D0.map && typeof D0.map === 'object' ? D0.map : {})) {
        if (!columns.includes(k)) continue; // a mapping for a column the config does not list is dropped
        map[k] = cfgStr(errs, `data.map.${k}`, v, 120) || k;
      }
      data = { columns, map, qtyCol: cfgStr(errs, 'data.qtyCol', D0.qtyCol, 120) || '' };
    }
  }
  if (errs.length) return { ok: false, body: null, errors: errs };
  const body = {
    label: { w: label.w, h: label.h, radius: label.radius, gap: label.gap, orientation: label.orientation },
    margin: mOk,
    unit, dpi, stock, printer, style, data,
  };
  return { ok: true, body, errors: [] };
}
const CFG_UNITS_LIST = ['mm', 'in', 'dots'];
const CFG_DPI_LIST = [152, 203, 300, 600];

/** A config name as typed: spaces collapsed, trimmed, at most CONFIG_MAX_NAME characters. '' when nothing is left. */
function cleanConfigName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, CONFIG_MAX_NAME).trim(); }
/** base, or base 2, base 3 ... so the name is not one of taken (case-insensitive). */
function uniqueConfigName(taken, base) {
  const have = new Set(taken.map((t) => String(t).toLowerCase()));
  let name = cleanConfigName(base) || 'Config', i = 2;
  const stem = name;
  while (have.has(name.toLowerCase())) name = `${stem} ${i++}`;
  return name;
}

/** The configuration a document holds right now. Throws with the first problem if the document cannot be a config. */
function configFromDoc(doc) {
  const L = doc.label, S = doc.stock || { kind: 'roll' }, P = doc.printer || {}, Y = Object.assign({}, DEFAULT_STYLE, doc.style);
  const body = {
    label: { w: round(L.w), h: round(L.h), radius: round(L.radius || 0), gap: round(L.gap || 0), orientation: L.orientation || (L.h >= L.w ? 'portrait' : 'landscape') },
    margin: (Array.isArray(L.margin) ? L.margin : [1.5, 1.5, 1.5, 1.5]).slice(0, 4).map((m) => round(m)),
    unit: doc.unit, dpi: doc.dpi,
    stock: { kind: S.kind || 'roll', id: S.id || '', name: S.name || '', cols: S.cols || 1, rows: S.rows || 1, left: round(S.left || 0), top: round(S.top || 0),
      hpitch: round(S.hpitch || 0), vpitch: round(S.vpitch || 0), pageW: round(S.pageW || 0), pageH: round(S.pageH || 0) },
    printer: { darkness: P.darkness, speed: P.speed, media: P.media, method: P.method, rotate180: !!P.rotate180 },
    style: { font: Y.font, colour: Y.colour, fill: Y.fill, stroke: round(Y.stroke) },
    data: doc.data ? { columns: doc.data.columns.slice(0, CONFIG_MAX_COLS).map(String), map: Object.assign({}, doc.data.map || {}), qtyCol: doc.data.qtyCol || '' } : null,
  };
  if (body.stock.kind === 'roll') { body.stock.pageW = 0; body.stock.pageH = 0; }
  const v = validateConfig(body);
  if (!v.ok) throw new Error(v.errors[0]);
  return v.body;
}

/** Applies a validated config to a document (in place). Returns the notes to show (data columns that are not in the data). */
function applyConfigToDoc(doc, body) {
  const notes = [];
  Object.assign(doc.label, body.label, { margin: body.margin.slice() });
  doc.unit = body.unit; doc.dpi = body.dpi;
  doc.stock = Object.assign({}, body.stock);
  doc.printer = Object.assign({}, doc.printer, body.printer);
  doc.style = Object.assign({}, body.style);
  if (body.data && doc.data) {
    const have = new Set(doc.data.columns);
    const missing = body.data.columns.filter((c) => !have.has(c));
    doc.data.map = Object.fromEntries(Object.entries(body.data.map).filter(([c]) => have.has(c)));
    doc.data.qtyCol = have.has(body.data.qtyCol) ? body.data.qtyCol : '';
    if (missing.length) notes.push(LT('label.cfg.missing_cols', { n: missing.length, list: missing.join(', ') }));
  } else if (body.data) notes.push('The config expects data columns. Import data to use them.');
  return notes;
}

/** A new document from a config (a new tab, or the source of a preset). */
function docFromConfig(body, name) {
  const d = newDoc({ name: cleanConfigName(name) || 'Untitled label', unit: body.unit, dpi: body.dpi });
  applyConfigToDoc(d, body);
  return normalizeDoc(d);
}

/** The text and shape defaults a new object gets from the document's style (the rest of its properties are the tool's own). */
function styleProps(doc, type) {
  const s = Object.assign({}, DEFAULT_STYLE, doc && doc.style);
  if (type === 'text' || type === 'para') return { font: s.font, color: s.colour };
  if (type === 'rect' || type === 'ellipse') return { fill: s.fill, stroke: s.stroke };
  if (type === 'line') return { stroke: s.stroke };
  return {};
}
