/* A small 3D view of a model for previews: drag to turn it, wheel or pinch to zoom, double-click to frame it again.
 * It draws only when something changes. Browser only (WebGL).
 *   view(el, root, { background }) → { canvas, render(), dispose() }   throws when this browser has no WebGL
 *   describe(root, animations) → 'mesh count · triangles · size' for a caption */
import * as T from '../../vendor/three/three.module.min.js';
import { stats, bounds } from './scene.js';

const fmt = (v) => +Number(v).toPrecision(4);   // the same rounding as the status line (convert.js)
/** A word shown to the person (ui.d3.*, shared/i18n/ui/en/misc.js), in the chosen language when it is made. */
const tr = (k, v) => { const I = globalThis.SlopI18n; return I ? I.t(k, v) : k; };
const plural = (k, what) => tr('ui.d3.n_' + what, { n: k });

export function describe(root, animations = []) {
  const s = stats(root, animations), b = bounds(root);
  const parts = [];
  if (s.meshes) parts.push(plural(s.meshes, 'mesh'), plural(s.triangles, 'triangle'));
  if (s.points) parts.push(plural(s.vertices, 'point'));
  if (b) parts.push(tr('ui.d3.units', { size: b.size.map(fmt).join(' × ') }));
  if (s.animations) parts.push(plural(s.animations, 'animation'));
  return parts.join(' · ');
}

export function view(el, root, { background = null } = {}) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: !background, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = T.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.className = 'slop-3dview';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', tr('ui.d3.view_aria'));
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';
  el.replaceChildren(canvas);
  const scene = new T.Scene();
  if (background) scene.background = new T.Color(background);
  scene.add(new T.HemisphereLight(0xffffff, 0x444450, 2.2));
  const sun = new T.DirectionalLight(0xffffff, 1.6);
  scene.add(sun);
  const holder = new T.Group();
  holder.add(root);
  scene.add(holder);
  const camera = new T.PerspectiveCamera(40, 1, 0.001, 1000);
  const box = new T.Box3().setFromObject(holder, true);
  const centre = box.isEmpty() ? new T.Vector3() : box.getCenter(new T.Vector3());
  const radius = box.isEmpty() ? 1 : Math.max(1e-6, box.getSize(new T.Vector3()).length() / 2);
  root.traverse((o) => { if (o.isPoints && o.material) o.material.size = radius / 150; });
  const st = { yaw: 0.6, pitch: 0.35, dist: 1 };
  function place() {
    const d = (radius / Math.sin((camera.fov * Math.PI) / 360)) * st.dist;
    camera.near = Math.max(radius / 1000, d / 1000);
    camera.far = d + radius * 10;
    camera.position.set(centre.x + d * Math.cos(st.pitch) * Math.sin(st.yaw), centre.y + d * Math.sin(st.pitch), centre.z + d * Math.cos(st.pitch) * Math.cos(st.yaw));
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
    sun.position.copy(camera.position).add(new T.Vector3(radius, radius * 2, 0));
  }
  let queued = false;
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  }
  function draw() {
    queued = false;
    const w = el.clientWidth || 300, h = el.clientHeight || 220;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    place();
    renderer.render(scene, camera);
  }
  let drag = null;
  // Touch (shared/input): a finger orbits and never scrolls the page; a pinch zooms (dist × 1/scale); a double tap resets.
  canvas.setAttribute('data-touch-surface', '');
  canvas.touchSurface = { zoom(k) { st.dist = Math.max(0.2, Math.min(8, st.dist / k)); render(); } };
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer */ } canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    st.yaw -= (e.clientX - drag.x) * 0.01;
    st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + (e.clientY - drag.y) * 0.01));
    drag = { x: e.clientX, y: e.clientY };
    render();
  });
  const end = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); st.dist = Math.max(0.2, Math.min(8, st.dist * Math.exp(e.deltaY * 0.001))); render(); }, { passive: false });
  canvas.addEventListener('dblclick', () => { Object.assign(st, { yaw: 0.6, pitch: 0.35, dist: 1 }); render(); });
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(render) : null;
  if (ro) ro.observe(el);
  draw();
  return {
    canvas, render: draw,
    dispose() {
      if (ro) ro.disconnect();
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
