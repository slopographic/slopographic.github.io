/* Slop Sheets for other apps: load this module once and window.SlopSheets is ready.
 *   <script type="module" src="../shared/sheets/index.js"></script>
 *   SlopSheets.read(file)                       → { name, format, sheets }  (see read.js)
 *   SlopSheets.preview(container, file, opts?)  → renders the first sheet in container with the viewer's grid,
 *                                                  read-only, and resolves with { name, sheet, sheets, rows }.
 *                                                  Rejects with the reason when the file cannot be read.
 * opts: { style: 'plain'|'striped'|'grid'|'compact' (default 'grid'), palette: 'app'|'light'|'dark'|'classic'|'lime' }.
 * Needs no viewer page: the grid stylesheet is added next to this module. */
import { read } from './read.js';
import { mountGrid } from './table.js';

const CSS = new URL('./table.css', import.meta.url).href;

function ensureStyles() {
  if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === CSS)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = CSS;
  document.head.append(link);
}

export async function preview(container, file, { style = 'grid', palette = 'app' } = {}) {
  if (!container) throw new TypeError('preview() needs a container element');
  const doc = await read(file);
  ensureStyles();
  const sheet = doc.sheets[0];
  const box = document.createElement('div');
  box.className = 'ss-preview';
  container.replaceChildren(box);
  mountGrid(box, {
    sheet, order: Array.from({ length: sheet.height }, (_, i) => i), style, palette, sortable: false,
    emptyText: 'This sheet is empty.',
  });
  return { name: doc.name, sheet: sheet.name, sheets: doc.sheets.map((s) => s.name), rows: sheet.height };
}

window.SlopSheets = { read, preview };
