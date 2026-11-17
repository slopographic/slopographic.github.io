// Sloppo, metaball circles through an SVG goo filter.
// sloppo() returns { el, pose(t, o) }: pose is a pure function of time.
import { h } from './ease.js';

let uid = 0;
export function sloppo(cls = '') {
  const id = 'sp' + (uid++);
  const el = h('div', 'sloppo ' + cls);
  el.innerHTML = `<svg viewBox="-60 -60 120 120" aria-hidden="true">
    <defs>
      <radialGradient id="${id}g" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#f6ffcf"/><stop offset=".35" stop-color="#d4ff3a"/><stop offset="1" stop-color="#5d8f00"/></radialGradient>
      <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>
    </defs>
    <g class="sp-all">
      <g filter="url(#${id}f)">
        <circle class="c0" cx="0" cy="4" r="25" fill="url(#${id}g)"/>
        <circle class="c1" cx="-15" cy="18" r="10" fill="#b7e81e"/>
        <circle class="c2" cx="16" cy="19" r="9" fill="#a9db10"/>
        <circle class="c3" cx="0" cy="-18" r="9" fill="#e3ff86"/>
        <circle class="d1" cx="-30" cy="30" r="0" fill="#b7e81e"/>
        <circle class="d2" cx="30" cy="30" r="0" fill="#a9db10"/>
      </g>
      <g class="face">
        <ellipse class="eye l" cx="-8" cy="0" rx="3.6" ry="5" fill="#0b0d05"/>
        <ellipse class="eye r" cx="8" cy="0" rx="3.6" ry="5" fill="#0b0d05"/>
        <circle cx="-6.8" cy="-1.8" r="1.2" fill="#fff"/><circle cx="9.2" cy="-1.8" r="1.2" fill="#fff"/>
        <path class="mouth" d="M-5 10 Q0 14 5 10" fill="none" stroke="#0b0d05" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <ellipse cx="-10" cy="-10" rx="6" ry="3.5" transform="rotate(-30 -10 -10)" fill="#fff" opacity=".55"/>
    </g>
  </svg>`;
  const q = (s) => el.querySelector(s);
  const all = q('.sp-all'), c1 = q('.c1'), c2 = q('.c2'), c3 = q('.c3'), d1 = q('.d1'), d2 = q('.d2');
  const eyes = el.querySelectorAll('.eye'), mouth = q('.mouth'), face = q('.face');
  /** squash: -1 (tall) .. 1 (flat); open: mouth 0..1; look: -1..1; splat: 0..1 spreads side drops. */
  function pose(t, { squash = 0, open = 0, look = 0, splat = 0, blink = true } = {}) {
    const sx = 1 + squash * 0.35, sy = 1 - squash * 0.3;
    all.setAttribute('transform', `translate(0 ${25 * (1 - sy)}) scale(${sx} ${sy})`);
    const w = Math.sin(t * 5.3) * 2;
    c1.setAttribute('cx', -15 - w - splat * 12); c2.setAttribute('cx', 16 + w + splat * 12);
    c3.setAttribute('cy', -18 + Math.sin(t * 3.1) * 2 + splat * 10);
    d1.setAttribute('r', 7 * splat); d2.setAttribute('r', 6 * splat);
    d1.setAttribute('cx', -22 - splat * 18); d2.setAttribute('cx', 22 + splat * 18);
    const bl = blink && (t % 3.1) < 0.12 ? 0.15 : 1;
    eyes.forEach((e) => e.setAttribute('ry', 5 * bl));
    face.setAttribute('transform', `translate(${look * 4} 0)`);
    const m = 10 + open * 7;
    mouth.setAttribute('d', open > 0.05 ? `M-5 10 Q0 ${m} 5 10 Q0 ${10 + open * 2} -5 10` : 'M-5 10 Q0 14 5 10');
    mouth.setAttribute('fill', open > 0.05 ? '#0b0d05' : 'none');
  }
  pose(0);
  return { el, pose };
}

/** A goo wipe: blobs that merge into a full-screen fill. progress 0..1 covers, 1..2 uncovers. */
export function gooWipe(cls = '') {
  const id = 'gw' + (uid++);
  const el = h('div', 'goo-wipe ' + cls);
  const n = 9;
  el.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 -12"/></filter></defs>
    <g filter="url(#${id})" fill="currentColor">${Array.from({ length: n }, (_, i) => `<circle cx="${(i + 0.5) * (100 / n)}" cy="-20" r="9"/>`).join('')}<rect x="-10" y="-40" width="120" height="0"/></g>
  </svg>`;
  const cs = [...el.querySelectorAll('circle')], rect = el.querySelector('rect');
  /** p in 0..2: drips fall and fill (0..1), then drain off the bottom (1..2). */
  function set(p) {
    el.style.display = p <= 0 || p >= 2 ? 'none' : '';
    cs.forEach((c, i) => {
      const lag = ((i * 37) % 9) / 9 * 0.35;
      const q = Math.max(0, Math.min(1, (p - lag) / 0.65));
      const y = p < 1 ? -20 + q * q * 140 : 120 + (p - 1) * 40;
      c.setAttribute('cy', y.toFixed(2)); c.setAttribute('r', (9 + q * 6).toFixed(2));
    });
    const top = p < 1 ? -40 : (p - 1) * 140 - 40;
    const bottom = p < 1 ? Math.max(-40, -40 + (p - 0.15) / 0.85 * 150) : 140;
    rect.setAttribute('y', top.toFixed(2)); rect.setAttribute('height', Math.max(0, bottom - top).toFixed(2));
  }
  set(0);
  return { el, set };
}
