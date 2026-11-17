/* Slop Image to 3D: the Slop 3D scene (.s3d) for a generated mesh, so Slop 3D can open it from Slop Drive. Pure.
 * sceneOf(mesh, { name, texture }) → scene object (format "slop-3d", version 1, one mesh node). mesh is the output of
 * hf.heightField; texture is an optional data:image/jpeg URL (under 12 MB, the 3d limit). Sets window.SlopImg3D.s3d. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});

  /** Plain numbers rounded to 1e-5 (keeps the file small; the mesh is in plane units anyway). */
  const round = (a) => Array.from(a, (v) => Math.round(v * 1e5) / 1e5);

  function sceneOf(mesh, opts = {}) {
    const name = String(opts.name || 'Image to 3D').slice(0, 80);
    const node = {
      id: 'n1', type: 'mesh', name, visible: true, parent: null,
      transform: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
      geom: { kind: 'mesh', positions: round(mesh.positions), normals: round(mesh.normals), indices: Array.from(mesh.indices), uvs: round(mesh.uv) },
      material: { color: '#ffffff', roughness: 0.9, metallic: 0, opacity: 1 },
    };
    if (opts.texture) node.material.map = opts.texture;
    // Slop 3D lights a scene only from its light nodes, so the file carries an ambient and a sun light.
    const light = (id, kind, intensity, p) => ({ id, type: 'light', name: kind === 'ambient' ? 'Ambient' : 'Sun', visible: true, parent: null,
      transform: { p, r: [0, 0, 0], s: [1, 1, 1] }, light: { kind, color: '#ffffff', intensity } });
    const nodes = { n1: node, l1: light('l1', 'ambient', 35, [0, 0, 0]), l2: light('l2', 'directional', 70, [1, 2, 3]) };
    return { format: 'slop-3d', version: 1, name, seq: 1, roots: ['n1', 'l1', 'l2'], nodes };
  }

  ns.s3d = { sceneOf };
})(typeof window !== 'undefined' ? window : globalThis);
