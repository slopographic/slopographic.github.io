/* Slop retouch: skin. One skin model for the whole site's retouching (PhotoSlop's Auto Enhance protects skin with it, and
 * Portrait retouch finds the skin to smooth with it). Pure, no DOM; Node tests load it (module.exports).
 *   skinWeight(r, g, b)                   0..1: YCbCr skin range (Cb 77–127, Cr 133–173) with soft edges, not too dark
 *   skinMask(d, w, h, { faces, subject }) → Uint8Array 0..255. With faces ([{ x, y, w, h, kps }] in these pixels) the skin
 *                                         colour is learnt from the cheeks and the eyes, brows and mouth are cut out (kps:
 *                                         YuNet's five landmarks: right eye, left eye, nose, right and left mouth corner),
 *                                         and only the face, neck and shoulders around a face count.
 *                                         subject (Uint8Array 0..255, the on-device subject matte) limits it to the person.
 *   featureRegions(face)                  { eyes: [{ x, y, rx, ry }], brows, mouth } ellipses from the landmarks
 *   inEllipse(e, x, y)                    0..1 (soft edge)
 *   healRadius(r)                         the radius to heal a spot of radius r with (the ring checked is twice that)
 *   findSpots(d, w, h, mask, opts)        small dark or red spots inside the mask: [{ x, y, r, score }], strongest first.
 *                                         opts: maxR (px, the largest spot), minR, contrast (levels). Lines and edges
 *                                         (brows, lashes, the lip line) are longer than a spot and are left alone, and a
 *                                         spot must sit on calm skin (the ring around it varies little). */
(function (root, factory) {
  const C = typeof module === 'object' && module.exports ? require('./core.js') : root.SlopRetouchCore;
  const api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopRetouchSkin = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const { clamp, smoothstep, lumaOf, boxBlur } = C;

  const cb = (r, g, b) => 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = (r, g, b) => 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

  function skinWeight(r, g, b) {
    const B = cb(r, g, b), R = cr(r, g, b), Y = C.luma(r, g, b);
    const wb = smoothstep(70, 82, B) * (1 - smoothstep(122, 134, B));
    const wr = smoothstep(128, 138, R) * (1 - smoothstep(168, 180, R));
    const wy = smoothstep(28, 60, Y) * (1 - smoothstep(246, 256, Y));
    return wb * wr * wy * (r >= g ? 1 : 0.3);
  }

  function featureRegions(f) {
    const k = f.kps;
    if (!k || k.length < 5) return null;
    const fw = f.w, eye = (p) => ({ x: p[0], y: p[1], rx: fw * 0.14, ry: fw * 0.085 });
    const brow = (p) => ({ x: p[0], y: p[1] - fw * 0.13, rx: fw * 0.17, ry: fw * 0.06 });
    const mx = (k[3][0] + k[4][0]) / 2, my = (k[3][1] + k[4][1]) / 2, md = Math.hypot(k[4][0] - k[3][0], k[4][1] - k[3][1]) || fw * 0.4;
    return { eyes: [eye(k[0]), eye(k[1])], brows: [brow(k[0]), brow(k[1])], mouth: { x: mx, y: my, rx: md * 0.62, ry: md * 0.34 } };
  }
  function inEllipse(e, x, y) {
    const q = Math.hypot((x - e.x) / e.rx, (y - e.y) / e.ry);
    return 1 - smoothstep(0.8, 1.05, q);
  }

  /** The skin colour of the faces' cheeks: mean and spread of Cb and Cr, or null. */
  function faceModel(d, w, h, faces) {
    let n = 0, sb = 0, sr = 0, sbb = 0, srr = 0;
    for (const f of faces) {
      const x0 = Math.max(0, Math.round(f.x + f.w * 0.22)), x1 = Math.min(w, Math.round(f.x + f.w * 0.78));
      const y0 = Math.max(0, Math.round(f.y + f.h * 0.45)), y1 = Math.min(h, Math.round(f.y + f.h * 0.72));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        if (skinWeight(r, g, b) < 0.15) continue;
        const B = cb(r, g, b), R = cr(r, g, b);
        n++; sb += B; sr += R; sbb += B * B; srr += R * R;
      }
    }
    if (n < 20) return null;
    const mb = sb / n, mr = sr / n;
    return { mb, mr, sb: Math.max(6, Math.sqrt(Math.max(0, sbb / n - mb * mb)) * 2.6), sr: Math.max(6, Math.sqrt(Math.max(0, srr / n - mr * mr)) * 2.6) };
  }

  /** Running max then min (a morphological closing) of radius r, rows then columns: holes up to about 2r across are
   *  filled while the outline stays where it is. In place. */
  function closeHoles(p, w, h, r) {
    const pass = (pick, init) => {
      const t = new Float32Array(p.length);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = init; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, p[y * w + k]);
        t[y * w + x] = v;
      }
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
        let v = init; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, t[k * w + x]);
        p[y * w + x] = v;
      }
    };
    pass(Math.max, 0); pass(Math.min, 1);
    return p;
  }

  function skinMask(d, w, h, o = {}) {
    const n = w * h, faces = o.faces || [], p = new Float32Array(n);
    const M = faces.length ? faceModel(d, w, h, faces) : null;
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (d[i * 4 + 3] < 8) continue;
      let v = skinWeight(r, g, b);
      if (M) {
        const q = ((cb(r, g, b) - M.mb) / M.sb) ** 2 + ((cr(r, g, b) - M.mr) / M.sr) ** 2;
        v = Math.max(Math.exp(-0.5 * q) * smoothstep(20, 50, C.luma(r, g, b)), v * 0.35);
      }
      p[i] = v;
    }
    closeHoles(p, w, h, Math.max(3, Math.round(Math.min(w, h) / 80)));   // a blemish is darker than skin: keep it inside
    if (faces.length) {   // with faces, only the face, the neck and the shoulders near them: warm things elsewhere are not skin
      const zones = faces.map((f) => ({ x: f.x + f.w / 2, y: f.y + f.h * 0.62, rx: f.w * 0.85, ry: f.h * 1.05 }));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!p[i]) continue;
        let z = 0; for (const e of zones) z = Math.max(z, inEllipse(e, x + 0.5, y + 0.5));
        p[i] *= z;
      }
    }
    if (o.subject) for (let i = 0; i < n; i++) p[i] *= o.subject[i] / 255;
    for (const f of faces) {
      const R = featureRegions(f);
      if (!R) continue;
      for (const e of R.eyes.concat(R.brows, [R.mouth])) {
        const x0 = Math.max(0, Math.floor(e.x - e.rx * 1.1)), x1 = Math.min(w, Math.ceil(e.x + e.rx * 1.1));
        const y0 = Math.max(0, Math.floor(e.y - e.ry * 1.1)), y1 = Math.min(h, Math.ceil(e.y + e.ry * 1.1));
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p[y * w + x] *= 1 - inEllipse(e, x + 0.5, y + 0.5);
      }
    }
    boxBlur(p, w, h, Math.max(1, Math.round(Math.min(w, h) / 220)));
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.round(smoothstep(0.22, 0.6, p[i]) * 255);
    return out;
  }

  /** How far out a spot of radius r is healed (the spot and a margin for its soft edge); the heal reads twice as far. */
  const healRadius = (r) => 1.3 * r + 2.5;

  function findSpots(d, w, h, mask, o = {}) {
    const n = w * h, maxR = Math.max(1.5, o.maxR || Math.max(3, Math.min(w, h) / 90)), minR = o.minR || 1;
    const L = lumaOf(d, w, h), red = new Float32Array(n);
    for (let i = 0; i < n; i++) red[i] = d[i * 4] - (d[i * 4 + 1] + d[i * 4 + 2]) / 2;
    const R = Math.ceil(maxR * 2.5), bL = boxBlur(Float32Array.from(L), w, h, R), bR = boxBlur(Float32Array.from(red), w, h, R);
    const score = new Float32Array(n);
    let s2 = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      score[i] = bL[i] - L[i] + 0.5 * Math.max(0, red[i] - bR[i]);
      if (mask[i] > 140) { s2 += (L[i] - bL[i]) ** 2; cnt++; }
    }
    const sigma = cnt ? Math.sqrt(s2 / cnt) : 0, thr = Math.max(o.contrast || 10, sigma * 2.2);
    const seen = new Uint8Array(n), out = [], stack = [], minA = Math.max(2, Math.PI * minR * minR * 0.5);
    for (let s = 0; s < n; s++) {
      if (seen[s] || mask[s] <= 110 || score[s] <= thr) continue;
      let A = 0, sx = 0, sy = 0, sum = 0, x0 = w, y0 = h, x1 = -1, y1 = -1, big = false;
      stack.push(s); seen[s] = 1;
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i - x) / w;
        A++; sx += x; sy += y; sum += score[i];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (A > 4 * maxR * maxR * 4) big = true;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && !seen[j] && score[j] > thr * 0.6 && mask[j] > 60) { seen[j] = 1; stack.push(j); }
        }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, long = Math.max(bw, bh), short = Math.min(bw, bh);
      if (big || A < minA || long > 2 * maxR + 2 || long / short > 2.5) continue;
      let inside = true;
      for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2) && inside; y++) {
        for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) if (mask[y * w + x] < 60) { inside = false; break; }
      }
      if (!inside) continue;
      // a blemish sits on smooth skin: the ring around it must be calm (a flower's centre, an eyelash or hair is not)
      const cx = sx / A + 0.5, cy = sy / A + 0.5, r0 = long / 2 + 1, r1 = 2 * healRadius(long / 2 + 0.5);   // as far as the heal reaches
      let rn = 0, rs = 0, rss = 0;
      for (let y = Math.max(0, Math.floor(cy - r1)); y <= Math.min(h - 1, Math.ceil(cy + r1)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r1)); x <= Math.min(w - 1, Math.ceil(cx + r1)); x++) {
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd < r0 || dd > r1) continue;
          const v = L[y * w + x]; rn++; rs += v; rss += v * v;
        }
      }
      const ringSd = rn ? Math.sqrt(Math.max(0, rss / rn - (rs / rn) ** 2)) : 0;
      if (ringSd > Math.min(12, Math.max(7, sigma * 1.5))) continue;
      out.push({ x: cx, y: cy, r: long / 2 + 0.5, score: sum / A });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, o.max || 300);
  }

  return { skinWeight, skinMask, closeHoles, healRadius, featureRegions, inEllipse, findSpots, cb, cr, clamp };
});
