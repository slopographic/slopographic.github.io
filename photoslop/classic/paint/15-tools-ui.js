/* Slop Paint, part 15: tools box, option box and tool selection.
 * Split from the old paint.js (one IIFE). Loaded in order by index.html; state and helpers are shared through window.SlopPaint (P). */
(() => {
'use strict';
const P = window.SlopPaint;
const { $, $$, t, BRUSHES, CURSORS, EMOJIS, ICONS, S, SLOP_PAL, TOOLS, cancelOp, clearOverlay, commitCurve, commitPoly, commitSel, commitText, ctx2d, discSpans, fontbar, h, mkCanvas, optbox, previewCurve, previewPoly, renderFloating, setZoom, slashSpans, squareSpans, stamp, status, styleTextBox, wrap } = P;

/* =====================================================================
 * Tools UI + options box
 * ===================================================================== */
function cursorFor(id) {
  if (CURSORS[id]) return CURSORS[id];
  if (id === 'text') return 'text';
  if (id === 'eraser') return 'none';
  return 'crosshair';
}
function finishPending() { commitText(); commitCurve(); commitPoly(); commitSel(); }
function setTool(id) {
  if (P.st.op) cancelOp();
  if (id !== S.tool) {
    finishPending();
    clearOverlay();
    if ((id === 'picker' || id === 'zoom') && S.tool !== 'picker' && S.tool !== 'zoom') S.prevTool = S.tool;
    S.tool = id;
  }
  $$('.tool').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
  wrap.style.cursor = cursorFor(id);
  fontbar.hidden = id !== 'text' || S.fontbarClosed;
  renderOptions();
}
function buildTools() {
  const box = $('#tools');
  for (const [id, name, desc] of TOOLS) {
    if (id === 'slop') box.append(h('div', { class: 'tool-sep', 'aria-hidden': 'true' }));
    const b = h('button', { class: 'tool', type: 'button', 'aria-label': t(name), title: t(name), 'aria-pressed': 'false', 'data-tool': id, html: ICONS[id] });
    const pick = () => { if (id === 'text') S.fontbarClosed = false; setTool(id); };
    b.addEventListener('pointerdown', e => { if (e.button === 0) pick(); });
    b.addEventListener('click', e => { if (e.detail === 0) pick(); });
    b.addEventListener('pointerenter', () => status(t(desc)));
    b.addEventListener('pointerleave', () => status());
    b.addEventListener('focus', () => status(t(desc)));
    box.append(b);
  }
}
/** The tool buttons' names again, in the chosen language (a language change). */
function labelTools() {
  for (const [id, name] of TOOLS) { const b = $(`.tool[data-tool="${id}"]`); if (b) { b.setAttribute('aria-label', t(name)); b.title = t(name); } }
}
function prev(w, hh, draw, inv = true) {
  const c = mkCanvas(w, hh), x = ctx2d(c);
  x.fillStyle = '#000'; draw(x);
  c.style.width = w + 'px'; c.style.height = hh + 'px';
  if (inv) c.className = 'inv';
  return c;
}
function opt(content, selected, onpick, label) {
  const b = h('button', { class: 'opt' + (selected ? ' sel' : '') + (typeof content === 'string' ? ' txt' : ''), type: 'button', 'aria-label': label, title: label, 'aria-pressed': String(!!selected) }, content);
  const pick = () => { onpick(); renderOptions(); };
  b.addEventListener('pointerdown', e => { if (e.button === 0) { e.preventDefault(); pick(); } });
  b.addEventListener('click', e => { if (e.detail === 0) pick(); });
  return b;
}
const BRUSH_KEYS = { circle: 'paint-classic.opt.brush_circle', square: 'paint-classic.opt.brush_square', slash: 'paint-classic.opt.brush_slash', back: 'paint-classic.opt.brush_back' };
function section(cols, items) { const s = h('div', { class: 'optsec', style: { '--cols': cols } }); s.append(...items); return s; }
function lineWidthSection() {
  return section(1, [1, 2, 3, 4, 5].map(w => opt(prev(34, 7, x => x.fillRect(2, 3 - Math.floor((w - 1) / 2), 30, w)), S.lineWidth === w, () => { S.lineWidth = w; if (P.st.curve) previewCurve(); if (P.st.poly) previewPoly(); }, t('paint-classic.opt.line_width', { n: w }))));
}
function opaqueSection(get, set) {
  const icon = transparent => prev(34, 22, x => {
    if (!transparent) { x.fillStyle = '#000'; x.fillRect(5, 3, 24, 16); x.fillStyle = '#fff'; x.fillRect(6, 4, 22, 14); }
    x.fillStyle = '#ff0000'; stamp(x, 12, 10, discSpans(9));
    x.fillStyle = '#0000ff'; for (let i = 0; i < 9; i++) x.fillRect(19 - i / 2 | 0, 6 + i, i + 1, 1);
    x.fillStyle = '#9fcc00'; x.fillRect(9, 14, 5, 4);
  }, false);
  return section(1, [
    opt(icon(false), !get(), () => set(false), t('paint-classic.opt.opaque')),
    opt(icon(true), get(), () => set(true), t('paint-classic.opt.transparent')),
  ]);
}
function renderOptions() {
  optbox.textContent = '';
  const tool = S.tool, add = s => optbox.append(s);
  if (tool === 'select' || tool === 'freesel') {
    add(opaqueSection(() => S.transparent, v => { S.transparent = v; renderFloating(); }));
  } else if (tool === 'text') {
    add(opaqueSection(() => !S.textOpaque, v => { S.textOpaque = !v; styleTextBox(); }));
  } else if (tool === 'eraser') {
    add(section(1, [4, 6, 8, 10].map(s => opt(prev(16, 12, x => x.fillRect(8 - (s >> 1), 6 - (s >> 1), s, s)), S.eraser === s, () => { S.eraser = s; }, t('paint-classic.opt.eraser', { n: s })))));
  } else if (tool === 'brush') {
    add(section(3, BRUSHES.map(([shape, size], i) => opt(prev(11, 11, x => {
      const sp = shape === 'circle' ? discSpans(size) : shape === 'square' ? squareSpans(size) : slashSpans(size, shape === 'back');
      stamp(x, 5, 5, sp);
    }), S.brush === i, () => { S.brush = i; }, t(BRUSH_KEYS[shape], { n: size })))));
  } else if (tool === 'airbrush') {
    add(section(1, [4, 8, 12].map(r => opt(prev(30, 26, x => {
      let seed = r * 99;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < r * 5; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * r; x.fillRect(Math.round(15 + Math.cos(a) * d), Math.round(13 + Math.sin(a) * d), 1, 1); }
    }), S.air === r, () => { S.air = r; }, t('paint-classic.opt.airbrush', { n: r })))));
  } else if (tool === 'zoom') {
    add(section(1, [1, 2, 4, 6, 8].map(z => opt(z + 'x', z === 1 ? S.zoom === 1 : S.zoom === z || (S.zoom === 1 && S.magZoom === z && false), () => {
      S.magZoom = z === 1 ? S.magZoom : z;
      setZoom(z); setTool(S.prevTool);
    }, t('paint-classic.opt.zoom', { pct: String(z * 100) })))));
  } else if (tool === 'line' || tool === 'curve') {
    add(lineWidthSection());
  } else if (['rect', 'poly', 'ellipse', 'rrect'].includes(tool)) {
    add(section(1, [0, 1, 2].map(m => opt(prev(34, 13, x => {
      if (m === 1) { x.fillStyle = '#808080'; x.fillRect(5, 3, 24, 7); }
      if (m === 2) { x.fillStyle = '#808080'; x.fillRect(4, 2, 26, 9); return; }
      x.fillStyle = '#000'; x.fillRect(4, 2, 26, 1); x.fillRect(4, 10, 26, 1); x.fillRect(4, 2, 1, 9); x.fillRect(29, 2, 1, 9);
    }, false), S.fillMode === m, () => { S.fillMode = m; }, t(['paint-classic.opt.outline', 'paint-classic.opt.outline_fill', 'paint-classic.opt.fill'][m])))));
    add(lineWidthSection());
  } else if (tool === 'slop') {
    add(section(1, [8, 14, 22].map(s => opt(prev(34, 26, x => {
      x.fillStyle = SLOP_PAL.shadow; stamp(x, 18, 12, discSpans(s));
      x.fillStyle = SLOP_PAL.body; stamp(x, 17, 10, discSpans(s));
      x.fillRect(17 - (s >> 3), 10, Math.max(2, s >> 3), Math.min(15, s));
      x.fillStyle = SLOP_PAL.shine; stamp(x, 17 - Math.round(s * 0.2), 10 - Math.round(s * 0.2), discSpans(Math.max(2, Math.round(s * 0.26))));
    }, false), S.slop === s, () => { S.slop = s; }, t('paint-classic.opt.slop', { n: s })))));
  } else if (tool === 'stamp') {
    add(section(2, EMOJIS.map(em => { const b = opt(em, S.emoji === em, () => { S.emoji = em; }, t('paint-classic.opt.stamp', { emoji: em })); b.classList.remove('txt'); b.classList.add('emo'); return b; })));
    add(section(1, [[24, 'S'], [40, 'M'], [64, 'L']].map(([s, l]) => opt(l, S.emojiSize === s, () => { S.emojiSize = s; }, t('paint-classic.opt.stamp_size', { n: s })))));
  }
}

Object.assign(P, { buildTools, finishPending, labelTools, renderOptions, setTool });
})();
