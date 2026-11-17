/* PhotoSlop: the eyedropper. Samples a point or an averaged box from the layer or the composite. The eyedropper tool (I)
 * draws a loupe. Alt on a painting or fill tool samples into the foreground (Alt+Shift: background) and never paints. */
'use strict';

/** Tools that take Alt as "sample" (clone, heal and spot keep Alt for their source; shapes use Alt for "from centre"). */
const EYE_ALT_TOOLS = new Set(['brush', 'pencil', 'eraser', 'bucket', 'gradient', 'blur', 'sharpen', 'smudge', 'dodge', 'sponge']);
const EYE = { layers: null, idx: -1, all: null, lid: null, canvas: null, loupe: null };

/** The pixels to sample: the composite (all visible layers) or the active layer, cached until the next history step. */
function sampleCanvas(all) {
  const L = activeLayer(), lid = L ? L.id : null;
  if (EYE.canvas && EYE.layers === D.layers && EYE.idx === Hist.idx && EYE.all === all && EYE.lid === lid) return EYE.canvas;
  const canvas = all ? flattenCanvas() : (L ? docCanvasOf(L) : null);
  Object.assign(EYE, { layers: D.layers, idx: Hist.idx, all, lid, canvas });
  return canvas;
}
/** Mean colour {r, g, b, a} of a size x size box (1, 3, 5, 11) centred on a document point, or null (outside or transparent). */
function sampleAt(x, y, all, size) {
  const X = Math.floor(x), Y = Math.floor(y);
  if (X < 0 || Y < 0 || X >= D.w || Y >= D.h) return null;
  const src = sampleCanvas(all); if (!src) return null;
  const b = SlopColor.boxAround(X, Y, size, D.w, D.h);
  return SlopColor.meanOf(cxr(src).getImageData(b.x0, b.y0, b.bw, b.bh).data, b.bw, b.bh);
}
/** The sampled colour as a hex string (with alpha when it is not opaque), or null. */
function pickColor(p, all, size = 1) { return SlopColor.fromSample(sampleAt(p.x, p.y, all, size)); }
/** Records a colour the person picked, for the recent-colours row. */
function noteRecent(hex) { if (hex) RECENTS.add(hex); }

/** Options-bar select: Sample Composite / Sample Layer (stored as T.eyedrop.all). */
function sampleSourceOpt() {
  const st = { v: T.eyedrop.all ? 'composite' : 'layer' };
  return optSelect('', st, 'v', [['composite', tr('photoslop.tool.sample_composite')], ['layer', tr('photoslop.tool.sample_layer')]], () => { T.eyedrop.all = st.v === 'composite'; });
}

/** Alt on a painting tool: sample instead of painting. Returns true when the pointer press was consumed. */
function eyeAltSample(t, p, e) {
  if (!e.altKey || !EYE_ALT_TOOLS.has(t.id)) return false;
  const hex = pickColor(p, T.eyedrop.all, T.eyedrop.size);
  if (hex) { setColor(e.shiftKey ? 'bg' : 'fg', hex); noteRecent(hex); }
  else toast(tr('photoslop.tool.transparent_here'));
  return true;
}

defTool({ id: 'eyedropper', nk: 'eyedropper', key: 'I', icon: ICON('M19 5a2.8 2.8 0 0 0-4 0l-2 2-1-1-2 2 1 1-7 7v4h4l7-7 1 1 2-2-1-1 2-2a2.8 2.8 0 0 0 0-4z'),
  down(p, e) { this.pick(p, e); }, move(p, e) { this.pick(p, e); },
  pick(p, e) {
    const hex = pickColor(p, T.eyedrop.all, T.eyedrop.size);
    if (!hex) return;
    setColor(e.shiftKey ? 'bg' : 'fg', hex);
    if (e.type === 'pointerdown' || e.type === 'mousedown') noteRecent(hex);
  },
  /** Loupe: an 11 x 11 magnifier of the pixels under the pointer, with the hex of the centre pixel. */
  overlay(g) { drawLoupe(g); },
});

const LOUPE_N = 11, LOUPE_PX = 9;
function drawLoupe(g) {
  if (!V.cursorIn || !V.cursor || !D.layers.length) return;
  const src = sampleCanvas(T.eyedrop.all); if (!src) return;
  const X = Math.floor(V.cursor.x), Y = Math.floor(V.cursor.y), half = (LOUPE_N - 1) / 2;
  if (!EYE.loupe) EYE.loupe = mkCanvas(LOUPE_N, LOUPE_N);
  cx(EYE.loupe).putImageData(cxr(src).getImageData(X - half, Y - half, LOUPE_N, LOUPE_N), 0, 0);
  const hex = pickColor({ x: X, y: Y }, T.eyedrop.all, 1);
  const box = LOUPE_N * LOUPE_PX, a = toScreen(V.cursor.x, V.cursor.y);
  let x = a.x + 22, y = a.y + 22;
  if (x + box + 8 > V.W) x = a.x - 22 - box - 8;
  if (y + box + 30 > V.H) y = a.y - 22 - box - 30;
  g.fillStyle = 'rgba(20,20,20,.92)'; g.fillRect(x - 4, y - 4, box + 8, box + 34);
  g.imageSmoothingEnabled = false; g.drawImage(EYE.loupe, x, y, box, box);
  const c = x + half * LOUPE_PX, d = y + half * LOUPE_PX;
  g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(c - 0.5, d - 0.5, LOUPE_PX + 1, LOUPE_PX + 1);
  g.strokeStyle = '#fff'; g.strokeRect(c + 0.5, d + 0.5, LOUPE_PX - 1, LOUPE_PX - 1);
  g.fillStyle = hex || 'transparent'; g.fillRect(x, y + box + 6, 14, 14); g.strokeStyle = '#fff'; g.strokeRect(x + 0.5, y + box + 6.5, 13, 13);
  g.font = '11px "JetBrains Mono", monospace'; g.fillStyle = '#fff'; g.fillText(hex ? hex.toUpperCase() : 'NONE', x + 20, y + box + 17); // i18n-ignore: a CSS font
}
