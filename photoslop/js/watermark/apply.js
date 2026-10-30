/* PhotoSlop watermark: painting it onto an export (the flattened image at full size, before any resize) and onto the
 * page preview. Both use the shared engine (SlopWatermark.draw) with the document's spec. Nothing is painted while the
 * switch is off. */
'use strict';

/** Paints the watermark onto the export canvas c (when on) and returns c. Used by every flattened export. */
function wmApplyExport(c) {
  const s = D.wm;
  if (s && s.on) SlopWatermark.draw(cx(c), c.width, c.height, s.spec);
  return c;
}

const wmView = { c: null, s: null, ver: -1 };
/** Paints the watermark over the page on the view (x0, y0, w, hh: the page on screen). It is drawn at screen size, so
 * its sizes, margins and shadow match the export at this zoom. Cached until the settings, the logo or the size change. */
function wmPreviewView(g, x0, y0, w, hh) {
  const s = D.wm;
  if (!s || !s.on) return;
  const pw = Math.max(1, Math.round(w * V.dpr)), ph = Math.max(1, Math.round(hh * V.dpr));
  if (!wmView.c) wmView.c = mkCanvas(1, 1);
  if (wmView.s !== s || wmView.ver !== wmVer || wmView.c.width !== pw || wmView.c.height !== ph) {
    wmView.c.width = pw; wmView.c.height = ph;
    SlopWatermark.draw(cx(wmView.c), pw, ph, s.spec);
    wmView.s = s; wmView.ver = wmVer;
  }
  g.drawImage(wmView.c, x0, y0, w, hh);
}
