// Small helpers shared by the recipes.
export const wait = (page, ms) => page.waitForTimeout(ms);
/** Wait for a predicate in the page, but never fail the capture because of it. */
export const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(() => null);
/** Run n virtual frames (frames mode). */
export const run = (page, n, dt = 1 / 30) => page.evaluate(([k, d]) => window.__cap.run(k, d), [n, dt]);
/** A smooth mouse drag along points [[x,y],...]. */
export async function drag(page, pts, { steps = 12, button = 'left' } = {}) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down({ button });
  for (let i = 1; i < pts.length; i++) await page.mouse.move(pts[i][0], pts[i][1], { steps });
  await page.mouse.up({ button });
}
/** Points on an ellipse / spiral, handy for brush strokes. */
export function curve(cx, cy, rx, ry, turns = 1, n = 40, a0 = 0, shrink = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * Math.PI * 2, k = 1 - shrink * t;
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}
/** Hide anything matching these selectors (toasts, cookie-ish banners, hints). */
export const hide = (page, sels) => page.addStyleTag({ content: sels.join(',') + '{visibility:hidden!important}' }).catch(() => null);
/**
 * A frame hook (frames mode) that draws strokes a little per captured frame, so the clip shows
 * the stroke being painted. strokes: [{ at: frame, pts: [[x,y],...], before?(page) }].
 */
export function strokeFrames(strokes) {
  return async (page, i) => {
    for (const s of strokes) {
      const j = i - s.at;
      if (j < 0 || j > s.pts.length) continue;
      if (j === 0) { await s.before?.(page); await page.mouse.move(...s.pts[0]); await page.mouse.down(); }
      else if (j < s.pts.length) await page.mouse.move(...s.pts[j]);
      else await page.mouse.up();
    }
  };
}
/** Points along a gentle wave from (x0,y) to (x1,y). */
export function wave(x0, x1, y, amp, n, waves = 2) {
  return Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y + Math.sin(i / (n - 1) * Math.PI * 2 * waves) * amp]);
}
