/* Slop Colors: drawing the colour wheel on its canvas (the handles are elements over it: js/wheel.js). The hue ring
 * outside, the disc inside (angle = hue, distance = saturation or chroma, at the slider's brightness or lightness), and a
 * line from the centre to each handle. Sharp on HiDPI screens: the canvas has devicePixelRatio pixels per CSS pixel. The
 * disc's pixels come from colors/js/core/wheel.js (rgb, ringRgb), the one place that says what a point of a wheel is, and
 * are kept until the wheel, the slider or the size changes (a drag only moves the lines).
 *   GEO                        the ring and disc radii as parts of the half width
 *   paint(canvas, { size, wheel, v, places: [{ a, r }] })   size in CSS pixels; places[0] is the base. Classic script. */
(function (g) {
  'use strict';
  const GEO = Object.freeze({ ringOut: 0.995, ringIn: 0.875, disc: 0.82 });
  let cache = null;

  /** The ring and disc as a canvas of px × px (OKLCH at most 260 px and scaled up: each of its pixels is gamut mapped). */
  function render(px, wheel, v) {
    const key = [px, wheel, Math.round(v * 400)].join('|');
    if (cache && cache.key === key) return cache.cv;
    const WH = g.SlopColors.wheel, n = wheel === 'oklch' ? Math.min(px, 260) : px;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const x = cv.getContext('2d'), img = x.createImageData(n, n), d = img.data, h = n / 2, aa = 1 / h;
    const ring = new Map();   // the ring's colour per half degree
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = i + 0.5 - h, dy = j + 0.5 - h, r = Math.hypot(dx, dy) / h, o = (j * n + i) * 4;
        let rgb = null, alpha = 0;
        if (r <= GEO.disc + aa) {
          alpha = Math.min(1, (GEO.disc + aa - r) / aa);
          rgb = WH.rgb((Math.atan2(dx, -dy) * 180) / Math.PI, Math.min(1, r / GEO.disc), v, wheel);
        } else if (r >= GEO.ringIn - aa && r <= GEO.ringOut + aa) {
          alpha = Math.min(1, (r - GEO.ringIn + aa) / aa, (GEO.ringOut + aa - r) / aa);
          const a = Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) * 2) / 2 % 360;
          if (!ring.has(a)) ring.set(a, WH.ringRgb(a, wheel));
          rgb = ring.get(a);
        }
        if (!rgb) continue;
        d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = Math.round(alpha * 255);
      }
    }
    x.putImageData(img, 0, 0);
    cache = { key, cv };
    return cv;
  }

  function paint(canvas, o) {
    const dpr = Math.min(3, g.devicePixelRatio || 1), px = Math.max(1, Math.round(o.size * dpr));
    if (canvas.width !== px || canvas.height !== px) { canvas.width = canvas.height = px; }
    const x = canvas.getContext('2d'), h = px / 2, R = h * GEO.disc, WH = g.SlopColors.wheel;
    x.clearRect(0, 0, px, px);
    x.imageSmoothingEnabled = true;
    x.drawImage(render(px, o.wheel, o.v), 0, 0, px, px);
    // the links: dark under light, so they show on any colour of the disc
    x.lineCap = 'round';
    for (const [w, c] of [[3.5, 'rgba(0,0,0,.45)'], [1.5, 'rgba(255,255,255,.95)']]) {
      x.lineWidth = w * dpr; x.strokeStyle = c;
      x.beginPath();
      for (const p of o.places) { const [dx, dy] = WH.toXY(p, R); x.moveTo(h, h); x.lineTo(h + dx, h + dy); }
      x.stroke();
    }
  }
  g.CO = g.CO || {};
  g.CO.wheelDraw = { GEO, paint, render };
})(window);
