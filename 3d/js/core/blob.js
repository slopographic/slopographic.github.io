/* Slop 3D blob (pure): an icosphere subdivided `detail` times, pushed in and out by smooth value noise.
 * Deterministic for a given seed, so a blob saved in an .s3d file rebuilds the same shape anywhere.
 * Also holds computeNormals (area-weighted, smooth) for meshes that come without normals.
 * Sets window.Slop3D.blob. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO_V = [[-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0], [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI], [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]];
  const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

  /** Integer lattice hash in [0, 1). */
  function hash(x, y, z, seed) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  /** Smooth 3D value noise in [0, 1]. */
  function noise(x, y, z, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = x - xi, fy = y - yi, fz = z - zi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    const L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz, seed);
    return L(
      L(L(c(0, 0, 0), c(1, 0, 0), sx), L(c(0, 1, 0), c(1, 1, 0), sx), sy),
      L(L(c(0, 0, 1), c(1, 0, 1), sx), L(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
  }

  /** Smooth vertex normals: sums the area-weighted face normals of each vertex. Returns a new flat array. */
  function computeNormals(p, idx) {
    const n = new Array(p.length).fill(0);
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let k = 0; k < n.length; k += 3) {
      const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
      n[k] /= l; n[k + 1] /= l; n[k + 2] /= l;
    }
    return n;
  }

  /** Unit icosphere with `detail` subdivisions (0 = the 20-face icosahedron). Faces point outwards. */
  function icosphere(detail) {
    const v = ICO_V.map((p) => { const l = Math.hypot(...p); return p.map((x) => x / l); });
    let faces = ICO_F.map((f) => f.slice());
    for (let d = 0; d < detail; d++) {
      const cache = new Map(), next = [];
      const mid = (a, b) => {
        const key = a < b ? a + ',' + b : b + ',' + a;
        if (cache.has(key)) return cache.get(key);
        const m = [(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2];
        const l = Math.hypot(...m);
        v.push(m.map((x) => x / l));
        cache.set(key, v.length - 1);
        return v.length - 1;
      };
      for (const [a, b, c] of faces) {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    return { v, faces };
  }

  /** The blob's triangle mesh. p = { radius, detail, noise, seed }. */
  function build(p) {
    const { v, faces } = icosphere(p.detail);
    const pos = [], idx = [];
    for (const q of v) {
      const f = p.noise > 0 ? 1 + p.noise * (noise(q[0] * 1.7 + 3.1, q[1] * 1.7 - 1.3, q[2] * 1.7 + 7.7, p.seed) * 2 - 1) : 1;
      pos.push(q[0] * p.radius * f, q[1] * p.radius * f, q[2] * p.radius * f);
    }
    for (const [a, b, c] of faces) {
      // Wind every triangle counter-clockwise seen from outside, whatever the icosphere subdivision did.
      const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
      const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
      if (nx * cx + ny * cy + nz * cz >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    }
    return { positions: pos, normals: computeNormals(pos, idx), indices: idx };
  }

  S.blob = { build, computeNormals, noise, icosphere };
})();
