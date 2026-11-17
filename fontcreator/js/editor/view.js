/* Slop Font: the glyph editor's canvas. Font units on screen (x right, y up, the baseline at 0), zoom and pan (wheel,
 * Ctrl+wheel or a pinch through the shared touch layer, the space bar or the middle button to pan), snapping (to the
 * grid and to the metric lines), the drag-in-progress copy of the outline (the "draft", committed as one undo step when
 * the pointer lifts) and the pointer events handed to the current tool (js/editor/select.js, js/editor/tools.js).
 * Classic script. FC.editor:
 *   mount(host)        the canvas in host                      paint()  redraw on the next frame
 *   fit()              the whole em and advance in view         zoomBy(f, sx?, sy?)
 *   toFont(sx, sy) / toScreen(x, y)   snap(pt, { free })        hitR() the pick radius in screen px (larger for a finger)
 *   draft() / setDraft(contours) / commit(label)                the outline being dragged and its one undo step
 *   contours()         what is drawn (the draft, else the glyph) focus() */
(function (g) {
  'use strict';
  const S = () => g.FC.state;
  let canvas = null, ctx = null, cam = { z: 0.5, ox: 0, oy: 0 }, draft = null, queued = false, fitted = null, spaceDown = false, pan = null;
  const coarse = () => g.matchMedia && g.matchMedia('(pointer: coarse)').matches;
  const hitR = () => (coarse() ? 22 : 7);
  const toFont = (sx, sy) => ({ x: (sx - cam.ox) / cam.z, y: (cam.oy - sy) / cam.z });
  const toScreen = (x, y) => ({ x: cam.ox + x * cam.z, y: cam.oy - y * cam.z });
  const contours = () => draft || S().view().contours;

  function size() {
    const r = canvas.parentElement.getBoundingClientRect(), dpr = g.devicePixelRatio || 1;
    const w = Math.max(50, Math.floor(r.width)), h = Math.max(50, Math.floor(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    }
    return { w, h, dpr };
  }
  function fit() {
    const { w, h } = size(), m = S().project().metrics, adv = Math.max(S().view().advance, m.upm * 0.4);
    const top = Math.max(m.ascender, m.capHeight) + m.upm * 0.08, bottom = m.descender - m.upm * 0.08;
    cam.z = Math.min((h - 40) / (top - bottom), (w - 80) / (adv + m.upm * 0.3));
    cam.ox = (w - adv * cam.z) / 2; cam.oy = 20 + top * cam.z;
    fitted = S().cur();
    paint();
  }
  function zoomBy(f, sx, sy) {
    const { w, h } = size(); sx = sx == null ? w / 2 : sx; sy = sy == null ? h / 2 : sy;
    const p = toFont(sx, sy), z = Math.max(0.02, Math.min(20, cam.z * f));
    cam.z = z; cam.ox = sx - p.x * z; cam.oy = sy + p.y * z;
    paint();
  }
  function snap(pt, opts = {}) {
    const st = S().settings();
    if (!st.snap || opts.free) return { x: Math.round(pt.x), y: Math.round(pt.y) };
    const grid = Math.max(1, st.grid || 10), m = S().project().metrics, tol = 8 / cam.z;
    let x = Math.round(pt.x / grid) * grid, y = Math.round(pt.y / grid) * grid;
    for (const v of [0, m.xHeight, m.capHeight, m.ascender, m.descender]) if (Math.abs(pt.y - v) < tol) y = v;
    for (const v of [0, S().view().advance]) if (Math.abs(pt.x - v) < tol) x = v;
    return { x, y };
  }
  function paint() {
    if (queued || !canvas) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const { w, h, dpr } = size();
      if (fitted !== S().cur()) { fit(); return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.FC.editorDraw.render(ctx, { w, h, cam, contours: contours(), glyph: S().view(), project: S().project(), sel: S().sel, tool: g.FC.tools && g.FC.tools.current() });
    });
  }
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
  function tool() { const T = g.FC.tools; return T ? T.current() : null; }
  /** The drag keeps the pointer (a pointer the browser no longer knows, from a script, is fine without). */
  function capture(e) { try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ } }
  function down(e) {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      pan = { x: e.clientX, y: e.clientY, ox: cam.ox, oy: cam.oy }; capture(e); e.preventDefault(); return;
    }
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    const t = tool(), l = local(e);
    if (t && t.down) { capture(e); t.down(Object.assign(l, { e, pt: toFont(l.sx, l.sy) })); e.preventDefault(); }
  }
  function move(e) {
    if (pan) { cam.ox = pan.ox + e.clientX - pan.x; cam.oy = pan.oy + e.clientY - pan.y; paint(); return; }
    const t = tool(), l = local(e);
    if (t && t.move) t.move(Object.assign(l, { e, pt: toFont(l.sx, l.sy) }));
  }
  function up(e) {
    if (pan) { pan = null; return; }
    const t = tool(), l = local(e);
    if (t && t.up) t.up(Object.assign(l, { e, pt: toFont(l.sx, l.sy) }));
  }
  function wheel(e) {
    e.preventDefault();
    const l = local(e);
    if (e.ctrlKey || e.metaKey) zoomBy(Math.exp(-e.deltaY / 300), l.sx, l.sy);
    else { cam.ox -= e.deltaX; cam.oy -= e.deltaY; paint(); }
  }
  function setDraft(c) { draft = c; paint(); }
  function commit(label) {
    if (!draft) return;
    const c = draft;
    draft = null;
    S().edit(label, 'glyph', (p, gl) => { gl.contours = g.SlopFont.paths.clean(c); });
    paint();
  }
  function mount(host) {
    canvas = document.createElement('canvas');
    canvas.id = 'fc-canvas'; canvas.className = 'fc-canvas'; canvas.tabIndex = 0;
    g.FC.mark(canvas, { 'aria-label': 'fontcreator.ops.canvas_label' });
    canvas.setAttribute('data-touch-surface', 'wheel');
    host.append(canvas);
    ctx = canvas.getContext('2d');
    if (g.SlopTouch && g.SlopTouch.surface) g.SlopTouch.surface(canvas, { wheel: true });
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { pan = null; const t = tool(); if (t && t.cancel) t.cancel(e); draft = null; paint(); });
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', (e) => { const t = tool(), l = local(e); if (t && t.dbl) t.dbl(Object.assign(l, { e, pt: toFont(l.sx, l.sy) })); });
    canvas.addEventListener('keydown', (e) => { if (e.key === ' ') { spaceDown = true; e.preventDefault(); } const t = tool(); if (t && t.key) t.key(e); });
    canvas.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
    if (g.ResizeObserver) new ResizeObserver(() => fit()).observe(host);
    S().on((e) => { if (e.what === 'select' || e.what === 'project') { draft = null; fitted = null; } paint(); });
    fit();
  }
  g.FC.editor = { mount, paint, fit, zoomBy, toFont, toScreen, snap, hitR, draft: () => draft, setDraft, commit, contours, cam: () => cam,
    focus: () => canvas && canvas.focus({ preventScroll: true }), canvas: () => canvas };
})(window);
