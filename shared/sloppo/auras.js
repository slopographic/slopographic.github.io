// Auras: sparkles, hearts, fire, bubbles, lightning, rainbow, glitch, gold.
import { TAU, star, mulberry } from './palette.js';

/* ---------- auras ---------- */
export function aura(g, look, H, t, W, Hh) {
  const k = look.fx;
  if (!k) return;
  g.save();
  const rnd = mulberry(look.seed || 7);
  if (k === 'sparkle' || k === 'stars') {
    g.fillStyle = k === 'stars' ? '#ffe680' : '#ffffff';
    for (let i = 0; i < 9; i++) { const x = rnd() * W, y = rnd() * Hh * 0.8, s = (0.5 + rnd()) * H.s * 0.035 * (0.7 + 0.3 * Math.sin(t * 3 + i)); g.globalAlpha = 0.85; star(g, x, y, s); }
  } else if (k === 'hearts') {
    g.fillStyle = '#ff6f9e';
    for (let i = 0; i < 7; i++) { const x = H.x + (rnd() - 0.5) * W * 0.9, y = H.base - H.h - rnd() * H.s * 0.6 - ((t * 20 + i * 30) % 40), r = H.s * (0.025 + rnd() * 0.02); g.globalAlpha = 0.8; g.beginPath(); g.moveTo(x, y + r); g.bezierCurveTo(x - r * 2, y - r * 0.5, x - r * 0.6, y - r * 1.6, x, y - r * 0.5); g.bezierCurveTo(x + r * 0.6, y - r * 1.6, x + r * 2, y - r * 0.5, x, y + r); g.fill(); }
  } else if (k === 'fire') {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI - Math.PI, x = H.x + Math.cos(a) * H.w * 0.62, y = H.base - H.h * 0.45 + Math.sin(a) * H.h * 0.75 - ((t * 30 + i * 7) % 20); const gr = g.createRadialGradient(x, y, 0, x, y, H.s * 0.14); gr.addColorStop(0, 'rgba(255,200,60,.55)'); gr.addColorStop(1, 'rgba(255,60,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, H.s * 0.14, 0, TAU); g.fill(); }
  } else if (k === 'bubbles') {
    g.strokeStyle = 'rgba(220,245,255,.7)'; g.lineWidth = H.s * 0.008;
    for (let i = 0; i < 10; i++) { const x = rnd() * W, y = Hh - ((rnd() * Hh + t * 25) % Hh), r = H.s * (0.015 + rnd() * 0.04); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
  } else if (k === 'lightning') {
    g.strokeStyle = '#e6f6ff'; g.lineWidth = H.s * 0.012; g.shadowColor = '#5cc8ff'; g.shadowBlur = H.s * 0.08;
    for (const sx of [-1, 1]) { let x = H.x + sx * H.w * 0.55, y = H.base - H.h * 1.1; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < 5; i++) { x += sx * (rnd() - 0.3) * H.s * 0.1; y += H.s * 0.12; g.lineTo(x, y); } g.stroke(); }
  } else if (k === 'rainbow') {
    const cols = ['#ff4f6e', '#ffa23a', '#ffd23f', '#5fe0b0', '#5cc8ff', '#a86bff'];
    g.lineWidth = H.s * 0.035; g.globalAlpha = 0.75;
    cols.forEach((c, i) => { g.strokeStyle = c; g.beginPath(); g.arc(H.x, H.base, H.w * (0.95 + i * 0.07), Math.PI, TAU); g.stroke(); });
  } else if (k === 'glitch') {
    for (let i = 0; i < 7; i++) { g.fillStyle = ['rgba(255,0,90,.35)', 'rgba(0,255,220,.35)', 'rgba(212,255,58,.3)'][i % 3]; g.fillRect(rnd() * W * 0.5, rnd() * Hh, W * (0.3 + rnd() * 0.6), H.s * (0.01 + rnd() * 0.04)); }
  } else if (k === 'gold') {
    g.globalCompositeOperation = 'lighter';
    const gr = g.createRadialGradient(H.x, H.base - H.h * 0.5, H.s * 0.2, H.x, H.base - H.h * 0.5, H.s * 1.1);
    gr.addColorStop(0, 'rgba(255,210,63,.35)'); gr.addColorStop(1, 'rgba(255,210,63,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#fff3a0'; for (let i = 0; i < 12; i++) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 2 + i); star(g, rnd() * W, rnd() * Hh * 0.85, H.s * (0.015 + rnd() * 0.03)); }
  }
  g.restore();
}
