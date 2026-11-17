/* PhotoSlop filters: red-eye removal (Filter ▸ Repair). redEyeData is shared with the Red Eye tool. */
'use strict';

/**
 * Red-eye on RGBA data d, in place. A pixel is red when its redness ratio r / max(1, (g+b)/2) passes a
 * threshold set by the tolerance (higher tolerance = more pixels count). The weight is soft, and it falls
 * to zero for bright pixels, so white and near-white catchlights are left alone. Red is pulled down to
 * the larger of green and blue, then the pixel is darkened by the darkening amount (0..100).
 */
function redEyeData(d, tol, dark) {
  const q0 = 2.4 - 1.2 * (clamp(tol, 0, 100) / 100), k = clamp(dark, 0, 100) / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    if (!d[i + 3] || r < 40) continue;
    const q = r / Math.max(1, (g + b) / 2);
    let w = clamp((q - q0) / 0.6, 0, 1);
    if (!w) continue;
    w *= clamp((235 - luma(r, g, b)) / 55, 0, 1); // keep highlights (catchlights)
    if (!w) continue;
    d[i] = clamp(lerp(r, Math.max(g, b), w) * (1 - k * 0.8 * w), 0, 255);
  }
  return d;
}

FILTERS.push(
  { id: 'redeye', menu: 'Repair', // i18n-ignore: menu ids
    params: [R('tol', 'tolerance', 0, 100, 50, { unit: '%' }), R('dark', 'darkening', 0, 100, 60, { unit: '%' })],
    fn: (s, p) => withPixels(s, (d) => redEyeData(d, p.tol, p.dark)) }
);
