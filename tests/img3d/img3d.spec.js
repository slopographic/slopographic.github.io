/* Slop Image to 3D, browser tests: a generated 64×64 test picture (encoded to PNG and decoded again, as a file would be)
 * becomes a height-field mesh with the expected vertex and index counts. The viewport tests need WebGL and pass as skipped
 * when the browser has none. Uses the classic core scripts loaded by app.test.html. */
(function () {
  'use strict';
  const I = window.SlopImg3D;
  const { describe, it, expect } = window.SlopTest;

  /** A 64×64 test picture: a diagonal ramp with a bright disc, drawn on a canvas. */
  function testCanvas(w = 64, h = 64) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#202020'); g.addColorStop(1, '#e0e0e0');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff'; x.beginPath(); x.arc(w / 2, h / 2, w / 5, 0, Math.PI * 2); x.fill();
    return c;
  }
  /** Canvas → PNG blob → decoded RGBA, the way a picture arrives from disk or Slop Drive. */
  async function roundTrip(canvas) {
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    return { rgba: x.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height, blob };
  }
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();

  describe('Slop Image to 3D: the mesh from a generated picture', () => {
    it('a 64×64 test picture makes a height field with 4096 vertices and 23814 indices', async () => {
      const img = await roundTrip(testCanvas(64, 64));
      expect(img.W).toBe(64);
      expect(img.H).toBe(64);
      const prep = I.prepare(img.rgba, img.W, img.H, { grid: 64 });
      expect(prep.source).toBe('luminance');
      const mesh = I.hf.heightField(prep, { scale: 0.3, smooth: 1 });
      expect(mesh.positions.length / 3).toBe(4096);
      expect(mesh.indices.length).toBe(63 * 63 * 6);
      expect(mesh.uv.length / 2).toBe(4096);
    });

    it('the depth scale is the height of the nearest point', async () => {
      const img = await roundTrip(testCanvas(64, 64));
      const prep = I.prepare(img.rgba, img.W, img.H, { grid: 64 });
      const mesh = I.hf.heightField(prep, { scale: 0.5, smooth: 0 });
      let top = -Infinity;
      for (let i = 2; i < mesh.positions.length; i += 3) top = Math.max(top, mesh.positions[i]);
      expect(Math.abs(top - 0.5) < 1e-5).toBe(true);
    });

    it('the mesh exports as GLB (texture, read back), points as GLB, OBJ, and a .s3d scene (shared 3D writer)', async () => {
      const img = await roundTrip(testCanvas(64, 64));
      const prep = I.prepare(img.rgba, img.W, img.H, { grid: 64 });
      const mesh = I.hf.heightField(prep, { scale: 0.3 });
      const canvas = testCanvas(64, 64);
      const glb = await I.exporter.glbBytes({ kind: 'mesh', positions: mesh.positions, normals: mesh.normals, uv: mesh.uv, indices: mesh.indices }, 'Test', canvas);
      const dv = new DataView(glb);
      expect(dv.getUint32(0, true)).toBe(0x46546c67);
      expect(dv.getUint32(8, true)).toBe(glb.byteLength);
      const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, dv.getUint32(12, true))));
      const prim = json.meshes[0].primitives[0];
      expect(json.accessors[prim.attributes.POSITION].count).toBe(4096);
      expect(json.accessors[prim.indices].count).toBe(63 * 63 * 6);
      expect(json.images[0].mimeType).toBe('image/jpeg');
      // read back by the shared reader (the one Slop 3D and File convert use)
      const { readModel } = await import('../../shared/3d-io/read.js');
      const back = await readModel([{ name: 'Test.glb', blob: new Blob([glb]) }]);
      let tris = 0;
      back.root.traverse((o) => { if (o.isMesh) tris += o.geometry.index.count / 3; });
      expect(tris).toBe(63 * 63 * 2);
      const pts = await I.exporter.glbBytes({ kind: 'points', positions: mesh.positions, colors: new Float32Array(mesh.positions.length) }, 'P');
      const pj = JSON.parse(new TextDecoder().decode(new Uint8Array(pts, 20, new DataView(pts).getUint32(12, true))));
      expect(pj.meshes[0].primitives[0].mode).toBe(0);
      expect(pj.meshes[0].primitives[0].indices).toBe(undefined);
      expect(pj.meshes[0].primitives[0].attributes.COLOR_0 >= 0).toBeTruthy();
      const obj = await I.exporter.objText(mesh, 'Picture');
      const lines = obj.split('\n');
      expect(lines.filter((l) => l.startsWith('v ')).length).toBe(4096);
      expect(lines.filter((l) => l.startsWith('f ')).length).toBe(63 * 63 * 2);
      const scene = I.s3d.sceneOf(mesh, { name: 'Test' });
      expect(scene.format).toBe('slop-3d');
      expect(scene.nodes.n1.geom.positions.length).toBe(4096 * 3);
    });
  });

  describe('Slop Image to 3D: the viewport (WebGL)', () => {
    it('shows the mesh, the point cloud and the splats without error (or skips without WebGL)', async () => {
      if (!hasGL) return;
      const stage = document.getElementById('stage');
      const v = await I.view.create(stage);
      try {
        const img = await roundTrip(testCanvas(64, 64));
        const prep = I.prepare(img.rgba, img.W, img.H, { grid: 64 });
        const m = I.hf.heightField(prep, { scale: 0.3 });
        v.show({ kind: 'mesh', positions: m.positions, normals: m.normals, uv: m.uv, indices: m.indices, texture: null });
        expect(stage.querySelector('canvas')).toBeTruthy();
        const p = I.hf.pointCloud(prep, { scale: 0.3 });
        v.show({ kind: 'points', positions: p.positions, colors: p.colors, spacing: 0.01 });
        const s = I.hf.splats(prep, { scale: 0.3, size: 1 });
        v.show({ kind: 'splats', positions: s.positions, colors: s.colors, sizes: s.sizes });
      } finally { v.dispose(); }
    });
  });
})();
