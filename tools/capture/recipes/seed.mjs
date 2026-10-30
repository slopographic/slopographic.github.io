// Fills Slop Drive (IndexedDB, via window.SlopHub) with a believable set of files for the
// Drive screenshot: folders, Sloppo artwork, a PDF, SVGs, text and audio-ish files.
// Runs inside the page (page.evaluate), so it must be self-contained.
export async function seedDrive() {
  const H = window.SlopHub;
  if ((await H.list()).length > 6) return;
  const { drawSloppo, HATS } = await import(new URL('/shared/sloppo/index.js', location.href).href);
  const hats = Object.keys(HATS);
  const bodies = ['lime', 'pink', 'sky', 'grape', 'tangerine', 'mint', 'gold', 'void', 'lava', 'frost'];
  const eyes = ['happy', 'heart', 'star', 'wink', 'sleepy', 'spiral'];
  const bgs = ['#1d2410', '#2a1020', '#0f2233', '#1c1236', '#2e1a06', '#0e2a20', '#2c2508', '#111118', '#2a0f06', '#122833'];
  const png = (c) => new Promise((r) => c.toBlob(r, 'image/png'));
  async function art(i, w = 640, h = 480) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(w * 0.5, h * 0.4, 10, w * 0.5, h * 0.5, w * 0.7);
    gr.addColorStop(0, bgs[i % bgs.length]); gr.addColorStop(1, '#050505');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    try { drawSloppo(g, w, h, { body: bodies[i % bodies.length], eyes: eyes[i % eyes.length], mouth: 'open', hat: hats[(i * 3) % hats.length], seed: i + 1, scale: 2.4, baseY: 0.86 }, i * 0.7); } catch (e) { /* plain bg */ }
    return png(c);
  }
  const f = {};
  for (const n of ['Artwork', 'Client work', 'Invoices', 'Labels', 'Video'] ) f[n] = await H.createFolder(n, null);
  f.Stickers = await H.createFolder('Stickers', f.Artwork);
  const names = ['sloppo-hero.png', 'poster-final-v3.png', 'sticker-pack-01.png', 'sticker-pack-02.png', 'goo-gardens.png', 'avatar-round.png', 'banner-wide.png', 'card-legendary.png', 'thumb-lava.png', 'frost-mood.png'];
  for (let i = 0; i < names.length; i++) {
    const where = i < 4 ? null : i < 7 ? f.Artwork : f.Stickers;
    const id = await H.put(await art(i), { name: names[i], from: i % 2 ? 'photoslop' : 'vector', folderId: where });
    if (i === 0 || i === 4) await H.update(id, { starred: true });
  }
  const svg = (col) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#111"/><path d="M100 20C100 20 40 90 40 130a60 60 0 0 0 120 0C160 90 100 20 100 20z" fill="${col}"/><circle cx="80" cy="130" r="9" fill="#111"/><circle cx="120" cy="130" r="9" fill="#111"/></svg>`], { type: 'image/svg+xml' });
  await H.put(svg('#d4ff3a'), { name: 'logo-goo.svg', from: 'vector' });
  await H.put(svg('#ff8fb8'), { name: 'logo-pink.svg', from: 'vector', folderId: f['Client work'] });
  const pdf = (title) => {
    const body = `BT /F1 28 Tf 50 760 Td (${title}) Tj ET`;
    const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
    let out = '%PDF-1.4\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
    return new Blob([out], { type: 'application/pdf' });
  };
  await H.put(pdf('Invoice 2026-114'), { name: 'invoice-2026-114.pdf', from: 'pdf', folderId: f.Invoices });
  await H.put(pdf('Invoice 2026-115'), { name: 'invoice-2026-115.pdf', from: 'pdf', folderId: f.Invoices });
  const text = (s, name, type, folderId = null) => H.put(new Blob([s], { type }), { name, from: 'drive', folderId });
  await H.put(pdf('Brochure A5'), { name: 'brochure-a5.pdf', from: 'pdf' });
  await text('sku,name,price\nSLP-250,Lime Goo,4.99\nSLP-500,Lime Goo XL,7.99\n', 'products.csv', 'text/csv', f.Labels);
  await text('^XA^FO50,50^BCN,100,Y,N,N^FD4006381333931^FS^XZ', 'shelf-label.zpl', 'text/plain', f.Labels);
  await text('# Notes\nShip the goo by Friday.\n', 'notes.md', 'text/markdown');
  await text(new Uint8Array(180000), 'voiceover.wav', 'audio/wav', f.Video);
  await text(new Uint8Array(900000), 'teaser-cut.mp4', 'video/mp4', f.Video);
}
