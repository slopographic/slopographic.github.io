/* SlopFaces overlay: face boxes drawn over a picture that SlopPreview shows (Drive's Quick look, Gallery's viewer). The
 * boxes are an SVG in the preview's own content layer, in the picture's pixels, so they stay on the faces at any zoom
 * and pan. Pointer events pass through. Classic script; adds to window.SlopFaces.drawBoxes. */
(function (g) {
  'use strict';
  const tr = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/preview.js
  const F = (g.SlopFaces = g.SlopFaces || {});
  const NS = 'http://www.w3.org/2000/svg';
  let styled = false;

  function style() {
    if (styled || !g.document || !g.document.head) return;
    styled = true;
    const s = g.document.createElement('style');
    s.textContent = '.face-ov{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}'
      + '.face-ov rect{fill:none;stroke:#d4ff3a;stroke-width:2px;vector-effect:non-scaling-stroke;filter:drop-shadow(0 0 1px #000)}';
    g.document.head.append(s);
  }

  /** Draws the boxes over the picture inside previewEl (the element SlopPreview.create returned as .el). Waits for the
   * picture to load. Returns a function that removes the boxes. faces: [{ x, y, w, h, score }] in picture pixels. */
  F.drawBoxes = function (previewEl, faces) {
    let gone = false;
    const img = previewEl && previewEl.querySelector('.spv-img');
    const content = previewEl && previewEl.querySelector('.spv-content');
    const paint = () => {
      if (gone || !img || !content || !img.naturalWidth) return;
      style();
      content.querySelectorAll('.face-ov').forEach((n) => n.remove());
      if (!faces || !faces.length) return;
      const svg = g.document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'face-ov');
      svg.setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      faces.forEach((f, i) => {
        const r = g.document.createElementNS(NS, 'rect');
        r.setAttribute('x', String(f.x)); r.setAttribute('y', String(f.y));
        r.setAttribute('width', String(f.w)); r.setAttribute('height', String(f.h));
        const t = g.document.createElementNS(NS, 'title');
        t.textContent = tr('ui.faces.face_n', { i: i + 1 });
        r.append(t);
        svg.append(r);
      });
      content.append(svg);
    };
    if (img) {
      if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
    }
    return () => { gone = true; if (content) content.querySelectorAll('.face-ov').forEach((n) => n.remove()); };
  };
})(typeof window !== 'undefined' ? window : globalThis);
