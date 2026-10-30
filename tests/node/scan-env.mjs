// Slop Scan test helpers: the pure modules, and photos of a page drawn in memory (no browser).
// Covers: scan/js/core/geom.js, scan/js/core/detect.js, scan/js/core/warp.js, scan/js/core/filters.js, scan/js/core/page.js, scan/js/core/pages.js
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const core = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scan', 'js', 'core');
export const G = require(path.join(core, 'geom.js'));
export const D = require(path.join(core, 'detect.js'));
export const W = require(path.join(core, 'warp.js'));
export const F = require(path.join(core, 'filters.js'));
export const P = require(path.join(core, 'page.js'));
export const L = require(path.join(core, 'pages.js'));

/** A seeded random 0..1, so a drawn photo is the same every run. */
export function rnd(seed = 7) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
/** True when (x, y) is inside the convex quad (any winding). */
export function inside(q, x, y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (c === 0) continue;
    if (!sign) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
/**
 * A photo of a page: a w × h desk (dark, grainy), the page as the quad q (light, with a shadow falling across it from
 * the left), lines of "text" (dark bars) on the page when text is true. Returns { data, width, height }.
 */
export function photo(w, h, q, { text = true, desk = 70, paper = 225, shadow = 0.35, noise = 18, seed = 3 } = {}) {
  const r = rnd(seed), d = new Uint8ClampedArray(w * h * 4);
  const H = G.homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], q), Hi = G.invert(H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = desk + (r() - 0.5) * noise, tint = [1.1, 0.95, 0.8];
    if (inside(q, x + 0.5, y + 0.5)) {
      const u = G.apply(Hi, x + 0.5, y + 0.5);   // the point on the page, 0..1 across and down
      v = paper * (1 - shadow * Math.max(0, 0.6 - u.x)) + (r() - 0.5) * 6;
      tint = [1, 0.99, 0.95];
      // text: lines of words 3% high every 7%, between 10% and 90% across, from 12% down
      if (text && u.y > 0.12 && u.y < 0.85 && ((u.y - 0.12) % 0.07) < 0.03 && u.x > 0.1 && u.x < 0.9 && Math.floor(u.x * 23) % 4 !== 3) v *= 0.25;
    }
    const p = (y * w + x) * 4;
    d[p] = v * tint[0]; d[p + 1] = v * tint[1]; d[p + 2] = v * tint[2]; d[p + 3] = 255;
  }
  return { data: d, width: w, height: h };
}
/** The largest distance between matching corners of two quads. */
export const cornerError = (a, b) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
