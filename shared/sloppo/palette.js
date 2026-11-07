// Sloppo palette: body colours and the small colour/maths helpers every part shares.

export const BODIES = {
  lime:      { hi: '#f1ffb8', base: '#a6ee14', lo: '#4d8f00', iris: '#3f8a00', rim: '#e6ff8c' },
  pink:      { hi: '#ffe3ee', base: '#ff8fb8', lo: '#c2457a', iris: '#b0306a', rim: '#ffd0e2' },
  sky:       { hi: '#e3f6ff', base: '#5cc8ff', lo: '#1f78b8', iris: '#1d6fb0', rim: '#c4ecff' },
  grape:     { hi: '#f0e3ff', base: '#a86bff', lo: '#5b2fb0', iris: '#6a35c9', rim: '#dcc4ff' },
  tangerine: { hi: '#fff0d8', base: '#ffa23a', lo: '#c25a00', iris: '#b35400', rim: '#ffd9a8' },
  mint:      { hi: '#e6fff6', base: '#5fe0b0', lo: '#1f8f6a', iris: '#1b8a63', rim: '#c4f7e4' },
  lava:      { hi: '#ffe0c4', base: '#ff5a1f', lo: '#9e1d00', iris: '#c21d00', rim: '#ffb38a' },
  frost:     { hi: '#ffffff', base: '#a8e8ff', lo: '#4aa8d0', iris: '#3a8fc0', rim: '#e6f9ff' },
  gold:      { hi: '#fffbe0', base: '#ffd23f', lo: '#b88700', iris: '#a87400', rim: '#fff0a8' },
  chrome:    { hi: '#ffffff', base: '#d2d9e0', lo: '#5f6873', iris: '#3a4450', rim: '#ffffff' },
  ghost:     { hi: '#ffffff', base: '#eef3ff', lo: '#9fb0d0', iris: '#5a6c94', rim: '#ffffff', alpha: 0.72 },
  void:      { hi: '#6d6d96', base: '#24243c', lo: '#08080f', iris: '#d4ff3a', rim: '#8f8fd0', glowEyes: true },
};

export const TAU = Math.PI * 2;
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
export function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
export function mulberry(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
