// Paint Sloppo: a soft, gummy slime with big anime eyes. Every look picks a body
// colour, eyes, mouth, hat, prop and aura. Pure canvas; the same look always
// draws the same Sloppo.
import { BODIES, TAU, shade, rgba, mulberry } from './palette.js';
import { bodyPath, jellyFill } from './body.js';
import { eye, mouth } from './face.js';
import { HATS, OVER } from './hats.js';
import { PROPS } from './props.js';
import { aura } from './auras.js';

/**
 * Paint Sloppo onto ctx (W×H). t animates a gentle idle bob.
 * look.noGlow skips the dark radial contrast glow behind him (for transparent backgrounds).
 */
export function drawSloppo(g, W, Hh, look = {}, t = 0) {
  const B = BODIES[look.body] || BODIES.lime;
  // The card's name/stats panel covers the bottom ~45%, so Sloppo lives up top.
  const s = Math.min(W * 0.48, Hh * 0.29) * (look.scale || 1);
  const bob = Math.sin(t * 2.2) * 0.025, squish = 1 + bob;
  const w = s * (1 / squish) * 1.0, h = s * 0.84 * squish;
  const x = W / 2, base = Hh * (look.baseY || 0.485);
  const top = base - h;
  const H = { x, base, top, w, h, s, eyeY: base - h * 0.5, B };
  g.save();
  // glow behind for contrast on busy fractals
  if (!look.noGlow) {
    const bg = g.createRadialGradient(x, base - h * 0.45, s * 0.2, x, base - h * 0.45, s * 1.05);
    bg.addColorStop(0, 'rgba(0,0,0,.42)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
  }
  aura(g, look, H, t, W, Hh);
  if (look.back === 'cape') {
    g.fillStyle = look.capeColor || '#c21d2e';
    g.beginPath(); g.moveTo(x - w * 0.4, top + h * 0.35); g.quadraticCurveTo(x - w * 0.85, base - h * 0.1, x - w * 0.7, base + s * 0.04); g.lineTo(x + w * 0.7, base + s * 0.04); g.quadraticCurveTo(x + w * 0.85, base - h * 0.1, x + w * 0.4, top + h * 0.35); g.closePath(); g.fill();
  }
  if (look.back === 'wings') {
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * w * 0.35, top + h * 0.45); g.bezierCurveTo(x + sx * w * 1.1, top - h * 0.1, x + sx * w * 1.15, top + h * 0.5, x + sx * w * 0.9, top + h * 0.75); g.bezierCurveTo(x + sx * w * 0.8, top + h * 0.65, x + sx * w * 0.6, top + h * 0.8, x + sx * w * 0.4, top + h * 0.7); g.closePath(); g.fill(); }
  }
  // shadow + goo puddle
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, base + s * 0.05, w * 0.72, s * 0.07, 0, 0, TAU); g.fill();
  g.globalAlpha = B.alpha || 1;
  const pg = g.createLinearGradient(0, base - s * 0.04, 0, base + s * 0.08); pg.addColorStop(0, B.base); pg.addColorStop(1, B.lo);
  g.fillStyle = pg; g.beginPath(); g.ellipse(x, base + s * 0.02, w * 0.68, s * 0.065, 0, 0, TAU); g.fill();
  for (const [dx, r] of [[-0.62, 0.05], [0.7, 0.035], [0.5, 0.025]]) { g.beginPath(); g.ellipse(x + dx * w, base + s * 0.035, s * r * 1.6, s * r * 0.6, 0, 0, TAU); g.fill(); }
  // soft-serve curl
  const curl = (cx0, cy0, r, sy) => { const gr = g.createRadialGradient(cx0 - r * 0.4, cy0 - r * 0.5, r * 0.1, cx0, cy0, r * 1.2); gr.addColorStop(0, B.hi); gr.addColorStop(0.6, B.base); gr.addColorStop(1, B.lo); g.fillStyle = gr; g.beginPath(); g.ellipse(cx0, cy0, r, r * sy, 0, 0, TAU); g.fill(); };
  if (!look.noCurl) { curl(x - w * 0.02, top + h * 0.03, s * 0.13, 1.05); curl(x + w * 0.04, top - h * 0.1, s * 0.075, 1.15); }
  // body
  bodyPath(g, x, base, w, h);
  g.fillStyle = jellyFill(g, B, x, base, w, h); g.fill();
  g.save(); g.clip();
  // jelly: a lighter core and light passing through the bottom
  let gr = g.createRadialGradient(x, base - h * 0.45, s * 0.05, x, base - h * 0.45, s * 0.5);
  gr.addColorStop(0, rgba(B.hi.startsWith('#') ? B.hi : '#ffffff', 0.25)); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - w, top, w * 2, h * 1.2);
  gr = g.createLinearGradient(0, base - h * 0.28, 0, base); gr.addColorStop(0, rgba(B.rim, 0)); gr.addColorStop(1, rgba(B.rim, 0.55)); g.fillStyle = gr; g.fillRect(x - w, base - h * 0.28, w * 2, h * 0.3);
  // tiny bubbles inside
  const rnd = mulberry((look.seed || 3) + 11);
  g.fillStyle = 'rgba(255,255,255,.28)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * w * 0.7, base - rnd() * h * 0.45, s * (0.008 + rnd() * 0.018), 0, TAU); g.fill(); }
  g.restore();
  // soft rim + edge
  bodyPath(g, x, base, w, h);
  g.strokeStyle = rgba(B.rim, 0.55); g.lineWidth = s * 0.018; g.stroke();
  g.strokeStyle = shade(B.lo.startsWith('#') ? B.lo : '#4d8f00', -0.35); g.globalAlpha = (B.alpha || 1) * 0.55; g.lineWidth = s * 0.008; g.stroke();
  g.globalAlpha = 1;
  // painted gloss (soft, not a hard specular)
  gr = g.createRadialGradient(x - w * 0.24, top + h * 0.26, 0, x - w * 0.24, top + h * 0.26, s * 0.14);
  gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(x - w * 0.24, top + h * 0.26, s * 0.13, s * 0.075, -0.6, 0, TAU); g.fill();
  // face
  const ey = H.eyeY + (look.eyeDY || 0) * s;
  eye(g, B, x - s * 0.17, ey, s, look.eyes || 'normal', -1);
  eye(g, B, x + s * 0.17, ey, s, look.eyes === 'wink' ? 'wink' : look.eyes || 'normal', 1);
  g.fillStyle = 'rgba(255,111,150,.42)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * s * 0.29, ey + s * 0.1, s * 0.065, s * 0.035, 0, 0, TAU); g.fill(); }
  mouth(g, x, ey + s * 0.14, s, look.mouth || 'smile');
  if (look.mustache) { g.fillStyle = '#3a2410'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * s * 0.05, ey + s * 0.115, s * 0.06, s * 0.022, sx * 0.3, 0, TAU); g.fill(); } }
  // accessories
  for (const k of [].concat(look.hat || [])) if (HATS[k]) HATS[k](g, H);
  if (look.hat === 'astro' || (Array.isArray(look.hat) && look.hat.includes('astro'))) OVER.astro(g, H);
  for (const k of [].concat(look.prop || [])) if (PROPS[k]) PROPS[k](g, H);
  g.restore();
}
