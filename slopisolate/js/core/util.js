/* SlopIsolate — namespace (window.CO), DOM helpers, storage, formatting, icons, image decoding. */
(function () {
  'use strict';
  const CO = window.CO = window.CO || {};
  const U = CO.util = {};
  U.$ = (s, r = document) => r.querySelector(s);
  U.h = (tag, attrs, ...kids) => SlopUI.el(tag, attrs, ...kids);
  /** The app's words (slopisolate/i18n): t(key, vars) in the chosen language; onLang(fn) re-runs fn after a language
   *  change, once the new tables are in (for UI built once). */
  U.t = (key, vars) => (window.SlopI18n ? SlopI18n.t(key, vars) : key);
  U.onLang = (fn) => (window.SlopI18n && SlopI18n.on ? SlopI18n.on(fn) : () => {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  U.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  /** Largest image we work on (pixels): iOS Safari caps canvases at 16.7 MP. */
  U.maxPixels = () => (U.isIOS ? 16.7e6 : 50e6);

  const PREFIX = 'slop-cutout.';
  U.store = {
    get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } },
  };
  U.fmtBytes = (n) => window.SlopHub.fmtSize(n);   // SlopHub.fmtSize (shared/hub.js)
  U.fmtMs = (ms) => (ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s');
  U.baseName = (name) => String(name || 'image').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'image';
  U.debounce = (fn, ms) => { let t = 0; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
  U.canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
  U.ctx = (c, o) => c.getContext('2d', o);
  U.blobOf = (c, type = 'image/png', q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, q));
  U.hexRGB = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  U.rgba = (hex, a) => { const [r, g, b] = U.hexRGB(hex); return `rgba(${r},${g},${b},${a})`; };
  U.isImage = (f) => !!f && (/^image\//.test(f.type) || /\.(png|jpe?g|webp|avif|gif|bmp|svg|ico|heic|heif|tiff?)$/i.test(f.name || ''));

  /** Decode a Blob into an ImageBitmap (EXIF orientation applied), downscaled if over maxPixels. */
  U.decode = async function (blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => {
        const url = URL.createObjectURL(blob), img = new Image();
        img.onload = () => { const c = U.canvas(img.naturalWidth || 1024, img.naturalHeight || 1024); U.ctx(c).drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); createImageBitmap(c).then(res, rej); };
        img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(U.t('cutout.app.not_image_file'))); };
        img.src = url;
      });
    }
    const px = bmp.width * bmp.height, max = U.maxPixels();
    if (px > max) {
      const s = Math.sqrt(max / px), w = Math.floor(bmp.width * s), h = Math.floor(bmp.height * s);
      const small = await createImageBitmap(bmp, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      bmp.close(); bmp = small; bmp.downscaled = true;
    }
    return bmp;
  };
  /** RGBA pixels of a bitmap. */
  U.pixels = (bmp) => { const c = U.canvas(bmp.width, bmp.height), x = U.ctx(c, { willReadFrequently: true }); x.drawImage(bmp, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };

  /* ---------- icons (24×24 strokes) ---------- */
  const I = {
    open: '<path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9.5a2 2 0 0 0-2-2h-7L10 5H5a2 2 0 0 0-2 2.5z"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 5V3.5a1.5 1.5 0 0 1 3 0V12M14 5.5a1.5 1.5 0 0 1 3 0V12M17 8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.3 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>',
    keep: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    remove: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
    compare: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 2v20"/><path d="M6 15l3-3 3 3" opacity=".6"/>',
    mask: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 7a5 5 0 1 0 0 10z" fill="currentColor"/>',
    result: '<path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z"/>',
    zoomin: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8v6M8 11h6"/>',
    zoomout: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8 11h6"/>',
    fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    send: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
    zip: '<path d="M6 3h9l4 4v14H6z"/><path d="M11 6h2M11 9h2M11 12h2M11 15v3h2v-3z"/>',
  };
  U.icon = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`;
  /** Fill a button with an icon and an optional text label. */
  U.btnIcon = (el, name, label) => { el.innerHTML = U.icon(name) + (label ? `<span>${label}</span>` : ''); return el; };
})();
