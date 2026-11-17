// The mascot slot's interaction logic (no DOM): where the mascot may sit, how a press becomes a tap, a long press or a
// drag (and how hard a drag shakes it), where its eyes look, and the helper menu's items. ui.js wires these to the page;
// Node tests drive them directly: tests/node/mascot-interact.test.mjs.

/** A press that moves less than this (px) is a tap; past it, a drag. A press held this long (ms) without moving is long. */
export const DRAG_PX = 6;
export const LONG_MS = 550;
/** The pointer within this distance (px) of the mascot's centre turns its eyes; further away it looks ahead. */
export const NEAR_PX = 320;
/** The gap kept from the window's edges, the header and the safe areas (px). */
export const MARGIN = 8;

/** The view the mascot lives in: { w, h, top (the header's bottom edge), safe: { top, right, bottom, left } }. */
const safeOf = (view) => Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, view.safe);

/** A position ({ right, bottom }, px from the window's right and bottom edges) moved inside the view: clear of the header
 * and the safe areas, with MARGIN to spare. size: { w, h } of the mascot. A view too small keeps it at the bottom right. */
export function clampPos(pos, size, view) {
  const s = safeOf(view);
  const minR = s.right + MARGIN, maxR = view.w - size.w - s.left - MARGIN;
  const minB = s.bottom + MARGIN, maxB = view.h - size.h - Math.max(s.top, view.top || 0) - MARGIN;
  const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo)));
  return { right: Math.round(clamp(pos.right, minR, maxR)), bottom: Math.round(clamp(pos.bottom, minB, maxB)) };
}

/** Where the mascot sits until it is moved: the bottom corner on its side (1 right, -1 left), above a footer bar. */
export function defaultPos(size, view, side = 1, foot = 0) {
  const right = side < 0 ? view.w - size.w : 0;
  return clampPos({ right, bottom: foot }, size, view);
}

/** Which half of the window the mascot is in: 1 right, -1 left. */
export const sideOf = (pos, size, view) => (pos.right + size.w / 2 <= view.w / 2 ? 1 : -1);

/** The same height on the other side of the window ("Move to the other side"). */
export function otherSide(pos, size, view) {
  return clampPos({ right: view.w - size.w - pos.right, bottom: pos.bottom }, size, view);
}

/** One press, from pointer down to up. move() returns null until it is a drag, then { dx, dy } (since the last move),
 * the position offset since the press ({ ox, oy }) and shake (0..1: how often it changed direction in the last 600 ms).
 * up() says what the press was: 'tap', 'long' or 'drag'. */
export function createPress(x, y, t) {
  let last = { x, y }, dragging = false, dir = 0;
  const flips = [];
  return {
    get dragging() { return dragging; },
    move(nx, ny, nt) {
      if (!dragging && Math.hypot(nx - x, ny - y) < DRAG_PX) return null;
      dragging = true;
      const dx = nx - last.x, dy = ny - last.y;
      last = { x: nx, y: ny };
      const d = Math.abs(dx) > 3 ? Math.sign(dx) : 0;
      if (d && dir && d !== dir) flips.push(nt);
      if (d) dir = d;
      while (flips.length && nt - flips[0] > 600) flips.shift();
      return { dx, dy, ox: nx - x, oy: ny - y, shake: Math.min(1, flips.length / 4) };
    },
    /** True while the press is held still past LONG_MS (the caller asks on a timer). */
    isLong(nt) { return !dragging && nt - t >= LONG_MS; },
    up(nt) { return dragging ? 'drag' : nt - t >= LONG_MS ? 'long' : 'tap'; },
  };
}

/** Where the eyes look: the pointer's direction from the mascot's centre, each axis -1..1, or [0, 0] when it is further
 * than NEAR_PX away. centre and pointer: { x, y } in the same coordinates. */
export function lookAt(centre, pointer, near = NEAR_PX) {
  const dx = pointer.x - centre.x, dy = pointer.y - centre.y, d = Math.hypot(dx, dy);
  if (!d || d > near) return [0, 0];
  const k = Math.min(1, d / (near / 3)) / d;   // full turn a third of the way out, and less right next to it
  const r = (v) => Math.round(Math.max(-1, Math.min(1, v * k)) * 100) / 100;
  return [r(dx), r(dy)];
}

/** The helper menu: what the page offers ({ ai, finder, tour }: booleans) and a text function t(key, en). Values are the
 * actions ui.js runs. Move and Hide are always there. */
export function menuItems(has, t = (k, en) => en) {
  const out = [];
  if (has.ai) out.push({ value: 'ai', label: t('mascot.ask', 'Ask the assistant') });
  if (has.finder) out.push({ value: 'search', label: t('mascot.search', 'Search apps') });
  if (has.tour) out.push({ value: 'tour', label: t('mascot.tour', 'Take the tour of this page') });
  out.push({ value: 'tips', label: t('mascot.tips', 'Tips') });
  out.push({ value: 'move', label: t('mascot.move', 'Move to the other side') });
  out.push({ value: 'hide', label: t('mascot.hide', 'Hide') });
  return out;
}

/** The tips the Tips item shows, one at a time in turn (i18n keys with their English). */
export const TIPS = [
  ['mascot.tip_offline', 'The apps keep working offline after your first visit.'],
  ['mascot.tip_local', 'Your files stay in this browser. Keep a backup now and then.'],
  ['mascot.tip_search', 'Press Ctrl+Space (Cmd+Space on a Mac) to switch to any app.'],
];

/** The next idle glance (ms from now): somewhere between 20 and 45 seconds, from a random number 0..1. */
export const nextGlance = (rnd) => 20000 + Math.round(rnd * 25000);

/** The drawing's box: W x H at full size (the overlay's own stage). */
export const STAGE = { w: 112, h: 136 };
/** How big the mascot is drawn: { desk, phone } (phone: up to 700 px wide), each { w, h, k (scale), real }. Without a
 * profile size (mascot.size: { desktop, phone }, px tall, 32..360) the stage is drawn at scale (0.62 in a plain-tone build,
 * 0.46 on a phone there). With one, the stage is laid out at that size (real: the overlay draws to fill it, sharp). */
export function dims(size, scale = 1) {
  const s = size || {}, ok = (v) => Number.isFinite(v) && v >= 32 && v <= 360;
  const at = (h) => ({ w: Math.round((h * STAGE.w) / STAGE.h), h: Math.round(h), k: h / STAGE.h, real: true });
  const scaled = (k) => ({ w: Math.round(STAGE.w * k), h: Math.round(STAGE.h * k), k, real: false });
  return { desk: ok(s.desktop) ? at(s.desktop) : scaled(scale), phone: ok(s.phone) ? at(s.phone) : scaled(scale < 1 ? 0.46 : scale) };
}
