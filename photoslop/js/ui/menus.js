/* PhotoSlop UI: the menu definitions and shortcut table */
'use strict';

/* ---------- menus ---------- */
/* Menu items have k, the slug of their English label with _ (it names the command id, so it never changes), and an
 * optional t when their text key differs from k. labelMenu(items) gives each item with k a label getter that reads
 * photoslop.menu.<t or k> in the chosen language (photoslop/i18n/<code>/menus.js). Code that finds an item looks for its k. */
function labelMenu(items) {
  for (const it of items) {
    if (!it || it === '-') continue;
    if (it.k && !Object.getOwnPropertyDescriptor(it, 'label')) Object.defineProperty(it, 'label', { get() { return tr('photoslop.menu.' + (this.t || this.k)); }, enumerable: true, configurable: true });
    if (Array.isArray(it.sub)) labelMenu(it.sub);
  }
  return items;
}
/* A filter item's k is the slug of the filter's English name, kept here where it differs from its id (command ids). */
const FILTER_K = Object.fromEntries(('brightness:brightness_contrast huesat:hue_saturation balance:color_balance bw:black_white photofilter:photo_filter ' + // i18n-ignore: command-id slugs
  'gradmap:gradient_map autotone:auto_tone autocontrast:auto_contrast gauss:gaussian_blur boxblur:box_blur motion:motion_blur radial:radial_blur_zoom ' + // i18n-ignore: command-id slugs
  'unsharp:unsharp_mask highpass:high_pass noise:add_noise median:median_despeckle crystal:crystallize halftone:color_halftone edges:find_edges ' + // i18n-ignore: command-id slugs
  'oil:oil_paint pinch:pinch_bulge polar:polar_coordinates_tiny_planet maximum:maximum_dilate minimum:minimum_erode deepfry:deep_fry jpeg:jpeg_crunch ' + // i18n-ignore: command-id slugs
  'chroma:chromatic_aberration redeye:red_eye_removal autoenhance:auto_enhance vhs:vhs_tape slopify:slopify_melt shadow:drop_shadow glow:outer_glow ' + // i18n-ignore: command-id slugs
  'overlay:color_overlay bevel:bevel_emboss inner-shadow:inner_shadow inner-glow:inner_glow gradient:gradient_overlay').split(' ').map((p) => p.split(':'))); // i18n-ignore: command-id slugs
const filterMenu = (group) => FILTERS.filter((f) => f.menu === group || (f.sep === group)).map((f) => (f.sep ? '-' : { k: FILTER_K[f.id] || f.id, get label() { return f.name; }, key: f.key, act: () => (f.menu === 'style' ? addStyleEffect(f.id) : runFilter(f.id)), need: 'layer' }));
function filterSub(name) { return { k: name.toLowerCase(), sub: filterMenu(name) }; }
/* Add layer mask: the same options in the Layer ▸ Mask menu, the layer right-click menu and the Layers panel button. */
const hasMask = () => !!activeLayer() && !!activeLayer().mask;
const maskAddItems = () => labelMenu([
  { k: 'reveal_all', act: () => addMask('reveal'), en: () => !!activeLayer() && !hasMask() },
  { k: 'hide_all', act: () => addMask('hide'), en: () => !!activeLayer() && !hasMask() },
  { k: 'from_selection', act: () => addMask('sel'), en: () => !!activeLayer() && !hasMask() && !!D.sel },
]);
const MENUS = [
  ['File', [
    { k: 'new', key: 'Ctrl+N', alt: ['Alt+Ctrl+N'], act: () => dlgNew() },
    { k: 'open', key: 'Ctrl+O', act: () => openFilePicker(false) },
    { k: 'config', sub: window.SlopConfigDialog ? SlopConfigDialog.menuItems({ app: 'photoslop' }) : [] },
    { k: 'close', key: 'Alt+Ctrl+W', act: () => closeDoc() },
    { k: 'close_others', act: async () => { for (const r of DOCS.filter((d) => d !== CUR)) await closeDoc(r); }, en: () => DOCS.length > 1 },
    { k: 'open_from_slop_drive', act: () => openFromDrive(false) },
    { k: 'place_image_as_layer', key: 'Shift+Ctrl+P', act: () => openFilePicker(true) },
    { k: 'new_from_clipboard', key: 'Alt+Shift+Ctrl+N', act: () => newFromClipboard() },
    '-',
    { k: 'save', key: 'Ctrl+S', act: () => saveDrive() },
    { k: 'download_as_photoshop_psd', act: () => savePSD() },
    { k: 'save_as_openraster_ora', act: () => saveORA() },
    { k: 'export_as', key: 'Alt+Shift+Ctrl+W', act: () => dlgExport() },
    { k: 'quick_export_as_png', key: 'Alt+Shift+Ctrl+S', act: () => quickExport() },
    { k: 'export_layers_as_pngs', act: () => exportLayers() },
    { k: 'send_to', sub: sendToMenu() },
    '-',
    { k: 'download_photoslop_for_offline_use_html', act: () => downloadOfflineApp() },
    { k: 'clear_recovery_data', act: () => clearAutosave() },
  ]],
  ['Edit', [
    { k: 'undo', key: 'Ctrl+Z', act: () => undo(), en: () => Hist.idx > 0, dyn: () => (Hist.idx > 0 ? tr('ui.undo_what', { what: Hist.states[Hist.idx].label }) : tr('ui.undo')) },
    { k: 'redo', key: 'Shift+Ctrl+Z', act: () => redo(), en: () => Hist.idx < Hist.states.length - 1, dyn: () => (Hist.idx < Hist.states.length - 1 ? tr('ui.redo_what', { what: Hist.states[Hist.idx + 1].label }) : tr('ui.redo')) },
    '-',
    { k: 'cut', key: 'Ctrl+X', act: () => cutSel(), need: 'layer' },
    { k: 'copy', key: 'Ctrl+C', act: () => copySel(false), need: 'layer' },
    { k: 'copy_merged', key: 'Shift+Ctrl+C', act: () => copySel(true) },
    { k: 'copy_to_buffer', act: () => copyToBuffer(false), need: 'layer' },
    { k: 'copy_merged_to_buffer', act: () => copyToBuffer(true) },
    { k: 'paste', key: 'Ctrl+V', act: () => pasteFromSystem(false) },
    { k: 'paste_in_place', key: 'Shift+Ctrl+V', act: () => pasteFromSystem(true) },
    { k: 'clear', key: 'Delete', act: () => clearSelectionPixels(), en: () => !!D.sel },
    '-',
    { k: 'fill_with_foreground', key: 'Alt+Backspace', act: () => fillSelection(C.fg, tr('photoslop.menu.undo_fill')), need: 'layer' },
    { k: 'fill_with_background', key: 'Ctrl+Backspace', act: () => fillSelection(C.bg, tr('photoslop.menu.undo_fill')), need: 'layer' },
    { k: 'stroke_selection', act: () => dlgStroke(), en: () => !!D.sel },
    '-',
    { k: 'free_transform', key: 'Ctrl+T', alt: ['Alt+Ctrl+T'], act: () => startTransform(), need: 'layer' },
    { k: 'transform', sub: [
      { k: 'rotate_180', act: () => transformLayerQuick('180') },
      { k: 'rotate_90_clockwise', act: () => transformLayerQuick('cw') },
      { k: 'rotate_90_counter_clockwise', act: () => transformLayerQuick('ccw') },
      '-',
      { k: 'flip_horizontal', act: () => transformLayerQuick('flipH') },
      { k: 'flip_vertical', act: () => transformLayerQuick('flipV') },
    ] },
    '-',
    { k: 'brush_settings', key: 'F5', act: () => dlgBrushSettings() },
    { k: 'define_brush_preset', act: () => defineBrushFromSelection(), need: 'layer' },
    { k: 'import_brushes_abr_slopbrush_png', act: () => SlopIntake.pick({ to: 'photoslop.brushes' }) },
    '-',
    { k: 'preferences', sub: [
      { k: 'navigation', act: () => SlopNav.openModal('photoslop') },
    ] },
    { k: 'keyboard_shortcuts', key: 'Alt+Shift+Ctrl+K', act: () => dlgShortcuts() },
  ]],
  ['Image', [
    { k: 'adjustments', sub: filterMenu('adjust') },
    '-',
    { k: 'image_size', key: 'Alt+Ctrl+I', act: () => dlgImageSize() },
    { k: 'canvas_size', key: 'Alt+Ctrl+C', act: () => dlgCanvasSize() },
    { k: 'watermark', dyn: () => tr(wmOn() ? 'photoslop.menu.watermark_off' : 'photoslop.menu.watermark_on'), act: () => wmToggle() },
    '-',
    { k: 'rotate_90_clockwise', act: () => transformCanvas('cw') },
    { k: 'rotate_90_counter_clockwise', act: () => transformCanvas('ccw') },
    { k: 'rotate_180', act: () => transformCanvas('180') },
    '-',
    { k: 'flip_horizontal', act: () => transformCanvas('flipH') },
    { k: 'flip_vertical', act: () => transformCanvas('flipV') },
    '-',
    { k: 'crop_to_selection', act: () => { const b = D.sel.bounds; cropTo(b, true); fitView(); }, en: () => !!D.sel },
    { k: 'trim_transparent_pixels', act: () => { const b = alphaBounds(flattenCanvas()); if (b) { cropTo(b, true); fitView(); } } },
  ]],
  ['Layer', [
    { k: 'new_layer', key: 'Shift+Ctrl+N', act: () => addLayer() },
    { k: 'duplicate_layer', act: () => duplicateLayer() },
    { k: 'delete', sub: [
      { k: 'delete_layer', act: () => deleteLayer() },
      { k: 'remove_all_layers', act: () => removeAllLayers(), en: () => D.layers.length > 0 },
    ] },
    { k: 'layer_properties', act: () => dlgLayerProps() },
    '-',
    { k: 'layer_via_copy', key: 'Ctrl+J', act: () => layerViaCopy(false) },
    { k: 'layer_via_cut', key: 'Shift+Ctrl+J', act: () => layerViaCopy(true), need: 'layer' },
    { k: 'isolate_subject', act: () => isolateSubject(), en: () => !!activeLayer() },
    { k: 'generate_image', cmdId: 'ps.generate', act: () => psImageGen('generate') },
    { k: 'edit_with_ai', cmdId: 'ps.edit-ai', act: () => psImageGen('edit'), en: () => !!activeLayer() },
    { k: 'new_fill_layer', sub: [
      { k: 'solid_color_foreground', act: () => { const c = mkCanvas(D.w, D.h), g = cx(c); g.fillStyle = C.fg; g.fillRect(0, 0, D.w, D.h); addLayer({ name: nextName('photoslop.layer.color_fill'), canvas: c }, tr('photoslop.menu.undo_fill_layer')); } },
      { k: 'gradient_foreground_background', act: () => { const keep = T.gradient.type; T.gradient.type = 'linear'; const c = gradientCanvas({ x: 0, y: 0 }, { x: 0, y: D.h }); T.gradient.type = keep; addLayer({ name: nextName('photoslop.layer.gradient_fill'), canvas: c }, tr('photoslop.menu.undo_fill_layer')); } },
    ] },
    { k: 'layer_style', sub: [{ k: 'layer_style', t: 'layer_style_dots', need: 'layer', act: () => { const L = activeLayer(); if (L) openLayerStyle(L.id); } }, '-'].concat(filterMenu('style')) },
    '-',
    { k: 'mask', sub: [
      { k: 'add', sub: maskAddItems() },
      { k: 'delete', act: () => { const L = activeLayer(); UI.editMask = false; setLayerProps(L.id, { mask: null }, tr('photoslop.menu.undo_delete_mask')); }, en: () => hasMask() },
      { k: 'invert', act: () => invertMask(activeLayer().id), en: () => hasMask() },
      { k: 'apply', act: () => applyMask(), en: () => hasMask() },
      { k: 'disable', dyn: () => tr(hasMask() && activeLayer().mask.enabled === false ? 'photoslop.menu.enable' : 'photoslop.menu.disable'), act: () => { const L = activeLayer(); setLayerProps(L.id, { mask: Object.assign({}, L.mask, { enabled: L.mask.enabled === false }) }, tr('photoslop.menu.undo_toggle_mask')); }, en: () => hasMask() },
    ] },
    { k: 'create_clipping_mask', key: 'Alt+Ctrl+G', dyn: () => tr(activeLayer() && activeLayer().clip ? 'photoslop.menu.release_clipping_mask' : 'photoslop.menu.create_clipping_mask'), act: () => { const L = activeLayer(); setClipping(L.id, !L.clip); }, need: 'layer' },
    { k: 'edit_text', act: () => editTypeLayer(), en: () => activeLayer() && !!activeLayer().text },
    { k: 'warp_text', act: () => dlgWarpText(), en: () => activeLayer() && !!activeLayer().text },
    { k: 'rasterize_type', act: () => rasterizeText(activeLayer()), en: () => activeLayer() && !!activeLayer().text },
    { k: 'rotate_and_flip', sub: [
      { k: 'rotate_180', act: () => transformLayerQuick('180') },
      { k: 'rotate_90_clockwise', act: () => transformLayerQuick('cw') },
      { k: 'rotate_90_counter_clockwise', act: () => transformLayerQuick('ccw') },
      '-',
      { k: 'flip_horizontal', act: () => transformLayerQuick('flipH') },
      { k: 'flip_vertical', act: () => transformLayerQuick('flipV') },
    ] },
    '-',
    { k: 'arrange', sub: [
      { k: 'bring_to_front', key: 'Shift+Ctrl+]', act: () => moveLayer(D.activeId, D.layers.length - 1) },
      { k: 'bring_forward', key: 'Ctrl+]', act: () => moveLayer(D.activeId, layerIndex(D.activeId) + 1) },
      { k: 'send_backward', key: 'Ctrl+[', act: () => moveLayer(D.activeId, layerIndex(D.activeId) - 1) },
      { k: 'send_to_back', key: 'Shift+Ctrl+[', act: () => moveLayer(D.activeId, 0) },
    ] },
    { k: 'lock_unlock_layer', key: 'Ctrl+/', act: () => { const L = activeLayer(); setLayerProps(L.id, { locked: !L.locked }, tr(L.locked ? 'photoslop.menu.undo_unlock_layer' : 'photoslop.menu.undo_lock_layer')); } },
    '-',
    { k: 'merge_down', key: 'Ctrl+E', act: () => mergeDown() },
    { k: 'merge_visible', key: 'Shift+Ctrl+E', act: () => mergeVisible() },
    { k: 'flatten_image', act: () => flattenImage() },
  ]],
  ['Select', [
    { k: 'all', key: 'Ctrl+A', act: () => selectAll() },
    { k: 'deselect', key: 'Ctrl+D', act: () => deselect(), en: () => !!D.sel },
    { k: 'inverse', key: 'Shift+Ctrl+I', act: () => selectInverse() },
    '-',
    { k: 'layer_transparency', act: () => { const L = activeLayer(); const c = mkCanvas(D.w, D.h); cx(c).drawImage(bakedLayer(L).canvas, L.x, L.y); D.sel = makeSel(c); commit(tr('photoslop.menu.undo_load_selection')); } },
    { k: 'subject', act: () => selectSubject(), need: 'layer' },
    { k: 'color_range_foreground', act: () => dlgColorRange() },
    '-',
    { k: 'feather', key: 'Shift+F6', act: () => dlgNumber(tr('photoslop.menu.feather_title'), tr('photoslop.menu.feather_radius'), 8, 0.5, 250, 'px', (v) => featherSel(v)), en: () => !!D.sel },
    { k: 'expand', act: () => dlgNumber(tr('photoslop.menu.expand_title'), tr('photoslop.menu.expand_by'), 8, 1, 100, 'px', (v) => growSel(v)), en: () => !!D.sel },
    { k: 'contract', act: () => dlgNumber(tr('photoslop.menu.contract_title'), tr('photoslop.menu.contract_by'), 8, 1, 100, 'px', (v) => growSel(-v)), en: () => !!D.sel },
  ]],
  ['Filter', [
    { k: 'last_filter', key: 'Alt+Ctrl+F', act: () => LAST_FILTER.id && runFilter(LAST_FILTER.id, LAST_FILTER.params), en: () => !!LAST_FILTER.id, dyn: () => (LAST_FILTER.id ? tr('photoslop.menu.last_filter_named', { name: FILTER_BY_ID[LAST_FILTER.id].name.replace('…', '') }) : tr('photoslop.menu.last_filter')) },
    '-',
    filterSub('Blur'), filterSub('Sharpen'), filterSub('Noise'), filterSub('Pixelate'), filterSub('Stylize'), filterSub('Distort'), filterSub('Render'), filterSub('Other'),   // i18n-ignore: filter group ids (the menu shows photoslop.menu.<k>)
    '-',
    ...filterMenu('Auto'),   // i18n-ignore: filter group ids (the menu shows photoslop.menu.<k>)
    { k: 'repair', sub: [
      { k: 'spot_healing_brush', act: () => selectTool('spot') },
      { k: 'healing_brush', act: () => selectTool('heal') },
      { k: 'red_eye_tool', act: () => selectTool('redeye') },
      '-',
      ...filterMenu('Repair'),   // i18n-ignore: filter group ids (the menu shows photoslop.menu.<k>)
    ] },
    '-',
    filterSub('Slop'),   // i18n-ignore: filter group ids (the menu shows photoslop.menu.<k>)
  ]],
  ['View', [
    { k: 'zoom_in', key: 'Ctrl+=', act: () => zoomStep(1) },
    { k: 'zoom_out', key: 'Ctrl+-', act: () => zoomStep(-1) },
    { k: 'fit_on_screen', key: 'Ctrl+0', act: () => fitView() },
    { k: '100', key: 'Ctrl+1', act: () => actualPixels() },
    '-',
    { k: 'rotate_view_left', key: 'Alt+[', act: () => rotateView(-90) },
    { k: 'rotate_view_right', key: 'Alt+]', act: () => rotateView(90) },
    { k: 'reset_view', key: 'Alt+0', act: () => resetView() },
    '-',
    { k: 'pixel_grid', check: () => store.get('pixelGrid', true), act: () => { store.set('pixelGrid', !store.get('pixelGrid', true)); dirty(); } },
    { k: 'layer_bounds', check: () => store.get('showBounds', true), act: () => { store.set('showBounds', !store.get('showBounds', true)); dirty(); } },
    { k: 'mask_overlay', check: () => UI.editMask && UI.maskOverlay, act: () => toggleMaskOverlay(), en: () => hasMask() },
    '-',
    ...guidesMenuItems(),
    '-',
    { k: 'theme', sub: [
      { k: 'pro_dark', check: () => theme() === 'pro', act: () => setTheme('pro') },
      { k: 'light', check: () => theme() === 'light', act: () => setTheme('light') },
      { k: 'paint_98', check: () => theme() === 'paint', act: () => setTheme('paint') },
    ].filter((r) => !window.SlopTheme || SlopTheme.has({ pro_dark: 'dark', light: 'light', paint_98: 'classic' }[r.k])) },   // the site's themes
    { k: 'show_hide_panels', key: 'Tab', act: () => document.body.classList.toggle('no-panels') },
    { k: 'reset_panel_sizes', cmdId: 'view.resetPanels', act: () => window.SlopResizePanel && SlopResizePanel.resetAll() },   // shared/ui/resize-panel.js
  ]],
  ['Layout', () => (window.SlopLayouts ? SlopLayouts.menu('photoslop') : [])],
  ['Window', () => windowMenuItems()],
  ['Help', [
    { k: 'search_commands', cmdId: 'cmd.palette', act: () => openCommandPalette() },
    { k: 'keyboard_shortcuts', cmdId: 'cmd.keymap', act: () => openKeymap() },
    { k: 'about_photoslop', act: () => dlgAbout() },
    { k: 'ai_agents', act: () => window.SlopAgents && window.SlopAgents.about() },
    '-',
    { k: 'open_slop_paint_classic_ms_paint', act: () => { location.href = 'classic/'; } },
    { k: 'back_to_slopographic_com', act: () => { location.href = '../'; } },
  ]],
];
const SHORTCUTS = new Map();
function collectShortcuts(items) { for (const it of items) { if (it === '-' || !it) continue; if (it.sub) collectShortcuts(it.sub); if (it.key) SHORTCUTS.set(normCombo(it.key), it); for (const k of it.alt || []) SHORTCUTS.set(normCombo(k), it); } }
MENUS.forEach(([, items]) => { if (Array.isArray(items)) { labelMenu(items); collectShortcuts(items); } });
SHORTCUTS.set(normCombo('Ctrl+Tab'), { act: () => cycleDoc(1) });
SHORTCUTS.set(normCombo('Shift+Ctrl+Tab'), { act: () => cycleDoc(-1) });
