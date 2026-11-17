// Particles and the speech bubble: hearts, sparkles, crumbs, landing dust, goo splats.
import { M, reduced, rand, clamp, pageW } from './state.js';
import { size, CW, BASE } from './look.js';
import { tr } from './lines.js';

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.4-4.5-9.5-9.1C1 8.3 3.1 4.6 6.6 4.6c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.5 0 5.6 3.7 4.1 7.3C19.4 16.5 12 21 12 21z"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>';

function particle(cls, x, y, html) {
  const n = document.createElement('span');
  n.className = 'sloppo-fx ' + cls;
  n.setAttribute('aria-hidden', 'true');
  n.style.left = x + 'px';
  n.style.top = y + 'px';
  if (html) n.innerHTML = html;
  M.layer.append(n);
  return n;
}
/** Animate a particle by (dx, dy) and remove it. Reduced motion: a plain fade. */
function fly(n, dx, dy, ms, { spin = 0, from = 0.4, to = 0.8, delay = 0 } = {}) {
  const frames = reduced()
    ? [{ opacity: 1 }, { opacity: 0 }]
    : [{ transform: `scale(${from})`, opacity: 0 },
       { transform: `translate(${dx * 0.25}px, ${dy * 0.25}px) scale(1)`, opacity: 1, offset: 0.2 },
       { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(${to})`, opacity: 0 }];
  const a = n.animate(frames, { duration: ms, delay, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' });
  const done = () => n.remove();
  a.onfinish = done; a.oncancel = done;
  return a;
}

export function hearts(n = 3) {
  const s = size();
  for (let i = 0; i < n; i++) {
    const h = particle('sloppo-heart', M.x + rand(-0.35, 0.35) * s, M.y - s * 0.85);
    h.innerHTML = HEART;
    fly(h, rand(-50, 50), -rand(60, 110), 900 + i * 140, { spin: rand(-25, 25), delay: i * 70 });
  }
}

export function sparkle(x = M.x, y = M.y - size() * 0.6, n = 10, colors = ['#d4ff3a', '#ffd23f', '#5cc8ff', '#ff4f86']) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3), d = rand(50, 110);
    const p = particle('sloppo-spark', x, y, STAR);
    p.style.color = colors[i % colors.length];
    fly(p, Math.cos(a) * d, Math.sin(a) * d, 800 + rand(0, 300), { spin: rand(-180, 180), from: 0.2, to: 0.3 });
  }
}

/** Little bits that fall from a bite. */
export function crumbs(x, y, color = '#1a1a1a', n = 6) {
  for (let i = 0; i < n; i++) {
    const c = particle('sloppo-crumb', x + rand(-14, 14), y + rand(-4, 6));
    c.style.background = color;
    fly(c, rand(-40, 40), rand(40, 120), 700 + rand(0, 300), { spin: rand(-200, 200), from: 1, to: 0.6 });
  }
}

/** Goo droplets puffing out sideways when he lands. */
export function dust(x = M.x, y = M.y, strength = 1) {
  const n = Math.round(clamp(strength * 6, 2, 8));
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const d = particle('sloppo-drop', x + side * size() * 0.3, y - 3);
    fly(d, side * rand(18, 46) * strength, -rand(8, 26) * strength, 420 + rand(0, 200), { from: 1, to: 0.3 });
  }
}

/* ---------- speech bubble ---------- */
let sayTimer = 0, rich = false;
/**
 * Say something. opts.actions: [{ label, run }] adds buttons (the bubble then waits for a click
 * or `ms`); opts.force replaces a bubble that has buttons. Returns the text element (for streaming).
 */
export function say(text, ms = 1600, opts = {}) {
  const b = M.bubble;
  if (!b) return null;
  if (rich && b.classList.contains('show') && !opts.force && !opts.actions) return null;
  b.textContent = '';
  const t = document.createElement('span');
  t.className = 'say-text';
  t.textContent = text;
  b.append(t);
  rich = !!(opts.actions && opts.actions.length) || !!opts.node;
  if (opts.node) b.append(opts.node);
  if (opts.actions && opts.actions.length) {
    const row = document.createElement('span');
    row.className = 'say-actions';
    for (const a of opts.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = a.label;
      btn.addEventListener('click', (e) => { e.stopPropagation(); hush(); if (a.run) a.run(); });
      row.append(btn);
    }
    b.append(row);
  }
  b.classList.toggle('rich', rich);
  b.classList.add('show');
  placeBubble();
  clearTimeout(sayTimer);
  if (ms > 0) sayTimer = setTimeout(hush, ms);
  return t;
}
/** Close the bubble. */
export function hush() {
  clearTimeout(sayTimer);
  rich = false;
  if (M.bubble) M.bubble.classList.remove('show', 'rich');
}
/** Stream text (an async iterable of chunks) into the bubble. Resolves with the full text. */
export async function stream(chunks, ms = 6000, opts = {}) {
  const t = say('…', 0, Object.assign({ force: true }, opts));
  let all = '';
  try {
    for await (const piece of chunks) { all += piece; if (t) { t.textContent = all; placeBubble(); } }
  } catch (e) { if (!all && t) t.textContent = tr('ui.buddy.brain_hiccup'); }
  clearTimeout(sayTimer);
  sayTimer = setTimeout(hush, ms);
  return all;
}
/** Keep the bubble above his head and inside the page. Called every frame. */
export function placeBubble() {
  const b = M.bubble;
  if (!b || !b.classList.contains('show')) return;
  const s = size(), w = b.offsetWidth;
  const left = CW / 2 - w / 2, pageLeft = M.x - CW / 2 + left;
  const fix = clamp(pageLeft, 8, pageW() - 8 - w) - pageLeft;
  b.style.left = left + fix + 'px';
  // Above his head when there is room; below when he is near the top of the window, so the bubble is never cut off.
  const above = BASE - s * (M.hat ? 1.55 : 1.25) - b.offsetHeight;
  const flip = M.el.getBoundingClientRect().top + above < 8;
  b.classList.toggle('below', flip);
  b.style.top = (flip ? BASE + s * 0.45 : above) + 'px';
  b.style.setProperty('--tail', clamp(w / 2 - fix, 14, w - 14) + 'px');
}

/* ---------- goo ---------- */
/** A random blobby goo splat with drips, as an SVG string. */
export function gooSVG(r = 34) {
  const n = 11, pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = r * rand(0.7, 1.12);
    pts.push([50 + Math.cos(a) * k, 50 + Math.sin(a) * k * 0.82]);
  }
  let d = '';
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    d += (i ? '' : `M${((pts[n - 1][0] + p[0]) / 2).toFixed(1)} ${((pts[n - 1][1] + p[1]) / 2).toFixed(1)}`) + `Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const drips = [0, 1, 2].map(() => {
    const x = 50 + rand(-r * 0.6, r * 0.6), len = rand(24, 58), w = rand(4, 7);
    return `<path class="drip" d="M${(x - w / 2).toFixed(1)} 55v${len.toFixed(1)}a${(w / 2).toFixed(1)} ${(w / 2).toFixed(1)} 0 0 0 ${w.toFixed(1)} 0V55z"/>`;
  }).join('');
  const dots = [0, 1, 2, 3].map(() => `<circle cx="${(50 + rand(-r * 1.4, r * 1.4)).toFixed(1)}" cy="${(50 + rand(-r, r)).toFixed(1)}" r="${rand(2, 5).toFixed(1)}"/>`).join('');
  return `<svg viewBox="0 0 100 130" aria-hidden="true"><g class="goo-body"><path d="${d}Z"/>${drips}${dots}</g><ellipse class="goo-shine" cx="40" cy="40" rx="9" ry="5" transform="rotate(-25 40 40)"/></svg>`;
}
