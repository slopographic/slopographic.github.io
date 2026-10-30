/* PhotoSlop UI: docked panels and the Layers panel */
'use strict';

/* ---------- panels ---------- */
/** A docked panel; title is the key of its name (photoslop.panel.*), so a language change relabels it (apply()). */
function panel(id, title, body, extra) {
  // Every panel starts collapsed except Layers. A saved choice (per panel, in localStorage) wins.
  const collapsed = store.get('collapsed.' + id, id !== 'layers');
  const p = h('section', { class: 'panel' + (collapsed ? ' collapsed' : ''), id: 'panel-' + id },
    h('button', { class: 'panel-head', type: 'button', 'aria-expanded': String(!collapsed) }, h('span', { 'data-i18n': title }, tr(title)), extra || null), h('div', { class: 'panel-body' }, body));
  p.firstChild.addEventListener('click', (e) => { if (e.target.closest('.panel-extra')) return; setPanelCollapsed(p, !p.classList.contains('collapsed')); });
  ctxTarget(p.firstChild, 'panel', () => panelItems(p));
  return p;
}
/** Collapse or expand a docked panel (remembered per panel). */
function setPanelCollapsed(p, on) {
  p.classList.toggle('collapsed', on); p.firstChild.setAttribute('aria-expanded', String(!on));
  store.set('collapsed.' + p.id.slice('panel-'.length), on);
}
function buildPanels() {
  const side = $('#panels');
  // Colour
  const cp = colorPicker(() => C.fg, (v) => setColor('fg', v));
  listeners.add((w) => { if (w === 'color') cp.sync(); });
  side.append(panel('color', 'photoslop.panel.color', cp.el));
  // Swatches
  const sw = h('div', { class: 'swatch-grid' });
  const renderSw = () => {
    sw.textContent = '';
    const custom = store.get('swatches', []);
    const base = ['#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#7f00ff', '#d4ff3a', '#9fcc00', '#3d5200', '#1f2a00', '#e6ff8c', '#ff6f8e', '#ffb3c7', '#f1ede4', '#0a0a0a', '#1e90ff', '#ffd23f', '#8b4513'];
    for (const c of base.concat(custom)) {
      const b = h('button', { type: 'button', class: 'swatch', title: tr('photoslop.panel.swatch_tip', { c }), 'aria-label': tr('photoslop.panel.swatch', { c }) });
      b.style.background = c;
      b.addEventListener('click', (e) => setColor(e.altKey ? 'bg' : 'fg', c));
      ctxTarget(b, 'swatch', () => swatchItems(c, custom.includes(c)));
      sw.append(b);
    }
    const addB = h('button', { type: 'button', class: 'swatch add', title: tr('photoslop.panel.add_swatch_tip'), 'aria-label': tr('photoslop.panel.add_swatch') }, '+'); // i18n-ignore: ids, key names, CSS
    addB.addEventListener('click', () => { const cs = store.get('swatches', []); if (!cs.includes(C.fg)) { cs.push(C.fg); store.set('swatches', cs.slice(-40)); renderSw(); } });
    sw.append(addB);
  };
  renderSw();
  listeners.add((w) => { if (w === 'swatches') renderSw(); });
  side.append(panel('swatches', 'photoslop.panel.swatches', sw));
  side.append(panel('brushes', 'photoslop.panel.brushes', buildBrushesPanel()));
  side.append(panel('character', 'photoslop.panel.character', buildCharPanel()));
  side.append(panel('watermark', 'photoslop.panel.watermark', buildWatermarkPanel()));
  // Layers
  side.append(panel('layers', 'photoslop.panel.layers', buildLayersPanel()));
  // History
  const hist = h('ol', { class: 'history', 'aria-label': tr('photoslop.panel.history_states'), 'data-i18n-attr': 'aria-label:photoslop.panel.history_states' });
  const renderHist = () => {
    hist.textContent = '';
    Hist.states.forEach((s, i) => {
      const li = h('li', { class: (i === Hist.idx ? 'cur' : '') + (i > Hist.idx ? ' future' : '') }, h('button', { type: 'button' }, s.label));
      li.firstChild.addEventListener('click', () => jumpHistory(i));
      hist.append(li);
    });
    const cur = hist.querySelector('.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  };
  listeners.add((w) => { if (w === 'history') renderHist(); });
  side.append(panel('history', 'photoslop.panel.history', hist));
  onLang(() => { renderSw(); renderHist(); });
}
function layerThumb(L) {
  const k = Math.min(40 / D.w, 30 / D.h), w = Math.max(1, Math.round(D.w * k)), hh = Math.max(1, Math.round(D.h * k));
  const t = mkCanvas(w, hh), g = cx(t);
  g.imageSmoothingQuality = 'high';
  g.drawImage(L.canvas, L.x * k, L.y * k, L.canvas.width * k, L.canvas.height * k);
  return t;
}
function maskThumb(L) {
  const k = Math.min(40 / D.w, 30 / D.h), w = Math.max(1, Math.round(D.w * k)), hh = Math.max(1, Math.round(D.h * k));
  const t = mkCanvas(w, hh), g = cx(t), m = L.mask;
  g.fillStyle = '#000'; g.fillRect(0, 0, w, hh);
  if (!m.def) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.fillStyle = '#000'; g.fillRect(m.x * k, m.y * k, m.canvas.width * k, m.canvas.height * k); }
  const white = mkCanvas(m.canvas.width, m.canvas.height), wg = cx(white); wg.drawImage(m.canvas, 0, 0); wg.globalCompositeOperation = 'source-in'; wg.fillStyle = '#fff'; wg.fillRect(0, 0, white.width, white.height);
  g.drawImage(white, m.x * k, m.y * k, m.canvas.width * k, m.canvas.height * k);
  return t;
}
const thumbs = new WeakMap();
function cachedThumb(L, mask) {
  const src = mask ? L.mask.canvas : L.canvas, key = src;
  const e = thumbs.get(key);
  const sig = `${D.w}x${D.h}|${mask ? L.mask.x + ',' + L.mask.y + ',' + L.mask.def : L.x + ',' + L.y}`;
  if (e && e.sig === sig) return e.c;
  const c = mask ? maskThumb(L) : layerThumb(L);
  thumbs.set(key, { sig, c });
  return c;
}
function buildLayersPanel() {
  const P = (k) => 'photoslop.panel.' + k, A = (k) => 'aria-label:' + P(k);
  const blend = h('select', { class: 'lp-blend', 'aria-label': tr(P('blend')), 'data-i18n-attr': A('blend') }, BLENDS.map((b) => h('option', { value: b[0] }, b[1])));
  const op = h('input', { type: 'range', min: 0, max: 100, class: 'lp-op', 'aria-label': tr(P('opacity_layer')), 'data-i18n-attr': A('opacity_layer') });
  const opN = h('input', { type: 'number', min: 0, max: 100, class: 'opt-num', 'aria-label': tr(P('opacity_pct')), 'data-i18n-attr': A('opacity_pct') });
  const list = h('ul', { class: 'layers', role: 'listbox', 'aria-label': tr(P('layers')), 'data-i18n-attr': A('layers') });
  // title is a key: the button follows a language change through apply()
  const btn = (key, d, fn) => { const title = tr(P(key)); const b = h('button', { type: 'button', class: 'lp-btn', title, 'aria-label': title, 'data-i18n-attr': 'title:' + P(key) + ';' + A(key), html: `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>` }); b.addEventListener('click', fn); return b; };
  const fx = btn('layer_style', 'M5 19c3 0 3-14 6-14M4 10h8M14 9l6 8M20 9l-6 8', (e) => { const r = e.currentTarget.getBoundingClientRect(); closeMenus(); const m = renderMenu(filterMenu('style'), r.left, r.top, 0); m.style.top = Math.max(0, r.top - m.getBoundingClientRect().height) + 'px'; openMenu = { btn: e.currentTarget, m }; });
  const foot = h('div', { class: 'lp-foot' },
    btn('lock', 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', () => { const L = activeLayer(); setLayerProps(L.id, { locked: !L.locked }, tr(P(L.locked ? 'step_unlock' : 'step_lock'))); }),
    fx,
    btn('add_mask', 'M3 5h18v14H3zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', (e) => { if (hasMask()) { UI.editMask = !UI.editMask; emit('doc'); return; } const r = e.currentTarget.getBoundingClientRect(); showContextMenu(maskAddItems(), r.left, r.top); }),
    btn('merge_down', 'M12 4v12M7 11l5 5 5-5M5 20h14', () => mergeDown()),
    btn('duplicate', 'M8 8h12v12H8zM4 16V4h12', () => duplicateLayer()),
    btn('new_layer', 'M4 4h16v16H4zM12 8v8M8 12h8', () => addLayer()),
    btn('delete_layer', 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', () => deleteLayer()));
  blend.addEventListener('change', () => setLayerProps(D.activeId, { blend: blend.value }, tr(P('step_blend'))));
  op.addEventListener('input', () => { patchLayer(D.activeId, { opacity: op.value / 100 }); opN.value = op.value; emit('doc'); });
  op.addEventListener('change', () => commit(tr(P('step_opacity'))));
  opN.addEventListener('change', () => { setLayerProps(D.activeId, { opacity: clamp(+opN.value, 0, 100) / 100 }, tr(P('step_opacity'))); });
  let dragId = null;
  const render = () => {
    const L0 = activeLayer();
    if (L0) { blend.value = L0.blend; if (document.activeElement !== op) op.value = Math.round(L0.opacity * 100); if (document.activeElement !== opN) opN.value = Math.round(L0.opacity * 100); }
    list.textContent = '';
    for (let i = D.layers.length - 1; i >= 0; i--) {
      const L = D.layers[i];
      const eye = h('button', { type: 'button', class: 'lp-eye' + (L.visible ? ' on' : ''), title: tr(P(L.visible ? 'hide' : 'show')), 'aria-label': tr(P(L.visible ? 'hide_named' : 'show_named'), { name: L.name }), html: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>' });
      eye.addEventListener('click', (e) => { e.stopPropagation(); if (e.altKey) { const solo = D.layers.every((l) => l === L || !l.visible); D.layers = D.layers.map((l) => Object.assign({}, l, { visible: solo ? true : l.id === L.id })); commit(tr(P('step_show_hide'))); } else setLayerProps(L.id, { visible: !L.visible }, tr(L.visible ? 'photoslop.ctx.hide_layer' : 'photoslop.ctx.show_layer')); });
      // the target of painting (pixels or mask) has the accent frame; aria-current says it to a screen reader
      const tgt = (m) => L.id === D.activeId && UI.editMask === m, cur = (m) => (tgt(m) ? { 'aria-current': 'true' } : {});
      const th = h('span', Object.assign({ class: 'lp-thumb' + (tgt(false) ? ' target' : ''), title: tr(P(tgt(false) ? 'editing_pixels' : 'edit_pixels')) }, cur(false)), cachedThumb(L, false));
      th.addEventListener('click', () => { D.activeId = L.id; UI.editMask = false; emit('doc'); emit('tool'); });
      th.addEventListener('dblclick', (e) => { e.stopPropagation(); if (L.text) editTypeLayer(L); else openLayerStyle(L.id); });
      const row = h('li', { class: 'layer' + (L.id === D.activeId ? ' active' : ''), role: 'option', 'aria-selected': String(L.id === D.activeId), draggable: 'true', 'data-id': L.id }, eye, th);
      if (L.mask) {
        const mt = h('span', Object.assign({ class: 'lp-thumb mask' + (tgt(true) ? ' target' : '') + (L.mask.enabled === false ? ' off' : ''), title: tr(P(tgt(true) ? 'editing_mask' : 'edit_mask')) }, cur(true)), cachedThumb(L, true));
        mt.addEventListener('click', (e) => { e.stopPropagation(); if (e.shiftKey) { setLayerProps(L.id, { mask: Object.assign({}, L.mask, { enabled: L.mask.enabled === false }) }, tr(P('step_toggle_mask'))); return; } if (e.altKey) { toggleMaskOverlay(L.id); return; } const was = tgt(true); D.activeId = L.id; UI.editMask = true; UI.maskOverlay = false; emit('doc'); emit('tool'); dirty(); if (!was) toast(tr(P('mask_toast'))); });
        row.append(mt);
      }
      const name = h('span', { class: 'lp-name' }, L.text ? h('b', { class: 'lp-t' }, 'T') : null, L.name);
      name.addEventListener('dblclick', (e) => { e.stopPropagation(); renameInline(name, L); });
      row.append(name);
      const xf = h('button', { type: 'button', class: 'lp-xf', title: tr(P('free_transform_tip')), 'aria-label': tr(P('free_transform_named'), { name: L.name }), html: '<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6zM2 2h3v3H2zM19 2h3v3h-3zM2 19h3v3H2zM19 19h3v3h-3zM12 2v4"/></svg>' });
      xf.addEventListener('click', (e) => { e.stopPropagation(); activateLayer(L); startTransform(); });
      row.append(xf);
      if (L.clip) row.append(h('span', { class: 'lp-meta lp-clip', title: tr(P('clipped_tip')) }, tr(P('clipped'))));
      if (L.locked) row.append(h('span', { class: 'lp-lock', title: tr(P('locked')), html: '<svg viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z"/></svg>' }));
      if (L.blend !== 'normal' || L.opacity < 1) row.append(h('span', { class: 'lp-meta' }, (L.blend !== 'normal' ? BLENDS.find((b) => b[0] === L.blend)[1] : '') + (L.opacity < 1 ? ` ${Math.round(L.opacity * 100)}%` : '')));
      // Double-click on the row (not the name, which renames, or the thumbnail) opens the Layer Style dialog, or edits a type layer.
      row.addEventListener('dblclick', (e) => { if (L.text) editTypeLayer(L); else openLayerStyle(L.id); });
      row.addEventListener('click', (e) => { if (e.altKey) { toggleClippingAt(L.id); return; } if (D.activeId !== L.id) { D.activeId = L.id; UI.editMask = false; emit('doc'); emit('tool'); } });
      ctxTarget(row, L.text ? 'text' : 'layer', () => (L.text ? textItems(L) : layerItems(L)));
      row.addEventListener('dragstart', (e) => { dragId = L.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(L.id)); row.classList.add('dragging'); });
      row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); $$('.layer', list).forEach((r) => r.classList.remove('drop-above', 'drop-below')); });
      row.addEventListener('dragover', (e) => { if (dragId == null) return; e.preventDefault(); const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2; row.classList.toggle('drop-above', above); row.classList.toggle('drop-below', !above); });
      row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
      row.addEventListener('drop', (e) => { // intake-ok: a layer row dragged to a new place (no files)
        e.preventDefault(); if (dragId == null) return;
        const r = row.getBoundingClientRect(), above = e.clientY < r.top + r.height / 2;
        const from = layerIndex(dragId); let to = layerIndex(L.id) + (above ? 1 : 0);
        if (from < to) to--;
        moveLayer(dragId, to);
      });
      list.append(row);
      for (const fr of fxRows(L)) list.append(fr);
    }
  };
  listeners.add((w) => { if (w === 'doc') render(); });
  // a language change: the blend mode names (BLENDS reads the language) and the rows
  onLang(() => { blend.replaceChildren(...BLENDS.map((b) => h('option', { value: b[0] }, b[1]))); render(); });
  render();
  return h('div', { class: 'lp' }, h('div', { class: 'lp-top' }, blend, h('label', { class: 'lp-opl' }, h('span', { 'data-i18n': P('opacity') }, tr(P('opacity'))), op, opN)), list, foot);
}
/** Remove a custom swatch and redraw the swatch grid. */
function removeSwatch(c) { store.set('swatches', store.get('swatches', []).filter((x) => x !== c)); emit('swatches'); }
function renameInline(el, L) {
  const inp = h('input', { class: 'lp-rename', value: L.name, 'aria-label': tr('photoslop.panel.layer_name') });
  el.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = (ok) => { if (done) return; done = true; if (ok && inp.value.trim() && inp.value !== L.name) setLayerProps(L.id, { name: inp.value.trim() }, tr('photoslop.panel.step_rename')); else emit('doc'); };
  inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
}
/** Adds a mask to the active layer: kind is reveal, hide, or sel (from the selection). One undo step. */
function addMask(kind) {
  if (kind === 'sel' && !D.sel) { toast(tr('photoslop.panel.select_first')); return; }
  const L = coverDoc(activeLayer());
  patchLayer(L.id, { mask: SlopMask.make(D.w, D.h, kind, kind === 'sel' ? D.sel.mask : null) });
  if (kind === 'sel') D.sel = null;
  UI.editMask = true;
  commit(tr('photoslop.panel.step_add_mask'));
}
function applyMask() {
  const L = activeLayer(); const b = bakedLayer(L);
  UI.editMask = false;
  setLayerProps(L.id, { canvas: b.canvas, x: b.x, y: b.y, mask: null }, tr('photoslop.panel.step_apply_mask'));
}
function layerViaCopy(cut) {
  const L = activeLayer(); if (!L) return;
  const r = D.sel ? copySelectionPixels(false) : null;
  if (!r) { duplicateLayer(); return; }
  if (cut) clearSelectionPixels(tr('photoslop.panel.step_cut'));
  const c = mkCanvas(D.w, D.h); cx(c).drawImage(r.canvas, r.x, r.y);
  addLayer({ name: nextName('photoslop.layer.default'), canvas: c }, tr(cut ? 'photoslop.panel.step_via_cut' : 'photoslop.panel.step_via_copy'));
}
