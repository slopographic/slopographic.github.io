/* Work on a loaded model (a three.js Object3D) before it is written: counts, size, units, axis, one shared material
 * type, world-space baking and merging. Pure three.js: no DOM, loads in Node.
 *   stats(root, animations)            → { meshes, points, lines, vertices, triangles, materials, textures, colors, uvs, … }
 *   bounds(root)                       → { min: [x,y,z], max: [x,y,z], size: [x,y,z] } or null
 *   transform(root, { scale, up })     → a new Group holding root, scaled and turned (Z-up to Y-up or back)
 *   standardMaterials(root)            → every mesh material becomes a MeshStandardMaterial (colour, map, opacity kept)
 *   bake(root, T)                      → a flat Group of world-space copies of every mesh, points and line object
 *   merge(group, T, mergeGeometries)   → one mesh (material groups kept) plus the points and lines */
import * as T from '../../vendor/three/three.module.min.js';
/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };

const MAPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap', 'bumpMap', 'specularMap'];
const mats = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []);

export function stats(root, animations = []) {
  const s = { meshes: 0, points: 0, lines: 0, vertices: 0, triangles: 0, materials: 0, textures: 0, colors: false, uvs: false,
    skinning: false, morphs: false, lights: 0, cameras: 0, nodes: 0, animations: animations.length };
  const m = new Set(), t = new Set();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    s.nodes++;
    if (o.isLight) s.lights++;
    if (o.isCamera) s.cameras++;
    const g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return;
    if (o.isMesh) {
      s.meshes++;
      s.triangles += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
      if (o.isSkinnedMesh) s.skinning = true;
      if (g.morphAttributes && Object.keys(g.morphAttributes).length) s.morphs = true;
    } else if (o.isPoints) s.points++;
    else if (o.isLine) s.lines++;
    else return;
    s.vertices += g.attributes.position.count;
    if (g.attributes.color) s.colors = true;
    if (g.attributes.uv) s.uvs = true;
    for (const x of mats(o)) { m.add(x); for (const k of MAPS) if (x[k]) t.add(x[k]); }
  });
  s.materials = m.size;
  s.textures = t.size;
  return s;
}

export function bounds(root) {
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root, true);
  if (box.isEmpty()) return null;
  const size = box.getSize(new T.Vector3());
  return { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() };
}

/** up: 'keep', 'z-to-y' (a Z-up model such as most STL and 3MF files, made Y-up) or 'y-to-z'. */
export function transform(root, { scale = 1, up = 'keep' } = {}) {
  const g = new T.Group();
  g.name = root.name || 'Model';
  g.add(root);
  const k = Number(scale) > 0 ? Number(scale) : 1;
  g.scale.setScalar(k);
  if (up === 'z-to-y') g.rotation.x = -Math.PI / 2;
  else if (up === 'y-to-z') g.rotation.x = Math.PI / 2;
  g.updateMatrixWorld(true);
  return g;
}

/** A MeshStandardMaterial with what the source material has: colour, texture, opacity, emissive, normal map, sides. */
function toStandard(src) {
  if (src.isMeshStandardMaterial) return src;
  const out = new T.MeshStandardMaterial({ name: src.name, color: src.color ? src.color.clone() : 0xcccccc, map: src.map || null,
    opacity: src.opacity ?? 1, transparent: !!src.transparent, side: src.side ?? T.FrontSide, vertexColors: !!src.vertexColors,
    normalMap: src.normalMap || null, alphaMap: src.alphaMap || null, emissiveMap: src.emissiveMap || null,
    roughness: src.shininess !== undefined ? Math.max(0.05, Math.min(1, 1 - Math.sqrt(src.shininess / 100))) : 0.6, metalness: 0 });
  if (src.emissive) out.emissive.copy(src.emissive);
  return out;
}
export function standardMaterials(root) {
  const seen = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const conv = (m) => { if (!seen.has(m)) seen.set(m, toStandard(m)); return seen.get(m); };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material || new T.MeshStandardMaterial());
  });
  return root;
}

/** A geometry in world space: skinning and morph targets at their current pose, winding kept outward when mirrored. */
function worldGeometry(o) {
  const src = o.geometry, g = src.clone();
  if ((o.isSkinnedMesh || (src.morphAttributes && src.morphAttributes.position)) && o.getVertexPosition) {
    const p = g.attributes.position, v = new T.Vector3();
    for (let i = 0; i < p.count; i++) { o.getVertexPosition(i, v); p.setXYZ(i, v.x, v.y, v.z); }
    g.morphAttributes = {};
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
  }
  g.applyMatrix4(o.matrixWorld);
  if (o.isMesh && o.matrixWorld.determinant() < 0) {
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const ix = g.index;
    for (let i = 0; i + 2 < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
  }
  return g;
}

/** Copies of every drawable object in world space under one Group (names kept, so OBJ objects keep them). */
export function bake(root) {
  root.updateMatrixWorld(true);
  const out = new T.Group();
  out.name = root.name || 'Model';
  root.traverse((o) => {
    if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position || o.visible === false) return;
    const g = worldGeometry(o);
    const C = o.isMesh ? T.Mesh : o.isPoints ? T.Points : o.isLineSegments ? T.LineSegments : o.isLine ? T.Line : null;
    if (!C) return;
    const copy = new C(g, o.material);
    copy.name = o.name || (o.parent && o.parent.name) || '';
    out.add(copy);
  });
  return out;
}

/** The attributes every geometry has, so they can be joined (uv and color only when all have them). */
function common(geos) {
  const keep = ['position', 'normal', 'uv', 'color'].filter((k) => geos.every((g) => g.attributes[k]));
  return geos.map((g) => {
    const n = g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
    for (const k of Object.keys(n.attributes)) if (!keep.includes(k)) n.deleteAttribute(k);
    if (n.attributes.color && n.attributes.color.itemSize !== 3) n.deleteAttribute('color');
    return n;
  });
}

/** Joins the meshes of a baked group into one mesh with one material per part. mergeGeometries: BufferGeometryUtils'. */
export function merge(group, mergeGeometries) {
  const meshes = group.children.filter((o) => o.isMesh);
  if (meshes.length < 2) return group;
  const geos = [], materials = [];
  for (const m of meshes) {
    const g = m.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const list = mats(m);
    if (Array.isArray(m.material) && g.groups.length) {
      for (const gr of g.groups) {
        const part = g.clone();
        part.clearGroups();
        const ix = g.index ? [...g.index.array.slice(gr.start, gr.start + gr.count)] : [...Array(gr.count).keys()].map((i) => i + gr.start);
        part.setIndex(ix);
        geos.push(part); materials.push(list[gr.materialIndex] || list[0]);
      }
    } else { g.clearGroups(); geos.push(g); materials.push(list[0]); }
  }
  const joined = mergeGeometries(common(geos), true);
  if (!joined) throw new Error(tr('ui.d3.merge_failed'));
  const out = new T.Group();
  out.name = group.name;
  const one = new T.Mesh(joined, materials);
  one.name = group.name || 'Merged';
  out.add(one, ...group.children.filter((o) => !o.isMesh));
  return out;
}
