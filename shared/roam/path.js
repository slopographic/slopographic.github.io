// The paths a page mascot moves along (no DOM): shared by the built-in buddy (shared/buddy: glide.js glides aside,
// motion.js hops between perches, avoid.js picks a spot away from the pointer) and the mascot slot's roaming
// (shared/mascot/roam.js), so both move the same way. Two styles of travel:
//   hop     an arc with a lift over the higher end (the buddy's hop between perches; a little physics feel)
//   float   a gentle curve with ease in and out, a soft hover bob at rest and a lean into the direction of travel; no
//           jumps and no gravity (for a mascot that floats)
// Tests: tests/node/roam-path.test.mjs (every function here); the buddy's pages and tests/buddy/roam.test.html use them.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Fast start, soft stop (the buddy's glide aside). */
export const easeOut = (u) => 1 - Math.pow(1 - u, 3);
/** Soft start and soft stop (a float). */
export const easeInOut = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

/** A quick glide aside: seconds for a distance (px). */
export const glideTime = (dist) => Math.min(0.6, 0.22 + dist / 1100);
/** A hop: seconds for a distance, and how high (px over the higher end) it lifts; high adds to the lift. */
export const hopTime = (dist) => clamp(0.36 + dist / 1700, 0.38, 0.95);
export const hopLift = (dist, high = 0) => clamp(46 + dist * 0.16, 46, 220) + high;
/** The height (y grows downwards) on a hop's arc from y0 to y1 at u (0..1): a quadratic curve whose top is lift px above
 * the higher end. */
export function arcY(y0, y1, lift, u) {
  const apex = Math.min(y0, y1) - lift, c = 2 * apex - (y0 + y1) / 2;
  return (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * c + u * u * y1;
}

/** A float: seconds for a distance, unhurried; calm (a plain-tone build) slower still. */
export const floatTime = (dist, calm = false) => clamp(1.1 + dist / 420, 1.4, 4.2) * (calm ? 1.35 : 1);
/** A gentle curve from a to b ({ x, y }): bend (-1..1) bows it sideways by up to a quarter of the distance, and it rises
 * a little in the middle, as something floating does. Returns u (0..1) -> { x, y }. */
export function curve(a, b, bend = 0) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, k = clamp(bend, -1, 1) * 0.25;
  const c = { x: (a.x + b.x) / 2 - (dy / d) * k * d, y: (a.y + b.y) / 2 + (dx / d) * k * d - d * 0.06 };
  return (u) => ({ x: (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * c.x + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * c.y + u * u * b.y });
}
/** A hop from a to b as a path: u (0..1) -> { x, y } (x moves evenly, y follows arcY). */
export function arc(a, b) {
  const lift = hopLift(Math.hypot(b.x - a.x, b.y - a.y));
  return (u) => ({ x: a.x + (b.x - a.x) * u, y: arcY(a.y, b.y, lift, u) });
}

/** The hover bob at t seconds: px up and down, amp high, one breath every period seconds. */
export const bob = (t, amp = 3, period = 3.2) => Math.sin((t * 2 * Math.PI) / period) * amp;
/** A slow idle drift around the resting spot: a lazy figure of eight, amp px wide. */
export const drift = (t, amp = 5) => ({ x: Math.sin(t * 0.37) * amp, y: Math.sin(t * 0.74) * amp * 0.5 });
/** The lean into the direction of travel: degrees for a sideways speed (px/s), at most max either way. */
export const leanOf = (vx, max = 7) => clamp(vx / 60, -max, max);
/** Eases a value towards a target over time: k of the gap closes per 1/60 s. */
export const approach = (v, target, dt, k = 0.12) => v + (target - v) * (1 - Math.pow(1 - k, dt * 60));

/** Spots around a box to move to, nearest first: rings at 1.4, 2 and 2.8 times (rx, ry), 16 directions each. Those
 * towards (px, py) (the pointer, from the box's centre) count as twice as far, so it never runs towards the pointer if
 * another way is free. Returns [{ dx, dy }]. */
export function ringSpots(rx, ry, px = 0, py = 0) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const k of [1.4, 2, 2.8]) {
      const dx = Math.cos(a) * rx * k, dy = Math.sin(a) * ry * k;
      out.push({ dx, dy, score: Math.hypot(dx, dy) * (dx * px + dy * py > 0 ? 2 : 1) });
    }
  }
  return out.sort((p, q) => p.score - q.score).map(({ dx, dy }) => ({ dx, dy }));
}

/** One spot from a list of { x, y, edge } (top-left corners), weighted: beside a content edge counts three times, a spot
 * far away less, one closer than near px to `from` not at all. rnd: 0..1. Returns the spot or null. */
export function chooseSpot(list, from, rnd, near = 60) {
  const w = list.map((s) => {
    const d = Math.hypot(s.x - from.x, s.y - from.y);
    return d < near ? 0 : (s.edge ? 3 : 1) / (1 + d / 500);
  });
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  let k = rnd * sum;
  for (let i = 0; i < list.length; i++) if (w[i] && (k -= w[i]) <= 0) return list[i];
  return list[w.map((v, i) => (v ? i : -1)).filter((i) => i >= 0).pop()];
}

/** Is a box ({ l, t, r, b }) inside the bounds ({ l, t, r, b })? */
export const within = (box, bounds) => box.l >= bounds.l && box.t >= bounds.t && box.r <= bounds.r && box.b <= bounds.b;
/** Do two boxes overlap? pad grows the first. */
export const overlaps = (a, b, pad = 0) => a.l - pad < b.r && a.r + pad > b.l && a.t - pad < b.b && a.b + pad > b.t;

/** The rest between two trips (ms) from a random number 0..1: longer when calm. */
export const restMs = (rnd, calm = false) => (calm ? 9000 + rnd * 7000 : 5000 + rnd * 5000);

/** Following the person after a scroll (the slot's roaming, like the buddy leaping back into view): a mascot left behind
 * on the page waits until the scroll has been quiet followMs, or until it has been out of the window maxOffMs even while
 * the scroll goes on, then travels back into view. */
export const followDue = (quietMs, outMs, followMs = 700, maxOffMs = 1500) => quietMs >= followMs || outMs >= maxOffMs;
/** Where the way back starts: its own place on the page, but never further out than just past the window's edge (a w x h
 * box, a window vw x vh): a long fast scroll costs no longer a trip than a short one. */
export const entry = (a, w, h, vw, vh, gap = 8) => ({ x: clamp(a.x, -w - gap, vw + gap), y: clamp(a.y, -h - gap, vh + gap) });
/** The way back: seconds for a distance, quicker than a roaming trip; calm a little slower. */
export const followTime = (dist, calm = false) => clamp(0.55 + dist / 700, 0.7, 1.5) * (calm ? 1.2 : 1);
/** Is a w x h box at (x, y) wholly out of a window vw x vh? */
export const outOf = (x, y, w, h, vw, vh) => x + w <= 0 || y + h <= 0 || x >= vw || y >= vh;
