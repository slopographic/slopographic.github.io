/* Slop Scan: files in and out. In, one way only (shared/intake, spec 'scan'): photos from the camera (SlopIntake.pick with
 * capture), the picker, a drop, a paste, Slop Drive or another app; iPhone HEIC photos are read by the browser where it
 * can (Safari) and otherwise by the shared decoder (shared/heic/engine.js, asked for before its first download). Each photo
 * becomes a page with its corners found (js/render.js); a retake replaces the photo of one page (ctx.data.replace).
 * Out: the PDF (js/pdf.js) as a download, to Slop Drive, to Slop PDF or Open in… (SlopOuttake, the one builder), and the
 * pages as JPG or PNG files (one, or a ZIP). Classic script. */
(function (g) {
  'use strict';
  const S = g.SlopScan, list = () => S.pages, R = () => S.render;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const HEIC = /\.(heic|heif)$/i, BASE = new URL('../', document.currentScript.src).href;
  const isHeic = (f) => /image\/hei[cf]/.test(f.type || '') || HEIC.test(f.name || '');

  /** The upright picture of a photo file (the camera's rotation applied), as a canvas or bitmap. */
  async function decode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* not a format this browser reads */ }
    if (isHeic(file)) {
      await g.SlopLoad.script('shared/heic/engine.js');
      const r = await g.SlopHeicEngine.decode(new Uint8Array(await file.arrayBuffer()), { ask: true });
      const c = document.createElement('canvas');
      c.width = r.width; c.height = r.height;
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
      return c;
    }
    const url = URL.createObjectURL(file);
    try { const im = new Image(); im.src = url; await im.decode(); return im; } catch (e) { throw new Error(t('scan.io.unreadable', { name: file.name })); } finally { URL.revokeObjectURL(url); }
  }
  /** A photo file → the page's photo, its corners and its first turn. */
  async function read(file) {
    const src = await decode(file), photo = R().photoOf(src);
    if (src.close) src.close();
    const d = R().detect(photo);
    return { photo, info: { name: file.name || 'photo.jpg', quad: d.quad, found: d.found } };
  }
  async function take(file, ctx) {
    const { photo, info } = await read(file), L = list(), id = ctx && ctx.data && ctx.data.replace;
    const p = id && L.get(id) ? L.replace(id, photo, info) : L.add(photo, info);
    if (L.doc.autoTurn !== false && info.found) { const turn = R().autoTurn(p); if (turn) L.set(p.id, { turn, auto: true }); }
    return p.name;
  }
  function register() {
    g.SlopIntake.register({
      id: 'scan',
      accept: { types: ['image/*'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.bmp', '.gif'], noun: 'scan.io.noun', maxBytes: 80 * 1024 * 1024 },
      driveAccept: ['image/*'],
      limit: 100,
      process: take,
      after: () => { if (S.app) S.app.added(); },
    });
  }
  /** The camera (a phone's back camera; a computer shows its picker). replace: the page whose photo a retake replaces. */
  const camera = (replace) => g.SlopIntake.pick({ to: 'scan', accept: 'image/*', capture: 'environment', multiple: !replace, data: replace ? { replace } : undefined });
  const pick = () => g.SlopIntake.pick({ to: 'scan' });

  /* ---------- out ---------- */
  const pdfName = () => S.page.fileName(list().doc.name);
  let made = null;   // the last PDF made, while nothing changed: { blob, name, key }
  const key = () => JSON.stringify([list().doc, list().all().map((p) => p.id + ':' + p.v)]);
  /** The PDF of every page in the document's settings (made again only after a change). */
  async function pdf(onProgress) {
    if (!list().size()) throw new Error(t('scan.io.no_pages'));
    const k = key();
    if (made && made.key === k) return made;
    const mod = await import(new URL('js/pdf.js', BASE).href);
    const blob = await mod.build(list().all(), list().doc, { onProgress, render: (p) => R().render(p, R().FULL), ocr: list().doc.ocr ? S.ocr : null });
    made = { blob, name: pdfName(), key: k };
    return made;
  }
  async function downloadPdf(onProgress) { const r = await pdf(onProgress); g.SlopUI.download(r.blob, r.name); return r; }
  async function saveToDrive(onProgress) {
    const r = await pdf(onProgress), id = await g.SlopHub.put(r.blob, { name: r.name, from: 'scan' });
    g.SlopUI.toast(t('scan.io.saved', { name: r.name }));
    return { id, name: r.name };
  }
  /** The PDF to Slop PDF: saved to Slop Drive and the editor opened on it (SlopOuttake's plain handover). */
  async function toPdfEditor(onProgress) { const r = await pdf(onProgress); return g.SlopOuttake.send('pdf', { get: () => r.blob, name: r.name, type: 'application/pdf', from: 'scan' }); }
  function openInItems() {
    if (!list().size() || !g.SlopOuttake) return [];
    return g.SlopOuttake.items({ get: () => pdf().then((r) => r.blob), name: pdfName, type: 'application/pdf', from: 'scan', folder: true });
  }
  const encode = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error(t('scan.io.not_written')))), type, q));
  /** One page as a JPG or PNG blob, full size. */
  function pageImage(p, type) { return encode(R().render(p, R().FULL), type, list().doc.quality); }
  /** The pages as pictures: one file, or a ZIP of all. type: 'image/jpeg' | 'image/png'. */
  async function downloadImages(type, only) {
    const pages = only ? [only] : list().all(), ext = type === 'image/png' ? 'png' : 'jpg', base = pdfName().replace(/\.pdf$/, '');
    if (!pages.length) throw new Error(t('scan.io.no_pages'));
    const files = [];
    for (let i = 0; i < pages.length; i++) files.push({ name: pages.length > 1 ? `${base} ${String(i + 1).padStart(2, '0')}.${ext}` : `${base}.${ext}`, data: await pageImage(pages[i], type) });
    if (files.length === 1) { g.SlopUI.download(files[0].data, files[0].name); return files[0].name; }
    const zip = await g.SlopZip.zip(files.map((f) => ({ name: f.name, data: f.data, time: Date.now() })));
    g.SlopUI.download(zip, base + '.zip');
    return base + '.zip';
  }
  /** The file size to expect: each page's preview made as it would be stored, scaled to the full size's pixels. */
  async function estimate() {
    const q = list().doc.quality, out = [];
    for (const p of list().all()) {
      const c = R().render(p, R().PREVIEW), full = g.SlopScan.geom.outSize(g.SlopScan.geom.denorm(p.quad, p.photo.w, p.photo.h), R().FULL);
      const b = await encode(c, p.style === 'bw' ? 'image/png' : 'image/jpeg', q);
      out.push({ px: full.w * full.h, sampleBytes: b.size, samplePx: c.width * c.height });
    }
    return S.page.estimate(out, q);
  }
  S.io = { register, decode, read, take, camera, pick, pdf, downloadPdf, saveToDrive, toPdfEditor, openInItems, downloadImages, pageImage, estimate, isHeic, forget: () => { made = null; } };
})(window);
