/* Slop Image to 3D: height-field, point and splat maths. Pure (no DOM, no three.js, no ONNX), so Node tests can
 * load it through vm. Classic script, sets window.SlopImg3D.hf.
 * Grids are row-major: index = y * w + x, x left to right, y top to bottom. Depth is 0..1, 1 = nearest. The plane
 * is one unit tall and aspect wide (x in [-aspect/2, aspect/2], y in [-0.5, 0.5]); depth pushes it to z = depth * scale. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const hf = (ns.hf = ns.hf || {});

  /** Box blur with clamped edges, radius r (0 returns a copy). */
  function blur(v, w, h, r) {
    const out = Float32Array.from(v);
    if (!(r >= 1)) return out;
    r = Math.min(Math.floor(r), 16);
    const tmp = new Float32Array(v.length), k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += out[y * w + Math.min(w - 1, Math.max(0, x + d))];
      tmp[y * w + x] = s * k;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) s += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      out[y * w + x] = s * k;
    }
    return out;
  }

  /** Bilinear resample of a single-channel Float32 grid to dw×dh (pixel-centre aligned). */
  function resample(src, sw, sh, dw, dh) {
    const out = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / dh - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < dw; x++) {
        const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sw / dw - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx;
        const b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
        out[y * dw + x] = a * (1 - ty) + b * ty;
      }
    }
    return out;
  }

  /** Percentile stretch to 0..1 (lo, hi as fractions). A flat input becomes 0.5. Never returns NaN. */
  function normalize(v, lo = 0.01, hi = 0.99) {
    const s = Float32Array.from(v).filter((x) => Number.isFinite(x)).sort();
    if (!s.length) return new Float32Array(v.length).fill(0.5);
    let a = s[Math.floor(lo * (s.length - 1))], b = s[Math.floor(hi * (s.length - 1))];
    if (!(b > a)) { a = s[0]; b = s[s.length - 1]; } // mostly flat input: use the full range so a spike still shows
    const out = new Float32Array(v.length);
    if (!(b > a)) { out.fill(0.5); return out; }
    for (let i = 0; i < v.length; i++) out[i] = Math.min(1, Math.max(0, (Number.isFinite(v[i]) ? v[i] : a) - a) / (b - a));
    return out;
  }

  /** Vertex normals from positions and triangles (area weighted, unit length). */
  function normalsOf(p, idx) {
    const n = new Float32Array(p.length);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }

  /** Grid size for a W×H image with its long side at maxSide (never below 2 on either side). */
  function gridFor(W, H, maxSide = 128) {
    const k = maxSide / Math.max(W, H);
    return { gw: Math.max(2, Math.round(W * k)), gh: Math.max(2, Math.round(H * k)) };
  }

  /** Position and displacement shared by every output: smoothed depth at each grid vertex. */
  function placed(prep, scale, smooth) {
    const { gw, gh, aspect, depth } = prep;
    const d = blur(depth, gw, gh, smooth);
    const p = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
    const sx = gw > 1 ? gw - 1 : 1, sy = gh > 1 ? gh - 1 : 1;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      p[i * 3] = (x / sx - 0.5) * aspect;
      p[i * 3 + 1] = 0.5 - y / sy;
      p[i * 3 + 2] = d[i] * scale;
      uv[i * 2] = x / sx;
      uv[i * 2 + 1] = 1 - y / sy;
    }
    return { p, uv, d };
  }

  /**
   * Height-field mesh. prep from prepare.js. opts: scale (plane units, default 0.3), smooth (blur radius, 0..16),
   * mask (prep.mask: vertices under 0.5 drop their triangles and the unused vertices are removed).
   * Returns { positions, normals, uv, indices } (Float32Array, Float32Array, Float32Array, Uint32Array).
   */
  function heightField(prep, opts = {}) {
    const { gw, gh } = prep, scale = opts.scale ?? 0.3;
    const { p, uv } = placed(prep, scale, opts.smooth ?? 0);
    const keepV = prep.mask ? prep.mask : null;
    const tris = [];
    const ok = (i) => !keepV || keepV[i] >= 0.5;
    for (let y = 0; y < gh - 1; y++) for (let x = 0; x < gw - 1; x++) {
      const a = y * gw + x, b = a + 1, c = a + gw, d = c + 1;
      if (!keepV) { tris.push(a, c, b, b, c, d); continue; }
      if (ok(a) && ok(c) && ok(b)) tris.push(a, c, b);
      if (ok(b) && ok(c) && ok(d)) tris.push(b, c, d);
    }
    // Compact: keep only vertices a kept triangle uses (all of them when there is no mask).
    const remap = new Int32Array(gw * gh).fill(-1);
    const used = [];
    const idx = new Uint32Array(tris.length);
    for (let t = 0; t < tris.length; t++) {
      const v = tris[t];
      if (remap[v] < 0) { remap[v] = used.length; used.push(v); }
      idx[t] = remap[v];
    }
    const positions = new Float32Array(used.length * 3), uvo = new Float32Array(used.length * 2);
    used.forEach((v, i) => { positions.set(p.subarray(v * 3, v * 3 + 3), i * 3); uvo.set(uv.subarray(v * 2, v * 2 + 2), i * 2); });
    return { positions, normals: normalsOf(positions, idx), uv: uvo, indices: idx };
  }

  /** Point cloud: one point per grid vertex (kept where the mask says so), coloured from the picture. */
  function pointCloud(prep, opts = {}) {
    const { p, uv } = placed(prep, opts.scale ?? 0.3, opts.smooth ?? 0);
    const keep = [];
    for (let i = 0; i < prep.gw * prep.gh; i++) if (!prep.mask || prep.mask[i] >= 0.5) keep.push(i);
    const positions = new Float32Array(keep.length * 3), colors = new Float32Array(keep.length * 3);
    keep.forEach((v, i) => { positions.set(p.subarray(v * 3, v * 3 + 3), i * 3); colors.set(prep.colors.subarray(v * 3, v * 3 + 3), i * 3); });
    return { positions, colors, uv };
  }

  /**
   * Splats: a point per grid vertex with a Gaussian footprint (drawn by the viewer). The radius follows the local
   * spacing and shrinks on depth edges, so flat areas fill in and silhouettes stay crisp. Returns positions, colors
   * (rgb 0..1) and sizes (world radius per point).
   */
  function splats(prep, opts = {}) {
    const { gw, gh, aspect } = prep, scale = opts.scale ?? 0.3, k = opts.size ?? 1;
    const { p, d } = placed(prep, scale, opts.smooth ?? 0);
    const sx = aspect / Math.max(1, gw - 1), sy = 1 / Math.max(1, gh - 1), spacing = (sx + sy) / 2;
    const pts = pointCloud(prep, opts);
    const sizes = new Float32Array(pts.positions.length / 3);
    let j = 0;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (prep.mask && prep.mask[i] < 0.5) continue;
      const dx = (d[Math.min(gw - 1, x + 1) + y * gw] - d[Math.max(0, x - 1) + y * gw]) / 2;
      const dy = (d[x + Math.min(gh - 1, y + 1) * gw] - d[x + Math.max(0, y - 1) * gw]) / 2;
      const edge = Math.min(1, Math.hypot(dx * scale / sx, dy * scale / sy) * 0.5);
      sizes[j++] = spacing * k * (0.55 + 0.6 * (1 - edge));
    }
    return { positions: pts.positions, colors: pts.colors, sizes };
  }

  Object.assign(hf, { blur, resample, normalize, normalsOf, gridFor, heightField, pointCloud, splats });
})(typeof window !== 'undefined' ? window : globalThis);
