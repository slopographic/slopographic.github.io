/* PhotoSlop guides: View-menu items, New Guide / Grid Settings dialogs and the shared GuideGuide-style panel. */
'use strict';

/** The View menu's guide items (k: the menu contract, ui/menus.js; text photoslop.menu.<k>). */
function guidesMenuItems() {
  return labelMenu([
    { k: 'rulers', key: 'Ctrl+R', check: () => GUIDE_PREFS.rulers, act: () => togglePref('rulers', true) },
    { k: 'grid', key: "Ctrl+'", check: () => GUIDE_PREFS.grid, act: () => togglePref('grid', false) },
    { k: 'grid_settings', act: () => dlgGridSettings() },
    '-',
    { k: 'show_guides', key: 'Ctrl+;', check: () => GUIDE_PREFS.show, act: () => togglePref('guides', true) },
    { k: 'lock_guides', key: 'Alt+Ctrl+;', check: () => GUIDE_PREFS.lock, act: () => togglePref('lockGuides', false, 'lock_guides') },
    { k: 'clear_guides', act: () => clearGuides(), en: () => !!(D.guides && D.guides.length) },
    { k: 'new_guide', act: () => dlgNewGuide(-1) },
    { k: 'new_guide_layout', key: 'Alt+Shift+Ctrl+;', act: () => openGuidesPanel() },
    { k: 'new_guides_from_shape', act: () => guidesFromBounds(), en: () => !!(D.sel || activeLayer()) },
    '-',
    { k: 'snap', key: 'Shift+Ctrl+;', check: () => GUIDE_PREFS.snap, act: () => togglePref('snap', true, 'snap') },
    { k: 'snap_to', sub: [
      { k: 'guides', check: () => GUIDE_PREFS.snapTo('guides'), act: () => togglePref('snapTo.guides', true) },
      { k: 'grid', check: () => GUIDE_PREFS.snapTo('grid'), act: () => togglePref('snapTo.grid', true) },
      { k: 'document_bounds_centre', check: () => GUIDE_PREFS.snapTo('bounds'), act: () => togglePref('snapTo.bounds', true) },
    ] },
  ]);
}
/** Guides on the edges and centre of the selection (or the active layer's pixels). */
function guidesFromBounds() {
  const b = D.sel ? D.sel.bounds : activeLayer() && layerBoundsDoc(activeLayer());
  if (!b) { toast(tr('photoslop.guide.no_bounds')); return; }
  applyGuides([{ o: 'v', pos: b.x }, { o: 'v', pos: b.x + b.w / 2 }, { o: 'v', pos: b.x + b.w }, { o: 'h', pos: b.y }, { o: 'h', pos: b.y + b.h / 2 }, { o: 'h', pos: b.y + b.h }], 'add');
}

/** New Guide… (idx < 0) or edit the position of guide idx. Positions accept units: 50%, 2in, 10mm. */
function dlgNewGuide(idx) {
  const g = idx >= 0 ? D.guides[idx] : null;
  const o = SlopUI.select([['v', tr('photoslop.guide.vertical')], ['h', tr('photoslop.guide.horizontal')]], g ? g.o : store.get('lastGuideO', 'v'));
  const pos = h('input', { type: 'text', class: 'sui-input', value: g ? fmtPos(g.pos) : '50%', spellcheck: 'false', 'aria-label': tr('photoslop.guide.position') });
  const hint = h('p', { class: 'dlg-p' }, tr('photoslop.guide.pos_hint'));
  dialog({ title: tr(g ? 'photoslop.guide.edit_title' : 'photoslop.guide.new_title'), body: h('div', { class: 'form' }, field(tr('photoslop.guide.orientation'), o), field(tr('photoslop.guide.position'), pos), hint),
    buttons: [{ label: tr('menu.cancel') }, { label: tr('menu.ok'), primary: true, act: () => {
      const len = SlopGuides.parseLen(pos.value, 'px');
      if (!len) { toast(tr('photoslop.guide.bad_pos')); return false; }
      const v = SlopGuides.toPx(len, { ref: o.value === 'v' ? D.w : D.h });
      store.set('lastGuideO', o.value);
      if (g) { const l = D.guides.slice(); l[idx] = { o: o.value, pos: v }; setGuides(l, tr('photoslop.guide.step_move')); }
      else addGuide(o.value, v);
    } }] });
}
function dlgGridSettings() {
  const size = numInput(GUIDE_PREFS.gridSize, 1, 10000), sub = numInput(GUIDE_PREFS.gridSub, 1, 20);
  const color = h('input', { type: 'color', value: GUIDE_PREFS.gridColor, 'aria-label': tr('photoslop.guide.grid_colour') });
  const gcolor = h('input', { type: 'color', value: GUIDE_PREFS.color, 'aria-label': tr('photoslop.guide.guide_colour') });
  const show = h('input', { type: 'checkbox', checked: GUIDE_PREFS.grid });
  const before = { grid: GUIDE_PREFS.grid, gridSize: GUIDE_PREFS.gridSize, gridSub: GUIDE_PREFS.gridSub, gridColor: GUIDE_PREFS.gridColor, guideColor: GUIDE_PREFS.color };
  const live = () => { store.set('grid', show.checked); store.set('gridSize', clamp(+size.value || 50, 1, 10000)); store.set('gridSub', clamp(Math.round(+sub.value) || 1, 1, 20)); store.set('gridColor', color.value); store.set('guideColor', gcolor.value); dirty(); };
  [size, sub, color, gcolor, show].forEach((i) => i.addEventListener('input', live));
  dialog({ title: tr('photoslop.guide.grid_title'), body: h('div', { class: 'form' },
    h('label', { class: 'field opt-check' }, show, h('span', null, tr('photoslop.guide.show_grid'))),
    field(tr('photoslop.guide.gridline'), size, 'px'), field(tr('photoslop.guide.subdivisions'), sub), field(tr('photoslop.guide.grid_colour'), color), field(tr('photoslop.guide.guide_colour'), gcolor)),
  buttons: [{ label: tr('menu.cancel'), act: () => { for (const k in before) store.set(k, before[k]); dirty(); } }, { label: tr('menu.ok'), primary: true }] });
}

/* ---------- the shared GuideGuide-style panel ---------- */
function openGuidesPanel() {
  if (typeof SlopGuides === 'undefined' || !SlopGuides.openPanel) { toast(tr('photoslop.guide.unavailable')); return null; }
  if (SlopGuides.panel) { SlopGuides.panel.close(); return null; }
  return SlopGuides.openPanel({
    title: tr('photoslop.guide.layout_title'), stateKey: 'slopshop.guidePanel',
    targets: [
      { id: 'canvas', label: tr('photoslop.guide.t_canvas'), rect: () => ({ x: 0, y: 0, w: D.w, h: D.h }) },
      { id: 'selection', label: tr('photoslop.guide.t_selection'), rect: () => (D.sel ? Object.assign({}, D.sel.bounds) : null) },
      { id: 'layer', label: tr('photoslop.guide.t_layer'), rect: () => { const L = activeLayer(); return L ? layerBoundsDoc(L) : null; } },
    ],
    preview: (gs) => { V.guidePreview = gs; dirty(); },
    apply: (gs, o) => applyGuides(gs, o.mode),
    clear: () => clearGuides(),
    toast: (m) => toast(m),
  });
}
