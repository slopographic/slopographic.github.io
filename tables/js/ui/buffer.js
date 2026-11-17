/* Slop Tables — ui/buffer: the shared copy-and-drop buffer (window.SlopBuffer, see shared/buffer/). A CSV table in the
 * buffer, from any app, is pasted as a sheet region at the selected cell: each field is typed in as its own value, the
 * way Paste of text is. Paste takes the buffer when it is newer than this document's last copy, and a drop on the grid
 * does the same. Items with no CSV are left to the ordinary paste. */
import { S, redraw } from './state.js';
import { transact } from './history.js';
import { parseCsv } from '../io/csv.js';

const SB = () => window.SlopBuffer;
let lastCopyT = 0;

/** Writes CSV rows as a region from the active cell, and selects it. */
export function pasteCsv(csv) {
  const rows = parseCsv(csv, ','), sh = S.wb.sheets[S.si], { r, c } = S.sel;
  transact(() => S.wb.batch(() => rows.forEach((row, i) => row.forEach((v, j) => S.wb.input(sh, r + i, c + j, v)))));
  S.sel = { r, c, er: r + rows.length - 1, ec: c + Math.max(0, ...rows.map((x) => x.length)) - 1 };
  redraw();
}

/** Paste: a CSV table in the buffer, when the buffer is newer than this app's last copy. True when it pasted. */
export function pasteBuffer() {
  const sb = SB(), rec = sb && sb.get();
  if (!rec || rec.t <= lastCopyT || !rec.formats['text/csv']) return false;
  pasteCsv(rec.formats['text/csv']);
  return true;
}

// Copies made in this document count as newer than the buffer, so Ctrl+V keeps pasting the local copy.
document.addEventListener('copy', () => { lastCopyT = Date.now(); }, true);
document.addEventListener('cut', () => { lastCopyT = Date.now(); }, true);

const grid = document.getElementById('grid');
if (SB() && grid) {
  SB().bindDrop(grid, (rec) => {
    if (rec.formats['text/csv']) pasteCsv(rec.formats['text/csv']);
  });
  SB().tray(document.body);
}
