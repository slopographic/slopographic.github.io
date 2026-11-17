/* PhotoSlop for the assistant: making pictures. new_document (a new tab, size and background), add_svg_layer (SVG the model
 * writes, checked and drawn at document size into a new named layer), gradient_fill (linear, radial or conic with any
 * stops, on the layer or the selection, or on a new layer) and draw_shape (rectangle, rounded, ellipse, polygon, star,
 * heart, line, a free path or a list of points, with fill, stroke, blur, opacity and blend). They use PhotoSlop's own
 * core: newDocTab, addLayer, coverDoc, bakeStroke (the selection limits it), maskedBuffer, shapePath, renderShapeLayer.
 * Each is one history step. Loaded on demand by SlopCmd.prepare() before ai-draw-cmds.js. */
'use strict';

/** SVG text that is safe to draw: no scripts, event handlers, foreignObject, or links outside the picture except data:.
 *  Returns the checked SVG text with its size set to w × h (a viewBox is kept, or made from the original size). */
function psCheckSvg(src, w, h) {
  const text = String(src || '').trim();
  if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) throw new Error('That is not an SVG: it must start with <svg');
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length || !root || root.localName !== 'svg') throw new Error('The SVG could not be read (check that every tag is closed)');
  const bad = (why) => { throw new Error('The SVG was refused: ' + why); };
  const okUrl = (u) => { const s = String(u).trim().replace(/^['"]|['"]$/g, ''); return !s || s[0] === '#' || /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(s); };
  for (const el of root.querySelectorAll('*')) {
    const n = el.localName.toLowerCase();
    if (n === 'script' || n === 'foreignobject' || n === 'iframe' || n === 'object' || n === 'embed') bad(`<${el.localName}> is not allowed`);
    for (const at of [...el.attributes]) {
      const an = at.name.toLowerCase(), v = at.value;
      if (an.startsWith('on')) bad(`the event handler ${at.name} is not allowed`);
      if ((an === 'href' || an === 'xlink:href' || an === 'src') && !okUrl(v)) bad('links to other files or sites are not allowed (only #ids and data: pictures)'); // i18n-ignore: the assistant's commands, their docs and replies are API
      if (/url\(/i.test(v)) for (const m of v.matchAll(/url\(([^)]*)\)/gi)) if (!okUrl(m[1])) bad('url(…) may only point inside the SVG');
      if (/javascript:/i.test(v)) bad('javascript: is not allowed'); // i18n-ignore: the assistant's commands, their docs and replies are API
    }
    if (n === 'style' && (/@import/i.test(el.textContent) || [...el.textContent.matchAll(/url\(([^)]*)\)/gi)].some((m) => !okUrl(m[1])))) bad('styles may not load other files'); // i18n-ignore: the assistant's commands, their docs and replies are API
  }
  for (const at of [...root.attributes]) if (at.name.toLowerCase().startsWith('on')) bad(`the event handler ${at.name} is not allowed`);
  if (!root.getAttribute('viewBox')) {
    const ow = parseFloat(root.getAttribute('width')) || w, oh = parseFloat(root.getAttribute('height')) || h;
    root.setAttribute('viewBox', `0 0 ${ow} ${oh}`);
  }
  if (!root.getAttribute('preserveAspectRatio')) root.setAttribute('preserveAspectRatio', 'none');
  root.setAttribute('width', w); root.setAttribute('height', h);
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}
/** A w × h canvas with the checked SVG drawn on it. */
async function psSvgCanvas(svg, w, h) {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(psCheckSvg(svg, w, h));
  try { await img.decode(); } catch (e) { throw new Error('The browser could not draw this SVG'); }
  const c = mkCanvas(w, h);
  cx(c).drawImage(img, 0, 0, w, h);
  return c;
}
/** fit: the box scaled down (keeping its shape) and moved so it lies inside the canvas. */
function psFitBox(b, fit) {
  if (!fit) return b;
  const k = Math.min(1, D.w / b.w, D.h / b.h), w = b.w * k, h = b.h * k;
  return { x: Math.max(0, Math.min(D.w - w, b.x)), y: Math.max(0, Math.min(D.h - h, b.y)), w, h };
}
const psBlend = (b) => (b && BLENDS.some((x) => x[0] === b) ? b : 'normal');
/** A new layer above the active one with this document-space canvas (limited to the selection when there is one).
 *  fallback: the layer's name when none is given (document content, English); step: the history label. */
function psNewLayer(c, a, fallback, step) {
  const L = addLayer({ name: String(a.name || '').slice(0, 80) || nextName(fallback), canvas: D.sel ? copyCanvas(maskedBuffer(c)) : c,
    opacity: a.opacity == null ? 1 : a.opacity / 100, blend: psBlend(a.blend) }, step || fallback);
  return L;
}

async function aiNewDocument(a) {
  await aiSettle();
  const bg = a.background === 'transparent' ? 'transparent' : a.background || '#ffffff';
  newDocTab(a.width, a.height, bg, String(a.name || 'Untitled').slice(0, 80)); // i18n-ignore: the assistant's commands, their docs and replies are API
  return `Opened a new ${a.width} × ${a.height} px document “${D.name}” (${bg} background) in a new tab.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}

async function aiSvgLayer(a) {
  await aiSettle();
  const b = psFitBox({ x: a.x || 0, y: a.y || 0, w: a.width || D.w, h: a.height || D.h }, a.fit);
  const w = Math.round(b.w), h = Math.round(b.h);
  const art = await psSvgCanvas(a.svg, w, h), c = mkCanvas(D.w, D.h);
  cx(c).drawImage(art, Math.round(b.x), Math.round(b.y));
  const L = psNewLayer(c, a, 'SVG', tr('photoslop.ai.step_svg'));
  return `Drew the SVG into the new layer “${L.name}” (${w} × ${h} px at ${Math.round(b.x)}, ${Math.round(b.y)}).` + psBoundsNote('The SVG', b); // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** The gradient's colour stops: [[offset 0–1, colour]] from colours (evenly spaced) or stops [{ offset, color }]. */
function psStops(a) {
  const A = window.SlopCmdArgs, list = [];
  const col = (v) => { const c = A.toColor(v); if (!c) throw new Error(`“${v}” is not a colour`); return c; };
  if (a.stops && a.stops.length) for (const s of a.stops) {
    const o = Array.isArray(s) ? { offset: s[0], color: s[1] } : s || {};
    const off = Number(o.offset); list.push([Math.max(0, Math.min(1, off > 1 ? off / 100 : off || 0)), col(o.color)]);
  } else for (const [i, v] of (a.colors && a.colors.length ? a.colors : [C.fg, C.bg]).entries()) list.push([0, col(v), i]);
  if (!(a.stops && a.stops.length)) list.forEach((s, i) => { s[0] = list.length > 1 ? i / (list.length - 1) : 0; });
  if (list.length < 2) list.push([1, list[0][1]]);
  return list.sort((p, q) => p[0] - q[0]);
}
const hexA = (c) => (c.length === 9 ? `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${parseInt(c.slice(7), 16) / 255})` : c);
/** A document-size canvas filled with the gradient. Angle 0 runs left → right, 90 top → bottom; the centre is a fraction of the document. */
function psGradientCanvas(a) {
  const c = mkCanvas(D.w, D.h), g = cx(c), x0 = (a.center_x == null ? 0.5 : a.center_x) * D.w, y0 = (a.center_y == null ? 0.5 : a.center_y) * D.h;
  const ang = ((a.angle || 0) * Math.PI) / 180, half = (Math.abs(Math.cos(ang)) * D.w + Math.abs(Math.sin(ang)) * D.h) / 2;
  let gr;
  if (a.type === 'radial') gr = g.createRadialGradient(x0, y0, 0, x0, y0, (a.radius || 0.5) * Math.hypot(D.w, D.h) / Math.SQRT2);
  else if (a.type === 'conic') { if (!g.createConicGradient) throw new Error('This browser cannot draw conic gradients'); gr = g.createConicGradient(ang, x0, y0); }
  else gr = g.createLinearGradient(x0 - Math.cos(ang) * half, y0 - Math.sin(ang) * half, x0 + Math.cos(ang) * half, y0 + Math.sin(ang) * half);
  for (const [o, col] of psStops(a)) gr.addColorStop(o, hexA(col));
  g.fillStyle = gr; g.fillRect(0, 0, D.w, D.h);
  return c;
}
async function aiGradientFill(a) {
  await aiSettle();
  const grad = psGradientCanvas(a);
  if (a.target === 'new_layer') { const L = psNewLayer(grad, a, 'Gradient', tr('photoslop.ai.step_gradient')); return `Filled the new layer “${L.name}” with a ${a.type} gradient${D.sel ? ' inside the selection' : ''}.`; } // i18n-ignore: the assistant's commands, their docs and replies are API
  const L0 = aiLayer(); if (L0.text || L0.shape) rasterizeText(L0, true);
  const L = coverDoc(activeLayer());
  patchLayer(L.id, { canvas: bakeStroke(L, grad, { opacity: a.opacity == null ? 1 : a.opacity / 100, blend: psBlend(a.blend) }) });
  commit(tr('photoslop.ai.step_gradient'));
  return `Filled ${D.sel ? 'the selection on' : ''} “${L.name}” with a ${a.type} gradient.`; // i18n-ignore: the assistant's commands, their docs and replies are API
}

/** A path from points: [[x, y], …], [{ x, y }], or "x,y x,y". */
function psPoints(v) {
  const list = typeof v === 'string' ? v.trim().split(/\s+/).map((s) => s.split(',').map(Number)) : [].concat(v || []);
  return list.map((p) => (Array.isArray(p) ? { x: +p[0], y: +p[1], pressure: p[2] == null ? null : +p[2] } : { x: +p.x, y: +p.y, pressure: p.pressure == null ? null : +p.pressure }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}
async function aiDrawShape(a) {
  await aiSettle();
  const A = window.SlopCmdArgs, fill = a.fill === 'none' ? null : A.toColor(a.fill || C.fg), stroke = a.stroke && a.stroke !== 'none' ? A.toColor(a.stroke) : null;
  if (a.fill && a.fill !== 'none' && !fill) throw new Error(`“${a.fill}” is not a colour`);
  if (a.stroke && a.stroke !== 'none' && !stroke) throw new Error(`“${a.stroke}” is not a colour`);
  const r = psFitBox({ x: a.x || 0, y: a.y || 0, w: a.width || D.w / 2, h: a.height || D.h / 2 }, a.fit);
  const c = mkCanvas(D.w, D.h), g = cx(c), kind = a.kind;
  if (a.blur) g.filter = `blur(${a.blur}px)`;
  let path = null;
  if (kind === 'path') { if (!a.path) throw new Error('Give path: SVG path data such as "M10 10 L200 40 Z"'); path = new Path2D(String(a.path)); }
  else if (kind === 'points' || kind === 'line') {
    const pts = kind === 'line' && !a.points ? [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y + r.h }] : psPoints(a.points);
    if (pts.length < 2) throw new Error('Give at least two points');
    path = new Path2D(); pts.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    if (kind === 'points' && a.closed !== false) path.closePath();
  }
  const open = kind === 'line' || (kind === 'points' && a.closed === false);
  const paint = () => {
    if (fill && !open) { g.fillStyle = hexA(fill); path ? g.fill(path, 'evenodd') : g.fill(); }
    if (stroke || open) { g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = a.stroke_width || 4; g.strokeStyle = hexA(stroke || fill || C.fg); path ? g.stroke(path) : g.stroke(); }
  };
  if (!path) shapePath(g, kind, r, { radius: a.radius || (kind === 'rounded' ? 32 : 0), sides: a.sides || 5 });
  paint();
  const plain = !a.blur && fill && !stroke && SHAPE_RADIUS_KINDS.includes(kind) && !D.sel;
  const rec = plain ? { kind, r, radius: a.radius || (kind === 'rounded' ? 32 : 0), fill: true, stroke: false, strokeW: 0, fg: fill, bg: C.bg } : null;
  const L = addLayer({ name: String(a.name || '').slice(0, 80) || nextName(kind[0].toUpperCase() + kind.slice(1)), canvas: rec ? renderShapeLayer(rec) : D.sel ? copyCanvas(maskedBuffer(c)) : c, shape: rec,
    opacity: a.opacity == null ? 1 : a.opacity / 100, blend: psBlend(a.blend) }, tr('photoslop.ai.step_shape'));
  return `Drew a ${kind} in the new layer “${L.name}”.` + psBoundsNote('The shape', path ? psLayerBounds(L) : r); // i18n-ignore: the assistant's commands, their docs and replies are API
}
