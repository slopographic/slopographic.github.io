/* PhotoSlop: tools. Each tool: { id, name, key, icon, down, move, up, hover, overlay, cancel, activate, deactivate, brushCursor }. */
'use strict';

const C = { fg: store.get('fg', '#000000'), bg: store.get('bg', '#ffffff') };
const T = Object.assign({
  brush: { size: 30, hardness: 0.7, opacity: 1, flow: 1, spacing: 0.12, pressure: true, blend: 'normal', tip: 'round' },
  pencil: { size: 2, opacity: 1 },
  eraser: { size: 40, hardness: 0.6, opacity: 1, flow: 1, spacing: 0.12, pressure: true, tip: 'round' },
  blur: { size: 50, hardness: 0.3, strength: 0.5 },
  sharpen: { size: 50, hardness: 0.3, strength: 0.4 },
  sponge: { size: 60, hardness: 0.3, flow: 0.4, mode: 'saturate' },
  clone: { size: 60, hardness: 0.5, opacity: 1, flow: 1, aligned: true, sampleAll: false },
  heal: { size: 60, hardness: 0.5, opacity: 1, aligned: true, sampleAll: false },
  spot: { size: 30, hardness: 0.5, opacity: 1 },
  redeye: { size: 40, tol: 50, dark: 60 },
  smudge: { size: 40, hardness: 0.4, strength: 0.6 },
  dodge: { size: 70, hardness: 0.3, exposure: 0.35, mode: 'dodge' },
  select: { mode: 'replace', feather: 0 },
  wand: { tol: 32, contiguous: true, sampleAll: false },
  bucket: { tol: 32, contiguous: true, sampleAll: false, opacity: 1 },
  gradient: { type: 'linear', mode: 'fgbg', reverse: false, opacity: 1 },
  shape: { kind: 'rect', fill: true, stroke: false, strokeW: 6, radius: 0, sides: 5, strokeColor: '#000000' },
  type: { font: 'Archivo', size: 96, bold: true, italic: false, align: 'left', tracking: 0, leading: 120, aa: 'smooth' }, // i18n-ignore: a font name
  move: { auto: false },
  crop: { del: true },
  eyedrop: { size: 1, all: true },
}, {});
(function loadToolOptions() { const saved = store.get('tools', null); if (saved) for (const k in saved) if (T[k]) Object.assign(T[k], saved[k]); })();
let saveOptsTimer = 0;
function saveToolOptions() { clearTimeout(saveOptsTimer); saveOptsTimer = setTimeout(() => store.set('tools', T), 300); }
// editMask: painting edits the active layer's mask (the canvas shows the result); maskOverlay: tint where the mask hides, on request
const UI = { tool: 'brush', prevTool: null, editMask: false, maskOverlay: false };

function setColor(which, hex) { C[which] = hex; store.set(which, hex); emit('color'); }

/* ---------- helpers ---------- */
function editableLayer(forPixels = true) {
  let L = activeLayer();
  if (!L) { cantPaint(tr('photoslop.tool.no_layer')); return null; }
  if (!L.visible) { cantPaint(tr('photoslop.tool.layer_hidden')); return null; }
  if (L.locked) { cantPaint(tr('photoslop.tool.layer_locked')); return null; }
  if (forPixels && (L.text || L.shape) && !UI.editMask) { const was = L.text ? 'type' : 'shape'; L = rasterizeText(L, true); toast(tr('photoslop.tool.rasterized_' + was)); }
  return L;
}
/** Clone and heal: Alt-click sets the source. A finger or a pen has no Alt key: its first press sets the source when
 *  there is none yet, and Set source (options bar: tool.pickSource) makes the next press set it. True when it did. */
function takeSource(tool, p, e, what) {   // what: 'clone' or 'heal'
  const touchy = e.pointerType === 'touch' || e.pointerType === 'pen';
  if (!e.altKey && !tool.pickSource && !(touchy && !tool.src)) return false;
  tool.src = { x: p.x, y: p.y }; tool.off = null; tool.pickSource = false;
  toast(tr('photoslop.tool.source_set_' + what + (touchy ? '_touch' : '')));
  return true;
}
/** A tool could not paint: says why, plainly, and offers a new pixel layer above to paint on instead. */
function cantPaint(msg) { toast(msg, 6000, { label: tr('photoslop.tool.add_pixel_layer'), run: () => addLayer({}, tr('photoslop.tool.step_new_layer')) }); }
function maskTarget(L) { return UI.editMask && L.mask; }
function docCanvasOf(L) { const c = mkCanvas(D.w, D.h); cx(c).drawImage(L.canvas, L.x, L.y); return c; }
function sampleSource(all) { return all ? flattenCanvas() : docCanvasOf(activeLayer()); }
