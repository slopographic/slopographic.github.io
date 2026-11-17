/* Slop Sheets viewer: the table's look, chosen in the header and remembered on this device.
 * Table style (plain, striped, grid, compact) and colour (follow the app theme, light, dark, Classic 98, lime).
 * Only the table is restyled; the rest of the page follows the app theme. The choice lives in localStorage, read and
 * written inside try/catch: a blocked or full store just means the defaults come back next time. */
// [id, label key]: the labels are read when the pickers are filled (sheetview/i18n), so they follow the language
export const STYLES = ['striped', 'plain', 'grid', 'compact'].map((id) => [id, 'sheetview.style.' + id]);
export const PALETTES = ['app', 'light', 'dark', 'classic', 'lime'].map((id) => [id, 'sheetview.palette.' + id]);
const KEY = 'sheetview.table';
const DEFAULTS = { style: 'striped', palette: 'app' };

const valid = (v, list, fallback) => (list.some(([id]) => id === v) ? v : fallback);

export function loadAppearance() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    return { style: valid(v.style, STYLES, DEFAULTS.style), palette: valid(v.palette, PALETTES, DEFAULTS.palette) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveAppearance(a) {
  try { localStorage.setItem(KEY, JSON.stringify({ style: a.style, palette: a.palette })); } catch (e) { /* storage unavailable: not remembered */ }
}
