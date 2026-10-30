// Rigid bodies for cards knocked off the page: gravity, spin, bouncing off the page bottom (the top of the footer),
// the page sides and each other (axis-aligned boxes around the rotated card). The card keeps its
// place in the layout and moves with a transform, so Restore page only has to clear the style.
// A fallen card is still a perch: Sloppo can land on it and ride it.
import { pageW, pageH } from './state.js';
import { CFG } from './config.js';

const G = 2200, bodies = [];
export const count = () => bodies.length;
export const isBody = (el) => bodies.some((b) => b.el === el);

/** Start simulating a card. Returns a function that stops it (for the journal). */
export function launch(el, { vx = 0, vy = -300, vr = 0 } = {}) {
  const r = el.getBoundingClientRect();
  const b = { el, x: 0, y: 0, rot: 0, vx, vy, vr, w: r.width, h: r.height, cx0: r.left + scrollX + r.width / 2, cy0: r.top + scrollY + r.height / 2, still: 0 };
  bodies.push(b);
  return () => { const i = bodies.indexOf(b); if (i >= 0) bodies.splice(i, 1); };
}

/** Half extents of the box around a rotated card. */
function half(b) {
  const a = (b.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return [(b.w * c + b.h * s) / 2, (b.w * s + b.h * c) / 2];
}

export function stepBodies(dt) {
  if (!bodies.length) return;
  const W = pageW(), foot = CFG.floor && document.querySelector(CFG.floor);
  const floor = foot ? foot.getBoundingClientRect().top + scrollY - 2 : pageH() - 2;   // they pile up on the footer
  for (const b of bodies) {
    if (!b.el.isConnected) continue;
    b.vy += G * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.vr * dt;
    const [hw, hh] = half(b), cx = b.cx0 + b.x, cy = b.cy0 + b.y;
    if (cy + hh > floor) {
      b.y -= cy + hh - floor;
      if (b.vy > 0) b.vy = b.vy > 220 ? -b.vy * 0.32 : 0;
      b.vx *= 0.82;
      b.vr *= 0.55;
      const flat = Math.round(b.rot / 180) * 180;                 // tip over onto a flat side
      b.rot += (flat - b.rot) * Math.min(1, dt * 6);
    }
    if (cx - hw < 0) { b.x -= cx - hw; b.vx = Math.abs(b.vx) * 0.5; b.vr *= -0.6; }
    if (cx + hw > W) { b.x -= cx + hw - W; b.vx = -Math.abs(b.vx) * 0.5; b.vr *= -0.6; }
  }
  // Cards bump into each other: push apart along the axis of least overlap.
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const a = bodies[i], b = bodies[j], [aw, ah] = half(a), [bw, bh] = half(b);
    const dx = b.cx0 + b.x - (a.cx0 + a.x), dy = b.cy0 + b.y - (a.cy0 + a.y);
    const ox = aw + bw - Math.abs(dx), oy = ah + bh - Math.abs(dy);
    if (ox <= 0 || oy <= 0) continue;
    if (ox < oy) {
      const s = Math.sign(dx) || 1;
      a.x -= (s * ox) / 2; b.x += (s * ox) / 2;
      const v = (a.vx + b.vx) / 2; a.vx = v - s * 40; b.vx = v + s * 40;
    } else {
      const s = Math.sign(dy) || 1, top = s > 0 ? a : b, bottom = s > 0 ? b : a;
      top.y -= oy; // the upper card rests on the lower one
      if (top.vy > bottom.vy) { top.vy = bottom.vy - (top.vy - bottom.vy) * 0.25; top.vx *= 0.9; top.vr *= 0.7; }
    }
  }
  for (const b of bodies) b.el.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) rotate(${b.rot.toFixed(1)}deg)`;
}
