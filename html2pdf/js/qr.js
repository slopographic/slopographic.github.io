/* Slop HTML to PDF: the header's QR code, drawn by the vendored bwip-js (no network) as inline SVG.
 * Returns '' when the code cannot be made, so the header still prints without it. Classic script.
 * Exposes window.H2P.qr. */
(function () {
  'use strict';
  const cache = new Map();
  const MAX = 40;

  /** Inline SVG for the text: the size comes from the header's CSS, so the width and height are dropped. */
  function normalise(markup) {
    const s = String(markup || '');
    const open = /<svg\b[^>]*>/i.exec(s);
    if (!open) return '';
    const tag = open[0].replace(/\s(width|height)="[^"]*"/gi, '').replace(/^<svg/i, '<svg preserveAspectRatio="xMidYMid meet" role="img" aria-label="QR code"');
    return s.replace(open[0], tag);
  }

  function svg(text) {
    const t = String(text || '').trim();
    if (!t) return '';
    if (cache.has(t)) return cache.get(t);
    let out = '';
    try {
      const b = window.bwipjs;
      if (b && typeof b.toSVG === 'function') out = normalise(b.toSVG({ bcid: 'qrcode', text: t, eclevel: 'M' }));
    } catch (e) { out = ''; }
    if (cache.size >= MAX) cache.delete(cache.keys().next().value);
    cache.set(t, out);
    return out;
  }

  window.H2P = Object.assign(window.H2P || {}, { qr: { svg } });
})();
