/* Builds a workbook from template data: sheets, cells as input text (typed like a user types, so "=..."
   is a formula and "3200" a number), column widths in pixels, and styles on ranges. */
import { Workbook } from '../engine/index.js';
import { parseCell, parseRange, colIndex } from '../engine/refs.js';

export function buildWorkbook(tpl) {
  const wb = new Workbook({ sheets: 0 });
  wb.batch(() => {
    for (const sd of tpl.sheets) {
      const sh = wb.addSheet(sd.name);
      for (const [ref, text] of Object.entries(sd.cells || {})) {
        const p = parseCell(ref);
        if (!p) throw new Error(`Template ${tpl.id}: bad cell ${ref}`);
        wb.input(sh, p.r, p.c, text);
      }
      for (const [letter, w] of Object.entries(sd.widths || {})) sh.colProp(colIndex(letter)).w = w;
      for (const [range, patch] of sd.styles || []) {
        const p = parseRange(range);
        if (!p) throw new Error(`Template ${tpl.id}: bad range ${range}`);
        for (let r = p.r1; r <= p.r2; r++) for (let c = p.c1; c <= p.c2; c++) {
          const cell = sh.ensure(r, c);
          cell.s = wb.patchStyle(cell.s || 0, patch);
        }
      }
    }
  });
  wb.active = 0;
  return wb;
}
