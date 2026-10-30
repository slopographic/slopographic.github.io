/* Slop 3D model files: opening and exporting OBJ, STL, PLY, glTF, GLB, 3MF, DAE, FBX and USDZ through the shared 3D I/O
 * module (shared/3d-io, the three.js loaders and exporters), the same one File convert uses. Loaded on first use.
 *   treeFor(files, name)            → { tree, warnings }: an import tree (see ops.importTree) of the model among files
 *   exportFiles(doc, format, name)  → { files: [{ name, blob }], notes }: the visible meshes and groups of a scene
 * A three.js object becomes a group (its transform, its children) or a mesh node (positions, normals, UVs, triangles,
 * colour, roughness, metallic, opacity and the colour texture as an embedded picture). Several materials on one mesh
 * give one mesh node each. Point clouds, lines, cameras and lights are left out and counted. Sets Slop3D.modelio. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const t = (key, vars) => (window.SlopI18n ? SlopI18n.t(key, vars) : key);
  const READ = ['obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx'];
  const WRITE = ['obj', 'stl', 'ply', 'glb', 'gltf', 'usdz'];
  const COMPANIONS = ['mtl', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'ktx2'];
  const D = Math.PI / 180;
  const ROOT = new URL('../../../', (document.currentScript && document.currentScript.src) || location.href);   // the site root
  const url = (p) => new URL('shared/3d-io/' + p, ROOT).href;
  let mods = null, loading = null;   // the modules, once loaded
  const load = () => (loading ??= Promise.all(['read.js', 'write.js', 'textures.js'].map((f) => import(url(f))))
    .then(([read, write, textures]) => (mods = { read, write, textures, T: read.THREE })));

  /** The vertices of a three.js geometry as plain arrays, with skinning and morphs at their current pose. */
  function arrays(o) {
    const g = o.geometry, p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const pos = new Array(p.count * 3), nrm = n ? new Array(p.count * 3) : null, uvs = uv ? new Array(p.count * 2) : null;
    const posed = (o.isSkinnedMesh || (g.morphAttributes && g.morphAttributes.position)) && o.getVertexPosition;
    const v = posed ? new (mods.T.Vector3)() : null;
    for (let i = 0; i < p.count; i++) {
      if (posed) { o.getVertexPosition(i, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
      else { pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i); }
      if (nrm) { nrm[i * 3] = n.getX(i); nrm[i * 3 + 1] = n.getY(i); nrm[i * 3 + 2] = n.getZ(i); }
      if (uvs) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
    }
    const idx = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
    return { pos, nrm, uvs, idx };
  }
  /** The part of a mesh that uses one material: only the vertices its triangles use. */
  function part(a, from, count) {
    const map = new Map(), out = { positions: [], normals: a.nrm ? [] : undefined, uvs: a.uvs ? [] : undefined, indices: [] };
    for (let i = from; i < Math.min(a.idx.length, from + count); i++) {
      const v = a.idx[i];
      if (!map.has(v)) {
        map.set(v, map.size);
        out.positions.push(a.pos[v * 3], a.pos[v * 3 + 1], a.pos[v * 3 + 2]);
        if (a.nrm) out.normals.push(a.nrm[v * 3], a.nrm[v * 3 + 1], a.nrm[v * 3 + 2]);
        if (a.uvs) out.uvs.push(a.uvs[v * 2], a.uvs[v * 2 + 1]);
      }
      out.indices.push(map.get(v));
    }
    out.indices.length -= out.indices.length % 3;
    if (!out.normals) out.normals = S.blob.computeNormals(out.positions, out.indices);
    if (!out.uvs) delete out.uvs;
    return Object.assign({ kind: 'mesh' }, out);
  }
  async function materialOf(m, warn) {
    const out = { color: '#' + (m.color ? m.color.getHexString() : 'cccccc'), roughness: m.roughness ?? (m.shininess !== undefined ? Math.max(0.05, Math.min(1, 1 - Math.sqrt(m.shininess / 100))) : 0.6),
      metallic: m.metalness ?? 0, opacity: m.transparent ? m.opacity ?? 1 : 1 };
    if (m.map) {
      const data = await mods.textures.textureDataUrl(mods.textures.plainTexture(m.map) || m.map, 2048);
      if (data && data.length < 12000000) out.map = data; else warn.textures++;
    }
    return out;
  }
  async function meshNodes(o, warn) {
    const a = arrays(o), list = Array.isArray(o.material) ? o.material : [o.material];
    const groups = Array.isArray(o.material) && o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: a.idx.length, materialIndex: 0 }];
    const out = [];
    for (const [k, gr] of groups.entries()) {
      const geom = part(a, gr.start, gr.count);
      if (!geom.indices.length) continue;
      if (geom.positions.length / 3 > 2000000) { warn.big++; continue; }
      out.push({ type: 'mesh', name: (o.name || 'Mesh') + (groups.length > 1 ? ' ' + (k + 1) : ''), geom, material: await materialOf(list[gr.materialIndex] || list[0] || {}, warn) });
    }
    return out;
  }
  /** One three.js object → an import tree node, or null when nothing in it can be shown. */
  async function nodeOf(o, warn) {
    o.updateMatrix();
    const transform = S.xform.decompose(Array.from(o.matrix.elements));
    if (o.isPoints) warn.points++;
    if (o.isLine) warn.lines++;
    if (o.isSkinnedMesh) warn.posed = true;
    const meshes = o.isMesh && o.geometry && o.geometry.attributes.position ? await meshNodes(o, warn) : [];
    const kids = [];
    for (const c of o.children) { const kid = await nodeOf(c, warn); if (kid) kids.push(kid); }
    if (meshes.length === 1 && !kids.length) return Object.assign(meshes[0], { transform });
    if (!meshes.length && !kids.length) return null;
    return { type: 'group', name: o.name || 'Node', transform, children: [...meshes, ...kids] };
  }

  async function treeFor(files, name) {
    await load();
    const r = await mods.read.readModel(files);
    const warn = { points: 0, lines: 0, textures: 0, big: 0, posed: false };
    const tree = await nodeOf(r.root, warn);
    if (!tree) throw new Error(t('3d.model.no_meshes'));
    let top = tree.type === 'group' ? tree : { type: 'group', name, children: [tree] };
    const still = (xf) => !xf || (xf.p.every((v) => v === 0) && xf.r.every((v) => v === 0) && xf.s.every((v) => v === 1));
    // a file whose root holds one group (a glTF scene around its model) opens as that group, not two levels
    if (top.children.length === 1 && top.children[0].type === 'group' && still(top.transform)) top = top.children[0];
    if (!top.name || top.name === 'Node') top.name = name;
    const warnings = r.warnings.slice();
    const what = [warn.points && t('3d.model.points', { n: warn.points }), warn.lines && t('3d.model.lines', { n: warn.lines })].filter(Boolean);
    if (what.length) warnings.push(t('3d.model.left_out', { what: window.SlopI18n ? SlopI18n.list(what) : what.join(' and ') }));
    if (warn.textures) warnings.push(t('3d.model.textures', { n: warn.textures }));
    if (warn.big) warnings.push(t('3d.model.big', { n: warn.big }));
    if (r.animations.length || warn.posed) warnings.push(t('3d.model.animations'));
    return { tree: top, warnings };
  }

  /** The visible meshes and groups of a scene as three.js objects (lights are not exported). */
  async function sceneObject(doc) {
    const T = mods.T, root = new T.Group();
    root.name = doc.name || 'Scene';
    const textures = new Map();
    const build = async (id) => {
      const n = doc.nodes[id];
      if (!n || !n.visible || n.type === 'light') return null;
      let o;
      if (n.type === 'group') {
        o = new T.Group();
        for (const c of n.children) { const k = await build(c); if (k) o.add(k); }
      } else {
        const m = n.material;
        const mat = new T.MeshStandardMaterial({ name: n.name, color: new T.Color(m.color), roughness: m.roughness, metalness: m.metallic, opacity: m.opacity, transparent: m.opacity < 1, side: T.DoubleSide });
        if (m.map) {
          if (!textures.has(m.map)) textures.set(m.map, new T.TextureLoader().loadAsync(m.map).then((tex) => { tex.colorSpace = T.SRGBColorSpace; return tex; }).catch(() => null));
          mat.map = await textures.get(m.map);
        }
        o = new T.Mesh(S.objects.toGeometry(T, S.geometry.build(n.geom)), mat);
      }
      o.name = n.name;
      const xf = n.transform;
      o.position.set(xf.p[0], xf.p[1], xf.p[2]);
      o.rotation.set(xf.r[0] * D, xf.r[1] * D, xf.r[2] * D, 'XYZ');
      o.scale.set(xf.s[0], xf.s[1], xf.s[2]);
      return o;
    };
    for (const id of doc.roots) { const o = await build(id); if (o) root.add(o); }
    root.updateMatrixWorld(true);
    return root;
  }

  async function exportFiles(doc, format, name) {
    await load();
    const root = await sceneObject(doc);
    let any = false;
    root.traverse((o) => { if (o.isMesh) any = true; });
    if (!any) throw new Error(t('3d.model.nothing_export'));
    return mods.write.writeModel(root, format, { name });
  }

  S.modelio = { READ, WRITE, COMPANIONS, treeFor, exportFiles, sceneObject, load };
})();
