/* PhotoSlop files: clipboard, open, save and export */
'use strict';

/* ---------- clipboard ---------- */
const CLIP = { canvas: null, x: 0, y: 0 };
let pasteInPlace = false;
function copySel(merged) {
  if (!activeLayer()) return;
  const r = copySelectionPixels(merged);
  CLIP.canvas = r.canvas; CLIP.x = r.x; CLIP.y = r.y; CLIP.t = Date.now();
  toast(tr(merged ? 'photoslop.io.copied_merged' : 'photoslop.io.copied'));
  try {
    if (navigator.clipboard && window.ClipboardItem) navigator.clipboard.write([new ClipboardItem({ 'image/png': canvasToBlob(r.canvas) })]).catch(() => {});
  } catch (e) { /* the internal clipboard still works */ }
}
function cutSel() {
  const L = activeLayer(); if (!L) return;
  if (L.locked) { toast(tr('photoslop.io.layer_locked')); return; }
  copySel(false);
  if (D.sel) clearSelectionPixels(tr('photoslop.io.step_cut'));
  else { patchLayer(L.id, { canvas: mkCanvas(1, 1), x: 0, y: 0, text: null }); commit(tr('photoslop.io.step_cut')); }
}
/** name: a file's name, or a key of photoslop.layer.* (the default name in the chosen language, see nextName). */
function pasteCanvas(c, x, y, name = 'photoslop.layer.pasted') {
  if (x == null) { x = Math.round((D.w - c.width) / 2); y = Math.round((D.h - c.height) / 2); }
  const L = newLayerRecord({ name: nextName(name.replace(/ \d+$/, '')), canvas: c, x, y });
  const i = layerIndex(D.activeId);
  D.layers.splice(i + 1, 0, L); D.activeId = L.id; D.sel = null;
  commit(tr('photoslop.io.step_paste'));
  selectTool('move');
}
function pasteInternal(inPlace) {
  if (!CLIP.canvas) { toast(tr('photoslop.io.nothing_to_paste')); return; }
  pasteCanvas(copyCanvas(CLIP.canvas), inPlace ? CLIP.x : null, inPlace ? CLIP.y : null, 'photoslop.layer.default');
}
/** The app's own clipboard: a paste with no file the intake takes (files go through shared/intake, app/intake.js, which
 *  marks the paste prevented), or one of our own buffer copies, places the buffer item or the internal copy. */
function onPaste(e) {
  if (e.defaultPrevented) return; // taken by SlopIntake (shared/intake)
  const fromCatcher = e.target && e.target.classList && e.target.classList.contains('paste-catcher');
  if ((!fromCatcher && isTyping(e.target)) || SlopUI.openDialogs) return;
  if (fromCatcher) e.target.blur();
  e.preventDefault();
  if (!pasteBuffer()) pasteInternal(pasteInPlace);
}

/* ---------- opening ---------- */
async function fileToCanvas(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const w = img.naturalWidth || img.width || 1000, hh = img.naturalHeight || img.height || 1000;
    const c = mkCanvas(w, hh); cx(c).drawImage(img, 0, 0, w, hh);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
const isPSD = (f) => /\.ps[db]$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop';
/** Open… and Place Image as Layer…: the picker is a source of the one intake (app/intake.js). */
function openFilePicker(place) { return SlopIntake.pick({ to: 'photoslop', accept: OPENABLE, mode: place ? 'add' : 'new' }); }
/** Open each file in its own tab, or (place) add them to the current document as layers. */
async function handleFiles(files, place) {
  document.body.classList.add('busy');
  let opened = 0;
  const failed = [];
  for (const f of files) {
    const name = (f.name || tr('ui.untitled')).replace(/\.[^.]+$/, '') || tr('ui.untitled');
    try {
      const doc = await readAnyFile(f);
      if (place) pasteCanvas(doc.layers.length === 1 && !doc.layers[0].x && !doc.layers[0].y ? doc.layers[0].canvas : flattenDocLayers(doc), null, null, name);
      else { openDocTab(doc.w, doc.h, doc.layers, name); if (doc.guides) adoptGuides(doc.guides); if (doc.wm) adoptWatermark(doc.wm); opened++; }
    } catch (e) { if (e && e.code === 'cancelled') continue; console.warn(e); const msg = tr('photoslop.io.open_failed', { name: f.name, error: e.message || String(e) }); failed.push(msg); toast(msg, 4200); }
  }
  if (opened) toast(opened === 1 ? tr('photoslop.io.opened_one', { name: files[0].name }) : tr('photoslop.io.opened_n', { n: opened }));
  document.body.classList.remove('busy');
  return failed;
}
function openDocument(w, hh, layers, name) {
  if (TE.el) endTypeEdit(true);
  if (TRANSFORM.active) cancelTransform();
  D.w = w; D.h = hh; D.name = name || tr('ui.untitled'); D.sel = null; D.guides = []; D.wm = null; live = null; UI.editMask = false;
  D.layers = layers.map((l) => newLayerRecord(l));
  D.activeId = D.layers[D.layers.length - 1].id;
  histReset(tr('photoslop.io.step_open'));
  fitView(true);
  emit('docname');
  scheduleAutosave();
}
/* ---------- saving & export ---------- */
const safeName = () => (D.name || tr('ui.untitled')).replace(/[\\/:*?"<>|]+/g, '-').trim() || tr('ui.untitled');
async function savePSD() {
  if (TE.el) await endTypeEdit();
  if (TRANSFORM.active) commitTransform();
  document.body.classList.add('busy');
  await new Promise((r) => setTimeout(r, 30));
  try {
    const bytes = writePSD();
    download(new Blob([bytes], { type: 'image/vnd.adobe.photoshop' }), safeName() + '.psd');
    D.dirty = false; emit('docname');
    toast(tr('photoslop.io.saved_psd', { name: safeName(), mb: SlopI18n.num(bytes.length / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }));
  } catch (e) { console.warn(e); alertDlg(tr('photoslop.io.save_psd_failed'), e.message); }
  document.body.classList.remove('busy');
}
async function renderExport(fmt, scale, bg) {
  let c = wmApplyExport(flattenCanvas(fmt === 'image/png' && !bg ? null : bg || '#ffffff'));
  if (scale !== 1) c = resampleCanvas(c, Math.max(1, Math.round(D.w * scale)), Math.max(1, Math.round(D.h * scale)));
  return c;
}
async function quickExport() { const c = await renderExport('image/png', 1, null); download(await canvasToBlob(c, 'image/png'), safeName() + '.png'); toast(tr('photoslop.io.exported_png')); SlopSupport.afterExport('photoslop'); }
function dlgExport() {
  const fmt = h('select', null, [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']].map(([v, l]) => h('option', { value: v }, l))); // i18n-ignore: format names
  const q = h('input', { type: 'range', min: 1, max: 100, value: 85 }), qn = h('span', { class: 'fp-u' }, '85');
  const scale = h('select', null, [[0.25, '25%'], [0.5, '50%'], [1, '100%'], [2, '200%'], [3, '300%']].map(([v, l]) => h('option', { value: v, selected: v === 1 }, l)));
  const transparent = h('input', { type: 'checkbox', checked: true });
  const info = h('p', { class: 'dlg-p mono' }, '…');
  const qRow = field(tr('photoslop.io.quality'), q, qn), tRow = h('label', { class: 'field opt-check' }, transparent, h('span', null, tr('photoslop.io.transparent_bg')));
  let tok = 0;
  const update = async () => {
    const my = ++tok, f = fmt.value;
    qRow.style.display = f === 'image/png' ? 'none' : ''; tRow.style.display = f === 'image/png' ? '' : 'none'; qn.textContent = q.value;
    const c = await renderExport(f, +scale.value, f === 'image/png' && transparent.checked ? null : '#ffffff');
    const b = await canvasToBlob(c, f, +q.value / 100);
    if (my === tok) info.textContent = `${c.width} × ${c.height} px · ${b ? (b.size / 1024 < 1024 ? Math.round(b.size / 1024) + ' KB' : (b.size / 1048576).toFixed(2) + ' MB') : '?'}`;
  };
  [fmt, q, scale, transparent].forEach((el) => el.addEventListener('input', update));
  dialog({ title: tr('photoslop.io.export_as'), body: h('div', { class: 'form' }, field(tr('photoslop.io.format'), fmt), qRow, field(tr('photoslop.io.size'), scale), tRow, h('p', { class: 'dlg-p' }, tr(wmOn() ? 'photoslop.io.wm_on_export' : 'photoslop.io.wm_off_export')), info),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.export'), primary: true, act: async () => {
      const f = fmt.value, c = await renderExport(f, +scale.value, f === 'image/png' && transparent.checked ? null : '#ffffff');
      const b = await canvasToBlob(c, f, +q.value / 100);
      if (!b) { toast(tr('photoslop.io.cannot_encode')); return false; }
      download(b, safeName() + { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[f]);
      SlopSupport.afterExport('photoslop');
    } }] });
  update();
}
/* Store-only ZIP (PNGs are already compressed). */
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const { name, data } of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function exportLayers() {
  document.body.classList.add('busy');
  const files = [], used = new Set();
  for (let i = 0; i < D.layers.length; i++) {
    const L = D.layers[i], b = bakedLayer(L), c = mkCanvas(D.w, D.h); cx(c).drawImage(b.canvas, b.x, b.y);
    let n = `${String(i + 1).padStart(2, '0')} ${L.name}`.replace(/[\\/:*?"<>|]+/g, '-'); while (used.has(n)) n += '_'; used.add(n);
    files.push({ name: n + '.png', data: new Uint8Array(await (await canvasToBlob(c)).arrayBuffer()) });
  }
  download(zipStore(files), safeName() + ' layers.zip');
  document.body.classList.remove('busy');
  toast(tr('photoslop.io.exported_layers', { n: files.length }));
  SlopSupport.afterExport('photoslop');
}
