/* PhotoSlop for the assistant: every toolbox tool, driven through the tool's OWN pointer handlers (tools/*.js down, move,
 * up, dblclick), the same code a mouse or pen runs; nothing here paints by itself. The tool list and each tool's options
 * come from the registry (TOOLS, defTool) and the tool settings (T, tools/state.js), so a new tool is covered without a
 * change here. One use is one history step (aiOneStep). Also transform_layer (Free Transform's own state and commit).
 *   psToolOptKey(id)        the T key that holds a tool's options ('marquee' → 'select', 'eyedropper' → 'eyedrop')
 *   psToolOptions(id)       { name: 'number' | 'boolean' | 'string' } of a tool's options, read from T
 *   psSetToolOptions(id, o) checks and applies options (and fg / bg colours); returns notes
 *   aiUseTool(a)            { tool, points, options, shift, alt, source, text, apply } → the tool's result sentence
 * Loaded on demand by SlopCmd.prepare() (app/commands.js). */
'use strict';

const PS_SEL_TOOLS = ['marquee', 'ellipse', 'lasso', 'polylasso'];
const PS_FRACTIONS = new Set(['hardness', 'opacity', 'flow', 'strength', 'exposure', 'spacing']);
function psToolOptKey(id) { return PS_SEL_TOOLS.includes(id) ? 'select' : id === 'eyedropper' ? 'eyedrop' : T[id] ? id : null; }
function psToolOptions(id) {
  const k = psToolOptKey(id), out = {};
  if (k) for (const [n, v] of Object.entries(T[k])) out[n] = typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string';
  return out;
}
/** The tools and their options, as one line each, for the command's description and for list_tools. */
function psToolCatalog() {
  return TOOLS.map((t) => ({ id: t.id, name: t.short, options: Object.entries(psToolOptions(t.id)).map(([n, ty]) => `${n} (${ty}${PS_FRACTIONS.has(n) ? ' 0–1 or %' : ''})`) }));
}
function psSetToolOptions(id, o = {}) {
  const k = psToolOptKey(id), have = k ? T[k] : {}, notes = [], A = window.SlopCmdArgs;
  for (const [n, raw] of Object.entries(o || {})) {
    if (n === 'color' || n === 'fg' || n === 'foreground' || n === 'bg' || n === 'background') {
      const c = A.toColor(raw); if (!c) throw new Error(`“${raw}” is not a colour`);
      setColor(n === 'bg' || n === 'background' ? 'bg' : 'fg', c); continue;
    }
    if (!(n in have)) { notes.push(`${id} has no option “${n}” (it has: ${Object.keys(have).join(', ') || 'none'})`); continue; }
    const ty = typeof have[n];
    if (ty === 'number') {
      let v = A.toNumber(raw); if (!Number.isFinite(v)) throw new Error(`${n} must be a number`);
      if (PS_FRACTIONS.has(n) && v > 1) v /= 100;
      have[n] = PS_FRACTIONS.has(n) ? Math.max(0, Math.min(1, v)) : Math.max(0, Math.min(5000, v));
    } else if (ty === 'boolean') have[n] = /^(true|yes|on|1)$/i.test(String(raw));
    else have[n] = String(raw).slice(0, 100);
  }
  if (k) { saveToolOptions(); emit('options'); }
  return notes;
}

const psEv = (type, p, a) => ({ type, shiftKey: !!a.shift, altKey: !!a.alt, ctrlKey: false, metaKey: false, button: 0, buttons: type === 'pointerup' ? 0 : 1,
  pointerType: p.pressure != null ? 'pen' : 'mouse', pressure: p.pressure == null ? 0.5 : p.pressure, target: V.el, preventDefault() {}, stopPropagation() {} });
const psPt = (p) => ({ x: p.x, y: p.y, pressure: p.pressure == null ? 1 : Math.max(0, Math.min(1, p.pressure)), pen: p.pressure != null });

async function aiUseTool(a) {
  await aiSettle();
  const t = TOOL[a.tool];
  if (!t) throw new Error(`No tool “${a.tool}”. Tools: ${TOOLS.map((x) => x.id).join(', ')}`);
  const pts = psPoints(a.points);
  if (!pts.length && a.tool !== 'crop') throw new Error('Give points: [[x, y], …] in document pixels (one point is a click)');
  selectTool(a.tool);
  const notes = psSetToolOptions(a.tool, a.options);
  const before = Hist.idx, fgBefore = C.fg;
  const result = await aiOneStep(t.short, async () => {
    if (a.source) { const s = psPoints([a.source])[0]; if (!s) throw new Error('source must be [x, y]'); t.down(psPt(s), psEv('pointerdown', s, { alt: true })); if (t.up) t.up(psPt(s), psEv('pointerup', s, { alt: true })); }
    if (a.tool === 'polylasso') {
      for (const p of pts) t.down(psPt(p), psEv('pointerdown', p, a));
      t.finish();
    } else if (pts.length) {
      const [p0] = pts, last = pts[pts.length - 1];
      if (t.down) t.down(psPt(p0), psEv('pointerdown', p0, a));
      if (t.move) for (const p of pts.slice(1)) t.move(psPt(p), psEv('pointermove', p, a));
      if (t.up) t.up(psPt(last), psEv('pointerup', last, a));
    }
    if (a.tool === 'type') {
      if (!TE.el) throw new Error('The type tool did not open a text box there');
      if (a.text != null) TE.el.textContent = String(a.text).slice(0, 5000);
      await endTypeEdit();
    }
    if (a.tool === 'crop' && a.apply !== false) t.apply();
    dirty(true);
  });
  const did = Hist.idx > before ? Hist.states[Hist.idx].label : null;
  const bits = [did ? `Done: ${did}.` : `Used the ${t.short} (no change to the picture).`]; // i18n-ignore: the assistant's commands, their docs and replies are API
  if (a.tool === 'eyedropper') bits.push(`Picked ${C.fg}${C.fg === fgBefore ? ' (the same colour as before)' : ''}.`); // i18n-ignore: the assistant's commands, their docs and replies are API
  if (PS_SEL_TOOLS.includes(a.tool) || a.tool === 'wand') bits.push(D.sel ? `Selection: ${D.sel.bounds.w} × ${D.sel.bounds.h} px at ${D.sel.bounds.x}, ${D.sel.bounds.y}.` : 'Nothing is selected.'); // i18n-ignore: the assistant's commands, their docs and replies are API
  if (did && ['shape', 'type', 'move'].includes(a.tool)) bits.push(psBoundsNote('The layer', psLayerBounds(activeLayer())).trim()); // i18n-ignore: the assistant's commands, their docs and replies are API
  if (notes.length) bits.push('Note: ' + notes.join('; ') + '.'); // i18n-ignore: the assistant's commands, their docs and replies are API
  return result || bits.join(' ');
}

/** Free Transform with numbers: scale (%), rotation (degrees, clockwise) and a move (px), applied in one step. */
async function aiTransformLayer(a) {
  await aiSettle();
  aiLayer();
  startTransform();
  if (!TRANSFORM.active) throw new Error('Nothing to transform: the layer is empty there');
  const tf = TRANSFORM;
  tf.sx = (a.scale_x != null ? a.scale_x : a.scale != null ? a.scale : 100) / 100;
  tf.sy = (a.scale_y != null ? a.scale_y : a.scale != null ? a.scale : 100) / 100;
  tf.rot = ((a.rotate || 0) * Math.PI) / 180;
  tf.tx = a.move_x || 0; tf.ty = a.move_y || 0;
  if (a.interpolation) tf.interp = a.interpolation;
  await aiOneStep(tr('photoslop.ai.step_free_transform'), () => commitTransform());
  const L = activeLayer();
  return `Transformed “${L.name}”: ${Math.round(tf.sx * 100)}% × ${Math.round(tf.sy * 100)}%, ${a.rotate || 0}°, moved ${tf.tx}, ${tf.ty} px.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}
