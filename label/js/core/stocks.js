/* SlopLabel — core/stocks: label stock library (thermal rolls, Avery/Herma sheets) and sheet layout maths. */
'use strict';

/* ---------------- stock library ----------------
 * Sheets: page size, columns × rows, label size, left/top margin to the first label and the
 * horizontal/vertical pitch (label + gap). All dimensions in mm (Letter/US stocks are exact inch values). */
const IN = (v) => round(v * MM_PER_IN, 4);
const STOCKS = [
  // thermal rolls (one label per "page")
  { id: 'roll-4x6', group: 'Thermal roll', name: '4 × 6" shipping (101.6 × 152.4 mm)', kind: 'roll', w: IN(4), h: IN(6), gap: 3, radius: 1.5 },
  { id: 'roll-4x4', group: 'Thermal roll', name: '4 × 4"', kind: 'roll', w: IN(4), h: IN(4), gap: 3, radius: 1.5 },
  { id: 'roll-4x3', group: 'Thermal roll', name: '4 × 3"', kind: 'roll', w: IN(4), h: IN(3), gap: 3, radius: 1.5 },
  { id: 'roll-4x2', group: 'Thermal roll', name: '4 × 2"', kind: 'roll', w: IN(4), h: IN(2), gap: 3, radius: 1.5 },
  { id: 'roll-3x1', group: 'Thermal roll', name: '3 × 1"', kind: 'roll', w: IN(3), h: IN(1), gap: 3, radius: 1 },
  { id: 'roll-2x1', group: 'Thermal roll', name: '2 × 1"', kind: 'roll', w: IN(2), h: IN(1), gap: 3, radius: 1 },
  { id: 'roll-2.25x1.25', group: 'Thermal roll', name: '2.25 × 1.25"', kind: 'roll', w: IN(2.25), h: IN(1.25), gap: 3, radius: 1 },
  { id: 'roll-100x150', group: 'Thermal roll', name: '100 × 150 mm', kind: 'roll', w: 100, h: 150, gap: 3, radius: 1.5 },
  { id: 'roll-100x100', group: 'Thermal roll', name: '100 × 100 mm', kind: 'roll', w: 100, h: 100, gap: 3, radius: 1.5 },
  { id: 'roll-100x50', group: 'Thermal roll', name: '100 × 50 mm', kind: 'roll', w: 100, h: 50, gap: 3, radius: 1.5 },
  { id: 'roll-58x40', group: 'Thermal roll', name: '58 × 40 mm', kind: 'roll', w: 58, h: 40, gap: 2, radius: 1 },
  { id: 'roll-57x32', group: 'Thermal roll', name: '57 × 32 mm', kind: 'roll', w: 57, h: 32, gap: 2, radius: 1 },
  { id: 'roll-50x25', group: 'Thermal roll', name: '50 × 25 mm', kind: 'roll', w: 50, h: 25, gap: 2, radius: 1 },
  { id: 'roll-62x29', group: 'Thermal roll', name: '62 × 29 mm (address)', kind: 'roll', w: 62, h: 29, gap: 3, radius: 1 },
  { id: 'roll-2up-2x1', group: 'Thermal roll', name: '2-across 2 × 1" (4" liner)', kind: 'roll', w: IN(2), h: IN(1), gap: 3, radius: 1, cols: 2, left: IN(0) , hpitch: IN(2) + 2 },
  // US Letter sheets (8.5 × 11")
  { id: 'avery-5160', group: 'Avery Letter', name: 'Avery 5160 / 8160 — Address 1 × 2⅝" (30)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(2.625), h: IN(1), cols: 3, rows: 10, left: IN(0.1875), top: IN(0.5), hpitch: IN(2.75), vpitch: IN(1), radius: IN(0.0625) },
  { id: 'avery-5161', group: 'Avery Letter', name: 'Avery 5161 — Address 1 × 4" (20)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(4), h: IN(1), cols: 2, rows: 10, left: IN(0.15625), top: IN(0.5), hpitch: IN(4.1875), vpitch: IN(1), radius: IN(0.0625) },
  { id: 'avery-5162', group: 'Avery Letter', name: 'Avery 5162 — Address 1⅓ × 4" (14)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(4), h: IN(4 / 3), cols: 2, rows: 7, left: IN(0.15625), top: IN(0.8333), hpitch: IN(4.1875), vpitch: IN(4 / 3), radius: IN(0.0625) },
  { id: 'avery-5163', group: 'Avery Letter', name: 'Avery 5163 / 8163 — Shipping 2 × 4" (10)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(4), h: IN(2), cols: 2, rows: 5, left: IN(0.15625), top: IN(0.5), hpitch: IN(4.1875), vpitch: IN(2), radius: IN(0.0625) },
  { id: 'avery-5164', group: 'Avery Letter', name: 'Avery 5164 — Shipping 3⅓ × 4" (6)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(4), h: IN(10 / 3), cols: 2, rows: 3, left: IN(0.15625), top: IN(0.5), hpitch: IN(4.1875), vpitch: IN(10 / 3), radius: IN(0.0625) },
  { id: 'avery-5167', group: 'Avery Letter', name: 'Avery 5167 — Return address ½ × 1¾" (80)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(1.75), h: IN(0.5), cols: 4, rows: 20, left: IN(0.3), top: IN(0.5), hpitch: IN(2.05), vpitch: IN(0.5), radius: IN(0.0625) },
  { id: 'avery-5195', group: 'Avery Letter', name: 'Avery 5195 — Return address ⅔ × 1¾" (60)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(1.75), h: IN(2 / 3), cols: 4, rows: 15, left: IN(0.3), top: IN(0.5), hpitch: IN(2.05), vpitch: IN(2 / 3), radius: IN(0.0625) },
  { id: 'avery-5126', group: 'Avery Letter', name: 'Avery 5126 — Shipping ½ sheet 5½ × 8½" (2)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(8.5), h: IN(5.5), cols: 1, rows: 2, left: 0, top: 0, hpitch: IN(8.5), vpitch: IN(5.5), radius: 0 },
  { id: 'avery-5165', group: 'Avery Letter', name: 'Avery 5165 — Full sheet 8½ × 11" (1)', kind: 'sheet', pageW: IN(8.5), pageH: IN(11), w: IN(8.5), h: IN(11), cols: 1, rows: 1, left: 0, top: 0, hpitch: IN(8.5), vpitch: IN(11), radius: 0 },
  // A4 sheets (210 × 297 mm)
  { id: 'avery-l7159', group: 'Avery A4', name: 'Avery L7159 — 63.5 × 33.9 mm (24)', kind: 'sheet', pageW: 210, pageH: 297, w: 63.5, h: 33.9, cols: 3, rows: 8, left: 7.25, top: 12.9, hpitch: 66.04, vpitch: 33.9, radius: 2 },
  { id: 'avery-l7160', group: 'Avery A4', name: 'Avery L7160 — 63.5 × 38.1 mm (21)', kind: 'sheet', pageW: 210, pageH: 297, w: 63.5, h: 38.1, cols: 3, rows: 7, left: 7.21, top: 15.15, hpitch: 66.04, vpitch: 38.1, radius: 2 },
  { id: 'avery-l7162', group: 'Avery A4', name: 'Avery L7162 — 99.1 × 33.9 mm (16)', kind: 'sheet', pageW: 210, pageH: 297, w: 99.1, h: 33.9, cols: 2, rows: 8, left: 4.65, top: 12.9, hpitch: 101.6, vpitch: 33.9, radius: 2 },
  { id: 'avery-l7163', group: 'Avery A4', name: 'Avery L7163 — 99.1 × 38.1 mm (14)', kind: 'sheet', pageW: 210, pageH: 297, w: 99.1, h: 38.1, cols: 2, rows: 7, left: 4.65, top: 15.15, hpitch: 101.6, vpitch: 38.1, radius: 2 },
  { id: 'avery-l7165', group: 'Avery A4', name: 'Avery L7165 — 99.1 × 67.7 mm (8)', kind: 'sheet', pageW: 210, pageH: 297, w: 99.1, h: 67.7, cols: 2, rows: 4, left: 4.65, top: 13.1, hpitch: 101.6, vpitch: 67.7, radius: 2 },
  { id: 'avery-l7173', group: 'Avery A4', name: 'Avery L7173 — 99.1 × 57 mm (10)', kind: 'sheet', pageW: 210, pageH: 297, w: 99.1, h: 57, cols: 2, rows: 5, left: 4.65, top: 6, hpitch: 101.6, vpitch: 57, radius: 2 },
  { id: 'avery-l7651', group: 'Avery A4', name: 'Avery L7651 — Mini 38.1 × 21.2 mm (65)', kind: 'sheet', pageW: 210, pageH: 297, w: 38.1, h: 21.2, cols: 5, rows: 13, left: 4.75, top: 10.7, hpitch: 40.64, vpitch: 21.2, radius: 1.5 },
  { id: 'avery-l7167', group: 'Avery A4', name: 'Avery L7167 — Full sheet 199.6 × 289.1 mm (1)', kind: 'sheet', pageW: 210, pageH: 297, w: 199.6, h: 289.1, cols: 1, rows: 1, left: 5.2, top: 3.95, hpitch: 199.6, vpitch: 289.1, radius: 3 },
  { id: 'herma-4360', group: 'Herma A4', name: 'Herma 4360 — 70 × 36 mm (24)', kind: 'sheet', pageW: 210, pageH: 297, w: 70, h: 36, cols: 3, rows: 8, left: 0, top: 4.5, hpitch: 70, vpitch: 36, radius: 0 },
  { id: 'herma-4474', group: 'Herma A4', name: 'Herma 4474 — 70 × 37 mm (24)', kind: 'sheet', pageW: 210, pageH: 297, w: 70, h: 37, cols: 3, rows: 8, left: 0, top: 0.5, hpitch: 70, vpitch: 37, radius: 0 },
  { id: 'herma-4457', group: 'Herma A4', name: 'Herma 4457 — 105 × 48 mm (12)', kind: 'sheet', pageW: 210, pageH: 297, w: 105, h: 48, cols: 2, rows: 6, left: 0, top: 4.5, hpitch: 105, vpitch: 48, radius: 0 },
  { id: 'herma-4628', group: 'Herma A4', name: 'Herma 4628 — 105 × 148 mm A6 (4)', kind: 'sheet', pageW: 210, pageH: 297, w: 105, h: 148, cols: 2, rows: 2, left: 0, top: 0.5, hpitch: 105, vpitch: 148, radius: 0 },
];
function stockById(id) { return STOCKS.find((s) => s.id === id) || null; }

/** The physical sheet/page a label is printed on. Roll: one row of `cols` labels (usually 1). */
function stockOf(doc) {
  const L = doc.label, S = doc.stock || { kind: 'roll' };
  if (S.kind === 'sheet') {
    return { kind: 'sheet', pageW: +S.pageW, pageH: +S.pageH, cols: Math.max(1, S.cols | 0), rows: Math.max(1, S.rows | 0), left: +S.left || 0, top: +S.top || 0, hpitch: +S.hpitch || L.w, vpitch: +S.vpitch || L.h, w: L.w, h: L.h };
  }
  const cols = Math.max(1, S.cols | 0 || 1), hpitch = cols > 1 ? (+S.hpitch || L.w + (+S.gapH || 2)) : L.w;
  const left = +S.left || 0;
  return { kind: 'roll', pageW: round(left * 2 + (cols - 1) * hpitch + L.w, 4), pageH: L.h, cols, rows: 1, left, top: 0, hpitch, vpitch: L.h, w: L.w, h: L.h };
}
/** Top-left corner of every label slot on a page, row-major (left→right, top→bottom), in mm. */
function sheetPositions(st) {
  const out = [];
  for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) out.push({ x: round(st.left + c * st.hpitch, 4), y: round(st.top + r * st.vpitch, 4), col: c, row: r });
  return out;
}
function slotsPerPage(st) { return st.cols * st.rows; }
