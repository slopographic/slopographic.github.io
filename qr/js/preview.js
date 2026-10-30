/* QR SLOP: the live preview. The code is an image on a checkerboard, so transparency shows. The image is also the drag source:
 * dragging it puts the PNG on the SlopBuffer for another app to take. The PNG is made a moment after each change, so the
 * buffer, Drive and the print page get it at once. Classic script; exposes window.QRPreview. */
(function (g) {
  'use strict';
  if (g.QRPreview) return;
  const img = () => document.getElementById('qr-img');
  let url = null, timer = 0, current = null;
  let cache = { svg: null, png: null };

  /** Wires the drag. Our listener runs before SlopBuffer.makeDraggable's, so a drag never carries an old code. */
  function init() {
    img().addEventListener('dragstart', (e) => {
      if (!current || cache.svg !== current || !cache.png) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (g.SlopUI) g.SlopUI.toast(g.SlopI18n ? g.SlopI18n.t('qr.app.drag_wait') : 'qr.app.drag_wait');
        return;
      }
      g.QRSave.forDrag(cache.png);
    });
    if (g.SlopBuffer && g.SlopBuffer.makeDraggable) g.SlopBuffer.makeDraggable(img());
  }

  /** Shows an SVG string, or hides the picture when svg is null. */
  function show(svg) {
    const el = img();
    current = svg;
    if (url) { URL.revokeObjectURL(url); url = null; }
    if (!svg) { el.hidden = true; el.removeAttribute('src'); return; }
    url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    el.src = url; el.hidden = false;
  }

  /** The PNG for an SVG at px pixels. Cached per SVG text, so repeat calls cost nothing. */
  async function pngFor(svg, px) {
    if (cache.png && cache.svg === svg) return cache.png;
    const png = await g.QRExport.toPng(svg, px);
    cache = { svg, png };
    return png;
  }

  /** Makes the PNG after the last change settles. */
  function prepare(svg, px) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (svg === current) pngFor(svg, px).catch(() => {}); }, 220);
  }

  g.QRPreview = Object.freeze({ init, show, pngFor, prepare });
})(typeof window !== 'undefined' ? window : globalThis);
