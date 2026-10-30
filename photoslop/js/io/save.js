/* PhotoSlop files: autosave, offline build and the sample document */
'use strict';

/* ---------- autosave (IndexedDB, this browser only) ---------- */
function idb() {
  return new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
    const r = indexedDB.open('slopshop', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('kv', mode), st = tx.objectStore('kv'), r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); }
let autosaveTimer = 0;
const pngCache = new WeakMap(); // canvases are immutable once in a document, so their PNGs can be reused
async function pngOf(c) { let p = pngCache.get(c); if (!p) { p = canvasToBlob(c); pngCache.set(c, p); } return p; }
// Encoding PNGs reads pixels back from the GPU, so wait for a pause and for idle time.
function scheduleAutosave() { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(() => autosave(), { timeout: 4000 }) : autosave()), 2500); }
function flushAutosave() { if (autosaveTimer) { clearTimeout(autosaveTimer); autosaveTimer = 0; autosave(); } }
function saveTabsIndex() { if (!CUR) return; idbDo('readwrite', (st) => st.put({ ids: DOCS.map((d) => d.id), active: CUR.id }, 'tabs')).catch(() => {}); }
async function autosave() {
  autosaveTimer = 0;
  if (!CUR) return;
  if (live || V.op) { scheduleAutosave(); return; }
  // Capture synchronously: the user may switch tabs while PNGs encode.
  const snap = { id: CUR.id, w: D.w, h: D.h, name: D.name, active: layerIndex(D.activeId), layers: D.layers.slice(), guides: D.guides || [], wm: D.wm };
  try {
    const layers = [];
    for (const L of snap.layers) {
      layers.push({ name: L.name, x: L.x, y: L.y, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, meta: layerMeta(L), text: L.text,
        png: await pngOf(L.canvas), mask: L.mask && { png: await pngOf(L.mask.canvas), x: L.mask.x, y: L.mask.y, def: L.mask.def, enabled: L.mask.enabled } });
    }
    if (!DOCS.some((d) => d.id === snap.id)) return; // closed meanwhile
    await idbDo('readwrite', (st) => st.put({ v: 2, w: snap.w, h: snap.h, name: snap.name, active: snap.active, layers, guides: snap.guides, wm: snap.wm && { on: snap.wm.on, spec: snap.wm.spec }, time: Date.now() }, 'doc:' + snap.id));
    saveTabsIndex();
    const s = $('#sbSaved'); if (s) { s.textContent = tr('photoslop.save.saved_device'); s.title = tr('photoslop.save.saved_device_tip'); s.dataset.i18n = 'photoslop.save.saved_device'; s.dataset.i18nAttr = 'title:photoslop.save.saved_device_tip'; }
  } catch (e) { const s = $('#sbSaved'); if (s) { s.textContent = tr('photoslop.save.recovery_off'); s.dataset.i18n = 'photoslop.save.recovery_off'; } try { window.SlopStorage && SlopStorage.handle(e, { once: 'photoslop-recovery' }); } catch (x) { /* no dialog on this page */ }; }
}
async function blobToCanvasExact(b) { const u = URL.createObjectURL(b); try { const i = await loadImage(u); const c = mkCanvas(i.width, i.height); cx(c).drawImage(i, 0, 0); return c; } finally { URL.revokeObjectURL(u); } }
async function docFromSaved(d) {
  const layers = [];
  for (const l of d.layers) {
    const canvas = await blobToCanvasExact(l.png);
    let mask = null;
    if (l.mask) mask = { canvas: await blobToCanvasExact(l.mask.png), x: l.mask.x, y: l.mask.y, def: l.mask.def, enabled: l.mask.enabled };
    layers.push(Object.assign({ name: l.name, canvas, x: l.x, y: l.y, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, text: l.text, mask }, l.meta));
  }
  return layers;
}
async function loadAutosave() {
  try {
    const idx = await idbDo('readonly', (st) => st.get('tabs'));
    const saved = [];
    if (idx && idx.ids) for (const id of idx.ids) { const d = await idbDo('readonly', (st) => st.get('doc:' + id)); if (d && d.layers && d.layers.length) saved.push([id, d]); }
    else { const d = await idbDo('readonly', (st) => st.get('doc')); if (d && d.layers && d.layers.length) saved.push([1, d]); }
    if (!saved.length) return false;
    let activeRec = null;
    for (const [id, d] of saved) {
      const layers = await docFromSaved(d);
      const rec = openInNewTab(() => { openDocument(d.w, d.h, layers, d.name); if (d.active >= 0 && D.layers[d.active]) D.activeId = D.layers[d.active].id; if (d.guides) adoptGuides(d.guides); if (d.wm) adoptWatermark(d.wm); }, id);
      if (idx && idx.active === id) activeRec = rec;
    }
    if (activeRec) switchToDoc(activeRec);
    toast(saved.length > 1 ? tr('photoslop.save.recovered_n', { n: saved.length }) : tr('photoslop.save.recovered_one'), 3200);
    return true;
  } catch (e) { return false; }
}
async function clearAutosave() {
  try { await idbDo('readwrite', (st) => st.clear()); toast(tr('photoslop.save.cleared')); } catch (e) { toast(tr('photoslop.save.nothing_to_clear')); }
}

/* ---------- offline single-file build ---------- */
async function appSources() {
  const emb = document.getElementById('app-src');
  if (emb) return JSON.parse(emb.textContent);
  const get = async (u) => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.text(); };
  const files = { 'index.html': await get('index.html') };
  const refs = [...files['index.html'].matchAll(/<link rel="stylesheet" href="([^"]+)">|<script src="([^"]+)"><\/script>/g)].map((m) => m[1] || m[2]).filter((u) => !/^(https?:)?\/\//.test(u));
  for (const u of refs) files[u] = await get(u);
  // the string tables: the offline copy runs in English with them inline (its marker tells i18n.js to fetch nothing)
  const parts = (((await get('i18n/index.js')).match(/parts: \[([^\]]*)\]/) || [])[1] || '').match(/[\w-]+/g) || [];
  // and the shared components' English parts (UI_PARTS in i18n.js: the presets words among them)
  const ui = ((((await get('../shared/i18n/i18n.js')).match(/\/\*ui-parts\*\/\{\s*parts: \[([^\]]*)\]/) || [])[1] || '').match(/[\w-]+/g) || []).map((p) => '../shared/i18n/ui/en/' + p + '.js');
  const tables = ['../shared/i18n/i18n.js', '../shared/i18n/strings.js', '../shared/i18n/ui/en.js'].concat(ui, parts.map((p) => 'i18n/en/' + p + '.js'));
  files.i18n = (await Promise.all(tables.map(get))).join('\n;\n');
  try { files['favicon'] = await get('../favicon.svg'); } catch (e) { /* optional */ }
  return files;
}
function buildOfflineHTML(files) {
  const esc = (s) => s.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  let html = files['index.html'];
  // Web fonts stay online-only (the woff2 set is ~0.8 MB): offline, the fallback font stack is used.
  html = html.replace(/\s*<script src="[^"]*shared\/guard\.js"[^>]*><\/script>/g, '').replace(/\s*<script\b[^>]*data-offline="strip"[^>]*><\/script>/g, '').replace(/\s*<link rel="preconnect"[^>]*>/g, '').replace(/\s*<link\b[^>]*data-offline="strip"[^>]*>/g, '');
  html = html.replace(/\s*<script src="[^"]*i18n\/index\.js"[^>]*><\/script>/, '');
  if (files.i18n != null) html = html.replace(/<script src="[^"]*shared\/i18n\/i18n\.js"[^>]*><\/script>/, () => `<meta name="slop-offline" content="offline"><script>\n${esc(files.i18n)}\n</script>`);
  // Function replacers throughout: a replacement *string* would treat "$$" and "$&" in the code as patterns.
  if (files.favicon) html = html.replace(/<link rel="icon" href="[^"]*"[^>]*>/, () => `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(files.favicon)}" type="image/svg+xml">`);
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => (files[href] != null ? `<style>\n${files[href].replace(/<\/style/gi, '<\\/style')}\n</style>` : m));
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => (files[src] != null ? `<script>\n${esc(files[src])}\n</script>` : m));
  html = html.replace('<html lang="en"', () => '<html lang="en" data-offline="1"');
  const json = JSON.stringify(files).replace(/</g, '\\u003c');
  html = html.replace(/<\/body>\s*<\/html>\s*$/, () => `<script type="application/json" id="app-src">${json}</script>\n</body>\n</html>\n`);
  return html;
}
async function downloadOfflineApp() {
  try {
    const html = buildOfflineHTML(await appSources());
    download(new Blob([html], { type: 'text/html' }), 'photoslop.html');
    dialog({ title: tr('photoslop.save.offline_title'), body: h('div', { class: 'about' },
      h('p', null, tr('photoslop.save.offline_file', { kb: Math.round(html.length / 1024) })),
      h('p', null, tr('photoslop.save.offline_where')),
      h('p', { class: 'dlg-p' }, tr('photoslop.save.offline_fonts'))),
    buttons: [{ label: tr('photoslop.save.nice'), primary: true }] });
  } catch (e) { console.warn(e); alertDlg(tr('photoslop.save.offline_failed'), e.message); }
}

