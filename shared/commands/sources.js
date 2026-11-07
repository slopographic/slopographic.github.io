/* SlopCmdSources: where an app command with arguments gets a file from, the same way in every app. Classic script
 * (window.SlopCmdSources), loaded on demand by the apps' assistant commands (slides/js/ui/ai-files.js, docs/js/ui/ai-create.js…).
 *   driveFile(q)               a Slop Drive record ({ id, name, type, blob }) by id, exact name, or a part of the name
 *   driveAsFile(q)             the same file as a File (name and type kept), for an app's own open or add code
 *   siteFile(url)              { name, blob } of a file on this site (same origin only; nothing is fetched from other sites)
 *   picture({ file, url })     { name, blob, dataUrl, w, h }: a picture from Slop Drive (file) or from this site (url)
 *   put(blob, name, from)      saves a new file to Slop Drive and resolves its id */
(function () {
  'use strict';
  const hub = () => window.SlopHub || null;
  const PIC = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

  async function driveFile(q) {
    const H = hub();
    if (!H) throw new Error('Slop Drive is not available here');
    let rec = await Promise.resolve(H.get(String(q))).catch(() => null);
    if (!rec) {
      const s = String(q).toLowerCase(), list = await H.list();
      const hit = list.find((f) => f.name.toLowerCase() === s) || list.find((f) => f.name.toLowerCase().includes(s));
      rec = hit ? await H.get(hit.id) : null;
    }
    if (!rec || !rec.blob) throw new Error(`No Slop Drive file “${q}”. List the files to see the names.`);
    return rec;
  }
  const driveAsFile = (q) => driveFile(q).then((r) => new File([r.blob], r.name || 'file', { type: r.type || r.blob.type || '' }));
  async function siteFile(url) {
    const u = new URL(String(url), location.href);
    if (u.origin !== location.origin) throw new Error('Only files from this site or from Slop Drive can be used');
    const r = await fetch(u.href);
    if (!r.ok) throw new Error(`Could not load ${u.pathname} (${r.status})`);
    return { name: decodeURIComponent(u.pathname.split('/').pop() || 'file'), blob: await r.blob() };
  }
  const dataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  const size = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth || 400, h: im.naturalHeight || 300 });
    im.onerror = () => rej(new Error('That file is not a picture this browser can show'));
    im.src = src;
  });
  async function picture({ file, url } = {}) {
    if (!file && !url) throw new Error('Give file (a Slop Drive name or id) or url (a picture on this site)');
    const f = file ? await driveFile(file) : await siteFile(url);
    if (!/^image\//.test(f.blob.type || '') && !PIC.test(f.name)) throw new Error(`${f.name} is not a picture`);
    const src = await dataUrl(f.blob), sz = await size(src);
    return { name: f.name, blob: f.blob, dataUrl: src, w: sz.w, h: sz.h };
  }
  async function put(blob, name, from) {
    if (!hub() || !hub().put) throw new Error('Slop Drive is not available here');
    return hub().put(blob, { name, from });
  }
  window.SlopCmdSources = { driveFile, driveAsFile, siteFile, picture, put, dataUrl };
})();
