/* PhotoSlop UI: right-click and keyboard (Menu key, Shift+F10) context menus.
 * A target element is marked with ctxTarget(el, kind, build): data-ctx="<kind>" names what it is
 * (canvas, layer, text, swatch, panel, tab, brush) and build(pos) returns its menu items, or null when
 * nothing applies (then no menu opens). Items reuse the menu bar's own items (MENUS, via M()), so the
 * action, enabled state and SlopCmd shortcut match the menus and the command palette. Rendered with SlopUI.menu. */
'use strict';

/** The menu-bar item for a group id and an item's k (menus.js), or null. Context menus reuse it, so nothing is duplicated. */
function M(group, k, over) {
  const entry = MENUS.find(([n]) => n === group);
  const items = entry && (typeof entry[1] === 'function' ? entry[1]() : entry[1]);
  const it = items && items.find((x) => x && x.k === k);
  if (!it) { console.error('context menu: no menu item ' + group + ' › ' + k); return null; }
  return over ? Object.assign({}, it, over) : it;
}
/** Menu-bar items → SlopUI.menu rows: disabled state, dynamic labels and SlopCmd shortcuts. */
function suiItems(items) {
  const rows = items.filter(Boolean).map((it) => {
    if (it === '-') return '-';
    if (it.sub) return { label: it.label, sub: suiItems(it.sub), disabled: !menuEnabled(it) };
    return { label: it.dyn ? it.dyn() : it.label, key: menuKey(it), disabled: !menuEnabled(it), check: !!(it.check && it.check()), act: it.act };
  });
  // no separator at either end or doubled up
  return rows.filter((r, i) => r !== '-' || (i > 0 && rows[i - 1] !== '-' && i < rows.length - 1));
}
function showContextMenu(items, x, y) {
  const rows = suiItems(items);
  if (rows.some((r) => r && r !== '-')) SlopUI.menu(rows, x, y);
}
/** Marks an element as a context-menu target. */
function ctxTarget(el, kind, build) { el.dataset.ctx = kind; el.ctxBuild = build; return el; }
function openContextMenu(host, x, y) {
  const items = host.ctxBuild({ x, y });
  if (items) showContextMenu(items, x, y);
}

/* ---------- right-click ---------- */
document.addEventListener('contextmenu', (e) => {
  const host = e.target.closest && e.target.closest('[data-ctx]');
  if (!host || isTyping(e.target)) return;
  e.preventDefault();
  if (!SlopUI.openDialogs) openContextMenu(host, e.clientX, e.clientY);
});
/* ---------- keyboard: the Menu key or Shift+F10 opens the menu of the focused target ---------- */
document.addEventListener('keydown', (e) => {
  if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || e.defaultPrevented) return; // i18n-ignore: ids, key names, CSS
  if (SlopUI.openDialogs || isTyping(e.target) || (e.target.closest && e.target.closest('.sui-menu'))) return;
  const el = document.activeElement;
  const host = el && el.closest && el.closest('[data-ctx]');
  const onCanvas = !host && (!el || el === document.body);
  const target = host || (onCanvas ? V.el : null);
  if (!target) return;
  const r = target.getBoundingClientRect();
  e.preventDefault();
  if (onCanvas) openContextMenu(target, r.left + r.width / 2, r.top + r.height / 2);
  else openContextMenu(target, r.left + 8, r.bottom);
});

/* ---------- canvas ---------- */
function canvasItems({ x, y }) {
  const items = canvasItemsFor({ x, y }), rc = V.el.getBoundingClientRect();
  // Right-click on the layer's box (idle, handles shown): the box's own item comes first; it is disabled outside a transform
  if (items && !TRANSFORM.active && boxShown() && idleHit({ x: x - rc.left, y: y - rc.top })) return [{ label: tr('photoslop.ctx.restore_aspect'), en: tfCanRestore, act: () => restoreAspect(null) }, '-'].concat(items);
  return items;
}
function canvasItemsFor({ x, y }) {
  const id = TRANSFORM.active ? 'transform' : UI.tool;
  if (BRUSH_OPTS()[id]) { openBrushPicker(x, y, id); return null; }
  if (id === 'redeye') return [{ label: tr('photoslop.ctx.red_eye_removal'), act: () => runFilter('redeye') }, '-', M('Edit', 'undo')]; // i18n-ignore: ids, key names, CSS
  if (id === 'transform') return [
    { label: tr('photoslop.ctx.commit_transform'), key: 'Enter', act: commitTransform }, { label: tr('photoslop.ctx.cancel_transform'), key: 'Escape', act: cancelTransform }, '-',
    { label: tr('photoslop.ctx.flip_h'), act: () => { TRANSFORM.sx *= -1; dirty(true); } }, { label: tr('photoslop.ctx.flip_v'), act: () => { TRANSFORM.sy *= -1; dirty(true); } },
    { label: tr('photoslop.ctx.rotate_cw'), act: () => { TRANSFORM.rot += Math.PI / 2; dirty(true); } }, { label: tr('photoslop.ctx.rotate_ccw'), act: () => { TRANSFORM.rot -= Math.PI / 2; dirty(true); } },
    '-', { label: tr('photoslop.ctx.restore_aspect'), en: tfCanRestore, act: () => restoreAspect(TRANSFORM_TOOL.handleAt(toDoc({ clientX: x, clientY: y }))) },
    { label: tr('photoslop.ctx.reset_transform'), act: () => { Object.assign(TRANSFORM, { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0 }); dirty(true); } }];
  const p = toDoc({ clientX: x, clientY: y });
  const items = [];
  if (id === 'move') {
    const hits = D.layers.filter((L) => { if (!L.visible) return false; const lx = Math.floor(p.x - L.x), ly = Math.floor(p.y - L.y); return lx >= 0 && ly >= 0 && lx < L.canvas.width && ly < L.canvas.height && cxr(L.canvas).getImageData(lx, ly, 1, 1).data[3] > 10; }).reverse();
    if (hits.length) { for (const L of hits) items.push({ label: L.name, check: () => L.id === D.activeId, act: () => { D.activeId = L.id; UI.editMask = false; emit('doc'); } }); items.push('-'); }
  }
  if (D.sel) items.push(M('Select', 'deselect'), M('Select', 'inverse'), M('Select', 'feather'), '-', // i18n-ignore: ids, key names, CSS
    M('Layer', 'layer_via_copy'), M('Layer', 'layer_via_cut'), { label: tr('photoslop.ctx.isolate_subject'), act: () => isolateSubject() }, '-', // i18n-ignore: ids, key names, CSS
    M('Edit', 'fill_with_foreground'), M('Edit', 'stroke_selection'), M('Edit', 'clear'), '-'); // i18n-ignore: ids, key names, CSS
  else if (['marquee', 'ellipse', 'lasso', 'polylasso', 'wand'].includes(id)) items.push(M('Select', 'all'), { label: tr('photoslop.ctx.select_layer_pixels'), act: () => selectLayerPixels(activeLayer()) }, '-'); // i18n-ignore: ids, key names, CSS
  items.push(M('Edit', 'free_transform'), M('Edit', 'undo'), '-', M('Edit', 'copy'), M('Edit', 'copy_merged')); // i18n-ignore: ids, key names, CSS
  // Paste only when this app has a clipboard image (system images still paste with Ctrl+V)
  if (CLIP.canvas) items.push(M('Edit', 'paste')); // i18n-ignore: ids, key names, CSS
  items.push('-', M('Layer', 'new_layer'), M('Layer', 'duplicate_layer')); // i18n-ignore: ids, key names, CSS
  return items;
}
/** Load a layer's pixels as the selection (the menu's Select Pixels). */
function selectLayerPixels(L) { const c = mkCanvas(D.w, D.h); cx(c).drawImage(bakedLayer(L).canvas, L.x, L.y); D.sel = makeSel(c); commit(tr('photoslop.ctx.load_selection')); }

/* ---------- layers and text ---------- */
function activateLayer(L) { if (D.activeId !== L.id) { D.activeId = L.id; UI.editMask = false; emit('doc'); } }
function layerItems(L) {
  activateLayer(L);
  return [M('Edit', 'free_transform'), '-', M('Layer', 'layer_properties'), M('Layer', 'duplicate_layer'), M('Layer', 'delete'), { label: tr('photoslop.ctx.isolate_subject'), act: () => isolateSubject(L.id) }, '-', // i18n-ignore: ids, key names, CSS
    { label: tr('photoslop.ctx.select_pixels'), act: () => selectLayerPixels(L) }, (hasMask() ? M('Layer', 'mask') : { label: tr('photoslop.ctx.add_mask'), sub: maskAddItems() }), M('Layer', 'layer_style'), { label: tr('photoslop.ctx.apply_fx_preset'), act: () => fxPresetPick(L.id) }, { label: tr('photoslop.ctx.save_fx_preset'), act: () => fxPresetSaveDialog(L.id), en: () => !!(L.fx && L.fx.length) },{ label: tr(L.clip ? 'photoslop.ctx.release_clip' : 'photoslop.ctx.create_clip'), act: () => setClipping(L.id, !L.clip) }, '-', // i18n-ignore: ids, key names, CSS
    M('Layer', 'rotate_and_flip'), '-', // i18n-ignore: ids, key names, CSS
    M('Layer', 'lock_unlock_layer'), { label: tr(L.visible ? 'photoslop.ctx.hide_layer' : 'photoslop.ctx.show_layer'), act: () => setLayerProps(L.id, { visible: !L.visible }, tr(L.visible ? 'photoslop.ctx.hide_layer' : 'photoslop.ctx.show_layer')) }, '-', // i18n-ignore: ids, key names, CSS
    M('Layer', 'merge_down'), M('Layer', 'merge_visible'), M('Layer', 'flatten_image')]; // i18n-ignore: ids, key names, CSS
}
function textItems(L) { activateLayer(L); return [M('Layer', 'edit_text'), M('Layer', 'warp_text'), M('Layer', 'rasterize_type'), '-'].concat(layerItems(L)); } // i18n-ignore: ids, key names, CSS

/* ---------- swatches, panels, document tabs ---------- */
function swatchItems(c, custom) {
  return [{ label: tr('photoslop.ctx.edit_colour'), act: () => { setColor('fg', c); editSwatch('fg'); } },
    { label: tr('photoslop.ctx.set_fg'), act: () => setColor('fg', c) }, { label: tr('photoslop.ctx.set_bg'), act: () => setColor('bg', c) },
    custom ? '-' : null, custom ? { label: tr('photoslop.ctx.remove_swatch'), act: () => removeSwatch(c) } : null];
}
function panelItems(p) {
  const all = $$('#panels .panel');
  return [{ label: tr(p.classList.contains('collapsed') ? 'photoslop.ctx.expand_panel' : 'photoslop.ctx.collapse_panel'), act: () => setPanelCollapsed(p, !p.classList.contains('collapsed')) }, '-',
    { label: tr('photoslop.ctx.collapse_all'), act: () => all.forEach((q) => setPanelCollapsed(q, true)) },
    { label: tr('photoslop.ctx.expand_all'), act: () => all.forEach((q) => setPanelCollapsed(q, false)) }];
}
function tabItems(rec) {
  return [M('File', 'close', { act: () => closeDoc(rec) }), { label: tr('photoslop.ctx.close_others'), act: async () => { for (const r of DOCS.filter((d) => d !== rec)) await closeDoc(r); }, en: () => DOCS.length > 1 }, // i18n-ignore: ids, key names, CSS
  ].filter(Boolean);
}
