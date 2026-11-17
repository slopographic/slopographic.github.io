/* PhotoSlop for the assistant: the operations behind the AI commands (ai-commands.js), the state summary and the
 * checkpoint for "Undo all AI changes". Loaded on demand by SlopCmd.prepare() (app/commands.js), never at boot.
 * Every operation is exactly one history step (aiOneStep), so Ctrl+Z undoes one AI command. Errors are thrown with a
 * plain message; the panel shows them on the step. */
'use strict';

/** Runs fn as one history step called label: several commits are folded into one, none leaves history alone. */
async function aiOneStep(label, fn) {
  const tab = CUR, ref = Hist.states[Hist.idx];
  const r = await fn();
  if (CUR !== tab) return r;
  const b = Hist.states.indexOf(ref), n = Hist.idx - b;
  if (b < 0 || n < 1) return r;
  if (n > 1) { Hist.states.splice(b + 1, n - 1); Hist.idx = b + 1; }
  if (label) Hist.states[Hist.idx].label = label;
  emit('history');
  return r;
}
/** The active layer, or an error that says why the operation cannot run on it. */
function aiLayer(forPixels = true) {
  const L = activeLayer();
  if (!L) throw new Error('There is no layer to work on');
  if (forPixels && L.locked) throw new Error(`The layer “${L.name}” is locked`);
  if (forPixels && !L.visible) throw new Error(`The layer “${L.name}” is hidden; show it first`);
  return L;
}
async function aiSettle() { if (TE.el) await endTypeEdit(); if (TRANSFORM.active) commitTransform(); }
/** A filter from the catalog with the given parameters (the rest at their defaults): one step, or an error. */
async function aiFilter(id, params, label) {
  const f = FILTER_BY_ID[id];
  if (!f) throw new Error('No filter ' + id);
  await aiSettle(); aiLayer();
  const full = {};
  for (const p of f.params || []) if (p.k && p.type !== 'histogram') full[p.k] = p.v === '@fg' ? C.fg : p.v === '@bg' ? C.bg : JSON.parse(JSON.stringify(p.v === undefined ? null : p.v));
  Object.assign(full, params || {});
  const before = Hist.idx;
  await aiOneStep(label || f.name.replace('…', ''), () => runFilter(id, full));
  if (Hist.idx === before) throw new Error(`${f.name.replace('…', '')} did not apply`);
}

const LEVELS_PRESETS = { brighten: { gamma: 1.4 }, darken: { gamma: 0.72 }, 'more-contrast': { inB: 22, inW: 233 }, 'less-contrast': { outB: 24, outW: 232 }, 'lift-shadows': { outB: 30 } };
const P2 = (pts) => pts.map(([x, y]) => [x, y]);
const CURVES_PRESETS = { 'more-contrast': P2([[0, 0], [64, 48], [192, 208], [255, 255]]), 'less-contrast': P2([[0, 0], [64, 80], [192, 176], [255, 255]]),
  brighten: P2([[0, 0], [128, 160], [255, 255]]), darken: P2([[0, 0], [128, 98], [255, 255]]), fade: P2([[0, 36], [128, 132], [255, 230]]), invert: P2([[0, 255], [255, 0]]) };
function curvesParam(rgb) { const id = [[0, 0], [255, 255]]; return { rgb, r: id, g: id, b: id }; }

/** Where content landed, and a plain warning when it runs past the canvas: { x, y, w, h } in document px → a sentence. */
function psBoundsNote(what, b) {
  if (!b) return '';
  const cut = { left: Math.max(0, -b.x), right: Math.max(0, b.x + b.w - D.w), top: Math.max(0, -b.y), bottom: Math.max(0, b.y + b.h - D.h) };
  let s = ` It covers ${Math.round(b.w)} × ${Math.round(b.h)} px at ${Math.round(b.x)}, ${Math.round(b.y)}.`; // i18n-ignore: the assistant's commands, their docs and replies are API
  const side = (a, z, size, dim, word) => {
    if (!a && !z) return '';
    const big = size > dim ? `${what} is ${Math.round(size)} px ${word}, ${word === 'wide' ? 'wider' : 'taller'} than the ${dim} px canvas; ` : `${what} runs past the canvas: `;
    return a && z && Math.abs(a - z) < 2 ? `${big}${Math.round(a)} px is cut off on each side.` : `${big}${[a ? `${Math.round(a)} px is cut off on the ${word === 'wide' ? 'left' : 'top'}` : '', z ? `${Math.round(z)} px on the ${word === 'wide' ? 'right' : 'bottom'}` : ''].filter(Boolean).join(' and ')}.`;
  };
  const warn = [side(cut.left, cut.right, b.w, D.w, 'wide'), side(cut.top, cut.bottom, b.h, D.h, 'tall')].filter(Boolean);
  if (warn.length) s += ' Warning: ' + warn.join(' ') + ' Use fit: true, a smaller size or another position to keep it all on the canvas.'; // i18n-ignore: the assistant's commands, their docs and replies are API
  return s;
}
/** The document-space bounds of a layer's visible pixels. */
function psLayerBounds(L) { const b = L && alphaBounds(L.canvas); return b ? { x: L.x + b.x, y: L.y + b.y, w: b.w, h: b.h } : null; }

/** Text layer from the assistant: placed by name ('center', 'top-left' …) or by x/y in document px. fit: shrink the size
 *  until the text fits inside the canvas margins. */
async function aiAddText(a) {
  await aiSettle();
  const t = normText({ str: a.text, x: 0, y: 0, font: a.font || T.type.font, size: a.size, bold: a.bold, color: a.color });
  await loadTextFonts(t);
  let r0 = renderTextCanvas(t);
  const m = Math.round(Math.min(D.w, D.h) * 0.04);
  if (a.fit) {
    const k = Math.min(1, (D.w - 2 * m) / r0.canvas.width, (D.h - 2 * m) / r0.canvas.height);
    if (k < 1) { t.size = Math.max(4, Math.floor(t.size * k * 0.98)); r0 = renderTextCanvas(t); }
  }
  const w = r0.canvas.width, hh = r0.canvas.height, pos = String(a.position || 'center');
  let bx = (D.w - w) / 2, by = (D.h - hh) / 2;
  if (/left/.test(pos)) bx = m; if (/right/.test(pos)) bx = D.w - w - m;
  if (/^top/.test(pos)) by = m; if (/^bottom/.test(pos)) by = D.h - hh - m;
  if (a.x != null) bx = a.x; if (a.y != null) by = a.y;
  t.x = Math.round(bx - r0.x); t.y = Math.round(by - r0.y);
  const r = renderTextCanvas(t);
  const L = await aiOneStep(tr('photoslop.ai.step_type_layer'), () => addLayer({ name: t.str.split('\n')[0].slice(0, 32), canvas: r.canvas, x: r.x, y: r.y, text: t }, tr('photoslop.ai.step_type_layer')));
  return `Added the text layer “${t.str.slice(0, 40)}” at ${Math.round(bx)}, ${Math.round(by)}, size ${t.size} px.` + psBoundsNote('The text', psLayerBounds(L) || { x: bx, y: by, w, h: hh }); // i18n-ignore: the assistant's commands, their docs and replies are API
}

async function aiExport(a) {
  await aiSettle();
  const fmt = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[a.format];
  const c = await renderExport(fmt, a.scale / 100, fmt === 'image/png' && a.transparent ? null : '#ffffff');
  const b = await canvasToBlob(c, fmt, a.quality / 100);
  if (!b || (fmt !== 'image/png' && b.type !== fmt)) throw new Error(`This browser cannot encode ${a.format.toUpperCase()}`);
  const name = safeName() + { png: '.png', jpeg: '.jpg', webp: '.webp' }[a.format];
  download(b, name);
  if (window.SlopSupport) SlopSupport.afterExport('photoslop');
  return `Exported ${name}, ${c.width} × ${c.height} px, ${Math.max(1, Math.round(b.size / 1024))} KB.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** Finds a layer by name (exact, then a part of the name, case-insensitive), or the active one when name is empty. */
function aiFindLayer(name) {
  if (!name) return aiLayer(false);
  const s = String(name).toLowerCase(), list = D.layers.slice().reverse();
  const L = list.find((l) => l.name.toLowerCase() === s) || list.find((l) => l.name.toLowerCase().includes(s));
  if (!L) throw new Error(`No layer called “${name}”. Layers: ${list.map((l) => l.name).join(', ')}`);
  return L;
}

const ANCHORS = { 'top-left': [0, 0], top: [0.5, 0], 'top-right': [1, 0], left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5], 'bottom-left': [0, 1], bottom: [0.5, 1], 'bottom-right': [1, 1] };
function aiCanvasSize(a) {
  const w = a.width || D.w, hh = a.height || D.h, [ax, ay] = ANCHORS[a.anchor] || ANCHORS.center;
  const fill = { transparent: null, background: C.bg, foreground: C.fg, white: '#ffffff', black: '#000000' }[a.fill];
  resizeCanvas(w, hh, Math.round((w - D.w) * ax), Math.round((hh - D.h) * ay), tr('photoslop.ai.step_canvas_size'), fill);
}
function aiImageSize(a) {
  let w = a.width, hh = a.height;
  if (!w && !hh) throw new Error('Give a width or a height in px');
  if (a.keep_aspect !== false) { if (w && !hh) hh = Math.round((D.h * w) / D.w); else if (hh && !w) w = Math.round((D.w * hh) / D.h); }
  imageSize(w || D.w, hh || D.h, a.resample);
  return `The image is now ${D.w} × ${D.h} px.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** What the assistant reads with app_state: small and plain. Layers are listed top first. */
function aiState() {
  const L = activeLayer(), b = D.sel && D.sel.bounds;
  return {
    app: 'PhotoSlop', document: { name: D.name, width: D.w, height: D.h, openDocuments: DOCS.length }, // i18n-ignore: the assistant's commands, their docs and replies are API
    layers: D.layers.slice().reverse().map((l) => ({ name: l.name, visible: l.visible, opacity: Math.round(l.opacity * 100), blend: l.blend,
      kind: l.text ? 'text' : l.shape ? 'shape' : 'pixels', mask: !!l.mask, locked: !!l.locked, active: l === L })),
    activeLayer: L ? L.name : null,
    selection: b ? { x: b.x, y: b.y, width: b.w, height: b.h } : null,
    activeTool: TOOL[UI.tool] ? TOOL[UI.tool].name : UI.tool,
    colors: { foreground: C.fg, background: C.bg },
    history: { steps: Hist.idx, last: Hist.states[Hist.idx] ? Hist.states[Hist.idx].label : null },
  };
}
/** "Undo all AI changes": back to the history step that was current when the request started (redo still works). */
function aiCheckpoint() {
  const tab = CUR, ref = tab && Hist.states[Hist.idx];
  return () => {
    if (!tab || !DOCS.includes(tab)) return false;
    if (CUR !== tab) switchToDoc(tab);
    const i = Hist.states.indexOf(ref);
    if (i < 0) return false;
    jumpHistory(i); D.dirty = true;
    return true;
  };
}
