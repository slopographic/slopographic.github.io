/* SlopLabel — core/presets: built-in label presets. Each preset is a configuration (core/configs.js), so applying one is
 * the same as applying a saved config. Sheet and roll sizes come from the stock library (core/stocks.js), which is the
 * printer standard the app uses; the sizes that are not in the library are given as measurements, and the Avery code
 * is given only where the library names it. Lengths are millimetres. Pure model: no DOM. */
'use strict';

const IN_MM = (v) => round(v * MM_PER_IN, 4);
/** A preset built from a stock library entry. */
function presetFromStock(stockId, name, group, desc) {
  const s = stockById(stockId);
  if (!s) throw new Error('No stock ' + stockId);
  return { id: 'stock-' + stockId, name, group, desc, body: configFromDoc(newDoc({ stock: s, name })) };
}
/** A preset for a single label of the given size (a roll; the stock id is the preset's). */
function presetFromSize(id, name, group, desc, w, h, o = {}) {
  const stock = { id: 'custom-' + id, name, kind: 'roll', w, h, gap: o.gap == null ? 3 : o.gap, radius: o.radius || 0, group: null };
  const d = newDoc({ stock, name, unit: o.unit || 'mm' });
  return { id, name, group, desc, body: configFromDoc(d) };
}

const PRESET_GROUPS = ['A4 sheets (Avery-style)', 'Rolls and single labels'];
const PRESETS = [
  presetFromStock('avery-l7651', 'Avery L7651: 65 per A4 sheet', PRESET_GROUPS[0], '5 across × 13 down, 38.1 × 21.2 mm labels'),
  presetFromStock('avery-l7159', 'Avery L7159: 24 per A4 sheet', PRESET_GROUPS[0], '3 across × 8 down, 63.5 × 33.9 mm labels'),
  presetFromStock('avery-l7160', 'Avery L7160: 21 per A4 sheet', PRESET_GROUPS[0], '3 across × 7 down, 63.5 × 38.1 mm labels'),
  presetFromStock('roll-4x6', 'Shipping label 4 × 6 in', PRESET_GROUPS[1], '101.6 × 152.4 mm thermal roll label'),
  presetFromStock('roll-62x29', 'Address label 62 × 29 mm', PRESET_GROUPS[1], '62 × 29 mm thermal roll label'),
  presetFromSize('product-40x30', 'Product label 40 × 30 mm', PRESET_GROUPS[1], '40 × 30 mm thermal roll label', 40, 30, { gap: 2, radius: 1 }),
  presetFromSize('file-folder', 'File folder label 3⁷⁄₁₆ × ⅔ in', PRESET_GROUPS[1], '3⁷⁄₁₆ × ⅔ in (87.3 × 16.9 mm) tab label', IN_MM(3 + 7 / 16), IN_MM(2 / 3), { unit: 'in', gap: 2, radius: 1 }),
  presetFromSize('round-50', 'Round label 50 mm', PRESET_GROUPS[1], 'Round sticker, 50 mm across', 50, 50, { gap: 3, radius: 25 }),
];

/** The built-in preset with this id, or null. */
function presetById(id) { return PRESETS.find((p) => p.id === id) || null; }
/** Labels on one page of a preset's stock (cols × rows; 1 for a roll). */
function presetSlots(body) { return (body.stock.cols || 1) * (body.stock.rows || 1); }

/** The sheet grid in millimetres: the page, the label slots and the labels' outer boxes (for the fit check and the preview). */
function presetLayout(body) {
  const doc = docFromConfig(body, 'preview'), st = stockOf(doc);
  return { doc, st, boxes: sheetPositions(st).map((p) => ({ x: p.x, y: p.y, w: st.w, h: st.h })), pageW: st.pageW, pageH: st.pageH };
}
/** true when every label of the preset lies on its page and no two labels overlap (validateConfig already checks the grid). */
function presetFits(body) {
  const v = validateConfig(body);
  if (!v.ok) return false;
  const { boxes, pageW, pageH } = presetLayout(body), eps = 0.01;
  if (boxes.length !== presetSlots(body)) return false;
  return boxes.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= pageW + eps && b.y + b.h <= pageH + eps)
    && boxes.every((a, i) => boxes.every((b, j) => i === j || a.x + a.w <= b.x + eps || b.x + b.w <= a.x + eps || a.y + a.h <= b.y + eps || b.y + b.h <= a.y + eps));
}

/** An SVG preview of a config's page: the sheet with its label slots, or one label for a roll. Numbers only, so it is safe to inline. */
function presetPreviewSvg(body, name = '') {
  const { boxes, pageW, pageH, st, doc } = presetLayout(body), f = (n) => Math.round(n * 100) / 100, L = doc.label;
  const rx = (w, h) => f(Math.min(L.radius || 0, w / 2, h / 2));
  const page = st.kind === 'sheet' ? `<rect class="pv-page" x="0" y="0" width="${f(pageW)}" height="${f(pageH)}"/>` : '';
  const labels = boxes.map((b) => `<rect class="pv-label" x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" rx="${rx(b.w, b.h)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(pageW)} ${f(pageH)}" role="img" aria-label="${escHTML(name)}">${page}${labels}</svg>`;
}
