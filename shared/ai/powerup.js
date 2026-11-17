/* SlopAIKit powerUp: Sloppo's "AI powered" look, drawn on a 2D canvas. Classic script; adds SlopAIKit.powerUp.
 * Works with the shared painter (shared/sloppo): its hats take (g, H) with H = { x, top, w, h, s, eyeY, base }.
 *   brain(g, H, t)                 a pink brain hat with a little antenna and a blinking LED
 *   aura(g, cx, cy, r, t)          a soft pulsing lime/cyan glow (draw BEFORE Sloppo)
 *   sparkles(g, cx, cy, r, t, n)   orbiting 4-point sparkles (draw AFTER Sloppo)
 *   install(HATS)                  adds HATS.brain so drawSloppo(…, { hat: 'brain' }) works
 *   draw(g, W, H, look, t, drawSloppo) Sloppo + aura + sparkles + brain in one call */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const TAU = Math.PI * 2;

  function brain(g, H, t = 0) {
    const s = H.s, x = H.x, y = H.top + s * 0.02, w = H.w * 0.62, h = s * 0.3;
    g.save();
    // lobes
    const gr = g.createLinearGradient(0, y - h, 0, y);
    gr.addColorStop(0, '#ffc2dc'); gr.addColorStop(1, '#ff7fb0');
    g.fillStyle = gr; g.strokeStyle = '#b8336a'; g.lineWidth = s * 0.014;
    g.beginPath();
    const lobes = [[-0.36, -0.35, 0.22], [-0.14, -0.62, 0.25], [0.14, -0.62, 0.25], [0.36, -0.35, 0.22], [0, -0.3, 0.3]];
    for (const [dx, dy, r] of lobes) { g.moveTo(x + dx * w + r * w, y + dy * h); g.arc(x + dx * w, y + dy * h, r * w, 0, TAU); }
    g.fill(); g.stroke();
    // folds
    g.strokeStyle = 'rgba(160,30,90,.55)'; g.lineWidth = s * 0.01; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y - h * 0.95); g.bezierCurveTo(x - w * 0.05, y - h * 0.6, x + w * 0.05, y - h * 0.4, x, y - h * 0.1); g.stroke();
    for (const sx of [-1, 1]) {
      g.beginPath(); g.moveTo(x + sx * w * 0.12, y - h * 0.75); g.quadraticCurveTo(x + sx * w * 0.3, y - h * 0.62, x + sx * w * 0.22, y - h * 0.45); g.stroke();
      g.beginPath(); g.moveTo(x + sx * w * 0.42, y - h * 0.5); g.quadraticCurveTo(x + sx * w * 0.3, y - h * 0.3, x + sx * w * 0.44, y - h * 0.18); g.stroke();
    }
    // antenna with a blinking LED
    g.strokeStyle = '#333'; g.lineWidth = s * 0.012;
    g.beginPath(); g.moveTo(x + w * 0.1, y - h * 0.95); g.quadraticCurveTo(x + w * 0.2, y - h * 1.35, x + w * 0.12, y - h * 1.55); g.stroke();
    const on = 0.55 + 0.45 * Math.sin(t * 6);
    g.shadowColor = '#d4ff3a'; g.shadowBlur = s * 0.12 * on;
    g.fillStyle = `rgba(212,255,58,${0.6 + 0.4 * on})`; g.beginPath(); g.arc(x + w * 0.12, y - h * 1.6, s * 0.035, 0, TAU); g.fill();
    g.restore();
  }

  function aura(g, cx, cy, r, t = 0) {
    g.save();
    const p = 0.85 + 0.15 * Math.sin(t * 2.4);
    const gr = g.createRadialGradient(cx, cy, r * 0.25, cx, cy, r * 1.25 * p);
    gr.addColorStop(0, 'rgba(212,255,58,.38)'); gr.addColorStop(0.55, 'rgba(92,200,255,.18)'); gr.addColorStop(1, 'rgba(92,200,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r * 1.3, 0, TAU); g.fill();
    g.restore();
  }

  function star4(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.28 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function sparkles(g, cx, cy, r, t = 0, n = 6) {
    g.save();
    for (let i = 0; i < n; i++) {
      const a = t * 0.9 + (i / n) * TAU, rr = r * (0.95 + 0.12 * Math.sin(t * 2 + i));
      const tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
      g.globalAlpha = 0.35 + 0.65 * tw; g.fillStyle = i % 2 ? '#ffffff' : '#d4ff3a';
      star4(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, r * (0.05 + 0.05 * tw));
    }
    g.restore();
  }

  function install(HATS) { if (HATS && !HATS.brain) HATS.brain = (g, H) => brain(g, H, performance.now() / 1000); return HATS; }

  /** Sloppo with the full power-up. drawSloppo comes from shared/sloppo/index.js (an ES module the caller imports). */
  function draw(g, W, Hh, look, t, drawSloppo) {
    const cx = W / 2, cy = Hh * 0.5, r = Math.min(W, Hh) * 0.48;
    aura(g, cx, cy, r, t);
    drawSloppo(g, W, Hh, Object.assign({ noGlow: true }, look, { hat: [].concat(look && look.hat || []).concat('brain') }), t);
    sparkles(g, cx, cy, r * 0.92, t);
  }

  K.powerUp = { brain, aura, sparkles, install, draw, look: { hat: 'brain', aura: 'ai', sparkle: true } };
})();
