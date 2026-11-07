/* Slop 3D mesh element transforms (pure). Move, rotate and scale work in WORLD space: a world matrix A is turned
 * into the mesh's local space (inv(W) · A · W, W being the object's world matrix), so the stored vertices stay exact
 * whatever the object's own position, rotation and scale are. Sets window.Slop3D.meshxf. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const X = S.xform, MH = S.mesh;
  const T = (p) => X.fromTRS(p, [0, 0, 0], [1, 1, 1]);

  /** Translation by d. */
  const translate = (d) => T(d);
  /** Rotation by deg degrees about an axis through the origin (Rodrigues). */
  function rotation(axis, deg) {
    const [x, y, z] = MH.unit(axis), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    const R = [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
    const m = X.identity();
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[k * 4 + r] = R[r][k];
    return m;
  }
  /** Scale by f: uniformly when axis is null, otherwise only along the unit axis. */
  function scale(f, axis = null) {
    const m = X.identity();
    if (!axis) { m[0] = m[5] = m[10] = f; return m; }
    const a = MH.unit(axis);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) m[k * 4 + r] = (r === k ? 1 : 0) + (f - 1) * a[r] * a[k];
    return m;
  }
  /** Applies m about a world pivot: T(p) · m · T(-p). */
  function about(pivot, m) {
    return X.mul(T(pivot), X.mul(m, T([-pivot[0], -pivot[1], -pivot[2]])));
  }
  /** Converts a world matrix into the local space of an object whose world matrix is W (null if W is singular). */
  function toLocal(W, A) {
    const inv = X.invert(W);
    return inv ? X.mul(inv, X.mul(A, W)) : null;
  }
  /** A new mesh whose listed vertices have moved by the local matrix L. */
  function apply(m, verts, L) {
    const pos = m.pos.map((p) => p.slice());
    for (const v of verts) pos[v] = X.point(L, m.pos[v]);
    return { pos, faces: m.faces.map((f) => ({ v: f.v.slice(), hide: f.hide })) };
  }
  /** Mean of the listed vertices in local space (the pivot of an element transform). */
  function centre(m, verts) {
    const c = [0, 0, 0];
    for (const v of verts) for (let k = 0; k < 3; k++) c[k] += m.pos[v][k] / verts.size;
    return c;
  }

  S.meshxf = { translate, rotation, scale, about, toLocal, apply, centre };
})();
