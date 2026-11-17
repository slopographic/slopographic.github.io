// The gumdrop silhouette and its jelly gradient.

/** The gumdrop silhouette: a dome on a wide, squishy base. */
export function bodyPath(g, x, y, w, h) {
  const l = x - w / 2, r = x + w / 2, b = y, t = y - h;
  g.beginPath();
  g.moveTo(l + w * 0.06, b);
  g.bezierCurveTo(l - w * 0.05, b - h * 0.18, l + w * 0.02, t + h * 0.22, x, t);
  g.bezierCurveTo(r - w * 0.02, t + h * 0.22, r + w * 0.05, b - h * 0.18, r - w * 0.06, b);
  g.bezierCurveTo(r - w * 0.2, b + h * 0.07, l + w * 0.2, b + h * 0.07, l + w * 0.06, b);
  g.closePath();
}
export function jellyFill(g, B, x, y, w, h) {
  const gr = g.createRadialGradient(x - w * 0.18, y - h * 0.78, w * 0.05, x, y - h * 0.4, w * 0.75);
  gr.addColorStop(0, B.hi); gr.addColorStop(0.45, B.base); gr.addColorStop(1, B.lo);
  return gr;
}
