/* Slop 3D transform maths. Pure: no DOM, no three.js (loads in Node for tests).
 * Matrices are 4×4 column-major flat arrays (16 numbers), the layout three.js and WebGL use.
 * Rotations are Euler angles in DEGREES, order XYZ, meaning R = Rx · Ry · Rz (the three.js convention).
 * Sets window.Slop3D.xform. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const D = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Strips floating-point noise so saved numbers stay tidy (1e-9 resolution). */
  const r9 = (v) => Math.round(v * 1e9) / 1e9;
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  /** a · b */
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }

  /** Translation p, Euler rotation r (degrees, XYZ), scale s → matrix T · R · S. */
  function fromTRS(p, r, s) {
    const [x, y, z] = r.map((d) => d * D);
    const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
    const R = [
      [cy * cz, -cy * sz, sy],
      [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
      [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
    ];
    const m = identity();
    for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) m[c * 4 + rr] = R[rr][c] * s[c];
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2];
    return m;
  }

  /** Rotation matrix (translation 0) from a quaternion [x, y, z, w]. */
  function fromQuat(q) {
    const [x, y, z, w] = q;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return [1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
      2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
      2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
      0, 0, 0, 1];
  }

  /** Matrix → { p, r (degrees XYZ), s }. Shear is dropped (rare, and it cannot be stored as TRS). */
  function decompose(m) {
    const p = [m[12], m[13], m[14]];
    const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
    const sx = Math.hypot(m[0], m[1], m[2]) * (det < 0 ? -1 : 1), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
    const s = [sx, sy, sz];
    const R = (i, j) => m[j * 4 + i] / (s[j] || 1); // row i, column j of the pure rotation
    const y = Math.asin(clamp(R(0, 2), -1, 1));
    let x, z;
    if (Math.abs(R(0, 2)) < 0.9999999) { x = Math.atan2(-R(1, 2), R(2, 2)); z = Math.atan2(-R(0, 1), R(0, 0)); }
    else { x = Math.atan2(R(2, 1), R(1, 1)); z = 0; }
    return { p: p.map(r9), r: [x / D, y / D, z / D].map((v) => r9(v)), s: s.map(r9) };
  }

  /** Inverse of a 4×4 matrix, or null when it is singular. */
  function invert(m) {
    const a = [], inv = [];
    for (let r = 0; r < 4; r++) {
      a.push([]); inv.push([]);
      for (let c = 0; c < 4; c++) { a[r].push(m[c * 4 + r]); inv[r].push(r === c ? 1 : 0); }
    }
    for (let c = 0; c < 4; c++) {
      let piv = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
      if (Math.abs(a[piv][c]) < 1e-14) return null;
      [a[c], a[piv]] = [a[piv], a[c]];
      [inv[c], inv[piv]] = [inv[piv], inv[c]];
      const d = a[c][c];
      for (let k = 0; k < 4; k++) { a[c][k] /= d; inv[c][k] /= d; }
      for (let r = 0; r < 4; r++) if (r !== c) {
        const f = a[r][c];
        if (f) for (let k = 0; k < 4; k++) { a[r][k] -= f * a[c][k]; inv[r][k] -= f * inv[c][k]; }
      }
    }
    const o = identity();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) o[c * 4 + r] = inv[r][c];
    return o;
  }

  /** Transforms a point (with translation). */
  function point(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  }
  /** Transforms a direction (no translation). Use the inverse-transpose for normals. */
  function dir(m, v) {
    return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]];
  }
  /** Normal matrix (3×3, row-major flat) for a model matrix: transpose of the inverse linear part. */
  function normalMatrix(m) {
    const inv = invert(m) || identity();
    return [inv[0], inv[1], inv[2], inv[4], inv[5], inv[6], inv[8], inv[9], inv[10]];
  }
  const normalApply = (n, v) => { const o = [n[0] * v[0] + n[1] * v[1] + n[2] * v[2], n[3] * v[0] + n[4] * v[1] + n[5] * v[2], n[6] * v[0] + n[7] * v[1] + n[8] * v[2]]; const l = Math.hypot(o[0], o[1], o[2]) || 1; return [o[0] / l, o[1] / l, o[2] / l]; };

  S.xform = { mul, fromTRS, fromQuat, decompose, invert, point, dir, identity, normalMatrix, normalApply, r9, clamp };
})();
