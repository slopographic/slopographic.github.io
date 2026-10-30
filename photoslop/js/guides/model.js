/* PhotoSlop guides: document guides (D.guides, undoable), view settings and snapping.
 * Guides are { o: 'v' | 'h', pos } in document pixels (see shared/guides). D.guides is treated as
 * immutable: every change makes a new array and commits one history step. */
'use strict';

const GUIDE_PREFS = {
  get show() { return store.get('guides', true); },
  get lock() { return store.get('lockGuides', false); },
  get snap() { return store.get('snap', true); },
  get rulers() { return store.get('rulers', true); },
  snapTo(k) { return store.get('snapTo.' + k, true); },
  get color() { return store.get('guideColor', '#00d8ff'); },
  get grid() { return store.get('grid', false); },
  get gridSize() { return Math.max(1, +store.get('gridSize', 50) || 50); },
  get gridSub() { return clamp(Math.round(+store.get('gridSub', 4) || 1), 1, 20); },
  get gridColor() { return store.get('gridColor', '#00aaff'); },
};
const RULER = 18; // ruler band, screen px
const SNAP_TOOLS = new Set(['marquee', 'ellipse', 'polylasso', 'crop', 'shape', 'gradient', 'type', 'transform']);

function setGuides(list, label) {
  D.guides = SlopGuides.normalize(list).map((g) => ({ o: g.o, pos: clamp(g.pos, -100000, 100000) }));
  if (label) commit(label); else dirty();
}
function addGuide(o, pos, label = tr('photoslop.guide.step_new')) { setGuides((D.guides || []).concat([{ o, pos }]), label); }
function clearGuides() { if (D.guides && D.guides.length) setGuides([], tr('photoslop.guide.step_clear')); }
function applyGuides(list, mode) {
  const next = mode === 'replace' ? list : SlopGuides.merge(D.guides, list);
  if (!GUIDE_PREFS.show) store.set('guides', true);
  setGuides(next, tr(mode === 'replace' ? 'photoslop.guide.step_replace' : 'photoslop.guide.step_layout'));
}
/** msg: the key (photoslop.guide.<msg>) of the setting's name for the on/off toast. */
function togglePref(key, def, msg) { const v = !store.get(key, def); store.set(key, v); dirty(); if (msg) toast(tr(v ? 'photoslop.guide.pref_on' : 'photoslop.guide.pref_off', { what: tr('photoslop.guide.' + msg) }), 1200); return v; }
/** Move guides with the canvas when it is resized, cropped, scaled or rotated. */
function remapGuides(fn) { if (D.guides && D.guides.length) D.guides = SlopGuides.normalize(D.guides.map(fn).filter(Boolean)); }

/* ---------- snapping ---------- */
function snapTargets(o) {
  const out = [];
  if (GUIDE_PREFS.show && GUIDE_PREFS.snapTo('guides')) for (const g of D.guides || []) if (g.o === o) out.push(g.pos);
  if (GUIDE_PREFS.snapTo('bounds')) { const L = o === 'v' ? D.w : D.h; out.push(0, L / 2, L); }
  return out;
}
/** The nearest target for one coordinate: { pos, d } or null. Grid lines are found arithmetically. */
function snapCoord(o, v, tol) {
  let best = SlopGuides.nearest(snapTargets(o), v, tol);
  if (!best && GUIDE_PREFS.grid && GUIDE_PREFS.snapTo('grid')) { // guides and bounds win over the grid
    const step = GUIDE_PREFS.gridSize / GUIDE_PREFS.gridSub, g = Math.round(v / step) * step, d = g - v;
    if (Math.abs(d) <= tol) best = { pos: g, d };
  }
  return best;
}
const snapTol = () => 7 / V.zoom;
/** Snap a pointer point for tools that place things (marquee, crop, shapes…). */
function snapP(p, t) {
  V.snapInd = null;
  if (!GUIDE_PREFS.snap || !p || !t || !SNAP_TOOLS.has(t.id) || V.pan) return p;
  if (t.id === 'transform' && TRANSFORM.drag && TRANSFORM.drag.h.move) return p;
  if (t.s && t.s.moveSel) return p;
  const tol = snapTol(), sx = snapCoord('v', p.x, tol), sy = snapCoord('h', p.y, tol);
  if (!sx && !sy) return p;
  V.snapInd = { x: sx ? sx.pos : null, y: sy ? sy.pos : null };
  return Object.assign({}, p, { x: sx ? sx.pos : p.x, y: sy ? sy.pos : p.y });
}
/** Snap a box moving by (dx, dy): its edges or centre lock onto targets. Returns { dx, dy }. */
function snapDelta(b, dx, dy) {
  V.snapInd = null;
  if (!GUIDE_PREFS.snap || !b) return { dx, dy };
  const tol = snapTol(), pick = (o, vals) => {
    let best = null;
    for (const v of vals) { const s = snapCoord(o, v, tol); if (s && (!best || Math.abs(s.d) < Math.abs(best.d))) best = s; }
    return best;
  };
  const sx = pick('v', [b.x + dx, b.x + b.w / 2 + dx, b.x + b.w + dx]), sy = pick('h', [b.y + dy, b.y + b.h / 2 + dy, b.y + b.h + dy]);
  if (sx) dx += sx.d; if (sy) dy += sy.d;
  if (sx || sy) V.snapInd = { x: sx ? sx.pos : null, y: sy ? sy.pos : null };
  return { dx, dy };
}

/* ---------- PSD: guides as image resource 1032 (grid and guides info) ---------- */
function psdWriteGuides(W) {
  const gs = (D.guides || []).filter((g) => g.pos >= -1e5 && g.pos <= 1e5);
  if (!gs.length) return;
  W.ascii('8BIM'); W.u16(1032); W.u16(0); W.u32(16 + gs.length * 5);
  W.u32(1); W.u32(576); W.u32(576); W.u32(gs.length);
  for (const g of gs) { W.i32(Math.round(g.pos * 32)); W.u8(g.o === 'v' ? 0 : 1); }
  if (gs.length % 2) W.u8(0); // pad the data to an even length
}
/** Read guides from the image resources section; leaves R.p at `end`. */
function psdReadGuides(R, end) {
  const out = [];
  try {
    while (R.p + 12 <= end) {
      if (R.ascii(4) !== '8BIM') break;
      const id = R.u16(), nl = R.u8(); R.p += nl + ((nl + 1) % 2);
      const size = R.u32(), next = R.p + size + (size % 2);
      if (id === 1032 && size >= 16) {
        R.p += 12; const n = R.u32();
        for (let i = 0; i < n && R.p + 5 <= next; i++) { const pos = R.i32() / 32, dir = R.u8(); out.push({ o: dir ? 'h' : 'v', pos }); }
      }
      R.p = next;
    }
  } catch (e) { /* malformed resources: keep what we have */ }
  R.p = end;
  return SlopGuides.normalize(out);
}
/** After opening a document that carried guides (PSD, autosave). */
function adoptGuides(list) { D.guides = SlopGuides.normalize(list || []); if (Hist.states[0]) Hist.states[0].guides = D.guides; dirty(); }
