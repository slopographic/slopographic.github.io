/* SlopSamples: sample files for "Try it with a sample" (SlopDrop's sample option), made in the page, so a first visit can
 * see what an app does before choosing a file of its own. Classic script; sets window.SlopSamples.
 *   SlopSamples.photos(n = 6, { width, height, type }) -> Promise<File[]>   painted scenes (sunset, mountains, forest,
 *       city at night, desert, lake, snow, meadow) as JPEG, named "Sample sunset.jpg" and so on.
 *   SlopSamples.file(name, text | Blob | Uint8Array, type) -> File          a file from text or bytes.
 *   SlopSamples.asset(path, name?, type?) -> Promise<File>                    a file kept in assets/samples/ (a real PDF,
 *       a voice clip): path is relative to that folder; the folder is found from this script's own address.
 *   SlopSamples.SCENES                                                       the scene names, in order. */
(function (g) {
  'use strict';
  if (g.SlopSamples) return;
  const doc = g.document;
  const here = doc && doc.currentScript ? doc.currentScript.src : '';
  const BASE = here ? new URL('../../assets/samples/', here).href : 'assets/samples/';

  /** A small seeded random, so a scene looks the same every time. */
  const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sky = (x, w, h, stops) => { const gr = x.createLinearGradient(0, 0, 0, h); stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c)); x.fillStyle = gr; x.fillRect(0, 0, w, h); };
  /** A ridge of hills across the picture, from a base height, with a random edge. */
  function ridge(x, w, h, base, rough, colour, r) {
    x.fillStyle = colour; x.beginPath(); x.moveTo(0, h);
    let y = base;
    for (let i = 0; i <= 24; i++) { y = Math.min(h, Math.max(h * 0.15, y + (r() - 0.5) * rough)); x.lineTo((w * i) / 24, y); }
    x.lineTo(w, h); x.closePath(); x.fill();
  }
  const disc = (x, cx, cy, rad, colour) => { x.fillStyle = colour; x.beginPath(); x.arc(cx, cy, rad, 0, Math.PI * 2); x.fill(); };
  const SCENES = {
    sunset(x, w, h, r) { sky(x, w, h, ['#2b1b5a', '#c2457a', '#ff9b54', '#ffd27a']); disc(x, w * 0.5, h * 0.62, h * 0.14, '#fff1b8');
      x.fillStyle = '#1d3557'; x.fillRect(0, h * 0.66, w, h); for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(255,220,150,.5)'; x.fillRect(w * 0.5 - w * 0.12 * r(), h * (0.68 + i * 0.022), w * 0.24 * r(), 2); } },
    mountains(x, w, h, r) { sky(x, w, h, ['#6fa8dc', '#cfe2f3']); ridge(x, w, h, h * 0.45, h * 0.18, '#7d8fa6', r); ridge(x, w, h, h * 0.6, h * 0.12, '#4a5d73', r); ridge(x, w, h, h * 0.78, h * 0.06, '#2f4f3a', r); },
    forest(x, w, h, r) { sky(x, w, h, ['#a8d5ba', '#e8f3e0']);
      for (let i = 0; i < 40; i++) { const tx = r() * w, th = h * (0.3 + r() * 0.4), ty = h * 0.95 - th; x.fillStyle = ['#1e5631', '#2d6a4f', '#40916c'][i % 3];
        x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx - th * 0.22, h * 0.95); x.lineTo(tx + th * 0.22, h * 0.95); x.closePath(); x.fill(); }
      x.fillStyle = '#3b2f1e'; x.fillRect(0, h * 0.94, w, h); },
    city(x, w, h, r) { sky(x, w, h, ['#0b132b', '#1c2541', '#3a506b']); disc(x, w * 0.82, h * 0.18, h * 0.06, '#f1f1d0');
      for (let bx = 0; bx < w;) { const bw = w * (0.05 + r() * 0.07), bh = h * (0.25 + r() * 0.5); x.fillStyle = '#111827'; x.fillRect(bx, h - bh, bw, bh);
        for (let wy = h - bh + 8; wy < h - 8; wy += 12) for (let wx = bx + 5; wx < bx + bw - 6; wx += 10) if (r() < 0.45) { x.fillStyle = '#ffd166'; x.fillRect(wx, wy, 4, 6); }
        bx += bw + 2; } },
    desert(x, w, h, r) { sky(x, w, h, ['#f9c74f', '#f9844a']); disc(x, w * 0.25, h * 0.3, h * 0.1, '#fff3c4'); ridge(x, w, h, h * 0.62, h * 0.08, '#e09f3e', r); ridge(x, w, h, h * 0.78, h * 0.05, '#c97c2c', r); },
    lake(x, w, h, r) { sky(x, w, h, ['#89c2d9', '#d8f0f7']); ridge(x, w, h, h * 0.45, h * 0.1, '#52796f', r);
      const gr = x.createLinearGradient(0, h * 0.58, 0, h); gr.addColorStop(0, '#468faf'); gr.addColorStop(1, '#01497c'); x.fillStyle = gr; x.fillRect(0, h * 0.58, w, h);
      for (let i = 0; i < 18; i++) { x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(r() * w, h * (0.62 + r() * 0.35), w * 0.08, 2); } },
    snow(x, w, h, r) { sky(x, w, h, ['#9db4c0', '#e0e7ec']); ridge(x, w, h, h * 0.5, h * 0.14, '#f8f9fa', r); ridge(x, w, h, h * 0.7, h * 0.08, '#dee2e6', r);
      for (let i = 0; i < 120; i++) disc(x, r() * w, r() * h, 1 + r() * 2, 'rgba(255,255,255,.85)'); },
    meadow(x, w, h, r) { sky(x, w, h, ['#4cc9f0', '#bde0fe']); disc(x, w * 0.8, h * 0.2, h * 0.08, '#fff3b0'); ridge(x, w, h, h * 0.6, h * 0.06, '#80b918', r);
      for (let i = 0; i < 160; i++) disc(x, r() * w, h * (0.68 + r() * 0.32), 2 + r() * 3, ['#ff006e', '#ffbe0b', '#fb5607', '#ffffff'][i % 4]); },
  };
  const NAMES = Object.keys(SCENES);

  function file(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    return new File([blob], name, { type: type || blob.type || 'application/octet-stream', lastModified: Date.now() });
  }
  async function photos(n = 6, o = {}) {
    const w = o.width || 1200, h = o.height || 800, type = o.type || 'image/jpeg', ext = type === 'image/png' ? 'png' : 'jpg';
    const out = [];
    for (let i = 0; i < Math.min(n, NAMES.length * 3); i++) {
      const name = NAMES[i % NAMES.length], c = doc.createElement('canvas');
      c.width = w; c.height = h;
      SCENES[name](c.getContext('2d'), w, h, rnd(1000 + i * 7919));
      const blob = await new Promise((res) => c.toBlob(res, type, 0.86));
      out.push(file(`Sample ${name}${i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''}.${ext}`, blob, type));
    }
    return out;
  }
  async function asset(path, name, type) {
    const res = await fetch(new URL(path, BASE).href);
    if (!res.ok) throw new Error(`The sample ${path} could not be loaded`);
    const blob = await res.blob();
    return file(name || path.split('/').pop(), blob, type || blob.type);
  }

  g.SlopSamples = { photos, file, asset, SCENES: NAMES, base: BASE };
})(typeof window !== 'undefined' ? window : globalThis);
