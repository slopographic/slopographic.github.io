/* Slop Compare: two texts compared as text, JSON or CSV, with the options the page, the commands and the Workflows step
 * share. Pure (no DOM): the pictures and PDFs are read by diff/js/io/files.js, which hands their text here.
 *   OPTIONS: the settings and their defaults, one table for the panel, the AI commands and the operation
 *   options(raw) → every setting, raw values checked against OPTIONS (unknown keys dropped)
 *   compareTexts(textA, textB, mode, opts) → { kind, text | json | csv, opts }
 *     mode: 'text', 'json' or 'csv' (kind.js modeOf decides 'auto'); a JSON side that does not parse throws with its line
 *     and column (convert/js/core/structured.js parseJson, prefixed with the side) */
import { diffLines } from './text.js';
import { diffJson } from './json.js';
import { diffTable } from './table.js';
import { parseJson } from '../../../convert/js/core/structured.js';

export const OPTIONS = [
  { key: 'mode', label: 'Compare as', value: 'auto', options: [['auto', 'Automatic'], ['text', 'Text'], ['json', 'JSON (by key)'], ['csv', 'CSV (by row)']] },
  { key: 'view', label: 'View', value: 'split', options: [['split', 'Side by side'], ['unified', 'Unified']] },
  { key: 'ignoreWs', label: 'Ignore whitespace', value: false },
  { key: 'ignoreCase', label: 'Ignore case', value: false },
  { key: 'context', label: 'Unchanged lines around changes', value: 3, min: -1, max: 50, hint: '-1 shows every line' },
  { key: 'key', label: 'CSV key column', value: 'auto', hint: 'auto, a column name, or none' },
  { key: 'threshold', label: 'Picture threshold (%)', value: 10, min: 0, max: 100, hint: 'How different a pixel must be to count' },
  { key: 'imageView', label: 'Picture view', value: 'side', options: [['side', 'Side by side'], ['slider', 'Slider'], ['diff', 'Difference']] },
  { key: 'pdfView', label: 'PDF view', value: 'text', options: [['text', 'Text'], ['visual', 'Pages']] },
];
export const DEFAULTS = Object.freeze(Object.fromEntries(OPTIONS.map((o) => [o.key, o.value])));

export function options(raw = {}) {
  const out = { ...DEFAULTS };
  for (const o of OPTIONS) {
    if (raw[o.key] === undefined || raw[o.key] === null || raw[o.key] === '') continue;
    let v = raw[o.key];
    if (typeof o.value === 'boolean') v = v === true || v === 'true' || v === 1 || v === 'on';
    else if (typeof o.value === 'number') { v = Number(v); if (!Number.isFinite(v)) continue; v = Math.round(Math.max(o.min, Math.min(o.max, v))); }
    else if (o.options) { v = String(v); if (!o.options.some(([k]) => k === v)) continue; }
    else v = String(v).trim().slice(0, 200);
    out[o.key] = v;
  }
  return out;
}

function parseSide(text, side) {
  try { return parseJson(text); } catch (e) { throw new Error(`${side}: ${e.message}`); }
}

export function compareTexts(textA, textB, mode = 'text', raw = {}) {
  const opts = options(raw), w = { ignoreWs: opts.ignoreWs, ignoreCase: opts.ignoreCase };
  if (mode === 'json') return { kind: 'json', json: diffJson(parseSide(textA, 'A'), parseSide(textB, 'B'), { ignoreCase: opts.ignoreCase }), opts };
  if (mode === 'csv') return { kind: 'csv', csv: diffTable(textA, textB, { ...w, key: opts.key === 'none' ? '' : opts.key }), opts };
  return { kind: 'text', text: diffLines(textA, textB, w), opts };
}
