/* Slop 3D primitive geometry (pure). A shape is stored as its parameters, so the .s3d file stays small:
 *   { kind: 'cube' | 'plane' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'blob', ...params }
 * or an imported triangle mesh { kind: 'mesh', positions, normals?, indices }.
 * build(geom) → { positions, normals, indices } as plain arrays (counter-clockwise triangles seen from outside).
 * check(geom) → an error string, or null when the shape is valid. Sets window.Slop3D.geometry. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const TAU = Math.PI * 2;
  const R = [0.001, 1000];
  /** Parameter ranges: [min, max, integer?]. */
  const SPEC = {
    cube: { size: [...R] },
    plane: { width: [...R], depth: [...R] },
    sphere: { radius: [...R], segments: [3, 256, 1], rings: [2, 256, 1] },
    cylinder: { radius: [...R], height: [...R], segments: [3, 256, 1] },
    cone: { radius: [...R], height: [...R], segments: [3, 256, 1] },
    torus: { radius: [...R], tube: [0.001, 500], segments: [3, 256, 1], sides: [3, 128, 1] },
    blob: { radius: [...R], detail: [0, 5, 1], noise: [0, 2], seed: [0, 99999, 1] },
  };
  const DEFAULTS = {
    cube: { size: 1 }, plane: { width: 1, depth: 1 },
    sphere: { radius: 0.5, segments: 32, rings: 16 }, cylinder: { radius: 0.5, height: 1, segments: 32 },
    cone: { radius: 0.5, height: 1, segments: 32 }, torus: { radius: 0.5, tube: 0.15, segments: 32, sides: 16 },
    blob: { radius: 0.6, detail: 3, noise: 0.25, seed: 1 },
  };
  const KINDS = Object.keys(DEFAULTS);
  const MAX_MESH_VERTS = 3000000;

  /** Fills defaults, clamps numbers into range. Unknown kinds fall back to a cube. */
  function normalize(geom) {
    const kind = KINDS.includes(geom && geom.kind) ? geom.kind : 'cube';
    const out = { kind };
    for (const k of Object.keys(SPEC[kind])) {
      const [a, b, int] = SPEC[kind][k];
      let v = Number(geom && geom[k]);
      if (!Number.isFinite(v)) v = DEFAULTS[kind][k];
      v = Math.min(b, Math.max(a, v));
      out[k] = int ? Math.round(v) : v;
    }
    return out;
  }

  /** Validates a shape. Returns an error message or null. Never throws. */
  function check(geom) {
    try {
      if (!geom || typeof geom !== 'object') return 'shape is missing';
      if (geom.kind === 'mesh') return checkMesh(geom);
      if (!SPEC[geom.kind]) return `unknown shape "${geom.kind}"`;
      for (const k of Object.keys(SPEC[geom.kind])) {
        const [a, b, int] = SPEC[geom.kind][k];
        const v = geom[k];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b || (int && !Number.isInteger(v))) return `${geom.kind}.${k} must be a number from ${a} to ${b}`;
      }
      return null;
    } catch (e) { return 'shape could not be read'; }
  }
  function checkMesh(g) {
    const p = g.positions, n = g.normals, i = g.indices;
    if (!Array.isArray(p) || p.length % 3 || !p.length) return 'mesh positions must be a list of xyz triples';
    if (p.length / 3 > MAX_MESH_VERTS) return 'mesh has too many vertices';
    if (p.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'mesh positions must be finite numbers';
    if (n !== undefined && (!Array.isArray(n) || n.length !== p.length)) return 'mesh normals must match the positions';
    if (!Array.isArray(i) || i.length % 3) return 'mesh indices must be triangles';
    const vc = p.length / 3;
    if (i.some((v) => !Number.isInteger(v) || v < 0 || v >= vc)) return 'mesh index out of range';
    if (g.uvs !== undefined && (!Array.isArray(g.uvs) || g.uvs.length !== vc * 2 || g.uvs.some((v) => typeof v !== 'number' || !Number.isFinite(v)))) return 'mesh uvs must be two numbers per vertex';
    if (g.faces !== undefined) {
      if (!Array.isArray(g.faces) || g.faces.some((f) => !Array.isArray(f) || f.length < 3 || f.some((v) => !Number.isInteger(v) || v < 0 || v >= vc))) return 'mesh faces must be lists of three or more vertex indices';
      if (g.hidden !== undefined && (!Array.isArray(g.hidden) || g.hidden.some((f) => !Number.isInteger(f) || f < 0 || f >= g.faces.length))) return 'mesh hidden must list face indices';
    }
    return null;
  }

  /* ---------- generators ---------- */
  function Buf() { return { p: [], n: [], i: [] }; }
  /** A flat quad centred at c with half-extents hu along u and hv along v (u × v must equal n). */
  function quad(b, c, u, v, hu, hv, n) {
    const base = b.p.length / 3;
    for (const [a, k] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let j = 0; j < 3; j++) b.p.push(c[j] + u[j] * a * hu + v[j] * k * hv);
      b.n.push(n[0], n[1], n[2]);
    }
    b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  function cube(size) {
    const b = Buf(), h = size / 2;
    quad(b, [h, 0, 0], [0, 0, -1], [0, 1, 0], h, h, [1, 0, 0]);
    quad(b, [-h, 0, 0], [0, 0, 1], [0, 1, 0], h, h, [-1, 0, 0]);
    quad(b, [0, h, 0], [1, 0, 0], [0, 0, -1], h, h, [0, 1, 0]);
    quad(b, [0, -h, 0], [1, 0, 0], [0, 0, 1], h, h, [0, -1, 0]);
    quad(b, [0, 0, h], [1, 0, 0], [0, 1, 0], h, h, [0, 0, 1]);
    quad(b, [0, 0, -h], [-1, 0, 0], [0, 1, 0], h, h, [0, 0, -1]);
    return b;
  }
  function plane(w, d) {
    const b = Buf();
    quad(b, [0, 0, 0], [1, 0, 0], [0, 0, -1], w / 2, d / 2, [0, 1, 0]);
    return b;
  }
  /** UV sphere: rings from pole to pole, seg segments around. */
  function sphere(radius, seg, rings) {
    const b = Buf();
    for (let r = 0; r <= rings; r++) {
      const phi = Math.PI * r / rings;
      for (let s = 0; s <= seg; s++) {
        const th = TAU * s / seg;
        const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
        b.p.push(radius * x, radius * y, radius * z); b.n.push(x, y, z);
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s, c = a + seg + 1;
      b.i.push(a, a + 1, c, a + 1, c + 1, c);
    }
    return b;
  }
  /** Cylinder along Y, with flat caps. */
  function cylinder(radius, height, seg) {
    const b = Buf(), h = height / 2;
    for (let s = 0; s <= seg; s++) {
      const th = TAU * s / seg, x = Math.cos(th), z = Math.sin(th);
      b.p.push(radius * x, -h, radius * z, radius * x, h, radius * z); b.n.push(x, 0, z, x, 0, z);
    }
    for (let s = 0; s < seg; s++) { const a = s * 2; b.i.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    for (const [y, ny] of [[h, 1], [-h, -1]]) {
      const c = b.p.length / 3;
      b.p.push(0, y, 0); b.n.push(0, ny, 0);
      for (let s = 0; s <= seg; s++) { const th = TAU * s / seg; b.p.push(radius * Math.cos(th), y, radius * Math.sin(th)); b.n.push(0, ny, 0); }
      for (let s = 0; s < seg; s++) (ny > 0 ? b.i.push(c, c + 2 + s, c + 1 + s) : b.i.push(c, c + 1 + s, c + 2 + s));
    }
    return b;
  }
  function cone(radius, height, seg) {
    const b = Buf(), h = height / 2, rise = radius / height, len = Math.hypot(1, rise);
    for (let s = 0; s <= seg; s++) {
      const th = TAU * s / seg, x = Math.cos(th), z = Math.sin(th);
      b.p.push(0, h, 0, radius * x, -h, radius * z); b.n.push(x / len, rise / len, z / len, x / len, rise / len, z / len);
    }
    for (let s = 0; s < seg; s++) { const a = s * 2; b.i.push(a, a + 3, a + 2); }
    const c = b.p.length / 3;
    b.p.push(0, -h, 0); b.n.push(0, -1, 0);
    for (let s = 0; s <= seg; s++) { const th = TAU * s / seg; b.p.push(radius * Math.cos(th), -h, radius * Math.sin(th)); b.n.push(0, -1, 0); }
    for (let s = 0; s < seg; s++) b.i.push(c, c + 1 + s, c + 2 + s);
    return b;
  }
  function torus(R0, r0, seg, sides) {
    const b = Buf();
    for (let i = 0; i <= sides; i++) {
      const ph = TAU * i / sides, cp = Math.cos(ph), sp = Math.sin(ph);
      for (let j = 0; j <= seg; j++) {
        const th = TAU * j / seg, ct = Math.cos(th), st = Math.sin(th);
        b.p.push((R0 + r0 * cp) * ct, r0 * sp, (R0 + r0 * cp) * st); b.n.push(cp * ct, sp, cp * st);
      }
    }
    for (let i = 0; i < sides; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, c = a + seg + 1;
      b.i.push(a, c, a + 1, a + 1, c, c + 1);
    }
    return b;
  }

  /** Builds a shape. The blob is built by blob.js (icosphere plus noise). */
  function build(geom) {
    if (geom.kind === 'mesh' && geom.faces) return S.meshrender.build(geom);
    if (geom.kind === 'mesh') {
      const out = { positions: geom.positions.slice(), normals: geom.normals ? geom.normals.slice() : null, indices: geom.indices.slice() };
      if (geom.uvs) out.uvs = geom.uvs.slice();
      return out;
    }
    const g = normalize(geom);
    let b;
    switch (g.kind) {
      case 'cube': b = cube(g.size); break;
      case 'plane': b = plane(g.width, g.depth); break;
      case 'sphere': b = sphere(g.radius, g.segments, g.rings); break;
      case 'cylinder': b = cylinder(g.radius, g.height, g.segments); break;
      case 'cone': b = cone(g.radius, g.height, g.segments); break;
      case 'torus': b = torus(g.radius, g.tube, g.segments, g.sides); break;
      default: return S.blob.build(g);
    }
    return { positions: b.p, normals: b.n, indices: b.i };
  }

  S.geometry = { KINDS, DEFAULTS, SPEC, normalize, check, build, quad };
})();
