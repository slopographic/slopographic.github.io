/* QR SLOP: the module grid. encode() runs the vendored bwip-js encoder (window.bwipjs); the path functions turn the dark
 * modules into SVG path data, so one path draws the whole code. Pure apart from encode(). Classic script; exposes window.QRMatrix. */
(function (g) {
  'use strict';
  if (g.QRMatrix) return;
  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (node tests, other pages). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const LEVELS = ['L', 'M', 'Q', 'H'];

  /** Encodes text. Returns { cols, rows, pixs }, pixs row-major with a truthy value for each dark module. Throws on failure. */
  function encode(text, level) {
    if (!g.bwipjs) throw new Error(tr('qr.err.encoder', 'The QR encoder did not load.'));
    const eclevel = LEVELS.includes(level) ? level : 'M';
    let r;
    try { r = g.bwipjs.raw({ bcid: 'qrcode', text: String(text), eclevel })[0]; } catch (e) {
      throw new Error(tr('qr.err.no_fit', 'This text does not fit in one QR code at level {ec}. Use a lower error correction level or shorter text.', { ec: eclevel }));
    }
    return { cols: r.pixx, rows: r.pixy, pixs: r.pixs };
  }

  /** True for a module in a finder pattern (the three large corner squares, with their separators). These stay square. */
  function inFinder(c, r, n) {
    return (c < 8 && r < 8) || (c >= n - 8 && r < 8) || (c < 8 && r >= n - 8);
  }

  /** Path data for the dark modules as square runs: "M x y h w v1 h-w z" per run. quiet is the quiet zone in modules. */
  function squarePath(m, quiet) {
    let d = '';
    for (let r = 0; r < m.rows; r++) {
      let c = 0;
      while (c < m.cols) {
        if (!m.pixs[r * m.cols + c]) { c++; continue; }
        let e = c;
        while (e + 1 < m.cols && m.pixs[r * m.cols + e + 1]) e++;
        const w = e - c + 1;
        d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h' + w + 'v1h-' + w + 'z';
        c = e + 1;
      }
    }
    return d;
  }

  /** Path data with each dark module a rounded square of corner radius r (0 to 0.5 modules). Finder modules stay square. */
  function roundPath(m, quiet, r) {
    const k = 1 - 2 * r, a = ' ' + r + ' ' + r + ' 0 0 1 ';
    let d = '';
    for (let row = 0; row < m.rows; row++) {
      for (let c = 0; c < m.cols; c++) {
        if (!m.pixs[row * m.cols + c]) continue;
        const x = c + quiet, y = row + quiet;
        if (inFinder(c, row, m.cols)) { d += 'M' + x + ' ' + y + 'h1v1h-1z'; continue; }
        d += 'M' + (x + r) + ' ' + y + 'h' + k + 'a' + a + r + ' ' + r +
          'v' + k + 'a' + a + (-r) + ' ' + r +
          'h' + (-k) + 'a' + a + (-r) + ' ' + (-r) +
          'v' + (-k) + 'a' + a + r + ' ' + (-r) + 'z';
      }
    }
    return d;
  }

  g.QRMatrix = Object.freeze({ LEVELS, encode, inFinder, squarePath, roundPath });
})(typeof window !== 'undefined' ? window : globalThis);
