/* Slop Scan: the sample, a phone photo of a printed letter on a wooden desk, painted in the page (the same picture every
 * time): the sheet tilted and seen in perspective, a shadow across it, a heading, lines of text and a signature. The drop
 * zone's "Try it with a sample" and the tests use it. Classic script; window.SlopScan.sample(n = 1) → Promise<File[]>;
 * SlopScan.sample.CORNERS: the sheet's corners in the photo (0..1), so a test can check what was found. */
(function (g) {
  'use strict';
  const W = 1200, H = 1600;
  const CORNERS = [{ x: 0.17, y: 0.13 }, { x: 0.84, y: 0.1 }, { x: 0.9, y: 0.86 }, { x: 0.11, y: 0.9 }];
  const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /** The page drawn flat (A4 shape), then mapped onto the photo through the corners, strip by strip (triangles). */
  function sheet(seed) {
    const c = document.createElement('canvas'), w = 840, h = 1188, x = c.getContext('2d'), r = rnd(seed);
    c.width = w; c.height = h;
    x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1d2a44'; x.font = 'bold 44px Georgia, serif'; x.fillText('Quarterly report', 80, 150);
    x.fillStyle = '#c23b22'; x.fillRect(80, 175, 220, 6);
    x.fillStyle = '#2b2b2b';
    for (let y = 250, line = 0; y < h - 220; y += 38, line++) {
      if (line % 6 === 5) continue;   // a paragraph break
      let px = 80;
      const end = line % 6 === 4 ? 80 + (w - 160) * (0.35 + r() * 0.4) : w - 80;
      while (px < end - 30) { const ww = 30 + r() * 90; x.fillRect(px, y - 14, Math.min(ww, end - px), 16); px += ww + 14; }
    }
    x.strokeStyle = '#1a3fa0'; x.lineWidth = 4; x.beginPath(); x.moveTo(520, h - 140);
    for (let i = 0; i < 9; i++) x.bezierCurveTo(540 + i * 22, h - 190, 560 + i * 22, h - 90, 575 + i * 22, h - 140);
    x.stroke();
    return c;
  }
  function desk(x) {
    const gr = x.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#6b4a2f'); gr.addColorStop(1, '#4a3220');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    const r = rnd(42);
    x.globalAlpha = 0.12;
    for (let i = 0; i < 160; i++) { x.strokeStyle = r() < 0.5 ? '#2e1d10' : '#8a6542'; x.lineWidth = 1 + r() * 3; x.beginPath(); const y = r() * H; x.moveTo(0, y); x.bezierCurveTo(W / 3, y + (r() - 0.5) * 60, (2 * W) / 3, y + (r() - 0.5) * 60, W, y + (r() - 0.5) * 40); x.stroke(); }
    x.globalAlpha = 1;
  }
  /** Draws the triangle (s0, s1, s2) of the source onto (d0, d1, d2) with an affine map (the usual canvas texture trick). */
  function tri(x, img, s, d) {
    const G = g.SlopScan.geom, A = s.map((p) => [p.x, p.y, 1]);
    const X = G.solve(A, d.map((p) => p.x)), Y = G.solve(A, d.map((p) => p.y));
    if (!X || !Y) return;
    x.save(); x.beginPath(); x.moveTo(d[0].x, d[0].y); x.lineTo(d[1].x, d[1].y); x.lineTo(d[2].x, d[2].y); x.closePath(); x.clip();
    x.transform(X[0], Y[0], X[1], Y[1], X[2], Y[2]); x.drawImage(img, 0, 0); x.restore();
  }
  function photo(seed) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = W; c.height = H;
    desk(x);
    const G = g.SlopScan.geom, page = sheet(seed), pw = page.width, ph = page.height;
    const dst = CORNERS.map((p) => ({ x: p.x * W, y: p.y * H }));
    const Hm = G.homography([{ x: 0, y: 0 }, { x: pw, y: 0 }, { x: pw, y: ph }, { x: 0, y: ph }], dst);
    x.save(); x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 30; x.shadowOffsetX = 12; x.shadowOffsetY = 16;
    x.fillStyle = '#ddd'; x.beginPath(); dst.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y))); x.closePath(); x.fill(); x.restore();
    const N = 24;   // a grid of small cells, each two triangles: close enough to the true perspective
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const s = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([u, v]) => ({ x: (u * pw) / N, y: (v * ph) / N }));
      const d = s.map((p) => G.apply(Hm, p.x, p.y)), grow = (q, k) => q.map((p) => ({ x: p.x + (p.x - (q[0].x + q[2].x) / 2) * k, y: p.y + (p.y - (q[0].y + q[2].y) / 2) * k }));
      const dg = grow(d, 0.02);
      tri(x, page, [s[0], s[1], s[2]], [dg[0], dg[1], dg[2]]); tri(x, page, [s[0], s[2], s[3]], [dg[0], dg[2], dg[3]]);
    }
    // a soft shadow from the phone across the left of the sheet
    const sh = x.createLinearGradient(0, 0, W * 0.7, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.38)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh; x.fillRect(0, 0, W, H);
    return new Promise((res) => c.toBlob((b) => res(new File([b], `Sample letter ${seed}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.9));
  }
  function sample(n = 1) { return Promise.all(Array.from({ length: n }, (_, i) => photo(i + 1))); }
  sample.CORNERS = CORNERS;
  sample.size = { w: W, h: H };
  (g.SlopScan = g.SlopScan || {}).sample = sample;
})(window);
