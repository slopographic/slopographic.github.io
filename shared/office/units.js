/* Slop Office units. Everything converts through points (1 pt = 1/72 inch).
 *   EMU (DrawingML): 914400 per inch, 12700 per pt
 *   twips / dxa (WordprocessingML): 20 per pt, 1440 per inch
 *   half-points (w:sz): 2 per pt;  eighths of a point (borders w:sz): 8 per pt
 *   px (CSS): 96 per inch, so 1 pt = 4/3 px
 *   ODF lengths are strings with units: "2.54cm", "12pt", "1in", "10mm", "0.5pc", "16px"
 */
export const PT_PER_IN = 72, PX_PER_IN = 96, MM_PER_IN = 25.4, EMU_PER_IN = 914400;
export const EMU_PER_PT = 12700, TWIPS_PER_PT = 20;

export const ptToPx = (pt) => (pt * PX_PER_IN) / PT_PER_IN;
export const pxToPt = (px) => (px * PT_PER_IN) / PX_PER_IN;
export const ptToIn = (pt) => pt / PT_PER_IN;
export const inToPt = (inch) => inch * PT_PER_IN;
export const ptToMm = (pt) => (pt / PT_PER_IN) * MM_PER_IN;
export const mmToPt = (mm) => (mm / MM_PER_IN) * PT_PER_IN;
export const cmToPt = (cm) => mmToPt(cm * 10);
export const ptToCm = (pt) => ptToMm(pt) / 10;
export const ptToEmu = (pt) => Math.round(pt * EMU_PER_PT);
export const emuToPt = (emu) => Number(emu) / EMU_PER_PT;
export const pxToEmu = (px) => ptToEmu(pxToPt(px));
export const emuToPx = (emu) => ptToPx(emuToPt(emu));
export const ptToTwips = (pt) => Math.round(pt * TWIPS_PER_PT);
export const twipsToPt = (tw) => Number(tw) / TWIPS_PER_PT;
export const ptToHalfPt = (pt) => Math.round(pt * 2);
export const halfPtToPt = (hp) => Number(hp) / 2;
export const ptToEighths = (pt) => Math.round(pt * 8);
export const eighthsToPt = (e) => Number(e) / 8;

const TO_PT = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12, px: 0.75, emu: 1 / 12700, twip: 1 / 20 };

/** Parse a length string ("2.54cm", "12pt", "1in", "16px") to points. Bare numbers use defUnit. */
export function lengthToPt(s, defUnit = 'pt') {
  if (s === null || s === undefined || s === '') return null;
  if (typeof s === 'number') return s * (TO_PT[defUnit] ?? 1);
  const m = /^\s*(-?[\d.]+(?:e-?\d+)?)\s*([a-z%]*)\s*$/i.exec(String(s));
  if (!m) return null;
  const unit = (m[2] || defUnit).toLowerCase();
  if (!(unit in TO_PT)) return null;
  return parseFloat(m[1]) * TO_PT[unit];
}
/** Format points as an ODF/CSS length in the given unit, trimmed to 4 decimals. */
export function ptToLength(pt, unit = 'pt') {
  const v = pt / (TO_PT[unit] ?? 1);
  return `${+v.toFixed(4)}${unit}`;
}

/** Standard page sizes in points (portrait). */
export const PAGE_SIZES = {
  A4: { w: mmToPt(210), h: mmToPt(297) },
  A3: { w: mmToPt(297), h: mmToPt(420) },
  A5: { w: mmToPt(148), h: mmToPt(210) },
  Letter: { w: 612, h: 792 },
  Legal: { w: 612, h: 1008 },
  Tabloid: { w: 792, h: 1224 },
};
/** Name of the page size matching w×h points (either orientation, ±1pt), or null. */
export function pageSizeName(w, h) {
  for (const [k, v] of Object.entries(PAGE_SIZES)) {
    if ((Math.abs(v.w - w) < 1 && Math.abs(v.h - h) < 1) || (Math.abs(v.w - h) < 1 && Math.abs(v.h - w) < 1)) return k;
  }
  return null;
}

/** Colours: '#rrggbb' ↔ 'RRGGBB' (OOXML hex without '#'). */
export const hexToOoxml = (c) => (c ? String(c).replace('#', '').toUpperCase().slice(0, 6) : null);
export const ooxmlToHex = (c) => (c && /^[0-9a-f]{6}$/i.test(c) ? '#' + c.toLowerCase() : null);
