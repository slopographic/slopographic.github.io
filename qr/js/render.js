/* QR SLOP: the SVG for one code. qrSvg(matrix, opts) is pure: opts { size, quiet, fg, fg2, gradient, shape, bg, transparent, logo }.
 * shape 'square' draws runs of modules; 'round' draws rounded modules (the finder patterns stay square). A gradient runs from
 * fg to fg2 across the code. The logo sits in the centre on a white plate. Its width is logo.frac of the code's width (the
 * quiet zone not counted), capped at MAX_LOGO. Every value that reaches the markup is checked here. Classic script; exposes window.QRRender. */
(function (g) {
  'use strict';
  if (g.QRRender) return;
  const M = g.QRMatrix;
  const QUIET = 4, MAX_LOGO = 0.22, ROUND_R = 0.3;
  const HEX = /^#[0-9a-f]{6}$/i;
  const DATA_IMG = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

  /** Pixel size for the output: whole pixels from 64 to 4096. */
  const clampSize = (v) => Math.max(64, Math.min(4096, Math.round(+v || 512)));
  /** Quiet zone in modules: 0 to 8. */
  const clampQuiet = (v) => (v === '' || v == null || !Number.isFinite(+v) ? QUIET : Math.max(0, Math.min(8, Math.round(+v))));
  /** Logo width as a share of the code: 10 to 22 percent. */
  const clampLogo = (v) => Math.max(0.1, Math.min(MAX_LOGO, Number.isFinite(+v) && +v > 0 ? +v : 0.2));
  const colour = (v, dflt) => (HEX.test(String(v || '')) ? String(v).toLowerCase() : dflt);

  /** The logo group: a white plate with the picture on it, in module units. */
  function logoMarkup(side, cols, logo) {
    const L = clampLogo(logo.frac) * cols, x = (side - L) / 2, P = L + 1.2, p = (side - P) / 2;
    return '<rect x="' + p + '" y="' + p + '" width="' + P + '" height="' + P + '" rx="' + (P * 0.14) + '" fill="#ffffff"/>' +
      '<image x="' + x + '" y="' + x + '" width="' + L + '" height="' + L + '" href="' + logo.href + '" preserveAspectRatio="xMidYMid meet"/>';
  }

  /** SVG markup for a matrix. Pure: no DOM, so the node tests can call it. */
  function qrSvg(m, o = {}) {
    const q = clampQuiet(o.quiet), side = m.cols + 2 * q, size = clampSize(o.size);
    const fg = colour(o.fg, '#000000'), fg2 = colour(o.fg2, fg);
    const grad = !!o.gradient;
    const defs = grad ? '<defs><linearGradient id="qr-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + fg + '"/><stop offset="1" stop-color="' + fg2 + '"/></linearGradient></defs>' : '';
    const bg = o.transparent ? '' : '<rect width="' + side + '" height="' + side + '" fill="' + colour(o.bg, '#ffffff') + '"/>';
    const round = o.shape === 'round';
    const d = round ? M.roundPath(m, q, ROUND_R) : M.squarePath(m, q);
    const path = '<path fill="' + (grad ? 'url(#qr-grad)' : fg) + '" d="' + d + '"' + (round ? '' : ' shape-rendering="crispEdges"') + '/>';
    const logo = o.logo && DATA_IMG.test(String(o.logo.href || '')) ? logoMarkup(side, m.cols, o.logo) : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + side + ' ' + side +
      '" role="img" aria-label="QR code">' + defs + bg + path + logo + '</svg>';
  }

  g.QRRender = Object.freeze({ QUIET, MAX_LOGO, clampSize, clampQuiet, clampLogo, colour, qrSvg });
})(typeof window !== 'undefined' ? window : globalThis);
