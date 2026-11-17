/* Slop Image to 3D: the three.js viewport (vendor/three, r170, loaded by dynamic import). Shows a height-field mesh
 * (textured with the picture), a point cloud, or a Gaussian-splat-like point render (a shader draws each point as a
 * soft disc, sized from the local spacing). Sets window.SlopImg3D.view: create(container) → Promise<viewer>.
 * viewer.show({ kind, positions, normals, uv, indices, colors, sizes, texture, spacing }) and viewer.frame(). */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const THREE_URL = new URL('../../../vendor/three/three.module.min.js', SELF).href;
  const FOV = 40;

  const SPLAT_VS = `
    attribute float aSize; attribute vec3 aColor; uniform float uScale; varying vec3 vColor;
    void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, 2.0 * aSize * uScale / -mv.z); }`;
  const SPLAT_FS = `
    varying vec3 vColor; uniform float uOpacity;
    void main() { vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard;
      gl_FragColor = vec4(vColor, exp(-r2 * 4.0) * uOpacity); }`;

  /** Bounding sphere of a flat xyz array. */
  function sphereOf(p) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
    const center = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
    return { center, radius: Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 || 1 };
  }

  async function create(container) {
    const THREE = await import(THREE_URL);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    container.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1b1b1f);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 500);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1.2, 2);
    scene.add(sun);
    const grid = new THREE.GridHelper(2, 10, 0x444450, 0x2a2a32);
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.01; grid.visible = false;
    scene.add(grid);
    const group = new THREE.Group();
    scene.add(group);
    let current = null, scale = 1, sphere = null;
    const orbit = new ns.Orbit(renderer.domElement, () => render());
    orbit.el.addEventListener('dblclick', () => { if (sphere) frame(); });

    function size() {
      const w = container.clientWidth || 1, h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((FOV * Math.PI) / 360));
      render();
    }
    function render() {
      orbit.apply(camera);
      if (current && current.material.uniforms && current.material.uniforms.uScale) current.material.uniforms.uScale.value = scale;
      renderer.render(scene, camera);
    }
    function clear() {
      if (!current) return;
      group.remove(current);
      current.geometry.dispose();
      (current.material.map && current.material.map.dispose());
      current.material.dispose();
      current = null;
    }
    function show(o) {
      clear();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(o.positions, 3));
      let obj;
      if (o.kind === 'mesh') {
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(o.normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
        geo.setIndex(new THREE.BufferAttribute(new Uint32Array(o.indices), 1));
        const map = o.texture ? new THREE.CanvasTexture(o.texture) : null;
        if (map) map.colorSpace = THREE.SRGBColorSpace;
        obj = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
      } else if (o.kind === 'points') {
        geo.setAttribute('color', new THREE.Float32BufferAttribute(o.colors, 3));
        obj = new THREE.Points(geo, new THREE.PointsMaterial({ vertexColors: true, size: o.spacing || 0.01, sizeAttenuation: true }));
      } else {
        geo.setAttribute('aColor', new THREE.Float32BufferAttribute(o.colors, 3));
        geo.setAttribute('aSize', new THREE.Float32BufferAttribute(o.sizes, 1));
        const material = new THREE.ShaderMaterial({ vertexShader: SPLAT_VS, fragmentShader: SPLAT_FS, transparent: true, depthWrite: false,
          uniforms: { uScale: { value: scale }, uOpacity: { value: 0.95 } } });
        obj = new THREE.Points(geo, material);
      }
      current = obj;
      group.add(obj);
      sphere = sphereOf(o.positions);
      grid.visible = true;
      frame();
    }
    function frame() { if (sphere) orbit.frame(sphere, FOV); render(); }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(size) : null;
    if (ro) ro.observe(container); else root.addEventListener('resize', size);
    size();
    return { show, frame, render, clear, size, get canvas() { return renderer.domElement; }, dispose() { clear(); renderer.dispose(); } };
  }

  ns.view = { create, sphereOf };
})(typeof window !== 'undefined' ? window : globalThis);
