// The 2D Sloppo: the SVG goo look (a lime gradient body of goo lumps merged by a blur +
// colour-matrix "goo" filter, dark ellipse eyes, a simple mouth and a shine). Moods swap face parts.
import { M, now, reduced, moodIs } from './state.js';
import { scaleFor } from './store.js';
import { HAT_SVG, BRAIN_SVG } from './hats.js';
import { MAD } from './rage.js';
import { GLAD_FACE } from './timing.js';

/** The mascot box (CSS px) and the y of his feet inside it. */
export const CW = 176, CH = 204, BASE = 168;
const S0 = 72;                                 // body width in px at level 1
const FEET = 28;                               // the body's feet sit at y = 28 in its own units
const NS = 'http://www.w3.org/2000/svg';
const INK = '#0b1300';
// Lumps: [cx, cy, r, wobble dx, wobble dy, period s] (from the 2100 Sloppo and its blob animations).
const LUMPS = [[0, 4, 25, 0, 0, 1], [-15, 18, 10, -4, 4, 4], [16, 19, 9, 4, 3, 5], [0, -18, 9, 2, -4, 3.6]];
let lastBrain = false, svg = null, parts = null, blinkAt = 0, blinkUntil = 0, lastEyes = '', lastMouth = '', lastHat = '', lastRage = null;

export const size = () => S0 * scaleFor(M.level);

const EYES = {
  normal: (x) => `<ellipse cx="${x}" cy="0" rx="3.6" ry="5" fill="${INK}"/><circle cx="${x - 1.2}" cy="-2" r="1.1" fill="#fff"/>`,
  sleepy: (x) => `<path d="M${x - 3.6} 0.5 Q${x} 3 ${x + 3.6} 0.5" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  happy: (x) => `<path d="M${x - 3.6} 1.5 Q${x} -4 ${x + 3.6} 1.5" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
  heart: (x) => `<path d="M${x} 4.5 C${x - 8} -1 ${x - 4} -7 ${x} -3 C${x + 4} -7 ${x + 8} -1 ${x} 4.5Z" fill="#ff4f86" stroke="${INK}" stroke-width=".7"/><circle cx="${x - 2}" cy="-2.6" r=".9" fill="#fff"/>`,
  spiral: (x) => `<circle cx="${x}" cy="0" r="4.8" fill="#fff" stroke="${INK}" stroke-width=".7"/><path d="M${x} 0 m0 -.6 a.6 .6 0 1 1 -.1 0 m0 -1.4 a2 2 0 1 1 -.3 0 m.1 -1.3 a3.4 3.4 0 1 1 -.4 0" stroke="${INK}" stroke-width=".8" fill="none"/>`,
  // Narrowed eyes under angry brows (no teeth: anger is brows, a frown, red, shaking and steam).
  angry: (x) => `<ellipse cx="${x}" cy="0.8" rx="3.6" ry="3.4" fill="${INK}"/><circle cx="${x - 1.2}" cy="-0.4" r=".9" fill="#fff"/><path d="M${x - 5 * Math.sign(x)} -5.5 L${x + 3.5 * Math.sign(x)} -9" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`,
};
const MOUTHS = {
  smile: `<path d="M-5 10 Q0 14 5 10" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  open: `<path d="M-6.5 8.5 Q0 7.5 6.5 8.5 Q5.5 21 0 21 Q-5.5 21 -6.5 8.5Z" fill="${INK}"/><ellipse cx="0" cy="17.5" rx="3.6" ry="2.2" fill="#ff6f8e"/>`,
  o: `<ellipse cx="0" cy="12" rx="2.6" ry="3.4" fill="${INK}"/>`,
  frown: `<path d="M-5 13.5 Q0 9 5 13.5" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  wavy: `<path d="M-6 11 q1.5 -2 3 0 t3 0 t3 0 t3 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
};

/** Build the SVG inside the mascot box. Ids are unique to this instance. */
export function setup(container) {
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'sloppo-svg');
  svg.setAttribute('width', CW);
  svg.setAttribute('height', CH);
  svg.setAttribute('viewBox', `0 0 ${CW} ${CH}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<defs>
    <radialGradient id="slp-g-mascot" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#f6ffcf"/><stop offset=".35" stop-color="#d4ff3a"/><stop offset="1" stop-color="#5d8f00"/></radialGradient>
    <radialGradient id="slp-gr-mascot" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#ffe0d0"/><stop offset=".35" stop-color="#ff5a3a"/><stop offset="1" stop-color="#8f1200"/></radialGradient>
    <radialGradient id="slp-gw-mascot" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#e4f0b0"/><stop offset=".35" stop-color="#9cb83a"/><stop offset="1" stop-color="#3f5a10"/></radialGradient>
    <filter id="slp-goo-mascot" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>
  </defs>
  <g class="m-root"><g class="m-squash"><g class="m-scale">
    <g class="m-body" filter="url(#slp-goo-mascot)">${LUMPS.map((l, i) => `<circle class="m-c${i}" cx="${l[0]}" cy="${l[1]}" r="${l[2]}"/>`).join('')}</g>
    <g class="m-face"><g class="m-eyes"></g><g class="m-cheeks" style="opacity:0;transition:opacity .45s"><ellipse cx="-14" cy="6" rx="3.4" ry="2" fill="#ff6f96" opacity=".45"/><ellipse cx="14" cy="6" rx="3.4" ry="2" fill="#ff6f96" opacity=".45"/></g><g class="m-mouth"></g></g>
    <ellipse class="m-shine" cx="-10" cy="-10" rx="6" ry="3.5" transform="rotate(-30 -10 -10)" fill="rgba(255,255,255,.8)"/>
    <g class="m-hat"></g><g class="m-brain"></g>
  </g></g></g>`;
  container.append(svg);
  const q = (s) => svg.querySelector(s);
  parts = { root: q('.m-root'), squash: q('.m-squash'), scale: q('.m-scale'), eyes: q('.m-eyes'), cheeks: q('.m-cheeks'), face: q('.m-face'), shine: q('.m-shine'), mouth: q('.m-mouth'), hat: q('.m-hat'), brain: q('.m-brain'), lumps: LUMPS.map((_, i) => q('.m-c' + i)) };
  lastEyes = lastMouth = lastHat = ''; lastRage = null; lastBrain = false;
  return svg;
}

/** [eyes, mouth] for the current state. */
export function face(t = now()) {
  if (moodIs('dizzy')) return ['sleepy', 'wavy'];
  if (M.mode === 'drag' || M.mode === 'air') return ['normal', 'o'];
  if (moodIs('love')) return ['heart', 'open'];
  if (moodIs('chomp')) return [M.chaos || M.raging ? 'angry' : 'happy', 'open'];
  if (moodIs('woozy')) return ['sleepy', 'wavy'];
  if (M.chaos || M.raging) return ['angry', 'frown'];
  if (moodIs('annoyed') || M.rage >= MAD) return ['angry', 'frown'];
  if (moodIs('land')) return ['happy', 'smile'];
  if (M.glad >= GLAD_FACE) return ['happy', 'smile'];      // a good moment still glowing
  if (M.mode === 'hop') return ['normal', 'open'];
  if (t > blinkAt) { blinkUntil = t + 140; blinkAt = t + 2200 + Math.random() * 3800; }
  return [t < blinkUntil ? 'sleepy' : 'normal', 'smile'];
}

export function draw(t) {
  if (!svg) return;
  const [eyes, mouth] = face(t), still = reduced(), s = size(), k = s / 50;
  if (eyes !== lastEyes) {
    parts.eyes.innerHTML = EYES[eyes](-8) + EYES[eyes](8);
    lastEyes = eyes;
    // Blush only shows (and fades) in love: petted, a favourite treat, heart eyes.
    parts.cheeks.style.opacity = eyes === 'heart' || moodIs('love') ? '1' : '0';
  }
  if (mouth !== lastMouth) { parts.mouth.innerHTML = MOUTHS[mouth]; lastMouth = mouth; }
  // Turned his back (snubbing a treat): no face, the shine moves to the other side.
  const back = now() < (M.backUntil || 0);
  parts.face.style.opacity = back ? '0' : '';
  parts.shine.setAttribute('transform', back ? 'translate(18 0) rotate(-30 -10 -10)' : 'rotate(-30 -10 -10)');
  const hat = M.tempHat || M.hat || '';
  if (hat !== lastHat) { parts.hat.innerHTML = HAT_SVG[hat] || ''; lastHat = hat; }
  if (!!M.powered !== lastBrain) { lastBrain = !!M.powered; parts.brain.innerHTML = lastBrain ? BRAIN_SVG : ''; }
  const rage = M.raging ? 'rage' : moodIs('woozy') ? 'woozy' : 'calm';
  if (rage !== lastRage) {
    const fills = rage === 'rage' ? ['url(#slp-gr-mascot)', '#e8442a', '#d93a1c', '#ff9a80'] : rage === 'woozy' ? ['url(#slp-gw-mascot)', '#7f9c2a', '#6f8c20', '#a8c060'] : ['url(#slp-g-mascot)', '#b7e81e', '#a9db10', '#e3ff86'];
    parts.lumps.forEach((c, i) => c.setAttribute('fill', fills[i]));
    lastRage = rage;
  }
  // Breathing squish plus the jelly spring; lumps wobble (and jiggle harder after a squash).
  const sec = still ? 0 : t / 1000, q = still ? 0 : M.squash;
  const breathe = still ? 0 : Math.sin(sec * Math.PI * 2 / 3.2) * 0.5 + 0.5;
  const sx = (1 + q * 0.32) * (1 + breathe * 0.04), sy = (1 - q * 0.28) * (1 - breathe * 0.05);
  const jig = still ? 0 : Math.max(-1, Math.min(1, M.sqv * 0.15));
  LUMPS.forEach(([cx, cy, r, dx, dy, p], i) => {
    if (!i) return;
    const w = still ? 0 : Math.sin(sec * Math.PI * 2 / p) * 0.5 + 0.5;
    const c = parts.lumps[i];
    c.setAttribute('cx', (cx + dx * w + jig * dx * 0.8).toFixed(2));
    c.setAttribute('cy', (cy + dy * w - jig * 2).toFixed(2));
    c.setAttribute('r', (r * (1 + jig * 0.12)).toFixed(2));
  });
  const deg = (M.rot * 180) / Math.PI, pivot = s * 0.55;
  parts.root.setAttribute('transform', `translate(${CW / 2} ${BASE}) translate(0 ${-pivot}) rotate(${deg.toFixed(2)}) translate(0 ${pivot})`);
  parts.squash.setAttribute('transform', `scale(${sx.toFixed(4)} ${sy.toFixed(4)})`);
  parts.scale.setAttribute('transform', `scale(${k.toFixed(4)}) translate(0 ${-FEET})`);
}
