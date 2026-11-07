/* SlopLabel — io/files: .sloplabel projects, image assets, the old IndexedDB autosave (read once, to bring it into the tabs), and the compact
 * URL-hash encoding used by shareable Print-form links. */
'use strict';

function readAsDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
function loadImageURL(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = url; }); }
/** Add an image file (PNG/JPEG/SVG/GIF/WebP/AVIF) as an asset. SVG stays vector (never rasterised); large bitmaps are
 * downscaled. A format this browser cannot decode gets a clear message. → { id, aspect, w, h } */
async function addImageAsset(doc, blob) {
  if (/\.webm$/i.test(blob.name || '') || /^video\//.test(blob.type || '')) throw new Error('WebM is video. SlopLabel places pictures and does not play video; export a still image instead.');
  if (!/^image\//.test(blob.type) && !/\.(png|jpe?g|svg|gif|webp|avif|bmp)$/i.test(blob.name || '')) throw new Error('Choose a PNG, JPEG, SVG, GIF, WebP or AVIF image');
  let url = await readAsDataURL(blob);
  if (/\.svg$/i.test(blob.name || '') && !/^data:image\/svg/.test(url)) url = 'data:image/svg+xml;base64,' + url.split(',')[1];
  const img = await loadImageURL(url).catch(() => { throw new Error(`This browser cannot decode ${blob.name || 'that image'}. Try a PNG, JPEG or SVG.`); });
  let w = img.naturalWidth || 300, h = img.naturalHeight || 300;
  if (!/svg/.test(url.slice(0, 30)) && (Math.max(w, h) > 2400 || url.length > 3e6)) {
    const k = 2400 / Math.max(w, h), c = document.createElement('canvas');
    c.width = Math.round(w * Math.min(1, k)); c.height = Math.round(h * Math.min(1, k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    url = c.toDataURL(/jpe?g/.test(blob.type) ? 'image/jpeg' : 'image/png', 0.92); w = c.width; h = c.height;
  }
  const existing = Object.keys(doc.assets).find((k) => doc.assets[k] === url);
  const id = existing || uid('a');
  doc.assets[id] = url;
  return { id, aspect: w / h, w, h };
}
/** Drop assets no object references (keeps saved files small). */
function pruneAssets(doc) { const used = new Set(doc.objects.filter((o) => o.asset).map((o) => o.asset)); for (const k of Object.keys(doc.assets)) if (!used.has(k)) delete doc.assets[k]; return doc; }
function projectBlob(doc) { const d = deepClone(doc); pruneAssets(d); return new Blob([serializeProject(d)], { type: 'application/json' }); }
function safeName(s, ext) { return (String(s || 'label').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'label') + ext; }

/* ---------------- the old autosave (IndexedDB), read only: the tabs (ui/tabs.js) save now ---------------- */
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('no IndexedDB'));
    const r = indexedDB.open('sloplabel', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return idbP;
}
async function kvGet(key) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction('kv', 'readonly'), r = t.objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function loadAutosave() { try { const r = await kvGet('autosave'); return r && r.json ? { doc: parseProject(r.json), time: r.time } : null; } catch (e) { return null; } }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

/* ---------------- hash encoding for form links ---------------- */
function b64urlEncode(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlDecode(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function streamBytes(u8, stream) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(stream)).arrayBuffer()); }
/** doc → "j…" (plain) or "z…" (deflate-raw) base64url string. */
async function encodeDocHash(doc) {
  const d = deepClone(doc); pruneAssets(d);
  const json = new TextEncoder().encode(JSON.stringify(d));
  if (json.length < 1200 || typeof CompressionStream === 'undefined') return 'j' + b64urlEncode(json);
  return 'z' + b64urlEncode(await streamBytes(json, new CompressionStream('deflate-raw')));
}
async function decodeDocHash(s) {
  const kind = s[0], bytes = b64urlDecode(s.slice(1));
  const json = kind === 'z' ? await streamBytes(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return normalizeDoc(JSON.parse(new TextDecoder().decode(json)));
}
