// Perches: the top edges of [data-perch] elements (headings, cards, the intro ledge).
import { M, navH, pageW } from './state.js';
import { size } from './look.js';
import { holesOf, isEaten } from './dom.js';
import { CFG } from './config.js';

/** Cards knocked off the page: no longer perches until the page is restored. */
export const gone = new WeakSet();
/** Cards knocked off and tumbling as rigid bodies (bodies.js): still perches, no longer chaos targets. */
export const fallen = new WeakSet();
const isHeading = (el) => /^H[1-6]$/.test(el.tagName);

/** The perch's top edge in viewport coordinates, or null when it is hidden. Headings use the top of their first line of text. */
export function rectOf(el) {
  if (!el || !el.isConnected || gone.has(el)) return null;
  const b = el.getBoundingClientRect();
  if (b.width < 40 || b.height <= 0) return null;
  if (isHeading(el)) {
    const rs = textRects(el);
    if (rs.length) {
      const top = Math.min(...rs.map((q) => q.top));
      const line = rs.filter((q) => q.top < top + q.height * 0.5);
      const h = Math.max(...line.map((q) => q.height));
      const left = Math.min(...line.map((q) => q.left)), right = Math.max(...line.map((q) => q.right));
      if (right - left >= 40) return { left, right, top: top + h * 0.17, bottom: b.bottom };
    }
  }
  return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
}

/** Text boxes of a heading; once chaos wrapped its letters, only the letters still there. */
function textRects(el) {
  const ch = el.querySelectorAll('.sloppo-ch');
  if (ch.length) return [...ch].filter((s) => !isEaten(s)).map((s) => s.getBoundingClientRect()).filter((q) => q.width > 1 && q.height > 1);
  const rg = document.createRange();
  rg.selectNodeContents(el);
  return [...rg.getClientRects()].filter((q) => q.width > 1 && q.height > 1);
}

/** Is there something to stand on at page x? Eaten letters and holes at the top edge leave gaps. */
export function solidAt(el, x) {
  const b = el.getBoundingClientRect(), lx = x - scrollX - b.left;
  for (const h of holesOf(el)) {
    if (h.r <= Math.abs(h.y)) continue;
    if (Math.abs(lx - h.x) < Math.sqrt(h.r * h.r - h.y * h.y) - 2) return false;
  }
  if (isHeading(el) && el.querySelector('.sloppo-ch')) {
    const cx = x - scrollX, rs = textRects(el), top = Math.min(...rs.map((q) => q.top));
    return rs.some((q) => q.top < top + q.height * 0.5 && cx > q.left - 10 && cx < q.right + 10);
  }
  return true;
}

/** Every perch that is laid out right now: [{ el, r }]. */
export function all() {
  const out = [];
  for (const el of document.querySelectorAll(CFG.perches)) {
    if (el.closest('.sloppo-layer, .sloppo-hud, .buddy-toggle')) continue;
    const r = rectOf(el);
    if (r) out.push({ el, r });
  }
  return out;
}

/** The consent card's box in the viewport (shared/consent/banner.js), or null when it is not shown. */
function strip() {
  const el = document.getElementById('slopc-banner');
  const r = el && el.getBoundingClientRect();
  return r && r.width ? r : null;
}
/** Viewport y of the consent card's top edge at viewport x, the window bottom beside it: the card floats in a bottom
 *  corner, so a spot beside it is clear of it (how tall the card is depends on the fonts). */
export function floorY(x = null) {
  const r = strip(), pad = 40;
  return Math.min(innerHeight, r && (x == null || (x > r.left - pad && x < r.right + pad)) ? r.top : innerHeight);
}
/** Is his feet point (from point()) under the consent card? He would then stand on its buttons. */
export const underStrip = (pt) => pt.y - scrollY > floorY(pt.x - scrollX) - 4;

/** The part of a perch's width (viewport x1..x2) he can stand on: inside the window and clear of the consent card. */
function clearSpan(r) {
  const x1 = Math.max(r.left, 40), x2 = Math.min(r.right, innerWidth - 40), c = strip(), pad = 40;
  if (x2 <= x1) return null;
  if (!c || r.top < c.top - 8) return [x1, x2];
  const left = [x1, Math.min(x2, c.left - pad)], right = [Math.max(x1, c.right + pad), x2];
  const best = left[1] - left[0] >= right[1] - right[0] ? left : right;
  return best[1] - best[0] >= 40 ? best : null;
}
/** Is this perch top comfortably inside the viewport, above or beside the consent card (with room for him above it)? */
export const inView = (r) => r.top > navH() + 60 && r.top < innerHeight - 8 && !!clearSpan(r);

/** Page coordinates of a spot on a perch, or null if the perch is hidden. */
export function point(p) {
  const r = p && rectOf(p.el);
  if (!r) return null;
  // Once he stands somewhere, he stays at that spot of the element even if its text changes.
  if (p.off != null) return { x: p.el.getBoundingClientRect().left + scrollX + p.off, y: r.top + scrollY };
  const pad = Math.min(30, (r.right - r.left) / 2);
  const x = Math.max(r.left + pad, Math.min(r.right - pad, r.left + p.frac * (r.right - r.left))) + scrollX;
  const edge = size() * 0.5;   // keep his puddle on the page
  return { x: Math.max(edge, Math.min(pageW() - edge, x)), y: r.top + scrollY };
}

/** A random visible perch, weighted toward nearby ones. filter(el) narrows the choice. */
export function pick({ exclude = null, filter = null, near = true } = {}) {
  const c = all().filter(({ el, r }) => el !== exclude && inView(r) && (!filter || filter(el)));
  if (!c.length) return null;
  const w = c.map(({ r }) => {
    const dx = (r.left + r.right) / 2 + scrollX - M.x, dy = r.top + scrollY - M.y;
    return near ? 1 / (1 + Math.hypot(dx, dy) / 260) : 1;
  });
  let k = Math.random() * w.reduce((a, b) => a + b, 0);
  /** A spot on the clear part of the perch (all of it unless the consent card is beside it). */
  const spot = ({ el, r }, u) => { const [x1, x2] = clearSpan(r), w = r.right - r.left || 1, a = (x1 - r.left) / w, b = (x2 - r.left) / w; return { el, frac: a + (b - a) * u }; };
  for (let i = 0; i < c.length; i++) if ((k -= w[i]) <= 0) return spot(c[i], 0.15 + Math.random() * 0.7);
  return spot(c[c.length - 1], 0.5);
}

/** The highest perch top crossed while falling from y0 to y1 at x (page coordinates). */
export function landing(x, y0, y1) {
  let best = null;
  for (const { el, r } of all()) {
    const top = r.top + scrollY, l = r.left + scrollX, rr = r.right + scrollX;
    if (top >= y0 - 0.5 && top <= y1 && x >= l + 6 && x <= rr - 6 && (!best || top < best.top) && solidAt(el, x)) best = { el, top, frac: (x - l) / (rr - l) };
  }
  return best;
}
