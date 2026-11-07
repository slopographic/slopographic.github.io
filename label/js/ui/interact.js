/* SlopLabel — ui/interact: tools, hit testing, move/resize with grid snap and smart guides,
 * creating objects by click or drag, marquee selection, pan, wheel and pinch zoom. */
'use strict';

const TOOLS = [
  { id: 'select', get name() { return LT('label.interact.select'); }, key: 'V', svg: '<path d="M5 3l12 8-5 1.2 3 5.8-2.4 1.2-3-5.8L5 17z" fill="currentColor"/>' },
  { id: 'hand', get name() { return LT('label.interact.hand_pan'); }, key: 'H', svg: '<path d="M7 11V5.5a1.5 1.5 0 013 0V10m0-5.5V4a1.5 1.5 0 013 0v6m0-4.5a1.5 1.5 0 013 0V11m0-3a1.5 1.5 0 013 0v5c0 4-3 7-6.5 7S7 18 5.5 15.5L3.8 12.6a1.4 1.4 0 012.3-1.6L7 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' },
  '-',
  { id: 'text', get name() { return LT('label.menu.text'); }, key: 'T', create: 'text', svg: '<path d="M5 5h14M12 5v14M9 19h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>' },
  { id: 'para', get name() { return LT('label.interact.paragraph_wrapping_text_box'); }, key: 'P', create: 'para', svg: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>' },
  { id: 'barcode', get name() { return LT('label.interact.barcode'); }, key: 'B', create: 'barcode', svg: '<path d="M4 5v14M6.5 5v14M8 5v14M11 5v14M13.5 5v14M15 5v14M17.5 5v14M20 5v14" stroke="currentColor" stroke-width="1.4" fill="none"/>' },
  { id: 'qr', name: 'QR / 2D code', key: 'Q', create: 'barcode', svg: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 6h2v2H6zM16 6h2v2h-2zM6 16h2v2H6zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" fill="currentColor"/>' },
  { id: 'image', get name() { return LT('label.ptypes.image'); }, key: 'I', create: 'image', svg: '<rect x="3.5" y="5" width="17" height="14" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="10" r="1.7" fill="currentColor"/><path d="M4 17l5-5 3.5 3.5L15 13l5 4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>' },
  '-',
  { id: 'rect', get name() { return LT('label.menu.box'); }, key: 'R', create: 'rect', svg: '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
  { id: 'line', get name() { return LT('label.menu.line'); }, key: 'L', create: 'line', svg: '<path d="M4 19L20 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { id: 'ellipse', get name() { return LT('label.menu.ellipse'); }, key: 'E', create: 'ellipse', svg: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' },
  { id: 'inverse', get name() { return LT('label.interact.inverse_box_reverse_print'); }, key: 'N', create: 'inverse', svg: '<rect x="4" y="6" width="16" height="12" fill="currentColor"/><path d="M8 12h8" stroke="var(--bg-panel)" stroke-width="2"/>' },
];
const toolById = (id) => TOOLS.find((t) => t && t.id === id);
function setTool(id) {
  if (!toolById(id)) return;
  App.tool = id;
  document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
  const st = $('stage');
  st.classList.toggle('tool-hand', id === 'hand');
  st.classList.toggle('tool-create', !!toolById(id).create);
  status(toolById(id).name + (toolById(id).create ? ': click to place, or drag to draw a box' : ''));
}

/* ---------------- hit testing ---------------- */
function hitTest(x, y) {
  const tol = 4 / App.zoom;
  for (let i = App.scene.length - 1; i >= 0; i--) {
    const it = App.scene[i], o = it.obj, b = it.box;
    if (o.locked) continue;
    if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return o;
  }
  return null;
}
/** e: the pointer event: a finger gets about 44 px around a handle (SlopTouch.hit), a mouse 3 px. */
function hitHandle(sx, sy, e) {
  const o = selOne(); if (!o || o.locked) return -1;
  const pad = e && window.SlopTouch ? Math.max(3, SlopTouch.hit(e, 3) - 4) : 3;
  for (const h of handleRects(boxOf(o))) if (sx >= h.x - pad && sx <= h.x + h.w + pad && sy >= h.y - pad && sy <= h.y + h.h + pad) return h.k;
  return -1;
}
const HANDLE_CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

/* ---------------- snapping ---------------- */
/** Snap a moving box: smart guides to the label, margins and other objects, else the grid. */
function snapBox(b, exclude, noSnap) {
  App.guides = [];
  if (noSnap) return [0, 0];
  const L = App.doc.label, m = L.margin || [0, 0, 0, 0], tol = 6 / App.zoom;
  const xs = [0, L.w / 2, L.w, m[3], L.w - m[1]], ys = [0, L.h / 2, L.h, m[0], L.h - m[2]];
  for (const it of App.scene) { if (exclude.has(it.obj.id) || it.obj.hidden) continue; const c = it.box; xs.push(c.x, c.x + c.w / 2, c.x + c.w); ys.push(c.y, c.y + c.h / 2, c.y + c.h); }
  const best = (vals, edges) => { let r = null; for (const e of edges) for (const v of vals) { const dd = v - e; if (Math.abs(dd) <= tol && (!r || Math.abs(dd) < Math.abs(r.d))) r = { d: dd, v }; } return r; };
  const bx = best(xs, [b.x, b.x + b.w / 2, b.x + b.w]), by = best(ys, [b.y, b.y + b.h / 2, b.y + b.h]);
  let dx = 0, dy = 0;
  const gs = App.doc.grid.snap ? +App.doc.grid.size || 0 : 0;
  if (bx) { dx = bx.d; App.guides.push({ axis: 'x', v: bx.v }); } else if (gs) dx = snapTo(b.x, gs) - b.x;
  if (by) { dy = by.d; App.guides.push({ axis: 'y', v: by.v }); } else if (gs) dy = snapTo(b.y, gs) - b.y;
  return [dx, dy];
}

/* ---------------- pointer handling ---------------- */
let Drag = null;
const pointers = new Map();
let spaceDown = false;
function onPointerDown(e) {
  const st = $('stage');
  st.focus({ preventScroll: true });
  pointers.set(e.pointerId, stagePoint(e));
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;
  try { st.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or finished pointer */ }
  const [sx, sy] = stagePoint(e), [x, y] = toMMpt(e), tool = toolById(App.tool);
  if (e.button === 1 || App.tool === 'hand' || spaceDown) { Drag = { mode: 'pan', sx, sy, px: App.panX, py: App.panY }; st.classList.add('panning'); return; }
  if (e.button === 2) return;
  if (tool.create) { Drag = { mode: 'create', x0: x, y0: y, x, y, sx, sy, tool }; return; }
  const hk = hitHandle(sx, sy, e);
  if (hk >= 0) { const o = selOne(); Drag = { mode: 'resize', k: hk, o, start: deepClone(o), box: { ...boxOf(o) }, x0: x, y0: y }; return; }
  const hit = hitTest(x, y);
  if (hit) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) { select([hit.id], true); return; }
    if (!App.sel.includes(hit.id)) select([hit.id]);
    const objs = selObjs().filter((o) => !o.locked);
    Drag = { mode: 'move', x0: x, y0: y, objs, starts: objs.map((o) => [o.x, o.y]), box: { ...selBox() }, moved: false };
    return;
  }
  if (e.pointerType === 'touch') { Drag = { mode: 'pan', sx, sy, px: App.panX, py: App.panY, tap: true }; return; } // a tap (no pan) clears the selection
  Drag = { mode: 'marquee', x0: x, y0: y, add: e.shiftKey, base: e.shiftKey ? App.sel.slice() : [] };
  if (!e.shiftKey) App.sel = [];
}
function onPointerMove(e) {
  const p = stagePoint(e);
  V.pointer = p;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
  if (Drag && Drag.mode === 'pinch') { movePinch(); return; }
  const [x, y] = toMMpt(e);
  $('stPos').textContent = `${fmtLen(x, U(), App.doc.dpi, false)}, ${fmtLen(y, U(), App.doc.dpi)}`;
  if (!Drag) {
    const hk = hitHandle(p[0], p[1]), hit = hk < 0 && !toolById(App.tool).create ? hitTest(x, y) : null;
    $('stage').style.cursor = hk >= 0 ? HANDLE_CURSORS[hk] : hit && App.tool === 'select' ? 'move' : '';
    const hv = hit ? hit.id : null;
    if (hv !== App.hover) { App.hover = hv; drawView(); } else drawRulers();
    return;
  }
  if (Drag.mode === 'pan') { App.panX = Drag.px + p[0] - Drag.sx; App.panY = Drag.py + p[1] - Drag.sy; drawView(); return; }
  if (Drag.mode === 'create') { Drag.x = x; Drag.y = y; App.ghost = normRect(Drag.x0, Drag.y0, x, y); drawView(); return; }
  if (Drag.mode === 'marquee') {
    App.marquee = normRect(Drag.x0, Drag.y0, x, y);
    const m = App.marquee, inside = App.scene.filter((it) => !it.obj.locked && !it.obj.hidden && it.box.x < m.x + m.w && it.box.x + it.box.w > m.x && it.box.y < m.y + m.h && it.box.y + it.box.h > m.y).map((it) => it.obj.id);
    App.sel = [...new Set([...Drag.base, ...expandGroups(App.doc, inside)])];
    drawView(); return;
  }
  if (Drag.mode === 'move') {
    let dx = x - Drag.x0, dy = y - Drag.y0;
    if (!Drag.moved && Math.hypot(dx, dy) * App.zoom < 3) return;
    Drag.moved = true;
    if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const b = { ...Drag.box, x: Drag.box.x + dx, y: Drag.box.y + dy };
    const [sdx, sdy] = snapBox(b, new Set(Drag.objs.map((o) => o.id)), e.altKey);
    Drag.objs.forEach((o, i) => { o.x = round(Drag.starts[i][0] + dx + sdx, 3); o.y = round(Drag.starts[i][1] + dy + sdy, 3); });
    rebuildScene(); drawView(); return;
  }
  if (Drag.mode === 'resize') { resizeDrag(x, y, e); rebuildScene(); drawView(); }
}
function onPointerUp(e) {
  pointers.delete(e.pointerId);
  $('stage').classList.remove('panning');
  const D0 = Drag; Drag = null;
  App.guides = []; App.marquee = null; App.ghost = null;
  if (!D0) return;
  if (D0.mode === 'pinch') { if (pointers.size < 2) Drag = null; refresh({ keepProps: true }); return; }
  if (D0.mode === 'pan') { if (D0.tap && e.type === 'pointerup' && Math.hypot(App.panX - D0.px, App.panY - D0.py) < 4 && App.sel.length) { select([]); return; } refresh({ keepProps: true }); return; }
  if (D0.mode === 'marquee') { refresh(); return; }
  if (D0.mode === 'move') { if (D0.moved) commit(D0.objs.length > 1 ? LT('label.interact.move_objects') : LT('label.interact.move')); else refresh(); return; }
  if (D0.mode === 'resize') { syncAutoSize(App.doc, D0.o, previewGet()); commit(LT('label.interact.resize')); return; }
  if (D0.mode === 'create') createFromDrag(D0);
}
const normRect = (x0, y0, x1, y1) => ({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });

function resizeDrag(x, y, e) {
  const { k, o, start, box } = Drag, gs = App.doc.grid.snap && !e.altKey ? +App.doc.grid.size || 0 : 0;
  const sx = (v) => (gs ? snapTo(v, gs) : round(v, 3));
  let x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  if ([0, 6, 7].includes(k)) x0 = Math.min(sx(x), x1 - 0.5);
  if ([2, 3, 4].includes(k)) x1 = Math.max(sx(x), x0 + 0.5);
  if ([0, 1, 2].includes(k)) y0 = Math.min(sx(y), y1 - 0.5);
  if ([4, 5, 6].includes(k)) y1 = Math.max(sx(y), y0 + 0.5);
  if (e.shiftKey && [0, 2, 4, 6].includes(k) && box.w && box.h) {
    const s = Math.max((x1 - x0) / box.w, (y1 - y0) / box.h);
    if (k === 0 || k === 6) x0 = x1 - box.w * s; else x1 = x0 + box.w * s;
    if (k === 0 || k === 2) y0 = y1 - box.h * s; else y1 = y0 + box.h * s;
  }
  const nw = x1 - x0, nh = y1 - y0, quarter = (start.rot || 0) % 180 !== 0;
  if (o.type === 'barcode') {
    const fx = nw / box.w, fy = nh / box.h, wFactor = quarter ? fy : fx;
    const S = SYM[o.symbology];
    if (S && S.kind === '2d') { const f = [0, 2, 4, 6].includes(k) ? Math.max(fx, fy) : [3, 7].includes(k) ? fx : fy; o.module = round(clamp(start.module * f, 0.1, 5), 3); }
    else {
      const cx = [0, 2, 3, 4, 6, 7].includes(k), cy = [0, 1, 2, 4, 5, 6].includes(k);
      if (quarter ? cy : cx) o.module = round(clamp(start.module * wFactor, 0.1, 3), 3);
      if (quarter ? cx : cy) o.barHeight = round(clamp(start.barHeight + (quarter ? nw - box.w : nh - box.h), 2, 400), 2);
    }
    o.x = round(x0, 3); o.y = round(y0, 3);
  } else if ((o.type === 'text' || o.type === 'para') && o.fit === 'grow') {
    const f = [3, 7].includes(k) ? nw / box.w : nh / box.h;
    o.size = round(clamp(start.size * f, 2, 400), 1);
    o.x = round(x0, 3); o.y = round(y0, 3);
  } else { o.x = round(x0, 3); o.y = round(y0, 3); o.w = round(nw, 3); o.h = round(nh, 3); }
  syncAutoSize(App.doc, o, previewGet());
  // keep the dragged edge put for auto-sized objects anchored on the opposite side
  if (o.type === 'barcode' || o.fit === 'grow') { if ([0, 6, 7].includes(k)) o.x = round(x1 - o.w, 3); if ([0, 1, 2].includes(k)) o.y = round(y1 - o.h, 3); }
}

/* ---------------- creating objects ---------------- */
function defaultsFor(toolId) {
  if (toolId === 'qr') return { symbology: 'qrcode', content: 'https://slopographic.com', module: 0.5, hr: 'none', name: 'QR code' };
  if (toolId === 'barcode') return { symbology: 'code128', content: 'SLOP-12345', name: 'Barcode' };
  return {};
}
async function createFromDrag(D0) {
  const t = D0.tool, r = normRect(D0.x0, D0.y0, D0.x, D0.y), dragged = r.w * App.zoom > 6 || r.h * App.zoom > 6;
  const gs = App.doc.grid.snap ? +App.doc.grid.size || 0 : 0, sn = (v) => (gs ? snapTo(v, gs) : round(v, 2));
  const props = Object.assign({ x: sn(r.x), y: sn(r.y) }, defaultsFor(t.id));
  const type = t.create;
  if (dragged && type !== 'barcode') Object.assign(props, { w: Math.max(0.5, sn(r.w) || r.w), h: Math.max(type === 'line' ? 0 : 0.5, sn(r.h) || r.h) });
  if (type === 'text' && dragged) Object.assign(props, { fit: 'box', wrap: true, shrink: true });
  if (type === 'line') {
    const dx = D0.x - D0.x0, dy = D0.y - D0.y0, s = 0.5;
    if (!dragged) Object.assign(props, { w: 30, h: s, dir: 'h', y: props.y - s / 2 });
    else if (Math.abs(dy) * App.zoom < 8 || Math.abs(dx) > Math.abs(dy) * 4) Object.assign(props, { h: s, dir: 'h', y: round(D0.y0 - s / 2, 3), w: Math.max(1, r.w) });
    else if (Math.abs(dx) * App.zoom < 8 || Math.abs(dy) > Math.abs(dx) * 4) Object.assign(props, { w: s, dir: 'v', x: round(D0.x0 - s / 2, 3), h: Math.max(1, r.h) });
    else props.dir = dx * dy > 0 ? 'd1' : 'd2';
    props.stroke = s;
  }
  setTool('select');
  if (type === 'image') { await insertImageFile(null, props); return; }
  addObject(makeObject(type, Object.assign(styleProps(App.doc, type), props)));
  if (type === 'text' || type === 'para') focusContent();
}
/** Place an image file as an object (with no file: the picker, a source of the intake, ui/intake.js). props may give x/y/w/h. */
async function insertImageFile(file, props = {}) {
  if (!file) { await pickImage(props); return null; }
  try {
    const a = await addImageAsset(App.doc, file);
    let w = props.w || Math.min(30, App.doc.label.w * 0.6), h = props.h || w / a.aspect;
    if (!props.h && h > App.doc.label.h * 0.8) { h = App.doc.label.h * 0.6; w = h * a.aspect; }
    const o = makeObject('image', Object.assign({ x: 3, y: 3 }, props, { w: round(w, 3), h: round(h, 3), asset: a.id, aspect: a.aspect, name: (file.name || LT('label.ptypes.image')).replace(/\.[^.]+$/, '') }));
    await preloadImages(App.doc);
    return addObject(o, LT('label.interact.place_image'));
  } catch (err) { SlopUI.toast(err.message); return null; }
}

/* ---------------- wheel & pinch ---------------- */
function onWheel(e) {
  e.preventDefault();
  const [sx, sy] = stagePoint(e);
  if (e.ctrlKey || e.metaKey) { zoomTo(App.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), sx, sy); return; }
  const k = e.deltaMode ? 16 : 1;
  App.panX -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k; App.panY -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
  drawView();
}
function startPinch() {
  const [a, b] = [...pointers.values()];
  Drag = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, z0: App.zoom, c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], px: App.panX, py: App.panY };
  App.marquee = null;
}
function movePinch() {
  const [a, b] = [...pointers.values()]; if (!a || !b) return;
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const z = clamp(Drag.z0 * (d / Drag.d0), 0.3, 120), mx = (Drag.c0[0] - Drag.px) / Drag.z0, my = (Drag.c0[1] - Drag.py) / Drag.z0;
  App.zoom = z; App.panX = c[0] - mx * z; App.panY = c[1] - my * z;
  drawView();
}
function initInteract() {
  const st = $('stage');
  st.setAttribute('data-touch-surface', 'nav'); // a touch surface (shared/input); the pinch above is the stage's own
  st.addEventListener('pointerdown', onPointerDown);
  st.addEventListener('pointermove', onPointerMove);
  st.addEventListener('pointerup', onPointerUp);
  st.addEventListener('pointercancel', onPointerUp);
  st.addEventListener('pointerleave', () => { V.pointer = null; if (App.hover) { App.hover = null; drawView(); } });
  st.addEventListener('wheel', onWheel, { passive: false });
  st.addEventListener('dblclick', (e) => { const [x, y] = toMMpt(e), o = hitTest(x, y); if (o) { select([o.id]); focusContent(); } else fitView(); });
  st.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const [x, y] = toMMpt(e), o = hitTest(x, y);
    if (o && !App.sel.includes(o.id)) select([o.id]);
    openContext(o, e.clientX, e.clientY);
  });
}
