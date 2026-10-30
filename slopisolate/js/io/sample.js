/* SlopIsolate — the built-in sample: a busy gradient background with a lime "Sloppo" goo blob (ink outline,
 * two eyes, a drip). Drawn on canvas with a seeded random so it is identical every time. PNG, no external assets. */
(function () {
  'use strict';
  const CO = window.CO, U = CO.util;
  const W = 1200, H = 900, INK = '#0b0b0f', LIME = '#d4ff3a';
  const CONFETTI = ['#ffb020', '#00d1b2', '#9b5cff', '#ff5a36', '#ffe14d', '#3ddc84', '#ff3ea5'];

  /** Small deterministic PRNG (mulberry32). */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Busy background: a diagonal gradient, confetti blobs, light stripes and speckles. */
  function paintBackground(g, rand) {
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#ff3ea5');
    grad.addColorStop(0.5, '#7a3cff');
    grad.addColorStop(1, '#2b6cff');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    for (let i = 0; i < 46; i++) {
      g.globalAlpha = 0.45 + rand() * 0.45;
      g.fillStyle = CONFETTI[i % CONFETTI.length];
      g.beginPath();
      g.ellipse(rand() * W, rand() * H, 30 + rand() * 120, 30 + rand() * 120, rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 0.14;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 14; i++) {
      const x = -200 + i * 110;
      g.beginPath();
      g.moveTo(x, 0); g.lineTo(x + 46, 0); g.lineTo(x + 46 + H * 0.6, H); g.lineTo(x + H * 0.6, H);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 0.7;
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rand() < 0.5 ? '#ffffff' : INK;
      g.beginPath();
      g.arc(rand() * W, rand() * H, 1.5 + rand() * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /** Closed wobbly outline through midpoints of N radial points, so it reads as a soft blob. */
  function blobPath(g, cx, cy, R) {
    const N = 10, pts = [];
    for (let i = 0; i < N; i++) {
      const a = (Math.PI * 2 * i) / N;
      const r = R * (1 + 0.1 * Math.sin(2 * a + 0.6) + 0.07 * Math.cos(3 * a) + 0.04 * Math.sin(5 * a));
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    g.beginPath();
    const start = mid(pts[N - 1], pts[0]);
    g.moveTo(start[0], start[1]);
    for (let i = 0; i < N; i++) {
      const p = pts[i], m = mid(p, pts[(i + 1) % N]);
      g.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    g.closePath();
  }

  /** The goo: body and drip are stroked first, then filled, so they share one ink outline. */
  function paintGoo(g) {
    const cx = 600, cy = 450, R = 290;
    const drip = { x: 752, y: 712, r: 34 };
    const shapes = () => {
      blobPath(g, cx, cy, R);
      g.moveTo(drip.x + drip.r, drip.y); g.arc(drip.x, drip.y, drip.r, 0, Math.PI * 2);
      g.moveTo(drip.x + 22, drip.y + 36); g.arc(drip.x + 14, drip.y + 62, 20, 0, Math.PI * 2);
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    g.strokeStyle = INK; g.lineWidth = 36;
    shapes(); g.stroke();
    g.fillStyle = LIME;
    shapes(); g.fill();

    g.fillStyle = INK;
    for (const ex of [cx - 42, cx + 42]) {
      g.beginPath(); g.ellipse(ex, cy - 20, 22, 30, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ex + 7, cy - 30, 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK;
    }
    g.strokeStyle = INK; g.lineWidth = 13;
    g.beginPath(); g.moveTo(cx - 52, cy + 48); g.quadraticCurveTo(cx, cy + 92, cx + 52, cy + 48); g.stroke();

    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 16;
    g.beginPath(); g.arc(cx, cy, R - 62, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
  }

  /** Draw the sample and return it as a PNG File named sloppo-sample.png. */
  CO.sample = {};
  CO.sample.make = async function () {
    const c = U.canvas(W, H), g = U.ctx(c);
    paintBackground(g, rng(20260611));
    paintGoo(g);
    const blob = await U.blobOf(c, 'image/png');
    return new File([blob], 'sloppo-sample.png', { type: 'image/png' });
  };
})();
