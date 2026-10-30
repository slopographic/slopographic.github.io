// Eyes and mouths.
import { TAU, rgba } from './palette.js';

/* ---------- eyes & mouths ---------- */
export function eye(g, B, x, y, s, kind, side) {
  const rx = s * 0.085, ry = s * 0.108;
  g.save();
  if (kind === 'happy' || (kind === 'wink' && side > 0)) {
    g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.028; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + ry * 0.35, rx * 0.95, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  } else if (kind === 'sleepy') {
    g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.024; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y - ry * 0.1, rx * 0.9, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  } else if (kind === 'dead') {
    g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.026; g.lineCap = 'round';
    const k = rx * 0.75; g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x + k, y - k); g.lineTo(x - k, y + k); g.stroke();
  } else if (kind === 'star' || kind === 'heart') {
    g.fillStyle = kind === 'star' ? '#ffd23f' : '#ff4f86'; g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.012;
    g.beginPath();
    if (kind === 'star') for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? rx * 0.5 : rx * 1.2; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    else { const k = rx * 1.15; g.moveTo(x, y + k * 0.9); g.bezierCurveTo(x - k * 1.6, y - k * 0.1, x - k * 0.6, y - k * 1.2, x, y - k * 0.35); g.bezierCurveTo(x + k * 0.6, y - k * 1.2, x + k * 1.6, y - k * 0.1, x, y + k * 0.9); }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(x - rx * 0.35, y - ry * 0.3, rx * 0.22, 0, TAU); g.fill();
  } else if (kind === 'spiral') {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.012; g.beginPath();
    for (let a = 0; a < TAU * 2.6; a += 0.2) { const rr = (a / (TAU * 2.6)) * rx * 0.9; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.2); }
    g.stroke(); g.lineWidth = s * 0.01; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke();
  } else {
    // The classic sparkly anime eye.
    const glow = B.glowEyes || kind === 'laser';
    if (glow) { g.shadowColor = kind === 'laser' ? '#ff2a2a' : B.iris; g.shadowBlur = s * 0.08; }
    g.fillStyle = '#120c04'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
    g.shadowBlur = 0;
    const iris = kind === 'laser' ? '#ff2a2a' : B.iris;
    const ig = g.createLinearGradient(x, y - ry, x, y + ry);
    ig.addColorStop(0, rgba('#120c04', 0)); ig.addColorStop(0.5, rgba(iris.startsWith('#') ? iris : '#3f8a00', 0.55)); ig.addColorStop(1, iris);
    g.fillStyle = ig; g.beginPath(); g.ellipse(x, y + ry * 0.12, rx * 0.82, ry * 0.82, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - rx * 0.32, y - ry * 0.38, rx * 0.36, ry * 0.3, -0.4, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + rx * 0.35, y + ry * 0.42, rx * 0.16, 0, TAU); g.fill();
    if (kind === 'sad' || kind === 'cry') {
      g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.016; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - rx * side * 0.9, y - ry * 1.35); g.lineTo(x + rx * side * 0.6, y - ry * 1.05); g.stroke();
    }
    if (kind === 'angry') {
      g.strokeStyle = '#1a1206'; g.lineWidth = s * 0.02; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - rx * side, y - ry * 1.05); g.lineTo(x + rx * side * 0.7, y - ry * 1.45); g.stroke();
    }
    if (kind === 'cry') {
      g.fillStyle = 'rgba(120,200,255,.85)'; g.beginPath(); g.ellipse(x + rx * 0.2 * side, y + ry * 1.35, rx * 0.28, ry * 0.42, 0, 0, TAU); g.fill();
    }
  }
  g.restore();
}
export function mouth(g, x, y, s, kind) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#2a1406'; g.lineWidth = s * 0.018;
  const k = s * 0.05;
  if (kind === 'open' || kind === 'tongue') {
    g.fillStyle = '#2a1406'; g.beginPath(); g.moveTo(x - k, y - k * 0.2); g.quadraticCurveTo(x, y - k * 0.35, x + k, y - k * 0.2); g.quadraticCurveTo(x + k * 0.9, y + k * 1.2, x, y + k * 1.2); g.quadraticCurveTo(x - k * 0.9, y + k * 1.2, x - k, y - k * 0.2); g.fill();
    g.fillStyle = '#ff6f8e'; g.beginPath(); g.ellipse(x, y + k * 0.85, k * 0.55, k * 0.35, 0, 0, TAU); g.fill();
  } else if (kind === 'blep') {
    g.beginPath(); g.moveTo(x - k, y); g.quadraticCurveTo(x, y + k * 0.5, x + k, y); g.stroke();
    g.fillStyle = '#ff6f8e'; g.beginPath(); g.ellipse(x + k * 0.25, y + k * 0.45, k * 0.38, k * 0.5, 0, 0, Math.PI); g.fill();
  } else if (kind === 'cat') {
    g.beginPath(); g.moveTo(x - k * 1.1, y); g.quadraticCurveTo(x - k * 0.55, y + k * 0.7, x, y); g.quadraticCurveTo(x + k * 0.55, y + k * 0.7, x + k * 1.1, y); g.stroke();
  } else if (kind === 'o') {
    g.fillStyle = '#2a1406'; g.beginPath(); g.ellipse(x, y + k * 0.3, k * 0.45, k * 0.6, 0, 0, TAU); g.fill();
  } else if (kind === 'frown') {
    g.beginPath(); g.arc(x, y + k * 0.9, k * 0.8, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
  } else if (kind === 'smirk') {
    g.beginPath(); g.moveTo(x - k * 0.8, y + k * 0.2); g.quadraticCurveTo(x + k * 0.2, y + k * 0.5, x + k, y - k * 0.2); g.stroke();
  } else if (kind === 'fangs') {
    g.beginPath(); g.moveTo(x - k, y); g.quadraticCurveTo(x, y + k * 0.6, x + k, y); g.stroke();
    g.fillStyle = '#fff'; for (const sx of [-0.45, 0.45]) { g.beginPath(); g.moveTo(x + sx * k - k * 0.18, y + k * 0.2); g.lineTo(x + sx * k + k * 0.18, y + k * 0.2); g.lineTo(x + sx * k, y + k * 0.75); g.closePath(); g.fill(); }
  } else if (kind === 'wavy') {
    g.beginPath(); for (let i = 0; i <= 8; i++) { const px = x - k + (i / 8) * 2 * k, py = y + Math.sin(i * 1.6) * k * 0.18; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  } else {
    g.beginPath(); g.arc(x, y - k * 0.2, k * 0.75, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
  }
  g.restore();
}
