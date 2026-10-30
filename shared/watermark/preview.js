/* A live watermark preview of any file: a picture (drawn with the watermark), a video (it plays, with the watermark drawn
 * over each frame at the time shown, so a time range can be checked) or a PDF page (rendered with the site's pdf.js and
 * the watermark on it, in the PDF fonts; arrows move between pages so a page range can be checked). The look is the
 * engine's (core.js), so it matches the file that apply() writes. Classic script: window.SlopWatermarkPreview.
 *   const pv = SlopWatermarkPreview.mount(host, { maxW: 960, maxH: 640 })
 *   pv.show(file) → Promise (file null: empty) ; pv.draw(spec) ; pv.kind ('picture' | 'video' | 'pdf' | '') ; pv.canvas
 *   pv.page() ; pv.pages() ; pv.destroy() */
(function () {
  'use strict';
  const WM = window.SlopWatermark;
  const el = (...a) => window.SlopUI.el(...a);
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  const RASTER = 'convert/js/core/pdf-raster.js';

  window.SlopWatermarkPreview = { mount(host, opts = {}) {
    const maxW = opts.maxW || 960, maxH = opts.maxH || 640;
    const canvas = el('canvas', { class: 'swv-canvas', 'aria-label': tr('ui.wm.preview_aria'), 'data-i18n-attr': 'aria-label:ui.wm.preview_aria' });
    const video = el('video', { class: 'swv-video', controls: true, muted: true, playsinline: true, preload: 'metadata', hidden: true });
    const over = el('canvas', { class: 'swv-over', 'aria-hidden': 'true', hidden: true });
    const prev = el('button', { type: 'button', class: 'sui-btn', 'aria-label': tr('ui.wm.prev_page'), 'data-i18n-attr': 'aria-label:ui.wm.prev_page' }, '‹');
    const next = el('button', { type: 'button', class: 'sui-btn', 'aria-label': tr('ui.wm.next_page'), 'data-i18n-attr': 'aria-label:ui.wm.next_page' }, '›');
    const pageNo = el('span', { class: 'swv-page', 'aria-live': 'polite', 'data-i18n': 'ui.wm.page_of' });   // marked: a language switch rewrites it
    const nav = el('div', { class: 'swv-nav', hidden: true }, prev, pageNo, next);
    const stage = el('div', { class: 'swv-stage' }, canvas, video, over);
    const root = el('div', { class: 'swv' }, stage, nav);
    host.append(root);
    let spec = null, base = null, kind = '', url = '', pdf = null, page = 0, pages = 0, seq = 0, raf = 0;
    const offLogo = WM.onLogo(() => paint());

    function fit(w, h) { const k = Math.min(1, maxW / w, maxH / h); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; }
    function paint() {
      if (!spec) return;
      if (kind === 'video') { paintVideo(); return; }
      if (!base) return;
      canvas.width = base.width; canvas.height = base.height;
      const g = canvas.getContext('2d');
      g.drawImage(base, 0, 0);
      WM.draw(g, canvas.width, canvas.height, spec, kind === 'pdf' ? { page, pages, pdfFonts: true } : {});
    }
    function paintVideo() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw) return;
      const box = video.getBoundingClientRect(), k = Math.min(box.width / vw, box.height / vh) || 1;
      const w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k)), dpr = window.devicePixelRatio || 1;
      over.style.width = w + 'px'; over.style.height = h + 'px';
      over.style.left = (video.offsetLeft + (box.width - w) / 2) + 'px'; over.style.top = (video.offsetTop + (box.height - h) / 2) + 'px';
      over.width = Math.round(w * dpr); over.height = Math.round(h * dpr);
      const g = over.getContext('2d');
      g.clearRect(0, 0, over.width, over.height);
      WM.draw(g, over.width, over.height, spec, { time: video.currentTime });
    }
    const loop = () => { paintVideo(); raf = video.paused ? 0 : requestAnimationFrame(loop); };
    video.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
    for (const ev of ['loadeddata', 'seeked', 'timeupdate', 'pause']) video.addEventListener(ev, paintVideo);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (kind === 'video') paintVideo(); }) : null;
    if (ro) ro.observe(stage);

    async function renderPage(my) {
      const p = await pdf.getPage(page + 1), vp1 = p.getViewport({ scale: 1 }), s = fit(vp1.width, vp1.height), vp = p.getViewport({ scale: s.w / vp1.width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      await p.render({ canvasContext: g, viewport: vp }).promise;
      if (my !== seq) return;
      base = c;
      const at = { page: String(page + 1), pages: String(pages) };
      pageNo.dataset.i18nVars = JSON.stringify(at); pageNo.textContent = tr('ui.wm.page_of', at);
      prev.disabled = page <= 0; next.disabled = page >= pages - 1;
      paint();
    }
    prev.addEventListener('click', () => { if (page > 0) { page--; renderPage(seq); } });
    next.addEventListener('click', () => { if (page < pages - 1) { page++; renderPage(seq); } });

    function reset() {
      if (url) URL.revokeObjectURL(url);
      url = ''; base = null; kind = ''; page = 0; pages = 0;
      if (pdf) { pdf.destroy().catch(() => {}); pdf = null; }
      video.pause(); video.removeAttribute('src'); video.load();
      canvas.hidden = true; video.hidden = true; over.hidden = true; nav.hidden = true;
    }
    async function show(file) {
      const my = ++seq;
      reset();
      if (!file) return;
      const m = WM.mediaOf(file);
      if (m === 'video') {
        kind = 'video'; url = URL.createObjectURL(file);
        video.hidden = false; over.hidden = false; video.src = url;
        return;
      }
      if (m === 'pdf') {
        kind = 'pdf';
        const R = await import(new URL(RASTER, WM.ROOT).href);
        const doc = await R.openPdf(new Uint8Array(await file.arrayBuffer()));
        if (my !== seq) { doc.destroy(); return; }
        pdf = doc; pages = doc.numPages; nav.hidden = pages < 2; canvas.hidden = false;
        await renderPage(my);
        return;
      }
      kind = 'picture';
      let src, w, h;
      if (WM.typeOf(file) === 'image/svg+xml') {
        const size = WM.svgSize(await file.text()); url = URL.createObjectURL(file);
        src = new Image(); src.src = url; await src.decode(); w = size.w; h = size.h;
      } else { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = src.width; h = src.height; }
      if (my !== seq) return;
      const s = fit(w, h), c = document.createElement('canvas');
      c.width = s.w; c.height = s.h;
      c.getContext('2d').drawImage(src, 0, 0, s.w, s.h);
      if (src.close) src.close();
      base = c; canvas.hidden = false;
      paint();
    }
    return {
      canvas, video,
      get kind() { return kind; },
      show,
      draw(next) { spec = next; paint(); },
      page: () => page, pages: () => pages,
      destroy() { seq++; reset(); offLogo(); if (ro) ro.disconnect(); cancelAnimationFrame(raf); root.remove(); },
    };
  } };
})();
