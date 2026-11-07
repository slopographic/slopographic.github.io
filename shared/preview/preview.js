/* SlopPreview — the viewer. SlopPreview.create({ title, blobUrl, kind, actions, onPrev, onNext, onClose, chrome, renderPages })
 * shows an image (kind 'image', blobUrl) or the pages of a PDF (kind 'pdf', renderPages) and returns
 * { el, close, zoomTo(scale), fit() }. Other kinds show a "No preview" note. The host owns the blob URL.
 *   zoom   the mouse wheel (around the pointer), + − 0 1 keys, the toolbar, pinch (around the midpoint). 0.05 to 16×.
 *   pan    drag with the mouse, or one finger; two fingers pan while they pinch. Smaller than the view = centred.
 *   touch  double-tap toggles fit / 2×.
 *   keys   Escape closes and ← → call onPrev / onNext, when the host gives them.
 *   chrome true (default): a header with the title and a close button, and a footer with actions[].
 *          false: only the toolbar and the picture, for a host with its own header and footer (Quick look).
 *   renderPages() resolves to { pages: HTMLElement[] (each with px style width and height), note? }.
 * Mouse and touch both use pointer events. No dependency on Drive or any other app. Needs chrome.js first. */
(function () {
  'use strict';
  const SP = (window.SlopPreview = window.SlopPreview || {});
  const MIN = 0.05, MAX = 16, STEP = 1.25;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  SP.create = function (o = {}) {
    SP.injectStyle();
    const pdf = o.kind === 'pdf' && typeof o.renderPages === 'function';
    const zoomable = o.kind === 'image' || pdf;
    const root = SP.el('div', 'spv');
    root.tabIndex = -1;
    root.setAttribute('role', 'group');
    const aria = o.title ? 'ui.pv.preview_of' : 'ui.pv.preview';
    root.setAttribute('aria-label', SP.tr(aria, { name: o.title || '' }));
    root.setAttribute('data-i18n-attr', 'aria-label:' + aria);   // a language switch rewrites it (SlopI18n.apply)
    if (o.title) root.setAttribute('data-i18n-vars', JSON.stringify({ name: o.title }));
    const stage = SP.el('div', zoomable ? 'spv-stage' : 'spv-stage spv-static');
    stage.setAttribute('data-touch-surface', ''); // a touch surface with its own pinch and pan (shared/input/HANDOFF.md)
    const content = SP.el('div', 'spv-content');
    stage.append(content);
    // s: scale (1 = 100% of the content's size w × h); x, y: the content's top-left in the stage; fit: follow the window.
    const v = { s: 1, x: 0, y: 0, w: 0, h: 0, fit: true };
    const pts = new Map(); // pointer id → position in the stage
    let pinch = null, tap = null, lastTap = null, note = null, closed = false, ro = null, wasAttached = false;
    const size = () => ({ W: stage.clientWidth, H: stage.clientHeight });
    const center = () => { const { W, H } = size(); return { x: W / 2, y: H / 2 }; };
    const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const fitScale = () => {
      const { W, H } = size();
      if (!v.w || !v.h || W < 30 || H < 30) return 1;
      return clamp(Math.min(1, (W - 24) / v.w, (H - 24) / v.h), MIN, MAX);
    };
    /** Lay the content out. centre: a smaller picture is centred (fit, the buttons, keys, resize). Without it (pointer zoom,
     * pinch, pan) a smaller picture keeps the place the anchor gives it, its centre kept inside the view, so the point under
     * the pointer holds. */
    function place(centre = false) {
      const { W, H } = size(), w = v.w * v.s, h = v.h * v.s;
      v.x = w <= W ? (centre ? (W - w) / 2 : clamp(v.x, -w / 2, W - w / 2)) : clamp(v.x, W - w, 0);
      v.y = h <= H ? (centre ? (H - h) / 2 : clamp(v.y, -h / 2, H - h / 2)) : clamp(v.y, H - h, 0);
      content.style.width = v.w + 'px';
      content.style.height = v.h + 'px';
      content.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.s})`;
      pct.textContent = Math.round(v.s * 100) + '%';
    }
    /** Zoom to target (clamped) keeping the stage point (px, py) where it is. */
    function zoomAt(px, py, target, centre = false) {
      const ns = clamp(target, MIN, MAX), cx = (px - v.x) / v.s, cy = (py - v.y) / v.s;
      v.s = ns; v.fit = false;
      v.x = px - cx * ns; v.y = py - cy * ns;
      place(centre);
      return ns;
    }
    function fit() { v.fit = true; v.s = fitScale(); place(true); return v.s; }
    function zoomTo(scale) {
      if (!isFinite(scale)) return v.s;
      const c = center();
      return zoomAt(c.x, c.y, Number(scale), true);
    }
    const zoomBy = (f) => { const c = center(); return zoomAt(c.x, c.y, v.s * f, true); };

    // The toolbar. Its readout is updated by place().
    const { bar, pct } = SP.bar({
      zoom: zoomable,
      zoomOut: () => zoomBy(1 / STEP), zoomIn: () => zoomBy(STEP), fit: () => fit(), actual: () => zoomTo(1),
      openTab: () => { if (o.blobUrl) SP.openInTab(o.blobUrl); },
      download: () => { if (o.blobUrl) SP.download(o.blobUrl, o.title); },
      share: navigator.share && o.blobUrl ? () => { SP.share(o.blobUrl, o.title).catch(() => {}); } : null,
    });

    function setSize(w, h) { v.w = w; v.h = h; if (v.fit) v.s = fitScale(); place(true); }
    /** A note over the stage: the host's text, or the words of a key (marked, so a language switch rewrites them). */
    function notice(text, mid, key) {
      if (!note) { note = SP.el('div', 'spv-note'); stage.append(note); }
      note.classList.toggle('spv-mid', !!mid);
      if (key) note.setAttribute('data-i18n', key); else note.removeAttribute('data-i18n');
      note.textContent = key ? SP.tr(key) : text;
    }
    const hideNote = () => { if (note) note.remove(); note = null; };

    // Wheel: zoom around the pointer.
    stage.addEventListener('wheel', (e) => {
      if (!zoomable || !v.w) return;
      e.preventDefault();
      const p = local(e), per = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0015;
      zoomAt(p.x, p.y, v.s * Math.exp(-e.deltaY * per));
    }, { passive: false });

    // Pointers (mouse, touch, pen): one pointer drags, two pinch. A still tap is checked for a double-tap.
    const anchor = () => {
      pinch = null;
      if (pts.size === 2) { const [a, b] = pts.values(); pinch = { d: dist(a, b), m: mid(a, b), s: v.s, x: v.x, y: v.y }; }
      stage.classList.toggle('spv-drag', pts.size > 0);
    };
    stage.addEventListener('pointerdown', (e) => {
      if (closed || (e.pointerType === 'mouse' && e.button !== 0)) return;
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* a pointer the browser does not track */ }
      try { root.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) tap = { t: e.timeStamp, x: p.x, y: p.y, moved: 0 };
      else if (tap) tap.moved = Infinity;
      anchor();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = local(e);
      pts.set(e.pointerId, cur);
      if (tap) tap.moved = Math.max(tap.moved, dist(cur, tap));
      if (!zoomable || !v.w) return;
      if (pts.size >= 2 && pinch) {
        const [a, b] = pts.values(), d = dist(a, b), m = mid(a, b);
        if (pinch.d < 4 || d < 1) return;
        const ns = clamp(pinch.s * d / pinch.d, MIN, MAX);
        const cx = (pinch.m.x - pinch.x) / pinch.s, cy = (pinch.m.y - pinch.y) / pinch.s;
        v.s = ns; v.fit = false;
        v.x = m.x - cx * ns; v.y = m.y - cy * ns;
        place();
      } else if (pts.size === 1) {
        v.fit = false;
        v.x += cur.x - prev.x; v.y += cur.y - prev.y;
        place();
      }
    });
    const release = (e, cancel) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (!cancel && pts.size === 0 && tap && tap.moved < 12 && e.timeStamp - tap.t < 350) tapped(e.timeStamp);
      if (pts.size === 0) tap = null;
      anchor();
    };
    stage.addEventListener('pointerup', (e) => release(e, false));
    stage.addEventListener('pointercancel', (e) => release(e, true));
    // A press on the picture belongs to the viewer: a host's selection, marquee or click-to-clear handlers do not see it.
    stage.addEventListener('pointerdown', (e) => e.stopPropagation());
    stage.addEventListener('click', (e) => e.stopPropagation());
    // Its own double tap (tapped, below) zooms: the dblclick a mouse, or the touch layer (shared/input), sends after it is
    // not the host's (Slop Drive's pane would open the file).
    stage.addEventListener('dblclick', (e) => e.stopPropagation());
    /** Two taps close together: fit → 2× around the tap, otherwise back to fit. */
    function tapped(at) {
      const p = tap;
      if (lastTap && at - lastTap.t < 320 && dist(p, lastTap) < 30) {
        lastTap = null;
        if (!zoomable || !v.w) return;
        if (Math.abs(v.s - fitScale()) < 0.01) zoomAt(p.x, p.y, 2); else fit();
      } else lastTap = { t: at, x: p.x, y: p.y };
    }

    function close() {
      if (closed) return;
      closed = true;
      if (ro) ro.disconnect();
      root.remove();
      if (o.onClose) o.onClose();
    }
    // Keys, while focus is in the viewer.
    root.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      if (e.ctrlKey || e.metaKey) return;
      const k = e.key, c = center();
      let used = true;
      if (zoomable && (k === '+' || k === '=')) zoomAt(c.x, c.y, v.s * STEP, true);
      else if (zoomable && (k === '-' || k === '_')) zoomAt(c.x, c.y, v.s / STEP, true);
      else if (zoomable && k === '0') fit();
      else if (zoomable && k === '1') zoomAt(c.x, c.y, 1, true);
      else if (k === 'Escape' && o.onClose) close();
      else if ((k === 'ArrowLeft' || k === 'ArrowUp') && o.onPrev) o.onPrev();
      else if ((k === 'ArrowRight' || k === 'ArrowDown') && o.onNext) o.onNext();
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
    });

    // The content. An image sizes itself on load; a PDF's pages are rendered by the host.
    if (o.kind === 'image' && o.blobUrl) {
      const img = SP.el('img', 'spv-img');
      img.alt = o.title || '';
      img.draggable = false;
      img.addEventListener('load', () => { setSize(img.naturalWidth || 640, img.naturalHeight || 480); hideNote(); });
      img.addEventListener('error', () => notice('', true, 'ui.pv.image_failed'));
      content.append(img);
      img.src = o.blobUrl;
    } else if (pdf) {
      notice('', false, 'ui.pv.rendering');
      Promise.resolve().then(() => o.renderPages()).then((r) => {
        if (closed) return;
        const pages = (r && r.pages) || [];
        content.classList.add('pv-pages');
        content.replaceChildren(...pages);
        let w = 0, h = 0;
        for (const p of pages) { w = Math.max(w, parseFloat(p.style.width) || 0); h += parseFloat(p.style.height) || 0; }
        h += Math.max(0, pages.length - 1) * SP.GAP;
        setSize(w || 640, h || 480);
        if (r && r.note) notice(r.note); else hideNote();
      }).catch(() => { if (!closed) notice('', true, 'ui.pv.pdf_failed'); });
    } else {
      notice('', true, 'ui.pv.no_preview');
    }

    if (o.chrome !== false) root.append(SP.head(o.title || '', close));
    root.append(bar, stage);
    if (o.chrome !== false) root.append(SP.foot(o.actions));

    // Re-fit when the window or the panel changes size. Once it has been in the page and is removed, stop watching.
    if (window.ResizeObserver) {
      ro = new ResizeObserver(() => {
        if (!root.isConnected) { if (wasAttached) ro.disconnect(); return; }
        wasAttached = true;
        if (!v.w) return;
        if (v.fit) fit(); else place(true);
      });
      ro.observe(stage);
    }
    return { el: root, close, zoomTo, fit };
  };
})();
