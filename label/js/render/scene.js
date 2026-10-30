/* SlopLabel — render/scene: turns label objects + variable values into a display list of simple
 * primitives in mm. Canvas, SVG and PDF backends all draw this same list, so outputs match.
 * Item: { obj, box:{x,y,w,h}, rot, lw, lh, cx, cy, prims:[…], error }
 * Prims are in the object's local frame (0..lw, 0..lh); the item transform is
 * translate(cx, cy) · rotate(rot) · translate(−lw/2, −lh/2). */
'use strict';

const isQuarter = (r) => ((r % 360) + 360) % 360;
/** Local size of an object box (rotated 90/270 swaps w/h). */
function localSize(o) { const r = isQuarter(o.rot || 0); return r === 90 || r === 270 ? [o.h, o.w] : [o.w, o.h]; }
/** For auto-sized content: keep the anchor (align/valign) of the stored box and return the new label-space box. */
function anchoredBox(o, nlw, nlh) {
  const [olw, olh] = localSize(o), r = isQuarter(o.rot || 0);
  const al = o.type === 'barcode' ? o.align || 'left' : o.align;
  const dx = al === 'center' ? (olw - nlw) / 2 : al === 'right' ? olw - nlw : 0;
  const dy = o.valign === 'middle' ? (olh - nlh) / 2 : o.valign === 'bottom' ? olh - nlh : 0;
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const pts = [[dx, dy], [dx + nlw, dy], [dx, dy + nlh], [dx + nlw, dy + nlh]].map(([px, py]) => rot90(cx + px - olw / 2, cy + py - olh / 2, cx, cy, r));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
function finishItem(o, box, lw, lh, prims, extra) {
  return Object.assign({ obj: o, box, rot: isQuarter(o.rot || 0), lw, lh, cx: box.x + box.w / 2, cy: box.y + box.h / 2, prims }, extra || {});
}

function buildItem(o, get, doc) {
  const dpi = doc.dpi;
  let [lw, lh] = localSize(o);
  const prims = [];
  switch (o.type) {
    case 'text': case 'para': {
      const text = interpolate(o.content, get);
      const L = layoutText(o, text, lw, lh);
      let box = objBox(o);
      if (o.fit === 'grow') { box = anchoredBox(o, L.width, L.height); lw = L.width; lh = L.height; }
      const color = o.color === 'white' ? '#fff' : '#000';
      for (const ln of L.lines) for (const s of ln.segs) prims.push({ t: 'text', x: ln.x + s.x, y: ln.y, w: s.w, text: s.text, size: L.sizeMM, font: o.font || 'sans', bold: s.bold, italic: s.italic, color });
      return finishItem(o, box, lw, lh, prims, { text, layout: L, warn: L.overflow ? LT('label.scene.text_does_not_fit_its') : '' });
    }
    case 'barcode': {
      const value = interpolate(o.content, get);
      const g = barcodeGeometry(o, value, dpi);
      const box = anchoredBox(o, g.w, g.h);
      if (!g.ok) return finishItem(o, objBox(o), lw, lh, [{ t: 'error', x: 0, y: 0, w: lw, h: lh }], { error: g.error, value });
      prims.push({ t: 'bars', rects: g.rects });
      for (const tx of g.texts) {
        let size = tx.size, w = measureMM(tx.text, tx.font, false, false, size);
        if (tx.fitW && w > tx.fitW) { size *= tx.fitW / w; w = tx.fitW; }
        const x = tx.align === 'center' ? tx.x - w / 2 : tx.align === 'right' ? tx.x - w : tx.x;
        prims.push({ t: 'text', x, y: tx.y, w, text: tx.text, size, font: tx.font, bold: false, italic: false, color: '#000' });
      }
      return finishItem(o, box, g.w, g.h, prims, { geom: g, value });
    }
    case 'image': {
      const a = o.aspect || 1;
      let iw = lw, ih = lh, ix = 0, iy = 0;
      if (o.keepAspect !== false) { if (lw / lh > a) { iw = lh * a; ix = (lw - iw) / 2; } else { ih = lw / a; iy = (lh - ih) / 2; } }
      prims.push({ t: 'image', asset: o.asset, x: ix, y: iy, w: iw, h: ih, mono: !!o.mono, threshold: o.threshold });
      break;
    }
    case 'rect': {
      const sw = Math.min(+o.stroke || 0, lw / 2, lh / 2);
      prims.push({ t: 'rect', x: 0, y: 0, w: lw, h: lh, r: Math.min(+o.radius || 0, lw / 2, lh / 2), fill: o.fill === 'black' ? '#000' : o.fill === 'white' ? '#fff' : null, sw: o.fill === 'black' ? 0 : sw });
      break;
    }
    case 'ellipse': prims.push({ t: 'ellipse', x: 0, y: 0, w: lw, h: lh, fill: o.fill === 'black' ? '#000' : o.fill === 'white' ? '#fff' : null, sw: o.fill === 'black' ? 0 : Math.min(+o.stroke || 0, lw / 2, lh / 2) }); break;
    case 'line': {
      const sw = Math.max(0.05, +o.stroke || 0.3), d = o.dir || 'h';
      if (d === 'h') prims.push({ t: 'rect', x: 0, y: (lh - sw) / 2, w: lw, h: sw, fill: '#000', sw: 0 });
      else if (d === 'v') prims.push({ t: 'rect', x: (lw - sw) / 2, y: 0, w: sw, h: lh, fill: '#000', sw: 0 });
      else prims.push({ t: 'line', x1: 0, y1: d === 'd1' ? 0 : lh, x2: lw, y2: d === 'd1' ? lh : 0, sw });
      break;
    }
    case 'inverse': prims.push({ t: 'invert', x: 0, y: 0, w: lw, h: lh }); break;
  }
  return finishItem(o, objBox(o), lw, lh, prims);
}
/** Display list for one label. `get` resolves variables (see makeResolver). */
function buildScene(doc, get) {
  const items = [];
  for (const o of doc.objects) { if (o.hidden || o.printable === false && get.__print) continue; try { items.push(buildItem(o, get, doc)); } catch (e) { items.push(finishItem(o, objBox(o), o.w, o.h, [], { error: e.message })); } }
  return items;
}
/** Map a local point of an item to label space. */
function itemToLabel(it, px, py) { return rot90(it.cx + px - it.lw / 2, it.cy + py - it.lh / 2, it.cx, it.cy, it.rot); }
/** 2×3 affine [a,b,c,d,e,f] (canvas/PDF/SVG convention) of an item's local frame in label mm. */
function itemMatrix(it) {
  const r = (it.rot * Math.PI) / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  const tx = it.cx + c * (-it.lw / 2) - s * (-it.lh / 2), ty = it.cy + s * (-it.lw / 2) + c * (-it.lh / 2);
  return [c, s, -s, c, tx, ty];
}
/** Errors that should stop a print job (bad barcode data etc.). */
function sceneErrors(items) { return items.filter((i) => i.error).map((i) => `${i.obj.name}: ${i.error}`); }
/** Recompute auto-sized boxes (grow text, barcodes) after an edit, using design-time values. */
function syncAutoSize(doc, o, get) {
  if (!((o.type === 'text' || o.type === 'para') && o.fit === 'grow') && o.type !== 'barcode') return;
  const it = buildItem(o, get, doc);
  if (it.error) return;
  const b = it.box;
  o.x = round(b.x); o.y = round(b.y); o.w = round(Math.max(0.5, b.w)); o.h = round(Math.max(0.5, b.h));
}
