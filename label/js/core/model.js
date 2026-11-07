/* SlopLabel — core/model: the label document, objects, undo history, arrange operations and project files. */
'use strict';

/* ---------------- document model ---------------- */
function newDoc(o = {}) {
  const stock = o.stock || stockById('roll-4x6');
  const d = {
    app: 'sloplabel', version: 1,
    name: o.name || 'Untitled label',
    unit: o.unit || (stock.group === 'Avery Letter' || /^[^(]*"/.test(stock.name) ? 'in' : 'mm'),
    dpi: o.dpi || 203,
    label: { w: stock.w, h: stock.h, radius: stock.radius || 0, margin: [1.5, 1.5, 1.5, 1.5], gap: stock.gap != null ? stock.gap : 3, orientation: stock.h >= stock.w ? 'portrait' : 'landscape' },
    stock: stockFromLib(stock),
    printer: { darkness: 15, speed: 4, media: 'gap', method: 'direct', rotate180: false, labelHome: [0, 0] },
    objects: [],
    vars: [],
    data: null,
    assets: {},
    grid: { size: 1, snap: true, show: true },
  };
  return d;
}
function stockFromLib(s) {
  if (s.kind === 'sheet') return { kind: 'sheet', id: s.id, name: s.name, pageW: s.pageW, pageH: s.pageH, cols: s.cols, rows: s.rows, left: s.left, top: s.top, hpitch: s.hpitch, vpitch: s.vpitch };
  return { kind: 'roll', id: s.id, name: s.name, cols: s.cols || 1, left: s.left || 0, hpitch: s.hpitch || 0 };
}
function applyStock(doc, s) {
  doc.stock = stockFromLib(s);
  doc.label.w = s.w; doc.label.h = s.h; doc.label.radius = s.radius || 0;
  if (s.gap != null) doc.label.gap = s.gap;
  doc.label.orientation = s.h >= s.w ? 'portrait' : 'landscape';
}
/** Portrait ⇄ landscape: swap width/height and rotate the layout 90° so nothing falls off. */
function setOrientation(doc, o) {
  const L = doc.label;
  if ((o === 'landscape') === (L.w > L.h) || L.w === L.h) { L.orientation = o; return false; }
  const W = L.w, H = L.h;
  L.w = H; L.h = W; L.orientation = o;
  for (const ob of doc.objects) {
    // rotate the object's box 90° clockwise about the label (portrait→landscape) or counter-clockwise
    const cw = o === 'landscape' ? 0 : 1;
    const x = ob.x, y = ob.y, w = ob.w, h = ob.h;
    if (ob.type === 'line') { /* lines keep their own endpoints */ }
    if (!cw) { ob.x = H - y - h; ob.y = x; } else { ob.x = y; ob.y = W - x - w; }
    ob.w = h; ob.h = w; ob.rot = ((ob.rot || 0) + (cw ? 270 : 90)) % 360;
  }
  return true;
}

const OBJ_DEFAULTS = {
  text: { w: 40, h: 8, content: 'Text', font: 'sans', size: 12, bold: false, italic: false, align: 'left', valign: 'top', fit: 'grow', wrap: false, shrink: false, color: 'black', lineSpacing: 1.15, minSize: 4 },
  para: { w: 50, h: 20, content: 'Paragraph text with **bold** and _italic_ words that wraps inside its box.', font: 'sans', size: 9, bold: false, italic: false, align: 'left', valign: 'top', fit: 'box', wrap: true, shrink: true, color: 'black', lineSpacing: 1.2, minSize: 4 },
  barcode: { w: 40, h: 15, content: '123456789012', symbology: 'code128', module: 0.33, barHeight: 12, hr: 'below', hrSize: 8, hrFont: 'mono', quiet: true, check: 'auto', ec: 'M', snapDots: true, ratio: 2.5, columns: 0, security: 2, dmShape: 'square', bearer: true },
  image: { w: 20, h: 20, asset: null, keepAspect: true, threshold: 128, dither: true },
  rect: { w: 30, h: 15, stroke: 0.5, fill: 'none', radius: 0 },
  ellipse: { w: 20, h: 20, stroke: 0.5, fill: 'none' },
  line: { w: 30, h: 0, stroke: 0.5, dir: 'h' },
  inverse: { w: 30, h: 10 },
};
const TYPE_NAMES = { text: 'Text', para: 'Paragraph', barcode: 'Barcode', image: 'Image', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', inverse: 'Inverse box' };
function makeObject(type, props = {}) {
  const o = Object.assign({ id: uid(), type, name: '', x: 5, y: 5, rot: 0, locked: false, hidden: false, group: null }, deepClone(OBJ_DEFAULTS[type] || {}), props);
  if (!o.name) o.name = TYPE_NAMES[type] || type;
  return o;
}

/* ---------------- history (snapshot undo/redo) ----------------
 * Snapshots are JSON of the document without assets (images are immutable, keyed by id). */
class History {
  constructor(limit = 200) { this.limit = limit; this.stack = []; this.idx = -1; }
  snap(doc) { const { assets, ...rest } = doc; return JSON.stringify(rest); }
  reset(doc, label = 'Open') { this.stack = [{ s: this.snap(doc), label }]; this.idx = 0; }
  push(doc, label = 'Edit', coalesce = '') {
    const s = this.snap(doc);
    if (this.idx >= 0 && this.stack[this.idx].s === s) return false;
    this.stack.length = this.idx + 1;
    if (coalesce && this.idx > 0 && this.stack[this.idx].co === coalesce) { this.stack[this.idx] = { s, label, co: coalesce }; return true; }
    this.stack.push({ s, label, co: coalesce });
    if (this.stack.length > this.limit) this.stack.shift();
    this.idx = this.stack.length - 1;
    return true;
  }
  get canUndo() { return this.idx > 0; }
  get canRedo() { return this.idx < this.stack.length - 1; }
  get undoLabel() { return this.canUndo ? this.stack[this.idx].label : ''; }
  get redoLabel() { return this.canRedo ? this.stack[this.idx + 1].label : ''; }
  /** Returns the restored document (assets carried over from `doc`) or null. */
  undo(doc) { if (!this.canUndo) return null; this.idx--; return this.restore(doc); }
  redo(doc) { if (!this.canRedo) return null; this.idx++; return this.restore(doc); }
  restore(doc) { const d = JSON.parse(this.stack[this.idx].s); d.assets = doc.assets; return d; }
}

/* ---------------- object geometry & arrange ---------------- */
function objBox(o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }
function unionBox(boxes) {
  if (!boxes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of boxes) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Align objects (in place) to the selection bounds or, with one object / toLabel, to the label. */
function alignObjects(objs, how, ref) {
  for (const o of objs) {
    if (o.locked) continue;
    if (how === 'left') o.x = ref.x;
    else if (how === 'right') o.x = ref.x + ref.w - o.w;
    else if (how === 'hcenter') o.x = ref.x + (ref.w - o.w) / 2;
    else if (how === 'top') o.y = ref.y;
    else if (how === 'bottom') o.y = ref.y + ref.h - o.h;
    else if (how === 'vcenter') o.y = ref.y + (ref.h - o.h) / 2;
    o.x = round(o.x); o.y = round(o.y);
  }
}
/** Distribute with equal gaps between objects (needs 3+). */
function distributeObjects(objs, axis) {
  const list = objs.filter((o) => !o.locked);
  if (list.length < 3) return false;
  const k = axis === 'h' ? 'x' : 'y', s = axis === 'h' ? 'w' : 'h';
  list.sort((a, b) => a[k] - b[k]);
  const first = list[0], last = list[list.length - 1];
  const total = last[k] + last[s] - first[k], used = list.reduce((a, o) => a + o[s], 0);
  const gap = (total - used) / (list.length - 1);
  let p = first[k] + first[s] + gap;
  for (let i = 1; i < list.length - 1; i++) { list[i][k] = round(p); p += list[i][s] + gap; }
  return true;
}
/** Z-order: front/back/forward/backward. objects[] is back→front. */
function reorder(doc, ids, how) {
  const set = new Set(ids), arr = doc.objects;
  if (how === 'front') doc.objects = arr.filter((o) => !set.has(o.id)).concat(arr.filter((o) => set.has(o.id)));
  else if (how === 'back') doc.objects = arr.filter((o) => set.has(o.id)).concat(arr.filter((o) => !set.has(o.id)));
  else if (how === 'forward') { for (let i = arr.length - 2; i >= 0; i--) if (set.has(arr[i].id) && !set.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; }
  else if (how === 'backward') { for (let i = 1; i < arr.length; i++) if (set.has(arr[i].id) && !set.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]]; }
}
function groupObjects(doc, ids) { if (ids.length < 2) return null; const g = uid('g'); for (const o of doc.objects) if (ids.includes(o.id)) o.group = g; return g; }
function ungroupObjects(doc, ids) { const gs = new Set(doc.objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group)); for (const o of doc.objects) if (gs.has(o.group)) o.group = null; return gs.size; }
/** Expand a selection to whole groups. */
function expandGroups(doc, ids) { const gs = new Set(doc.objects.filter((o) => ids.includes(o.id) && o.group).map((o) => o.group)); return doc.objects.filter((o) => ids.includes(o.id) || (o.group && gs.has(o.group))).map((o) => o.id); }
function snapTo(v, grid) { return grid > 0 ? round(Math.round(v / grid) * grid) : v; }
/** Rotate a point about a centre by a multiple of 90°. */
function rot90(px, py, cx, cy, deg) {
  const dx = px - cx, dy = py - cy;
  switch (((deg % 360) + 360) % 360) { case 90: return [cx - dy, cy + dx]; case 180: return [cx - dx, cy - dy]; case 270: return [cx + dy, cy - dx]; default: return [px, py]; }
}

/* ---------------- project files ---------------- */
function serializeProject(doc) { return JSON.stringify(Object.assign({ app: 'sloplabel', version: 1 }, doc), null, 1); }
function parseProject(text) {
  const d = JSON.parse(text);
  if (!d || d.app !== 'sloplabel' || !d.label || !Array.isArray(d.objects)) throw new Error('Not a SlopLabel project (.sloplabel)');
  return normalizeDoc(d);
}
/** Fill in defaults for older or hand-written documents. */
function normalizeDoc(d) {
  const base = newDoc();
  d.label = Object.assign(base.label, d.label || {});
  if (!Array.isArray(d.label.margin)) d.label.margin = [1.5, 1.5, 1.5, 1.5];
  d.stock = d.stock || base.stock;
  d.printer = Object.assign(base.printer, d.printer || {});
  d.grid = Object.assign(base.grid, d.grid || {});
  d.unit = UNITS[d.unit] ? d.unit : 'mm';
  d.dpi = [152, 203, 300, 600].includes(+d.dpi) ? +d.dpi : 203;
  d.vars = Array.isArray(d.vars) ? d.vars : [];
  d.assets = d.assets || {};
  d.objects = d.objects.map((o) => Object.assign({ id: uid(), rot: 0, locked: false, hidden: false, group: null }, deepClone(OBJ_DEFAULTS[o.type] || {}), o));
  d.name = d.name || 'Untitled label';
  return d;
}
