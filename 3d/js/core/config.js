/* Slop 3D scene config (pure): the scene3d data that builds objects from a list, and the export of a scene's
 * primitives back to the same shape. Data is { objects: [...], lights: [...] } (a bare list is read as objects).
 *   object: { type: cube|sphere|cylinder|cone|torus|plane|group, name?, position?: [x,y,z], rotation?: [x,y,z] degrees,
 *             scale?: [x,y,z], material?: { color: '#rrggbb', roughness?, metallic?, opacity? 0..1 },
 *             params?: shape parameters (as in geometry.js, e.g. { radius: 0.5 }), children?: [objects] (groups only) }
 *   light:  { type: directional|ambient, name?, color?: '#rrggbb', intensity?: 0..100, position?: [x,y,z] }
 * validate(data) → { ok, errors, trees }: all or nothing. trees are ready for ops.importTree, one per root.
 * exportScene(scene) → { data, skipped }: the visible primitives and lights, world transforms, groups flattened.
 * Sets window.Slop3D.config. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, G = S.geometry, X = S.xform, O = S.ops;
  const PRIMS = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'plane'];
  const LIGHTS = ['directional', 'ambient'];
  const MAX_OBJECTS = 500, MAX_DEPTH = 8, MAX_ERRORS = 20;
  const HEX = /^#[0-9a-f]{6}$/i;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /** [x, y, z] from v (or the default when v is missing), or null when v is not three numbers. */
  function vec3(v, dflt) {
    if (v === undefined) return dflt.slice();
    return Array.isArray(v) && v.length === 3 && v.every(isNum) ? v.slice() : null;
  }

  function validate(data) {
    const errs = [], trees = [];
    let count = 0;
    const bad = (path, msg) => { if (errs.length < MAX_ERRORS) errs.push(`${path}: ${msg}`); };
    const root = Array.isArray(data) ? { objects: data } : data;
    if (!root || typeof root !== 'object' || Array.isArray(root)) return { ok: false, errors: ['the config must be an object with objects and lights lists'], trees: [] };
    if (root.objects !== undefined && !Array.isArray(root.objects)) bad('objects', 'must be a list');
    if (root.lights !== undefined && !Array.isArray(root.lights)) bad('lights', 'must be a list');

    function material(mat, path) {
      if (mat === undefined) return M.material({});
      if (!mat || typeof mat !== 'object' || Array.isArray(mat)) { bad(path, 'material must be an object'); return null; }
      if (mat.color !== undefined && !(typeof mat.color === 'string' && HEX.test(mat.color))) bad(path + '.color', 'must be #rrggbb');
      for (const k of ['roughness', 'metallic', 'opacity']) {
        if (mat[k] !== undefined && !(isNum(mat[k]) && mat[k] >= 0 && mat[k] <= 1)) bad(`${path}.${k}`, 'must be a number from 0 to 1');
      }
      return M.material({ color: mat.color, roughness: mat.roughness, metallic: mat.metallic, opacity: mat.opacity });
    }
    function object(o, path, depth) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) { bad(path, 'must be an object'); return null; }
      if (++count > MAX_OBJECTS) { bad(path, `a config holds at most ${MAX_OBJECTS} objects`); return null; }
      const type = o.type;
      if (type !== 'group' && !PRIMS.includes(type)) { bad(path + '.type', `must be one of ${PRIMS.join(', ')}, group`); return null; }
      const name = o.name === undefined ? cap(type) : o.name;
      if (typeof name !== 'string' || name.length > 80) bad(path + '.name', 'must be text of up to 80 characters');
      const p = vec3(o.position, [0, 0, 0]), r = vec3(o.rotation, [0, 0, 0]), s = vec3(o.scale, [1, 1, 1]);
      if (!p) bad(path + '.position', 'must be three numbers');
      if (!r) bad(path + '.rotation', 'must be three numbers (degrees)');
      if (!s) bad(path + '.scale', 'must be three numbers');
      const transform = { p: p || [0, 0, 0], r: r || [0, 0, 0], s: s || [1, 1, 1] };
      if (type === 'group') {
        if (o.children !== undefined && !Array.isArray(o.children)) { bad(path + '.children', 'must be a list'); return null; }
        if (depth >= MAX_DEPTH) { bad(path, `groups nest at most ${MAX_DEPTH} deep`); return null; }
        const children = (o.children || []).map((c, k) => object(c, `${path}.children[${k}]`, depth + 1)).filter(Boolean);
        return { type: 'group', name, transform, children };
      }
      const raw = Object.assign({}, G.DEFAULTS[type], o.params || {}, { kind: type });
      if (o.params !== undefined && (!o.params || typeof o.params !== 'object' || Array.isArray(o.params))) { bad(path + '.params', 'must be an object'); return null; }
      const shapeErr = G.check(raw);
      if (shapeErr) bad(path + '.params', shapeErr);
      const mat = material(o.material, path + '.material');
      if (!p || !r || !s || shapeErr || !mat) return null;
      return { type: 'mesh', name, transform, geom: G.normalize(raw), material: mat };
    }
    function light(l, path) {
      if (!l || typeof l !== 'object' || Array.isArray(l)) { bad(path, 'must be an object'); return null; }
      if (++count > MAX_OBJECTS) { bad(path, `a config holds at most ${MAX_OBJECTS} objects`); return null; }
      if (!LIGHTS.includes(l.type)) { bad(path + '.type', 'must be directional or ambient'); return null; }
      const color = l.color === undefined ? '#ffffff' : l.color;
      if (!(typeof color === 'string' && HEX.test(color))) bad(path + '.color', 'must be #rrggbb');
      const intensity = l.intensity === undefined ? 1 : l.intensity;
      if (!(isNum(intensity) && intensity >= 0 && intensity <= 100)) bad(path + '.intensity', 'must be a number from 0 to 100');
      const pos = vec3(l.position, [0, 0, 0]);
      if (!pos) bad(path + '.position', 'must be three numbers');
      const name = l.name === undefined ? (l.type === 'ambient' ? 'Ambient' : 'Sun') : l.name;
      if (typeof name !== 'string' || name.length > 80) bad(path + '.name', 'must be text of up to 80 characters');
      if (!pos || !(HEX.test(color)) || !(isNum(intensity)) || typeof name !== 'string') return null;
      return { type: 'light', name, transform: { p: pos, r: [0, 0, 0], s: [1, 1, 1] }, light: { kind: l.type, color, intensity } };
    }

    (root.objects || []).forEach((o, i) => { const t = object(o, `objects[${i}]`, 0); if (t) trees.push(t); });
    (root.lights || []).forEach((l, i) => { const t = light(l, `lights[${i}]`); if (t) trees.push(t); });
    return errs.length ? { ok: false, errors: errs, trees: [] } : { ok: true, errors: [], trees };
  }

  /** The visible primitives and lights of a scene, as scene3d data. Meshes that are not primitives are counted in skipped. */
  function exportScene(scene) {
    const objects = [], lights = [];
    let skipped = 0;
    for (const id of Object.keys(scene.nodes)) {
      const n = scene.nodes[id];
      if (!O.visibleChain(scene, id) || n.type === 'group') continue;
      const d = X.decompose(M.worldMatrix(scene, id));
      if (n.type === 'light') {
        const entry = { type: n.light.kind, name: n.name, color: n.light.color, intensity: n.light.intensity };
        if (n.light.kind === 'directional') entry.position = d.p;
        lights.push(entry);
      } else if (n.geom.kind === 'mesh') skipped++;
      else {
        const params = Object.assign({}, n.geom);
        delete params.kind;
        objects.push({ type: n.geom.kind, name: n.name, position: d.p, rotation: d.r, scale: d.s, material: { color: n.material.color, roughness: n.material.roughness, metallic: n.material.metallic, opacity: n.material.opacity }, params });
      }
    }
    return { data: { objects, lights }, skipped };
  }

  S.config = { PRIMS, LIGHTS, validate, exportScene };
})();
