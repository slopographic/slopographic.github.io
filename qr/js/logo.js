/* QR SLOP: logos for the centre of a code. Every logo is drawn on a canvas and kept as a PNG data URL, so the preview, the
 * SVG, the PNG and the PDF all carry the same picture. A file is read in, a built-in mark is drawn from its SVG. Classic
 * script; exposes window.QRLogo. */
(function (g) {
  'use strict';
  if (g.QRLogo) return;
  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (node tests, other pages). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const MAX_PX = 256;

  /** Built-in marks. Each is an SVG of 48 units; the canvas draws it at MAX_PX. */
  function star(n, R, r) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / n, rad = i % 2 ? r : R;
      pts.push((24 + rad * Math.cos(a)).toFixed(2) + ',' + (24 + rad * Math.sin(a)).toFixed(2));
    }
    return 'M' + pts.join(' L') + ' Z';
  }
  const wrap = (inner) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="256" height="256">' + inner + '</svg>';
  const MARKS = [
    { id: 'dot', name: 'Dot', svg: () => wrap('<circle cx="24" cy="24" r="22" fill="#111111"/><circle cx="24" cy="24" r="8" fill="#d4ff3a"/>') }, // i18n-ignore: the page shows qr.mark.*
    { id: 'badge', name: 'Slop badge', svg: () => (g.SLOP_ICON_BADGE && g.SLOP_ICONS ? wrap(g.SLOP_ICON_BADGE(g.SLOP_ICONS.qr)) : wrap('<rect x="2" y="2" width="44" height="44" rx="12" fill="#d4ff3a"/>')) }, // i18n-ignore: the page shows qr.mark.*
    { id: 'heart', name: 'Heart', svg: () => wrap('<path d="M24 41 6 23C1 18 4 8 13 8c4 0 8 3 11 7 3-4 7-7 11-7 9 0 12 10 7 15z" fill="#e5484d"/>') }, // i18n-ignore: the page shows qr.mark.*
    { id: 'star', name: 'Star', svg: () => wrap('<path d="' + star(5, 22, 9) + '" fill="#f5b400"/>') }, // i18n-ignore: the page shows qr.mark.*
    { id: 'check', name: 'Check', svg: () => wrap('<circle cx="24" cy="24" r="22" fill="#0b1300"/><path d="M14 25l7 7 13-14" fill="none" stroke="#d4ff3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>') }, // i18n-ignore: the page shows qr.mark.*
  ];

  function blobUrl(svgText) { return URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })); }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(tr('qr.err.bad_picture', 'That picture could not be read.')));
      img.src = src;
    });
  }
  /** Draws an image on a canvas, at most MAX_PX on its longer side, and returns it as a PNG data URL. Transparency is kept. */
  function toPngUrl(img) {
    const w = img.naturalWidth || img.width || MAX_PX, h = img.naturalHeight || img.height || MAX_PX;
    const s = Math.min(1, MAX_PX / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/png');
  }

  /** A picture file (PNG, JPEG, WebP or SVG) as a logo. Rejects anything else with a message. */
  async function fromFile(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error(tr('qr.err.not_image', 'Choose an image file: PNG, JPEG, WebP or SVG.'));
    const url = URL.createObjectURL(file);
    try { return toPngUrl(await loadImage(url)); } finally { URL.revokeObjectURL(url); }
  }
  /** A built-in mark as a logo. */
  async function fromMark(id) {
    const m = MARKS.find((x) => x.id === id);
    if (!m) throw new Error('Unknown mark.');
    const url = blobUrl(m.svg());
    try { return toPngUrl(await loadImage(url)); } finally { URL.revokeObjectURL(url); }
  }
  /** The marks for the picker: id, name and the inline SVG of each. */
  const marks = () => MARKS.map((m) => ({ id: m.id, name: m.name, svg: m.svg() }));

  g.QRLogo = Object.freeze({ marks, fromFile, fromMark });
})(typeof window !== 'undefined' ? window : globalThis);
