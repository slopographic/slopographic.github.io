/* Slop Font: the Kerning view. Pick a pair (type the two letters, click between two letters of the sample, or pick one
 * from the list), move the slider or type a value (font units; negative brings them closer) and see the sample line
 * change as you go. The sample is drawn from the project's own outlines, so it shows the kerning before any export.
 * Classic script. FC.kerning: mount(host), paint(), setPair(a, b), pair() → [a, b] ids, render(canvas, text, size). */
(function (g) {
  'use strict';
  const S = () => g.FC.state, F = () => g.SlopFont, M = () => g.SlopFont.model, t = (k, v) => g.FC.t(k, v);
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); n.append(...kids); return n; };
  let host = null, parts = {}, pair = ['u0041', 'u0056'], boxes = [];

  /** Lays out a text with the project's glyphs and kerning: [{ glyph, x, kern }] and the total width (font units). */
  function layout(text) {
    const p = S().project(), out = [];
    let x = 0, prev = null;
    for (const ch of String(text || '')) {
      const gl = p.glyphs.find((q) => q.unicode === ch.codePointAt(0)) || p.glyphs[0];
      const k = prev ? M().kern(p, prev.id, gl.id) : 0;
      x += k;
      out.push({ glyph: gl, x, kern: k, prev: prev && prev.id });
      x += gl.advance; prev = gl;
    }
    return { items: out, width: x };
  }
  function render(canvas, text, size) {
    const p = S().project(), m = p.metrics, dpr = g.devicePixelRatio || 1;
    const lay = layout(text), z = size / m.upm, pad = 16;
    const w = Math.max(canvas.parentElement ? canvas.parentElement.clientWidth : 300, lay.width * z + pad * 2), h = (m.ascender - m.descender) * z + pad * 2;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d'), C = g.FC.editorDraw.colors(canvas);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, w, h);
    const base = pad + m.ascender * z;
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(w, base + 0.5); ctx.stroke();
    boxes = [];
    for (const it of lay.items) {
      const ox = pad + it.x * z, on = it.prev === pair[0] && it.glyph.id === pair[1];
      if (on) { ctx.fillStyle = C.box; ctx.fillRect(ox - it.kern * z - 2, pad, 4 + Math.abs(it.kern * z), h - 2 * pad); ctx.fillStyle = C.accent; ctx.fillRect(ox - 1, pad, 2, h - 2 * pad); }
      if (it.glyph.contours.length) {
        g.FC.editorDraw.trace(ctx, F().paths.orient(it.glyph.contours), { z, ox, oy: base });
        ctx.fillStyle = C.fg; ctx.fill('nonzero');
      }
      boxes.push({ x: ox, w: it.glyph.advance * z, id: it.glyph.id, prev: it.prev });
    }
    return lay;
  }
  function setPair(a, b) {
    const p = S().project(), A = M().find(p, a), B = M().find(p, b);
    if (!A || !B) throw new Error(t('fontcreator.kern.not_in_font', { char: !A ? a : b }));
    pair = [A.id, B.id];
    paint();
    return pair;
  }
  function label(id) { const gl = M().find(S().project(), id); return gl && gl.unicode != null ? F().charset.label(gl.unicode) : id; }
  function setValue(v) { S().edit(t('fontcreator.kern.undo_kern', { pair: label(pair[0]) + label(pair[1]) }), 'meta', (p) => { M().setKern(p, pair[0], pair[1], v); }); }
  function list() {
    const p = S().project(), rows = M().pairs(p).sort((x, y) => (label(x[0]) + label(x[1])).localeCompare(label(y[0]) + label(y[1])));
    parts.count.textContent = rows.length ? t('fontcreator.kern.count', { n: rows.length }) : t('fontcreator.kern.empty');
    parts.list.replaceChildren(...rows.slice(0, 400).map(([a, b, v]) => {
      const pick = el('button', { type: 'button', class: 'sui-btn fc-kern-pair' + (a === pair[0] && b === pair[1] ? ' fc-on' : ''), 'data-pair': a + ' ' + b }, `${label(a)}${label(b)}  ${v > 0 ? '+' : ''}${v}`);
      pick.addEventListener('click', () => setPair(a, b));
      const del = el('button', { type: 'button', class: 'sui-btn fc-kern-del', 'aria-label': t('fontcreator.kern.remove_pair', { pair: label(a) + label(b) }) }, '×');
      del.addEventListener('click', () => S().edit(t('fontcreator.kern.undo_remove'), 'meta', (pp) => { M().setKern(pp, a, b, 0); }));
      return el('li', {}, pick, del);
    }));
  }
  function paint() {
    if (!host || host.hidden) return;
    const p = S().project(), v = M().kern(p, pair[0], pair[1]), lim = Math.round(p.metrics.upm * 0.4);
    if (document.activeElement !== parts.a) parts.a.value = label(pair[0]);
    if (document.activeElement !== parts.b) parts.b.value = label(pair[1]);
    parts.range.min = String(-lim); parts.range.max = String(lim);
    if (document.activeElement !== parts.num) parts.num.value = String(v);
    parts.range.value = String(v);
    if (document.activeElement !== parts.sample) parts.sample.value = S().settings().kernSample;
    render(parts.pairCanvas, label(pair[0]) + label(pair[1]), 120);
    render(parts.canvas, S().settings().kernSample, 64);
    list();
  }
  function mount(el0) {
    host = el0;
    const mk = g.FC.mark, lab = (k) => mk(el('span', { class: 'sf-lab' }), { text: k });
    const a = mk(el('input', { type: 'text', id: 'fc-kern-a', maxlength: '2', autocomplete: 'off', spellcheck: 'false' }), { 'aria-label': 'fontcreator.kern.left_label' });
    const b = mk(el('input', { type: 'text', id: 'fc-kern-b', maxlength: '2', autocomplete: 'off', spellcheck: 'false' }), { 'aria-label': 'fontcreator.kern.right_label' });
    const range = mk(el('input', { type: 'range', id: 'fc-kern-range', step: '1' }), { 'aria-label': 'fontcreator.kern.range_label' });
    const num = mk(el('input', { type: 'number', id: 'fc-kern-value', step: '1' }), { 'aria-label': 'fontcreator.kern.value_label' });
    const sample = mk(el('input', { type: 'text', id: 'fc-kern-sample', autocomplete: 'off' }), { 'aria-label': 'fontcreator.kern.sample_label' });
    const pairCanvas = el('canvas', { id: 'fc-kern-pair-canvas', class: 'fc-kern-canvas', 'aria-hidden': 'true' });
    const canvas = mk(el('canvas', { id: 'fc-kern-canvas', class: 'fc-kern-canvas', role: 'img' }), { 'aria-label': 'fontcreator.kern.canvas_label' });
    const listEl = mk(el('ul', { class: 'fc-kern-list', id: 'fc-kern-list' }), { 'aria-label': 'fontcreator.kern.list_label' }), count = el('p', { class: 'sf-note', id: 'fc-kern-count' });
    parts = { a, b, range, num, sample, canvas, pairCanvas, list: listEl, count };
    const pick = () => { if (a.value && b.value) { try { setPair(a.value, b.value); } catch (e) { g.SlopUI.toast(e.message); } } };
    a.addEventListener('change', pick); b.addEventListener('change', pick);
    range.addEventListener('input', () => { num.value = range.value; render(pairCanvas, label(pair[0]) + label(pair[1]), 120); });
    range.addEventListener('change', () => setValue(Number(range.value)));
    num.addEventListener('change', () => { if (num.value !== '') setValue(Number(num.value)); });
    sample.addEventListener('input', () => { S().settings().kernSample = sample.value; render(canvas, sample.value, 64); });
    sample.addEventListener('change', () => S().set({ kernSample: sample.value.slice(0, 200) }));
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left;
      let best = null;
      for (const bx of boxes) if (bx.prev && (!best || Math.abs(bx.x - x) < Math.abs(best.x - x))) best = bx;
      if (best) setPair(best.prev, best.id);
    });
    host.append(
      el('div', { class: 'fc-kern-head' }, el('label', { class: 'sf-field fc-kern-letter' }, lab('fontcreator.kern.left'), a),
        el('label', { class: 'sf-field fc-kern-letter' }, lab('fontcreator.kern.right'), b),
        el('label', { class: 'sf-field fc-kern-amount' }, lab('fontcreator.kern.amount'), el('span', { class: 'fc-kern-ctl' }, range, num))),
      el('div', { class: 'fc-kern-view' }, pairCanvas),
      el('label', { class: 'sf-field' }, lab('fontcreator.kern.sample'), sample),
      el('div', { class: 'fc-kern-view' }, canvas), count, listEl);
    S().on((e) => { if (e.what !== 'select') paint(); });
    g.FC.onLang(paint);   // the count and the list (the labels: data-i18n)
  }
  g.FC.kerning = { mount, paint, setPair, pair: () => pair.slice(), render, layout };
})(window);
