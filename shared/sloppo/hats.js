// Hats & accessories drawn relative to the head, plus things drawn over the whole body.
import { TAU, star } from './palette.js';

/* ---------- hats & accessories (drawn relative to the head) ---------- */
// H = { x, top, w, s, eyeY } ; each draws in front of the body unless noted.
export const HATS = {
  crown(g, H) {
    const w = H.w * 0.42, y = H.top + H.s * 0.07, x = H.x;
    const gr = g.createLinearGradient(0, y - w * 0.55, 0, y); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(1, '#d99a00');
    g.fillStyle = gr; g.strokeStyle = '#7a4a00'; g.lineWidth = H.s * 0.01;
    g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x - w / 2, y - w * 0.32); g.lineTo(x - w / 4, y - w * 0.12); g.lineTo(x, y - w * 0.5); g.lineTo(x + w / 4, y - w * 0.12); g.lineTo(x + w / 2, y - w * 0.32); g.lineTo(x + w / 2, y); g.closePath(); g.fill(); g.stroke();
    for (const [dx, c] of [[-0.25, '#ff4f86'], [0, '#5cc8ff'], [0.25, '#5fe0b0']]) { g.fillStyle = c; g.beginPath(); g.arc(x + dx * w, y - w * 0.07, w * 0.055, 0, TAU); g.fill(); }
  },
  tiara(g, H) {
    const w = H.w * 0.34, y = H.top + H.s * 0.09, x = H.x;
    g.strokeStyle = '#e6e9f0'; g.lineWidth = H.s * 0.014; g.beginPath(); g.arc(x, y + w * 0.4, w * 0.6, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    g.fillStyle = '#c4ecff'; g.beginPath(); g.moveTo(x, y - w * 0.32); g.lineTo(x + w * 0.1, y - w * 0.12); g.lineTo(x, y + w * 0.02); g.lineTo(x - w * 0.1, y - w * 0.12); g.closePath(); g.fill();
  },
  wizard(g, H) {
    const w = H.w * 0.62, y = H.top + H.s * 0.1, x = H.x;
    g.fillStyle = '#3b2a8a'; g.beginPath(); g.ellipse(x, y, w * 0.62, w * 0.12, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(x - w * 0.3, 0, x + w * 0.3, 0); gr.addColorStop(0, '#5a43c4'); gr.addColorStop(1, '#2d1f75');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w * 0.34, y - w * 0.02); g.quadraticCurveTo(x - w * 0.05, y - w * 0.6, x + w * 0.42, y - w * 1.05); g.quadraticCurveTo(x + w * 0.1, y - w * 0.5, x + w * 0.34, y - w * 0.02); g.closePath(); g.fill();
    g.fillStyle = '#ffd23f'; for (const [dx, dy, r] of [[-0.1, -0.25, 0.06], [0.12, -0.45, 0.045], [0.02, -0.12, 0.035]]) star(g, x + dx * w, y + dy * w, r * w);
  },
  ninja(g, H) {
    const y = H.eyeY - H.s * 0.15;
    g.fillStyle = '#20232b'; g.beginPath(); g.ellipse(H.x, y, H.w * 0.5, H.s * 0.06, 0, 0, TAU); g.fill();
    g.fillStyle = '#c9d1d9'; g.beginPath(); g.ellipse(H.x, y, H.s * 0.05, H.s * 0.035, 0, 0, TAU); g.fill();
    g.strokeStyle = '#20232b'; g.lineWidth = H.s * 0.035; g.lineCap = 'round';
    g.beginPath(); g.moveTo(H.x + H.w * 0.46, y); g.quadraticCurveTo(H.x + H.w * 0.62, y + H.s * 0.02, H.x + H.w * 0.7, y + H.s * 0.14); g.moveTo(H.x + H.w * 0.46, y); g.quadraticCurveTo(H.x + H.w * 0.66, y - H.s * 0.06, H.x + H.w * 0.78, y + H.s * 0.02); g.stroke();
  },
  knight(g, H) {
    const w = H.w * 0.9, y = H.eyeY - H.s * 0.04, x = H.x;
    const gr = g.createLinearGradient(0, H.top - H.s * 0.05, 0, y + H.s * 0.08); gr.addColorStop(0, '#f2f4f8'); gr.addColorStop(1, '#7a8494');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w * 0.5, y + H.s * 0.06); g.bezierCurveTo(x - w * 0.55, H.top - H.s * 0.12, x + w * 0.55, H.top - H.s * 0.12, x + w * 0.5, y + H.s * 0.06); g.closePath(); g.fill();
    g.fillStyle = '#20232b'; g.beginPath(); g.roundRect ? g.roundRect(x - w * 0.36, y - H.s * 0.06, w * 0.72, H.s * 0.07, H.s * 0.03) : g.rect(x - w * 0.36, y - H.s * 0.06, w * 0.72, H.s * 0.07); g.fill();
    g.fillStyle = '#ff4f6e'; g.beginPath(); g.moveTo(x, H.top - H.s * 0.05); g.quadraticCurveTo(x + w * 0.35, H.top - H.s * 0.35, x + w * 0.5, H.top - H.s * 0.08); g.quadraticCurveTo(x + w * 0.2, H.top - H.s * 0.15, x, H.top - H.s * 0.05); g.fill();
  },
  astro(g, H) {
    // glass dome drawn after the body (see 'over')
  },
  halo(g, H) {
    g.save(); g.strokeStyle = '#ffe680'; g.lineWidth = H.s * 0.03; g.shadowColor = '#ffd23f'; g.shadowBlur = H.s * 0.08;
    g.beginPath(); g.ellipse(H.x, H.top - H.s * 0.12, H.w * 0.3, H.s * 0.05, 0, 0, TAU); g.stroke(); g.restore();
  },
  horns(g, H) {
    g.fillStyle = '#c21d2e';
    for (const sx of [-1, 1]) { const x = H.x + sx * H.w * 0.24, y = H.top + H.s * 0.1; g.beginPath(); g.moveTo(x - H.s * 0.05, y); g.quadraticCurveTo(x + sx * H.s * 0.02, y - H.s * 0.2, x + sx * H.s * 0.1, y - H.s * 0.22); g.quadraticCurveTo(x + sx * H.s * 0.02, y - H.s * 0.06, x + H.s * 0.06, y); g.closePath(); g.fill(); }
  },
  chef(g, H) {
    const y = H.top + H.s * 0.08, x = H.x, w = H.w * 0.4;
    g.fillStyle = '#ffffff'; g.strokeStyle = '#c9cdd4'; g.lineWidth = H.s * 0.008;
    g.beginPath(); g.rect(x - w / 2, y - w * 0.45, w, w * 0.45); g.fill(); g.stroke();
    for (const [dx, dy, r] of [[-0.3, -0.62, 0.32], [0.3, -0.62, 0.32], [0, -0.8, 0.36]]) { g.beginPath(); g.arc(x + dx * w, y + dy * w, r * w, 0, TAU); g.fill(); g.stroke(); }
  },
  party(g, H) {
    const y = H.top + H.s * 0.08, x = H.x + H.w * 0.06, w = H.w * 0.3;
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0); gr.addColorStop(0, '#ff4f86'); gr.addColorStop(1, '#ffa23a');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w * 0.15, y - w * 1.25); g.lineTo(x + w / 2, y); g.closePath(); g.fill();
    g.fillStyle = '#5cc8ff'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x - w * 0.15 + i * w * 0.2, y - w * 0.25 - i * w * 0.3, w * 0.06, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x + w * 0.15, y - w * 1.28, w * 0.13, 0, TAU); g.fill();
  },
  cowboy(g, H) {
    const y = H.top + H.s * 0.1, x = H.x, w = H.w;
    g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(x, y, w * 0.56, w * 0.09, 0, 0, TAU); g.fill();
    g.fillStyle = '#a06a33'; g.beginPath(); g.moveTo(x - w * 0.25, y); g.quadraticCurveTo(x - w * 0.3, y - w * 0.3, x - w * 0.08, y - w * 0.28); g.quadraticCurveTo(x, y - w * 0.2, x + w * 0.08, y - w * 0.28); g.quadraticCurveTo(x + w * 0.3, y - w * 0.3, x + w * 0.25, y); g.closePath(); g.fill();
    g.fillStyle = '#4a2c10'; g.fillRect(x - w * 0.25, y - w * 0.07, w * 0.5, w * 0.05);
  },
  tophat(g, H) {
    const y = H.top + H.s * 0.09, x = H.x - H.w * 0.04, w = H.w * 0.34;
    g.fillStyle = '#111318'; g.beginPath(); g.ellipse(x, y, w * 0.9, w * 0.16, -0.1, 0, TAU); g.fill();
    g.fillRect(x - w / 2, y - w * 0.95, w, w * 0.92);
    g.fillStyle = '#c21d2e'; g.fillRect(x - w / 2, y - w * 0.28, w, w * 0.14);
  },
  monocle(g, H) {
    const x = H.x + H.s * 0.17, y = H.eyeY;
    g.strokeStyle = '#d4a017'; g.lineWidth = H.s * 0.012; g.beginPath(); g.arc(x, y, H.s * 0.11, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(x + H.s * 0.08, y + H.s * 0.08); g.quadraticCurveTo(x + H.s * 0.18, y + H.s * 0.3, x + H.s * 0.08, y + H.s * 0.4); g.stroke();
  },
  beanie(g, H) {
    const y = H.top + H.s * 0.2, x = H.x, w = H.w * 0.62;
    g.fillStyle = '#ff6f3a'; g.beginPath(); g.ellipse(x, y, w / 2, w * 0.45, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#d94f1a'; g.fillRect(x - w / 2, y - w * 0.04, w, w * 0.14);
    g.fillStyle = '#fff1d6'; g.beginPath(); g.arc(x, y - w * 0.47, w * 0.1, 0, TAU); g.fill();
  },
  headphones(g, H) {
    const y = H.eyeY - H.s * 0.02;
    g.strokeStyle = '#1b1b2e'; g.lineWidth = H.s * 0.035; g.beginPath(); g.ellipse(H.x, y, H.w * 0.48, H.s * 0.48, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    for (const sx of [-1, 1]) { g.fillStyle = '#ff4f86'; g.beginPath(); g.ellipse(H.x + sx * H.w * 0.46, y, H.s * 0.07, H.s * 0.1, 0, 0, TAU); g.fill(); g.fillStyle = '#1b1b2e'; g.beginPath(); g.ellipse(H.x + sx * H.w * 0.49, y, H.s * 0.04, H.s * 0.08, 0, 0, TAU); g.fill(); }
  },
  shades(g, H) {
    const y = H.eyeY - H.s * 0.01;
    g.fillStyle = '#0b0b10';
    for (const sx of [-1, 1]) { g.beginPath(); g.roundRect ? g.roundRect(H.x + sx * H.s * 0.17 - H.s * 0.11, y - H.s * 0.06, H.s * 0.22, H.s * 0.12, H.s * 0.04) : g.rect(H.x + sx * H.s * 0.17 - H.s * 0.11, y - H.s * 0.06, H.s * 0.22, H.s * 0.12); g.fill(); }
    g.fillRect(H.x - H.s * 0.07, y - H.s * 0.04, H.s * 0.14, H.s * 0.025);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (const sx of [-1, 1]) g.fillRect(H.x + sx * H.s * 0.17 - H.s * 0.08, y - H.s * 0.04, H.s * 0.06, H.s * 0.02);
  },
  eyepatch(g, H) {
    g.strokeStyle = '#111'; g.lineWidth = H.s * 0.012; g.beginPath(); g.moveTo(H.x - H.w * 0.42, H.eyeY - H.s * 0.18); g.lineTo(H.x + H.w * 0.42, H.eyeY + H.s * 0.02); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.ellipse(H.x + H.s * 0.17, H.eyeY, H.s * 0.1, H.s * 0.12, 0, 0, TAU); g.fill();
  },
  pirate(g, H) {
    const y = H.top + H.s * 0.12, x = H.x, w = H.w * 0.7;
    g.fillStyle = '#1b1b22'; g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x - w * 0.3, y - w * 0.45, x, y - w * 0.32); g.quadraticCurveTo(x + w * 0.3, y - w * 0.45, x + w / 2, y); g.quadraticCurveTo(x, y + w * 0.06, x - w / 2, y); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y - w * 0.16, w * 0.06, 0, TAU); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = H.s * 0.008; g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + w * 0.06, x + w / 2, y); g.stroke();
    HATS.eyepatch(g, H);
  },
  viking(g, H) {
    const y = H.top + H.s * 0.14, x = H.x, w = H.w * 0.55;
    g.fillStyle = '#f1ede4'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * w * 0.42, y - w * 0.12); g.quadraticCurveTo(x + sx * w * 0.9, y - w * 0.2, x + sx * w * 0.85, y - w * 0.75); g.quadraticCurveTo(x + sx * w * 0.66, y - w * 0.28, x + sx * w * 0.3, y - w * 0.3); g.closePath(); g.fill(); }
    const gr = g.createLinearGradient(0, y - w * 0.5, 0, y); gr.addColorStop(0, '#d9dde4'); gr.addColorStop(1, '#7a8494');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, w / 2, w * 0.45, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#b07a33'; g.fillRect(x - w / 2, y - w * 0.06, w, w * 0.1);
  },
  catears(g, H) {
    for (const sx of [-1, 1]) {
      const x = H.x + sx * H.w * 0.25, y = H.top + H.s * 0.13;
      g.fillStyle = H.B.base; g.beginPath(); g.moveTo(x - H.s * 0.1, y); g.lineTo(x + sx * H.s * 0.04, y - H.s * 0.2); g.lineTo(x + H.s * 0.1, y); g.closePath(); g.fill();
      g.fillStyle = '#ff9fc0'; g.beginPath(); g.moveTo(x - H.s * 0.05, y - H.s * 0.01); g.lineTo(x + sx * H.s * 0.03, y - H.s * 0.13); g.lineTo(x + H.s * 0.05, y - H.s * 0.01); g.closePath(); g.fill();
    }
  },
  bunny(g, H) {
    for (const sx of [-1, 1]) {
      const x = H.x + sx * H.w * 0.16, y = H.top + H.s * 0.12;
      g.save(); g.translate(x, y); g.rotate(sx * 0.18);
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, -H.s * 0.2, H.s * 0.06, H.s * 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = '#ffc4d8'; g.beginPath(); g.ellipse(0, -H.s * 0.2, H.s * 0.03, H.s * 0.15, 0, 0, TAU); g.fill(); g.restore();
    }
  },
  flower(g, H) {
    const x = H.x + H.w * 0.25, y = H.top + H.s * 0.14, r = H.s * 0.06;
    g.fillStyle = '#ff8fb8'; for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(x, y, r * 0.6, 0, TAU); g.fill();
  },
  sprout(g, H) {
    const x = H.x, y = H.top + H.s * 0.02;
    g.strokeStyle = '#3f8a00'; g.lineWidth = H.s * 0.016; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + H.s * 0.02, y - H.s * 0.08, x, y - H.s * 0.14); g.stroke();
    g.fillStyle = '#5fd400'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * H.s * 0.07, y - H.s * 0.15, H.s * 0.07, H.s * 0.035, sx * -0.5, 0, TAU); g.fill(); }
  },
  bow(g, H) {
    const x = H.x + H.w * 0.22, y = H.top + H.s * 0.13, r = H.s * 0.08;
    g.fillStyle = '#ff4f86'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * r * 1.4, y - r * 0.8); g.lineTo(x + sx * r * 1.4, y + r * 0.8); g.closePath(); g.fill(); }
    g.beginPath(); g.arc(x, y, r * 0.4, 0, TAU); g.fill();
  },
  gradcap(g, H) {
    const y = H.top + H.s * 0.1, x = H.x, w = H.w * 0.5;
    g.fillStyle = '#1b1b22'; g.beginPath(); g.ellipse(x, y, w * 0.4, w * 0.16, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x - w * 0.7, y - w * 0.2); g.lineTo(x, y - w * 0.45); g.lineTo(x + w * 0.7, y - w * 0.2); g.lineTo(x, y + w * 0.05); g.closePath(); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = H.s * 0.01; g.beginPath(); g.moveTo(x, y - w * 0.22); g.lineTo(x + w * 0.55, y - w * 0.12); g.lineTo(x + w * 0.55, y + w * 0.2); g.stroke();
  },
  propeller(g, H) {
    const y = H.top + H.s * 0.08, x = H.x, w = H.w * 0.36;
    for (const [c, a0] of [['#ff4f6e', Math.PI], ['#5cc8ff', Math.PI * 1.33], ['#ffd23f', Math.PI * 1.66]]) { g.fillStyle = c; g.beginPath(); g.moveTo(x, y); g.arc(x, y, w / 2, a0, a0 + Math.PI / 3); g.closePath(); g.fill(); }
    g.strokeStyle = '#333'; g.lineWidth = H.s * 0.01; g.beginPath(); g.moveTo(x, y - w / 2); g.lineTo(x, y - w * 0.75); g.stroke();
    g.fillStyle = '#ff4f6e'; g.beginPath(); g.ellipse(x - w * 0.2, y - w * 0.75, w * 0.22, w * 0.05, 0.2, 0, TAU); g.fill(); g.fillStyle = '#5cc8ff'; g.beginPath(); g.ellipse(x + w * 0.2, y - w * 0.75, w * 0.22, w * 0.05, -0.2, 0, TAU); g.fill();
  },
  laurel(g, H) {
    g.fillStyle = '#e8c547';
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) { const a = Math.PI * (sx < 0 ? 1.05 + i * 0.07 : 1.95 - i * 0.07), rx = H.w * 0.38, ry = H.s * 0.2; const px = H.x + Math.cos(a) * rx, py = H.top + H.s * 0.22 + Math.sin(a) * ry; g.beginPath(); g.ellipse(px, py, H.s * 0.035, H.s * 0.016, a + Math.PI / 2, 0, TAU); g.fill(); }
  },
  bandana(g, H) {
    const y = H.top + H.s * 0.2;
    g.fillStyle = '#c21d2e'; g.beginPath(); g.ellipse(H.x, y, H.w * 0.4, H.s * 0.13, 0, Math.PI, TAU); g.fill();
    g.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(H.x + i * H.s * 0.07, y - H.s * 0.06, H.s * 0.012, 0, TAU); g.fill(); }
    g.fillStyle = '#c21d2e'; g.beginPath(); g.moveTo(H.x - H.w * 0.38, y - H.s * 0.02); g.lineTo(H.x - H.w * 0.52, y + H.s * 0.06); g.lineTo(H.x - H.w * 0.42, y + H.s * 0.08); g.closePath(); g.fill();
  },
  lasers(g, H) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const sx of [-1, 1]) { const x = H.x + sx * H.s * 0.17, y = H.eyeY; const gr = g.createLinearGradient(x, y, x + sx * H.s * 2, y - H.s * 0.5); gr.addColorStop(0, 'rgba(255,60,60,.95)'); gr.addColorStop(1, 'rgba(255,60,60,0)'); g.strokeStyle = gr; g.lineWidth = H.s * 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * H.s * 2, y - H.s * 0.5); g.stroke(); }
    g.restore();
  },
};
// Things drawn over the whole body.
export const OVER = {
  astro(g, H) {
    const r = H.w * 0.66, y = H.base - H.h * 0.52;
    const gr = g.createRadialGradient(H.x - r * 0.4, y - r * 0.4, r * 0.1, H.x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.45)'); gr.addColorStop(0.5, 'rgba(200,230,255,.12)'); gr.addColorStop(1, 'rgba(200,230,255,.3)');
    g.fillStyle = gr; g.beginPath(); g.arc(H.x, y, r, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = H.s * 0.015; g.stroke();
    g.fillStyle = '#d2d9e0'; g.beginPath(); g.ellipse(H.x, H.base + H.s * 0.01, r * 0.85, H.s * 0.07, 0, 0, TAU); g.fill();
  },
};
