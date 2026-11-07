/* Slop Drive — core/thumb-card: the typed card, drawn on a canvas as a thumbnail. It shows the file's extension in its
 * colour, its size and kind, and optionally lines of text (a text file's first lines, a CSV header, a document's first
 * paragraph) or a waveform. Every file without a picture of its own gets one. DR.drawCard(r, spec) → Promise<Blob>. */
'use strict';
(function (DR) {
  const W = 320, H = 240, BG = '#1d1e22', FG = '#e8e7ea', FAINT = '#9a9aa3';
  const MONO = '13px ui-monospace, Menlo, Consolas, monospace', SANS = '13px system-ui, sans-serif';
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  DR.canvasOf = canvas;
  /** A canvas as a WebP blob (alpha kept). Rejects only if the browser cannot encode it. */
  DR.canvasBlob = (c, type = 'image/webp', quality = 0.84) => new Promise((res, rej) => {
    c.toBlob((b) => (b ? res(b) : rej(new Error('The thumbnail could not be encoded'))), type, quality);
  });
  /** Cuts a string with an ellipsis so it fits max px wide in the current font. */
  function fit(g, s, max) {
    if (g.measureText(s).width <= max) return s;
    let t = s;
    while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }
  function bars(g, peaks, color, x, y, w, h) {
    const n = peaks.length, bw = w / n;
    g.fillStyle = color;
    peaks.forEach((v, i) => {
      const bh = Math.max(2, v * h);
      g.fillRect(x + i * bw, y + (h - bh) / 2, Math.max(1, bw * 0.6), bh);
    });
  }
  /** spec: { big (the large label), sub (the line under it), color, lines, mono, wave (peaks 0..1) }. */
  DR.drawCard = function (r, spec = {}) {
    const c = canvas(W, H), g = c.getContext('2d'), color = spec.color || DR.kindColor(r);
    const label = spec.big || (DR.ext(r.name) || (r.type || '').split('/').pop() || 'FILE').toUpperCase().slice(0, 5);
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    g.fillStyle = color; g.fillRect(0, 0, W, 6);
    g.font = `600 ${label.length > 4 ? 34 : 44}px system-ui, sans-serif`;
    g.fillText(label, 18, 62);
    g.font = SANS; g.fillStyle = FAINT;
    g.fillText(fit(g, [DR.fmtSize(r.size), spec.sub || DR.kindLabel(r)].join(' · '), W - 36), 18, 84);
    if (spec.wave && spec.wave.length) bars(g, spec.wave, color, 18, 98, W - 36, 124);
    else if (spec.lines && spec.lines.length) {
      g.fillStyle = FG; g.font = spec.mono ? MONO : SANS;
      let y = 110;
      for (const line of spec.lines.slice(0, 7)) {
        if (y > H - 10) break;
        g.fillText(fit(g, String(line), W - 36), 18, y);
        y += 19;
      }
    }
    return DR.canvasBlob(c);
  };
})(window.DR);
