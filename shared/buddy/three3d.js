// 3D Sloppo: the 2100 look in three.js. A main ball and three goo lumps merged as metaballs
// (each frame a sphere mesh is re-fitted to the blobby surface), a lime gradient shader, the
// simple face and the shine. Loaded only when the HUD's "3D" toggle is switched on (dynamic
// import), so the homepage stays light. create() throws without WebGL; the caller falls back to 2D.
import * as THREE from '../../vendor/three/three.module.min.js';

const INK = 0x0b1300, FEET = 28;
// Lumps in the 2D body units (y down): [cx, cy, r, wobble dx, wobble dy, period s].
const LUMPS = [[0, 4, 25, 0, 0, 1], [-15, 18, 10, -4, 4, 4], [16, 19, 9, 4, 3, 5], [0, -18, 9, 2, -4, 3.6]];
const PALETTE = { calm: ['#5d8f00', '#d4ff3a', '#f6ffcf'], rage: ['#8f1200', '#ff5a3a', '#ffe0d0'] };

const VERT = `varying vec3 vN; varying vec3 vV;
void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const FRAG = `uniform vec3 lo; uniform vec3 mid; uniform vec3 hi; varying vec3 vN; varying vec3 vV;
void main() {
  vec3 n = normalize(vN); vec3 l = normalize(vec3(-0.45, 0.6, 0.65));
  float g = dot(n, l) * 0.5 + 0.5;
  vec3 c = mix(lo, mid, smoothstep(0.15, 0.62, g));
  c = mix(c, hi, smoothstep(0.78, 1.0, g));
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  c += rim * 0.18 * hi;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Signed distance to the lumps merged with a smooth union (body units, y up, main ball centre at 0). */
function sdf(balls, x, y, z) {
  let d = 1e9;
  for (const b of balls) {
    const e = Math.sqrt((x - b[0]) ** 2 + (y - b[1]) ** 2 + (z - b[2]) ** 2) - b[3];
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (e - d)) / 7));
    d = e * (1 - h) + d * h - 7 * h * (1 - h);   // polynomial smooth-min, k = 7
  }
  return d;
}
/** z of the front surface at (x, y). */
function front(balls, x, y) {
  let z = 40;
  while (z > 0 && sdf(balls, x, y, z) > 0) z -= 0.5;
  return z;
}

export function create(container, W, H, base) {
  const canvas = document.createElement('canvas');
  canvas.className = 'sloppo-3d';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  if (!renderer.getContext()) throw new Error('No WebGL');
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -500, 500);
  cam.position.z = 300;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223300, 2));

  const root = new THREE.Group();
  root.position.y = H / 2 - base;          // origin at his feet
  scene.add(root);
  const squash = new THREE.Group();
  root.add(squash);
  const body = new THREE.Group();          // body units: y up, main ball centre at the origin
  squash.add(body);

  const uni = { lo: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hi: { value: new THREE.Color() } };
  const setPalette = (p) => { uni.lo.value.set(p[0]); uni.mid.value.set(p[1]); uni.hi.value.set(p[2]); };
  setPalette(PALETTE.calm);
  const geo = new THREE.SphereGeometry(1, 56, 40);
  const dirs = Float32Array.from(geo.attributes.position.array);
  const blob = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: VERT, fragmentShader: FRAG }));
  body.add(blob);

  // Face (body units, like the SVG: eyes at x ±8, mouth below), on the front of the main ball.
  const dark = new THREE.MeshBasicMaterial({ color: INK }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pink = new THREE.MeshBasicMaterial({ color: 0xff4f86 });
  const sph = new THREE.SphereGeometry(1, 20, 14);
  const z = (x, y) => Math.sqrt(Math.max(0, 25 * 25 - x * x - y * y)) + 0.6;
  const eyes = [-8, 8].map((x) => {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(sph, dark); ball.scale.set(3.6, 5, 1.6);
    const hi = new THREE.Mesh(sph, white); hi.scale.setScalar(1.1); hi.position.set(-1.2, 2, 1.4);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(8, 1.8, 1), dark); brow.position.set(x > 0 ? 1 : -1, 7.5, 1); brow.rotation.z = x > 0 ? 0.42 : -0.42;
    g.add(ball, hi, brow);
    g.position.set(x, 4, z(x, 4));
    g.userData = { ball, hi, brow };
    body.add(g);
    return g;
  });
  const curve = (y0, y1) => new THREE.QuadraticBezierCurve3(new THREE.Vector3(-5, y0, 0), new THREE.Vector3(0, y1, 0), new THREE.Vector3(5, y0, 0));
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, -6, z(0, 7) - 0.4);
  body.add(mouthGroup);
  const smile = new THREE.Mesh(new THREE.TubeGeometry(curve(0, -4), 16, 1, 6), dark);
  const frown = new THREE.Mesh(new THREE.TubeGeometry(curve(-3, 1), 16, 1, 6), dark);
  const open = new THREE.Mesh(sph, dark); open.scale.set(6, 6, 1.5); open.position.y = -5;
  const o = new THREE.Mesh(sph, dark); o.scale.set(2.6, 3.4, 1.5); o.position.y = -2;
  mouthGroup.add(smile, frown, open, o);
  const shine = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  shine.scale.set(6, 3.5, 1); shine.rotation.z = 0.52; shine.position.set(-10, 14, z(-10, 14));
  body.add(shine);

  const pos = geo.attributes.position, balls = LUMPS.map(() => [0, 0, 0, 0]);
  /** Fit the sphere mesh to the merged lumps: march each vertex's ray out from the centre. */
  function fit(sec, jig) {
    LUMPS.forEach(([cx, cy, r, dx, dy, p], i) => {
      const w = i ? Math.sin((sec * Math.PI * 2) / p) * 0.5 + 0.5 : 0;
      balls[i][0] = cx + dx * w + jig * dx * 0.8;
      balls[i][1] = -(cy + dy * w - jig * 2 - 4);
      balls[i][2] = 0;
      balls[i][3] = r * (i ? 1 + jig * 0.12 : 1);
    });
    for (let i = 0; i < pos.count; i++) {
      const vx = dirs[i * 3], vy = dirs[i * 3 + 1], vz = dirs[i * 3 + 2];
      let t = 44;
      while (t > 0 && sdf(balls, vx * t, vy * t, vz * t) > 0) t -= 2;
      let a = t, b = t + 2;                  // inside at a, outside at b: bisect the surface
      for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (sdf(balls, vx * m, vy * m, vz * m) <= 0) a = m; else b = m; }
      pos.setXYZ(i, vx * a, vy * a, vz * a);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    eyes.forEach((e) => { e.position.z = front(balls, e.position.x, e.position.y) + 0.3; });
    mouthGroup.position.z = front(balls, 0, -8) + 0.2;
    shine.position.z = front(balls, -10, 14) + 0.2;
  }
  fit(0, 0);
  let lastRage = false;

  /** Paint one frame. M: mascot state, s: body width (px), look: [eyes, mouth], t: ms. */
  function render(M, s, look, t, still) {
    const [eyeKind, mouth] = look, k = s / 50, q = still ? 0 : M.squash;
    const sec = still ? 0 : t / 1000, jig = still ? 0 : Math.max(-1, Math.min(1, M.sqv * 0.15));
    if (!still) fit(sec, jig);
    const breathe = still ? 0 : Math.sin((sec * Math.PI * 2) / 3.2) * 0.5 + 0.5;
    squash.scale.set((1 + q * 0.32) * (1 + breathe * 0.04) * k, (1 - q * 0.28) * (1 - breathe * 0.05) * k, k);
    squash.rotation.z = -M.rot;
    body.position.y = FEET - 4;
    body.rotation.y = still ? 0 : Math.sin(t / 1500) * 0.3;
    if (!!M.raging !== lastRage) { lastRage = !!M.raging; setPalette(lastRage ? PALETTE.rage : PALETTE.calm); }
    root.position.x = M.raging && !still ? Math.sin(t * 0.09) * 2 : 0;
    for (const e of eyes) {
      const { ball, hi, brow } = e.userData;
      const closed = eyeKind === 'sleepy' || eyeKind === 'happy';
      ball.material = eyeKind === 'heart' ? pink : eyeKind === 'spiral' ? white : dark;
      ball.scale.set(3.6, closed ? 0.6 : eyeKind === 'angry' ? 3.4 : 5, 1.6);
      hi.material = eyeKind === 'spiral' ? dark : white;
      hi.position.set(eyeKind === 'spiral' ? Math.cos(t / 90) * 2 : -1.2, eyeKind === 'spiral' ? Math.sin(t / 90) * 2 : 2, 1.4);
      hi.visible = !closed;
      brow.visible = eyeKind === 'angry';
    }
    smile.visible = mouth === 'smile' || mouth === 'wavy';
    frown.visible = mouth === 'frown';
    open.visible = mouth === 'open';
    o.visible = mouth === 'o';
    renderer.render(scene, cam);
  }
  function dispose() { renderer.dispose(); geo.dispose(); canvas.remove(); }
  return { render, dispose, canvas };
}
