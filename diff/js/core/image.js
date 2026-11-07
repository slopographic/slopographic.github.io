/* Slop Compare: the maths of comparing two pictures (or two rendered PDF pages) pixel by pixel. Pure: RGBA arrays in, a mask
 * and boxes out, so the Node tests check it without a browser.
 *   pixelDiff(a, b, w, h, { threshold }) → { mask: Uint8Array(w*h), count, ratio, boxes }
 *     a, b: RGBA bytes of the same size. Each pixel is put over white (its alpha), and differs when its weighted colour
 *     distance (0..1, the eye's weights for red, green and blue) is above threshold (default 0.1, 0 = any change).
 *   boxesOf(mask, w, h, { cell }) → [{ x, y, w, h, pixels }]   the changed areas: cells of `cell` px with a change, joined
 *     with their neighbours (8-way), biggest first, at most 200 (the rest merged into the last)
 *   paint(out, a, mask, w, h, { color, fade })   writes a picture for the difference view into out (RGBA): A faded towards
 *     white, the changed pixels in the colour
 *   fit(wA, hA, wB, hB, max) → { w, h, scaled, note }   the size both are compared at: A's, within max on its long side */
const W = [0.299, 0.587, 0.114];

export function pixelDiff(a, b, w, h, { threshold = 0.1 } = {}) {
  const n = w * h, mask = new Uint8Array(n), t = Math.max(0, Math.min(1, Number(threshold) || 0));
  let count = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const aa = a[p + 3] / 255, ab = b[p + 3] / 255;
    let d = 0;
    for (let c = 0; c < 3; c++) {
      const x = a[p + c] * aa + 255 * (1 - aa), y = b[p + c] * ab + 255 * (1 - ab);
      d += W[c] * Math.abs(x - y);
    }
    if (d / 255 > t || (t === 0 && (a[p] !== b[p] || a[p + 1] !== b[p + 1] || a[p + 2] !== b[p + 2] || a[p + 3] !== b[p + 3]))) { mask[i] = 1; count++; }
  }
  return { mask, count, ratio: n ? count / n : 0, boxes: boxesOf(mask, w, h) };
}

export function boxesOf(mask, w, h, { cell = 0 } = {}) {
  const size = cell || Math.max(8, Math.round(Math.max(w, h) / 64));
  const cw = Math.ceil(w / size), ch = Math.ceil(h / size), hits = new Int32Array(cw * ch);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) hits[Math.floor(y / size) * cw + Math.floor(x / size)]++;
  const seen = new Uint8Array(cw * ch), boxes = [];
  for (let start = 0; start < hits.length; start++) {
    if (!hits[start] || seen[start]) continue;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1, pixels = 0;
    const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const c = stack.pop(), cx = c % cw, cy = (c - cx) / cw;
      pixels += hits[c];
      if (cx < x0) x0 = cx; if (cy < y0) y0 = cy; if (cx > x1) x1 = cx; if (cy > y1) y1 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const k = ny * cw + nx;
        if (hits[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    const bx = x0 * size, by = y0 * size;
    boxes.push({ x: bx, y: by, w: Math.min(w, (x1 + 1) * size) - bx, h: Math.min(h, (y1 + 1) * size) - by, pixels });
  }
  boxes.sort((p, q) => q.pixels - p.pixels);
  if (boxes.length > 200) {
    const rest = boxes.splice(199);
    boxes.push(rest.reduce((m, r) => { const x = Math.min(m.x, r.x), y = Math.min(m.y, r.y); return { x, y, w: Math.max(m.x + m.w, r.x + r.w) - x, h: Math.max(m.y + m.h, r.y + r.h) - y, pixels: m.pixels + r.pixels }; }));
  }
  // reading order (top to bottom, then left to right) for Next and Previous change
  return boxes.sort((p, q) => p.y - q.y || p.x - q.x);
}

export function paint(out, a, mask, w, h, { color = [230, 30, 60], fade = 0.75 } = {}) {
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    if (mask[i]) { out[p] = color[0]; out[p + 1] = color[1]; out[p + 2] = color[2]; out[p + 3] = 255; continue; }
    const al = a[p + 3] / 255;
    for (let c = 0; c < 3; c++) { const v = a[p + c] * al + 255 * (1 - al); out[p + c] = Math.round(v + (255 - v) * fade); }
    out[p + 3] = 255;
  }
  return out;
}

export function fit(wA, hA, wB, hB, max = 2400) {
  const k = Math.min(1, max / Math.max(wA, hA, 1));
  const w = Math.max(1, Math.round(wA * k)), h = Math.max(1, Math.round(hA * k));
  const scaled = wA !== wB || hA !== hB;
  return { w, h, scaled, note: scaled ? `The pictures differ in size (${wA} × ${hA} and ${wB} × ${hB}): B is stretched to A's size to compare them.` : '' };
}
