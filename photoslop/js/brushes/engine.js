/* PhotoSlop: brush engine v2 and brush packs.
 * Presets carry a tip (procedural shape or an imported image) plus dynamics: angle,
 * roundness, size/angle/opacity/hue jitter, scatter, count, follow-stroke and pressure.
 * Packs: built-ins, plus imports from Photoshop .abr, PNG tips and .slopbrush/JSON packs. */
'use strict';

const DYN = { angle: 0, roundness: 1, sizeJitter: 0, angleJitter: 0, follow: false, scatter: 0, count: 1, opacityJitter: 0, hueJitter: 0, pressureOpacity: false, tipImage: null };
const TIP_IMAGES = new Map(); // id → alpha-mask canvas (black where it paints)
const ALL_TIPS = trPairs([['round', ''], ['square', ''], ['flat', ''], ['spray', ''], ['chalk', ''], ['charcoal', ''], ['bristle', ''], ['sponge', ''], ['grass', ''], ['leaf', ''], ['star', ''], ['heart', ''], ['ring', ''], ['splat', ''], ['slime', ''], ['sloppo', '']], 'photoslop.brush.tip_');
const tipOptions = (o) => ALL_TIPS.concat(o.tip === 'image' ? [['image', tr('photoslop.brush.tip_image')]] : []);
const MULTI = { spray: 6, chalk: 4, bristle: 4, charcoal: 4, sponge: 4, splat: 4 };

/* ---------- procedural tips ---------- */
function procTip(tip, d, variant) {
  const c = mkCanvas(d, d), g = cx(c), m = d / 2, r = d / 2 - 1, rnd = rng(variant * 7919 + tip.length * 131 + 3);
  g.fillStyle = '#000'; g.strokeStyle = '#000';
  const path = (fn) => { g.beginPath(); fn(); g.fill(); };
  switch (tip) {
    case 'bristle':
      for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r * 0.9; g.globalAlpha = 0.35 + rnd() * 0.65; g.beginPath(); g.ellipse(m + Math.cos(a) * rr, m + Math.sin(a) * rr * 0.45, r * (0.04 + rnd() * 0.06), r * (0.04 + rnd() * 0.05), 0, 0, Math.PI * 2); g.fill(); }
      break;
    case 'charcoal': {
      path(() => g.ellipse(m, m, r, r * 0.8, 0.4, 0, Math.PI * 2));
      const img = g.getImageData(0, 0, d, d), px = img.data;
      for (let i = 3; i < px.length; i += 4) if (px[i]) px[i] *= rnd() < 0.55 ? rnd() * 0.25 : 0.55 + rnd() * 0.45;
      g.putImageData(img, 0, 0);
      break;
    }
    case 'sponge':
      path(() => g.arc(m, m, r, 0, Math.PI * 2));
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 22; i++) { g.beginPath(); g.arc(m + (rnd() - 0.5) * d * 0.9, m + (rnd() - 0.5) * d * 0.9, r * (0.06 + rnd() * 0.16), 0, Math.PI * 2); g.fill(); }
      break;
    case 'grass':
      path(() => { g.moveTo(m - r * 0.12, m + r); g.quadraticCurveTo(m - r * 0.1, m, m + r * 0.15, m - r); g.quadraticCurveTo(m + r * 0.05, m, m + r * 0.12, m + r); });
      break;
    case 'leaf':
      path(() => { g.moveTo(m, m - r); g.quadraticCurveTo(m + r * 0.75, m, m, m + r); g.quadraticCurveTo(m - r * 0.75, m, m, m - r); });
      g.globalCompositeOperation = 'destination-out'; g.lineWidth = Math.max(1, d * 0.03); g.beginPath(); g.moveTo(m, m - r * 0.8); g.lineTo(m, m + r * 0.9); g.stroke();
      break;
    case 'star':
      path(() => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); } g.closePath(); });
      break;
    case 'heart':
      path(() => { const k = r * 0.95; g.moveTo(m, m + k * 0.85); g.bezierCurveTo(m - k * 1.5, m - k * 0.1, m - k * 0.6, m - k * 1.1, m, m - k * 0.35); g.bezierCurveTo(m + k * 0.6, m - k * 1.1, m + k * 1.5, m - k * 0.1, m, m + k * 0.85); });
      break;
    case 'ring':
      g.lineWidth = Math.max(1, d * 0.07); g.beginPath(); g.arc(m, m, r * 0.88, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.25; path(() => g.arc(m, m, r * 0.82, 0, Math.PI * 2));
      g.globalAlpha = 1; path(() => g.ellipse(m - r * 0.35, m - r * 0.38, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2));
      break;
    case 'splat':
      path(() => g.arc(m, m, r * 0.42, 0, Math.PI * 2));
      for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, rr = r * (0.45 + rnd() * 0.5), s = r * (0.04 + rnd() * 0.12); path(() => g.arc(m + Math.cos(a) * rr, m + Math.sin(a) * rr, s, 0, Math.PI * 2)); }
      break;
    case 'sloppo': {
      path(() => { g.moveTo(m - r * 0.78, m + r * 0.8); g.bezierCurveTo(m - r * 0.95, m - r * 0.2, m - r * 0.4, m - r * 0.62, m, m - r * 0.62); g.bezierCurveTo(m + r * 0.4, m - r * 0.62, m + r * 0.95, m - r * 0.2, m + r * 0.78, m + r * 0.8); g.closePath(); });
      path(() => g.ellipse(m - r * 0.02, m - r * 0.72, r * 0.18, r * 0.2, 0, 0, Math.PI * 2));
      g.globalCompositeOperation = 'destination-out';
      for (const sx of [-1, 1]) path(() => g.ellipse(m + sx * r * 0.27, m + r * 0.08, r * 0.12, r * 0.16, 0, 0, Math.PI * 2));
      g.lineWidth = Math.max(1, r * 0.07); g.lineCap = 'round'; g.beginPath(); g.arc(m, m + r * 0.28, r * 0.14, 0.3, Math.PI - 0.3); g.stroke();
      break;
    }
    default: return null;
  }
  return c;
}
/** Black alpha mask for any tip at the given size. */
function tipMask(o, size, variant) {
  const tip = o.tip || 'round';
  if (tip === 'image') {
    const src = TIP_IMAGES.get(o.tipImage);
    if (!src) return dabCanvas(size, o.hardness, '#000000', 'round', 0);
    const key = `img|${o.tipImage}|${Math.ceil(size)}`;
    if (dabCache.has(key)) return dabCache.get(key);
    const k = size / Math.max(src.width, src.height), w = Math.max(1, Math.round(src.width * k)), hh = Math.max(1, Math.round(src.height * k));
    const c = mkCanvas(w, hh), g = cx(c); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, hh);
    dabCache.set(key, c); return c;
  }
  if (['round', 'square', 'flat', 'spray', 'chalk', 'slime'].includes(tip)) return dabCanvas(size, o.hardness, '#000000', tip, variant);
  const d = Math.max(4, Math.ceil(size) + 2), key = `proc|${tip}|${d}|${variant}`;
  if (dabCache.has(key)) return dabCache.get(key);
  const c = procTip(tip, d, variant) || dabCanvas(size, o.hardness, '#000000', 'round', 0);
  dabCache.set(key, c);
  return c;
}
function tint(mask, color) {
  const c = mkCanvas(mask.width, mask.height), g = cx(c);
  g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}
function hueShift(hex, deg) { const [hh, s, l] = rgbToHsl(...hexToRgb(hex)); return rgbToHex(...hslToRgb((hh + deg + 360) % 360, s, l)); }

/** Build the per-stroke dab painter for a brush preset. Returns { spacing(pressure), dab(g, x, y, pressure) }. */
function makeDabber(o, color, usePressure) {
  o = Object.assign({}, DYN, o);
  const nv = MULTI[o.tip] || 1, master = Math.max(4, Math.min(o.size, 1200));
  const masks = Array.from({ length: nv }, (_, v) => tipMask(o, master, v));
  const colors = o.hueJitter > 0 ? Array.from({ length: 6 }, () => hueShift(color, (Math.random() - 0.5) * 360 * o.hueJitter)) : [color];
  const tips = colors.map((c) => masks.map((m) => tint(m, c)));
  const spacingK = o.tip === 'spray' ? Math.max(o.spacing, 0.3) : o.tip === 'slime' ? Math.max(o.spacing, 0.18) : o.spacing;
  let last = null, dir = 0;
  return {
    spacing: (pr) => Math.max(0.5, o.size * (usePressure ? clamp(pr, 0.05, 1) : 1) * spacingK),
    dab(g, x, y, pr) {
      if (last) { const dx = x - last.x, dy = y - last.y; if (dx * dx + dy * dy > 0.25) dir = Math.atan2(dy, dx); }
      last = { x, y };
      const p = usePressure ? clamp(pr, 0.05, 1) : 1;
      for (let k = 0; k < Math.max(1, o.count | 0); k++) {
        const set = tips[(Math.random() * tips.length) | 0], tip = set[(Math.random() * set.length) | 0];
        const s = o.size * p * (1 - o.sizeJitter * Math.random());
        if (s < 0.3) continue;
        const sc = o.scatter * o.size * (Math.random() - 0.5) * 2, sc2 = o.scatter * o.size * (Math.random() - 0.5) * 2;
        const px = x + (o.follow ? -Math.sin(dir) * sc : sc), py = y + (o.follow ? Math.cos(dir) * sc : sc2);
        const ang = (o.angle * Math.PI) / 180 + (o.follow ? dir : 0) + (Math.random() - 0.5) * 2 * Math.PI * o.angleJitter;
        const alpha = o.flow * (1 - o.opacityJitter * Math.random()) * (usePressure && o.pressureOpacity ? p : 1);
        const k2 = s / master, w = tip.width * k2, hh = tip.height * k2;
        g.save(); g.globalAlpha = alpha; g.translate(px, py);
        if (ang) g.rotate(ang);
        if (o.roundness < 1) g.scale(1, Math.max(0.05, o.roundness));
        g.drawImage(tip, -w / 2, -hh / 2, w, hh);
        g.restore();
      }
    },
  };
}
/** A sample S-stroke for previews. */
function presetPreview(p, w = 64, hh = 40, color) {
  const c = mkCanvas(w, hh), g = cx(c), col = color || (theme() === 'pro' ? '#e8e8e8' : '#111111');
  const o = Object.assign({}, DYN, p);
  const s = clamp(o.size, 3, hh * 0.55) * (o.tip === 'spray' ? 1.3 : 1);
  const big = p.size > 140 || p.size < 6 || ['sloppo', 'star', 'heart', 'leaf', 'splat', 'image'].includes(o.tip) && !o.scatter && o.spacing > 0.6;
  const d = makeDabber(Object.assign({}, o, { size: s, flow: Math.min(1, o.flow * 1.4) }), col, false);
  if (big) { d.dab(g, w / 2, hh / 2, 1); return c; }
  const st = new Stroker(() => d.spacing(1), (x, y, pr) => d.dab(g, x, y, pr));
  const pt = (t) => ({ x: 8 + t * (w - 16), y: hh / 2 + Math.sin(t * Math.PI * 2) * hh * 0.22, pressure: 1 });
  st.begin(pt(0)); for (let i = 1; i <= 24; i++) st.to(pt(i / 24));
  return c;
}
