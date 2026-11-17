/* Slop Music: small display helpers. Exposes window.SlopMusic.fmt: time(seconds), tile(track, size) (the cover
 * image, or a generated tile when the file has no cover), hue(text). */
(function () {
  'use strict';
  const M = (window.SlopMusic = window.SlopMusic || {});
  const el = (...a) => window.SlopUI.el(...a);
  const pad = (n) => String(n).padStart(2, '0');
  function time(s) {
    if (s == null || !isFinite(s) || s < 0) return '—';
    const t = Math.floor(s), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  }
  /** A stable hue (0 to 359) from text, for the generated covers. */
  function hue(text) {
    let h = 0;
    for (const c of String(text || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
  }
  /** The cover of a track: its ID3 picture, else a tile in a colour from the title. */
  function tile(t, cls = 'mu-cover-img') {
    if (t && t.coverUrl) return el('img', { class: cls, src: t.coverUrl, alt: '', loading: 'lazy' });
    const text = t ? M.lib.display(t) : '';
    const initials = text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '♪';
    return el('span', { class: cls + ' mu-tile', 'aria-hidden': 'true', style: `--h:${hue(text)}` }, initials);
  }
  M.fmt = { time, tile, hue };
})();
