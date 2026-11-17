/* PhotoSlop UI: filter dialogs with live preview, curves */
'use strict';

/* ---------- filters ---------- */
const LAST_FILTER = { id: null, params: null };
async function runFilter(id, presetParams) {
  const f = FILTER_BY_ID[id];
  let L = activeLayer();
  if (!L) return;
  if (L.locked) { toast(tr('photoslop.layer.locked')); return; }
  if (!L.visible) { toast(tr('photoslop.filter.show_layer_first')); return; }
  if (TE.el) await endTypeEdit();
  if (TRANSFORM.active) commitTransform();
  L = activeLayer();
  const wasText = !!L.text; // rasterized only if the filter is actually applied
  if (f.cover) L = coverDoc(L);
  const env = { fg: C.fg, bg: C.bg };
  const base = L.canvas;
  // Analysing filters (Auto Enhance) give the dialog their values from the layer; others use their list.
  const plist = f.plist ? f.plist(base) : (f.params || null);
  const finish = async (params) => {
    document.body.classList.add('busy');
    await new Promise((r) => setTimeout(r, 20));
    try {
      const out = await f.fn(base, params, env);
      const LL = D.layers.find((l) => l.id === L.id);
      live = null;
      patchLayer(L.id, { canvas: D.sel ? mixBySel(LL.canvas, out, selInLayer(LL)) : out, text: null });
      commit(f.name.replace('…', ''));
      if (wasText) toast(tr('photoslop.filter.type_rasterized'));
      LAST_FILTER.id = id; LAST_FILTER.params = params;
      if (window.SlopMacros) SlopMacros.note('ps.ai.filter', { filter: id, params: JSON.stringify(params) }, f.name.replace('…', ''));   // a macro step (app/macros.js)
    } catch (e) { console.warn(e); toast(tr('photoslop.filter.failed', { error: e.message })); live = null; dirty(true); }
    document.body.classList.remove('busy');
  };
  if (!plist || presetParams) { await finish(presetParams || {}); return; }
  const params = {}, autoVals = {};
  for (const p of plist) if (p.k) autoVals[p.k] = p.v;
  for (const p of plist) if (p.k) params[p.k] = p.v === '@fg' ? C.fg : p.v === '@bg' ? C.bg : JSON.parse(JSON.stringify(p.v === undefined ? null : p.v));
  if (LAST_FILTER.id === id && LAST_FILTER.params) Object.assign(params, JSON.parse(JSON.stringify(LAST_FILTER.params)));
  let preview = true, token = 0, pending = false, lastOut = null;
  const status = h('span', { class: 'dlg-status' });
  const runPreview = async () => {
    if (pending) return; pending = true;
    await new Promise((r) => requestAnimationFrame(r));
    pending = false;
    const my = ++token;
    if (!preview) { live = null; dirty(true); return; }
    status.textContent = tr('photoslop.filter.rendering');
    await new Promise((r) => setTimeout(r, 0));
    let out;
    try { out = await f.fn(base, params, env); } catch (e) { status.textContent = e.message; return; }
    if (my !== token) return;
    lastOut = { out, key: JSON.stringify(params) };
    const mixed = D.sel ? mixBySel(base, out, selInLayer(L)) : out;
    live = { layerId: L.id, surface: (LL) => ({ canvas: mixed, x: L.x, y: L.y }) };
    status.textContent = '';
    dirty(true);
  };
  const body = h('div', { class: 'fparams' });
  for (const p of plist) body.append(paramControl(p, params, base, runPreview));
  const pv = h('input', { type: 'checkbox', checked: true });
  pv.addEventListener('change', () => { preview = pv.checked; runPreview(); });
  body.append(h('div', { class: 'dlg-row' }, h('label', { class: 'opt-check' }, pv, h('span', null, tr('photoslop.filter.preview'))), status));
  // Reset to auto: restores the analysed values and refreshes the sliders (the dialog stays open).
  const reset = () => {
    for (const p of plist) {
      if (!p.k || p.type === 'histogram' || p.type === 'curve' || p.type === 'color') continue;
      params[p.k] = autoVals[p.k];
      for (const el of body.querySelectorAll(`[aria-label="${p.label}"]`)) { if (el.type === 'checkbox') el.checked = !!params[p.k]; else el.value = params[p.k]; }
    }
    runPreview();
    return false;
  };
  const buttons = [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true }];
  if (f.auto) buttons.splice(1, 0, { label: tr('photoslop.filter.reset_auto'), act: reset });
  dialog({ title: f.name.replace('…', ''), body, cls: 'dlg-filter' + (plist.some((p) => p.type === 'curve') ? ' dlg-curve' : ''),
    buttons,
    onClose: async (ok) => {
      token++;
      if (!ok) { live = null; dirty(true); return; }
      if (lastOut && lastOut.key === JSON.stringify(params) && preview) {
        live = null;
        const LL = D.layers.find((l) => l.id === L.id);
        patchLayer(L.id, { canvas: D.sel ? mixBySel(LL.canvas, lastOut.out, selInLayer(LL)) : lastOut.out, text: null });
        if (wasText) toast(tr('photoslop.filter.type_rasterized'));
        commit(f.name.replace('…', '')); LAST_FILTER.id = id; LAST_FILTER.params = JSON.parse(JSON.stringify(params));
      } else { await finish(params); LAST_FILTER.params = JSON.parse(JSON.stringify(params)); }
    } });
  runPreview();
}
function paramControl(p, params, base, changed) {
  if (p.type === 'range') {
    const r = h('input', { type: 'range', min: p.min, max: p.max, step: p.step || 1, value: params[p.k], 'aria-label': p.label });
    const n = h('input', { type: 'number', min: p.min, max: p.max, step: p.step || 1, value: params[p.k], class: 'opt-num', 'aria-label': p.label });
    // A slider always updates its number box; the box is only left alone while the person types in it.
    const set = (v, fromNumber) => { v = clamp(+v, p.min, p.max); params[p.k] = v; r.value = v; if (!fromNumber) n.value = v; changed(); };
    r.addEventListener('input', () => set(r.value)); n.addEventListener('change', () => set(n.value, true));
    return h('div', { class: 'fp fp-range' }, h('div', { class: 'fp-l' }, h('span', null, p.label), h('span', { class: 'fp-n' }, n, p.unit ? h('span', { class: 'fp-u' }, p.unit) : null)), r);
  }
  if (p.type === 'check') { const c = h('input', { type: 'checkbox', checked: !!params[p.k], 'aria-label': p.label }); c.addEventListener('change', () => { params[p.k] = c.checked; changed(); }); return h('label', { class: 'fp opt-check' }, c, h('span', null, p.label)); }
  if (p.type === 'select') { const s = h('select', null, p.options.map(([v, l]) => h('option', { value: v, selected: params[p.k] === v }, l))); s.addEventListener('change', () => { params[p.k] = s.value; changed(); }); return h('label', { class: 'fp fp-sel' }, h('span', null, p.label), s); }
  if (p.type === 'color') {
    const b = h('button', { type: 'button', class: 'fp-color', 'aria-label': p.label }); b.style.background = params[p.k];
    b.addEventListener('click', async () => { const c = await pickColorDialog(p.label, params[p.k]); if (c) { params[p.k] = c; b.style.background = c; changed(); } });
    return h('div', { class: 'fp fp-sel' }, h('span', null, p.label), b);
  }
  if (p.type === 'histogram') {
    const c = h('canvas', { class: 'fp-hist', width: 256, height: 90 }), H = histogram(base), g = c.getContext('2d');
    let mx = 1; for (let i = 0; i < 256; i++) mx = Math.max(mx, H.l[i]);
    g.fillStyle = getComputedStyle(document.body).getPropertyValue('--fg') || '#ddd';
    for (let i = 0; i < 256; i++) { const v = Math.sqrt(H.l[i] / mx) * 88; g.fillRect(i, 90 - v, 1, v); }
    return h('div', { class: 'fp' }, c);
  }
  if (p.type === 'curve') return curveEditor(params[p.k], base, changed);
  return h('div');
}
function curveEditor(curves, base, changed) {
  const S = 256, c = h('canvas', { class: 'fp-curve', 'data-touch-surface': '', width: S, height: S, 'aria-label': tr('photoslop.filter.curve_label') });
  let ch = 'rgb', drag = -1;
  const sel = h('select', { 'aria-label': tr('photoslop.filter.channel') }, [['rgb', 'RGB'], ['r', tr('photoslop.filter.red')], ['g', tr('photoslop.filter.green')], ['b', tr('photoslop.filter.blue')]].map(([v, l]) => h('option', { value: v }, l)));
  sel.addEventListener('change', () => { ch = sel.value; draw(); });
  const H = histogram(base);
  function draw() {
    const g = c.getContext('2d');
    g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, S, S);
    const hist = ch === 'rgb' ? H.l : H[ch]; let mx = 1; for (const v of hist) mx = Math.max(mx, v);
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 256; i++) { const v = Math.sqrt(hist[i] / mx) * S; g.fillRect(i, S - v, 1, v); }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); for (let i = 1; i < 4; i++) { g.moveTo((i * S) / 4, 0); g.lineTo((i * S) / 4, S); g.moveTo(0, (i * S) / 4); g.lineTo(S, (i * S) / 4); } g.moveTo(0, S); g.lineTo(S, 0); g.stroke();
    const lut = curveLut(curves[ch]);
    g.strokeStyle = { rgb: '#eee', r: '#ff5a5a', g: '#4cff7a', b: '#5aa0ff' }[ch]; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < 256; x++) { const y = S - lut[x]; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    for (const [x, y] of curves[ch]) { g.fillStyle = '#fff'; g.fillRect(x - 3.5, S - y - 3.5, 7, 7); }
  }
  const pt = (e) => { const r = c.getBoundingClientRect(); return [clamp(Math.round(((e.clientX - r.left) / r.width) * 255), 0, 255), clamp(Math.round((1 - (e.clientY - r.top) / r.height) * 255), 0, 255), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  c.addEventListener('pointerdown', (e) => {
    const [x, y] = pt(e), pts = curves[ch];
    const tol = Math.max(10, (e.pointerType === 'touch' ? 22 : e.pointerType === 'pen' ? 12 : 0) * 255 / (c.getBoundingClientRect().width || 255)); // a finger's grab
    drag = pts.findIndex(([px, py]) => Math.abs(px - x) < tol && Math.abs(py - y) < tol);
    if (drag < 0) { pts.push([x, y]); pts.sort((a, b) => a[0] - b[0]); drag = pts.findIndex((p) => p[0] === x && p[1] === y); }
    c.setPointerCapture(e.pointerId); draw(); changed();
  });
  c.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const [x, y, fx, fy] = pt(e), pts = curves[ch];
    if ((fx < -0.08 || fx > 1.08 || fy < -0.08 || fy > 1.08) && pts.length > 2) { pts.splice(drag, 1); drag = -1; draw(); changed(); return; }
    const lo = drag > 0 ? pts[drag - 1][0] + 1 : 0, hi = drag < pts.length - 1 ? pts[drag + 1][0] - 1 : 255;
    pts[drag] = [clamp(x, lo, hi), y]; draw(); changed();
  });
  c.addEventListener('pointerup', () => { drag = -1; });
  const reset = h('button', { type: 'button', class: 'btn' }, tr('photoslop.filter.reset_channel'));
  reset.addEventListener('click', () => { curves[ch] = [[0, 0], [255, 255]]; draw(); changed(); });
  const presets = h('select', { 'aria-label': tr('photoslop.filter.preset') }, [['', 'preset_pick'], ['contrast', 'curve_contrast'], ['film', 'curve_film'], ['negative', 'curve_negative'], ['lighter', 'curve_lighter'], ['darker', 'curve_darker']].map(([v, k]) => h('option', { value: v }, tr('photoslop.filter.' + k))));
  presets.addEventListener('change', () => {
    const P = { contrast: [[0, 0], [64, 48], [192, 208], [255, 255]], film: [[0, 38], [128, 130], [255, 232]], negative: [[0, 255], [255, 0]], lighter: [[0, 0], [128, 160], [255, 255]], darker: [[0, 0], [128, 96], [255, 255]] }[presets.value];
    if (P) { curves.rgb = P.map((p) => p.slice()); ch = 'rgb'; sel.value = 'rgb'; draw(); changed(); }
    presets.value = '';
  });
  draw();
  return h('div', { class: 'fp fp-curvebox' }, h('div', { class: 'dlg-row' }, sel, presets, reset), c, h('p', { class: 'fp-help' }, tr('photoslop.filter.curve_help')));
}
