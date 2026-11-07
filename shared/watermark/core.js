/* Slopographic watermark engine: paints a watermark spec (spec.js) onto a 2D canvas. One engine for every picture and video
 * frame on the site: Slop Watermark, PhotoSlop's exports and page view, SlopCut's monitor and exports, Slop Workflows. The
 * layout maths is spec-layout.js (shared with the PDF mapping). Classic script; load spec.js and spec-layout.js first.
 *   SlopWatermark.draw(ctx, w, h, spec, { page, pages, time, pdfFonts })   every layer that is active there (spec.active),
 *        bottom first. A logo that is still decoding is skipped; onLogo tells when it is ready, to draw again.
 *   SlopWatermark.drawLayer(ctx, w, h, layer, image, opts)
 *   SlopWatermark.logo(dataUrl) → { img, ok, w, h, ready }     decoded once and kept (at most 2048 px on the long side)
 *   SlopWatermark.ready(spec) → Promise                        every logo of the spec decoded (exports wait for it)
 *   SlopWatermark.onLogo(fn) → off()                            fn() after any logo finishes decoding
 *   SlopWatermark.readLogo(file) → Promise<{ logo, logoName, logoW, logoH }>   a picked picture as a layer's logo fields:
 *        PNG or JPEG under 1.5 MB as it is, anything else (WebP, GIF, SVG, big files) as a PNG, so PDFs can embed it
 *   SlopWatermark.ROOT ; load(paths) → Promise                  the site root, and classic scripts from it (once each) */
(function () {
  'use strict';
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  if (window.SlopWatermark && window.SlopWatermark.draw) return;
  const S = window.SlopWatermarkSpec;
  const SCRIPT = document.currentScript;
  // the site root from this script's own address; a script run inline (an offline copy, a test frame) uses the page's base
  const ROOT = (() => { for (const [rel, base] of [['../../', SCRIPT && SCRIPT.src], ['/', document.baseURI]]) { try { return new URL(rel, base).href; } catch (e) { /* next */ } } return ''; })();
  const LOGO_SIDE = 2048, KEEP_BYTES = 1.5 * 1048576, SVG_SIDE = 1024;
  const PDF_CSS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' };
  const logos = new Map(), listeners = new Set();

  const fontOf = (L, px, opts) => (L.bold ? 600 : 400) + ' ' + px + 'px ' + (opts && opts.pdfFonts ? PDF_CSS[L.font] : S.FONTS[L.font].css);

  function logo(url) {
    let e = logos.get(url);
    if (e) return e;
    e = { img: null, ok: false, w: 0, h: 0, ready: null };
    logos.set(url, e);
    e.ready = (async () => {
      try {
        const im = new Image();
        im.src = url;
        await im.decode();
        let w = im.naturalWidth, h = im.naturalHeight;
        if (!(w > 0 && h > 0)) { w = SVG_SIDE; h = SVG_SIDE; }
        const k = Math.min(1, LOGO_SIDE / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        Object.assign(e, { img: c, ok: true, w: c.width, h: c.height });
        listeners.forEach((fn) => { try { fn(url); } catch (x) { console.warn(x); } });
      } catch (err) { console.warn('Slopographic watermark: a logo could not be read', err); }
    })();
    return e;
  }
  const ready = (spec) => Promise.all(S.visible(spec).filter((L) => L.kind === 'logo' && L.logo).map((L) => logo(L.logo).ready)).then(() => {});
  function onLogo(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  /** A layer's items, painted at their centres. A logo without its own size takes the decoded picture's aspect. */
  function drawLayer(ctx, w, h, L, img, opts) {
    if (L.kind === 'logo' && !img) return;
    if (L.kind === 'text' && !L.text) return;
    const lay = L.kind === 'logo' && !(L.logoW > 0 && L.logoH > 0) ? Object.assign({}, L, { logoW: img.width, logoH: img.height }) : L;
    const item = S.itemSize(lay, w, h, (t, px) => { ctx.save(); ctx.font = fontOf(L, px, opts); const m = ctx.measureText(t).width; ctx.restore(); return m; });
    const at = S.placements(lay, w, h, item);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, L.opacity));
    if (L.kind === 'text') {
      ctx.font = fontOf(L, item.px, opts); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = L.colour;
      if (L.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = item.h * 0.15; ctx.shadowOffsetY = item.h * 0.05; }
    }
    const rad = at.rot * Math.PI / 180;
    for (const p of at.items) {
      ctx.save();
      ctx.translate(p.cx, p.cy);
      if (rad) ctx.rotate(rad);
      if (L.kind === 'logo') ctx.drawImage(img, -item.w / 2, -item.h / 2, item.w, item.h);
      else ctx.fillText(L.text, -item.w / 2, -item.h / 2);
      ctx.restore();
    }
    ctx.restore();
  }
  function draw(ctx, w, h, spec, opts = {}) {
    if (!spec || !spec.layers) return;
    for (const L of spec.layers) {
      if (!S.active(L, opts)) continue;
      const e = L.kind === 'logo' && L.logo ? logo(L.logo) : null;
      drawLayer(ctx, w, h, L, e && e.ok ? e.img : null, opts);
    }
  }

  const dataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error(tr('ui.wm.file_unread'))); r.readAsDataURL(blob); });
  async function readLogo(file) {
    if (!file || !/^image\//.test(file.type || '') && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file.name || '')) throw new Error(tr('ui.wm.logo_choose'));
    let url = await dataUrl(file.type ? file : new Blob([file], { type: /\.svg$/i.test(file.name) ? 'image/svg+xml' : 'image/png' }));
    const e = logo(url);
    await e.ready;
    if (!e.ok) { logos.delete(url); throw new Error(tr('ui.wm.logo_unread')); }
    const keep = /^data:image\/(png|jpeg)/.test(url) && file.size <= KEEP_BYTES && Math.max(e.w, e.h) < LOGO_SIDE;
    if (!keep) { url = e.img.toDataURL('image/png'); logos.set(url, e); }
    return { logo: url, logoName: String(file.name || 'logo').slice(0, 120), logoW: e.w, logoH: e.h };
  }

  const loaded = new Map();
  function one(rel) {
    const src = new URL(rel, ROOT).href;
    if (!loaded.has(src)) {
      loaded.set(src, new Promise((resolve, reject) => {
        if ([...document.scripts].some((s) => s.src === src)) { resolve(); return; }
        const s = Object.assign(document.createElement('script'), { src, async: false });
        s.onload = () => resolve();
        s.onerror = () => { loaded.delete(src); s.remove(); reject(new Error(tr('ui.wm.load_failed', { file: rel }))); };
        document.head.append(s);
      }));
    }
    return loaded.get(src);
  }
  async function load(paths) { for (const p of paths) await one(p); }

  window.SlopWatermark = Object.assign(window.SlopWatermark || {}, { ROOT, draw, drawLayer, logo, ready, onLogo, readLogo, load, POSITIONS: S.POSITIONS });
})();
