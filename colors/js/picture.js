/* Slop Colors: the picture. Drawn on a canvas (at most 1600 px on its long side), with an eyedropper: move over it (a
 * mouse, a finger or a pen; the canvas is a touch surface, so a drag is never a scroll) and a magnifier shows the pixels
 * under the point with their colour; a click or lifting the finger picks it. The arrow keys move the point by one pixel
 * (Shift: ten), Enter adds the colour to the palette. Its main colours come from seeded k-means (core/kmeans.js) on a
 * copy at most 400 px wide. "Pick from screen" is the browser's EyeDropper where it has one (Chrome and Edge). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.CO.state, MAXSIDE = 1600, SMALL = 400, ZOOM = 12, CELLS = 11;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  let pic = null, at = { x: 0, y: 0 }, picking = false, dominant = [];

  async function bitmapOf(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) {
      const url = URL.createObjectURL(file), img = new Image();
      try { img.src = url; await img.decode(); return img; } catch (x) { throw new Error(t('colors.pic.unreadable', { name: file.name })); } finally { URL.revokeObjectURL(url); }
    }
  }
  /** Shows a picture file: on the canvas, its main colours found. Resolves { width, height, colors }. */
  async function load(file) {
    const bmp = await bitmapOf(file), w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    if (!w0 || !h0) throw new Error(t('colors.pic.no_pixels', { name: file.name }));
    const f = Math.min(1, MAXSIDE / Math.max(w0, h0)), cv = $('co-canvas');
    cv.width = Math.max(1, Math.round(w0 * f)); cv.height = Math.max(1, Math.round(h0 * f));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    if (bmp.close) bmp.close();
    pic = { name: file.name, w: cv.width, h: cv.height, ctx };
    at = { x: Math.floor(cv.width / 2), y: Math.floor(cv.height / 2) };
    $('co-pic').hidden = false;
    find();
    paintNote();
    return { width: pic.w, height: pic.h, colors: dominant };
  }
  function clear() {
    pic = null; dominant = [];
    $('co-pic').hidden = true; $('co-dominant-wrap').hidden = true;
    paintNote();
  }
  function paintNote() {
    $('co-pic-note').textContent = pic ? t('colors.pic.note', { name: pic.name }) : '';
    if (g.CO.main) g.CO.main.dropEmpty(!pic);
  }
  /** The colour of one pixel of the picture (canvas pixels), or null. */
  function pixel(x, y) {
    if (!pic) return null;
    x = Math.max(0, Math.min(pic.w - 1, Math.round(x))); y = Math.max(0, Math.min(pic.h - 1, Math.round(y)));
    const d = pic.ctx.getImageData(x, y, 1, 1).data;
    return g.SlopColors.convert.hexOf([d[0], d[1], d[2]]);
  }
  /** Picks the pixel at (x, y): it becomes the current colour. add: also into the palette. */
  function pickAt(x, y, add) {
    const hex = pixel(x, y);
    if (!hex) throw new Error(t('colors.pic.open_first'));
    at = { x: Math.round(x), y: Math.round(y) };
    S().set({ current: hex });
    if (add) S().addColor(hex);
    return hex;
  }
  /** The main colours of the picture (k from the panel), drawn as swatches. */
  function find(k) {
    if (!pic) return [];
    const f = Math.min(1, SMALL / Math.max(pic.w, pic.h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(pic.w * f)); c.height = Math.max(1, Math.round(pic.h * f));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage($('co-canvas'), 0, 0, c.width, c.height);
    dominant = g.SlopColors.kmeans.dominant(x.getImageData(0, 0, c.width, c.height).data, { k: k || S().get().k, seed: 1 });
    paintDominant();
    return dominant;
  }
  function paintDominant() {
    $('co-dominant-wrap').hidden = !dominant.length;
    $('co-dominant').replaceChildren(...dominant.map((d) => g.CO.swatches.swatch(d.hex, { share: d.share, selected: d.hex === S().get().current })));
  }
  function addAll() {
    const p = S().get().palette, cols = p.colors.concat(dominant.map((d) => ({ hex: d.hex }))).slice(0, S().MAX);
    S().set({ palette: { name: pic ? pic.name.replace(/\.[^.]+$/, '') : p.name, colors: cols } });
  }

  /** Canvas pixel under a pointer event. */
  function toPixel(e) {
    const cv = $('co-canvas'), r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * cv.width, y: ((e.clientY - r.top) / r.height) * cv.height, cx: e.clientX - r.left, cy: e.clientY - r.top, finger: e.pointerType === 'touch' };
  }
  /** The magnifier at canvas pixel (x, y), drawn near the point (above a finger, so it is not hidden under it). */
  function loupe(x, y, cx, cy, finger) {
    const L = $('co-loupe'), lx = L.getContext('2d'), cv = $('co-canvas');
    if (!pic) { L.hidden = true; return; }
    const px = Math.floor(x), py = Math.floor(y), half = (CELLS - 1) / 2;
    lx.imageSmoothingEnabled = false;
    lx.fillStyle = '#808080'; lx.fillRect(0, 0, L.width, L.height);
    lx.drawImage(cv, px - half, py - half, CELLS, CELLS, 0, 0, CELLS * ZOOM, CELLS * ZOOM);
    const hex = pixel(px, py), ink = g.CO.swatches.ink(hex);
    lx.strokeStyle = ink; lx.lineWidth = 2; lx.strokeRect(half * ZOOM, half * ZOOM, ZOOM, ZOOM);
    lx.fillStyle = hex; lx.fillRect(0, CELLS * ZOOM - 22, L.width, 22);
    lx.fillStyle = ink; lx.font = '600 13px system-ui, sans-serif'; lx.textAlign = 'center'; lx.fillText(hex, L.width / 2, CELLS * ZOOM - 7);
    const box = $('co-pic').getBoundingClientRect(), r = cv.getBoundingClientRect();
    let left = r.left - box.left + cx + 18, top = r.top - box.top + cy - (finger ? L.height + 40 : L.height / 2);
    if (left + L.width > box.width) left = r.left - box.left + cx - L.width - 18;
    L.style.left = Math.max(0, left) + 'px'; L.style.top = Math.max(0, top) + 'px';
    L.hidden = false;
  }
  function wire() {
    const cv = $('co-canvas');
    cv.addEventListener('pointerdown', (e) => {
      if (!pic || e.button > 0) return;
      picking = true;
      try { cv.setPointerCapture(e.pointerId); } catch (x) { /* none */ }   // touch-ok: the canvas is data-touch-surface in colors/index.html
      const p = toPixel(e); loupe(p.x, p.y, p.cx, p.cy, p.finger);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', (e) => { if (!pic || (!picking && e.pointerType === 'touch')) return; const p = toPixel(e); loupe(p.x, p.y, p.cx, p.cy, p.finger); });
    cv.addEventListener('pointerup', (e) => { if (!picking) return; picking = false; const p = toPixel(e); pickAt(p.x, p.y); $('co-loupe').hidden = true; });
    cv.addEventListener('pointercancel', () => { picking = false; $('co-loupe').hidden = true; });
    cv.addEventListener('pointerleave', () => { if (!picking) $('co-loupe').hidden = true; });
    cv.addEventListener('blur', () => { $('co-loupe').hidden = true; });
    cv.addEventListener('keydown', (e) => {
      if (!pic) return;
      const step = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        at = { x: Math.max(0, Math.min(pic.w - 1, at.x + d[0])), y: Math.max(0, Math.min(pic.h - 1, at.y + d[1])) };
        pickAt(at.x, at.y);
      } else if (e.key === 'Enter' || e.key === ' ') { try { pickAt(at.x, at.y, true); } catch (x) { g.SlopUI.toast(x.message); } } else return;
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      loupe(at.x, at.y, (at.x / pic.w) * r.width, (at.y / pic.h) * r.height, false);
    });
    $('co-dominant-add').addEventListener('click', addAll);
    const scr = $('co-screen');
    scr.hidden = typeof g.EyeDropper !== 'function';
    scr.addEventListener('click', pickScreen);
  }
  /** The browser's own eyedropper: any pixel on the screen (it asks the person; nothing is read without their click). */
  async function pickScreen() {
    if (typeof g.EyeDropper !== 'function') throw new Error(t('colors.pic.no_eyedropper'));
    try { const r = await new g.EyeDropper().open(); S().set({ current: r.sRGBHex }); return S().get().current; } catch (e) { return null; }
  }
  g.CO.picture = { load, clear, pixel, pickAt, find, addAll, pickScreen, paintDominant, wire, has: () => !!pic, info: () => (pic ? { name: pic.name, width: pic.w, height: pic.h } : null), colors: () => dominant };
})(window);
