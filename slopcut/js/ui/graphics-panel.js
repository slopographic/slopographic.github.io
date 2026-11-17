/* SlopCut: the graphics library (Effects tab). Shapes from shared/graphics (SlopGraphics) with a colour, a size and a
   motion chosen above the grid. Click adds the shape at the playhead; drag it onto the timeline. The inspector edits a
   placed graphic (Inspector ▸ Graphic). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, h = U.h, G = window.SlopGraphics;
  const GP = SE.gfxPanel = { opts: Object.assign({}, M.GFX_DEFAULT) };
  const tiles = [];

  /** The SVG of a shape in the current colour, as a node (the markup is our own static path data). */
  function icon(id) {
    const doc = new DOMParser().parseFromString(G.svg(id, { color: GP.opts.color, size: 28 }), 'image/svg+xml');
    return document.importNode(doc.documentElement, true);
  }
  function tile(s) {
    const b = h('button', { type: 'button', class: 'fx gfx', draggable: 'true', title: U.t('slopedit.gfx.tile_tip', { name: s.name }), onclick: () => SE.act.addGraphic(Object.assign({ id: s.id }, GP.opts)) }, icon(s.id), h('span', null, s.name)); // i18n-ignore: class names
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-slopedit-fx', JSON.stringify({ kind: 'graphic', gfx: Object.assign({ id: s.id }, GP.opts) })); e.dataTransfer.effectAllowed = 'copy'; });
    b.addEventListener('dragend', () => { SE.timeline.ghost = null; SE.timeline.dirty(); });
    tiles.push({ id: s.id, b });
    return b;
  }
  /** Redraw the tile icons in the current colour (no re-render, so a slider keeps its drag). */
  function refreshIcons() {
    for (const t of tiles) { const old = t.b.querySelector('svg'); if (old) old.replaceWith(icon(t.id)); }
  }
  function controls() {
    const col = h('input', { type: 'color', value: GP.opts.color, 'aria-label': U.t('slopedit.gfx.graphic_colour') });
    col.addEventListener('input', () => { GP.opts.color = col.value; refreshIcons(); });
    const size = SE.fields.slider(U.t('slopedit.exp.size'), () => GP.opts.size, (v) => { GP.opts.size = U.clamp(v, 0.05, 1); }, { min: 5, max: 100, step: 1, scale: 100, unit: '%', reset: 0.3, hardMin: 5, hardMax: 100 });
    const anim = h('select', { class: 'inp', 'aria-label': U.t('slopedit.gfx.graphic_motion') }, G.ANIMS.map(([v, l]) => h('option', { value: v, selected: v === GP.opts.anim }, l)));
    anim.addEventListener('change', () => { GP.opts.anim = anim.value; });
    return h('div', { class: 'gfx-ctl' },
      h('label', { class: 'ins-row' }, h('span', null, U.t('slopedit.gfx.colour')), col, h('span')),
      size.el,
      h('label', { class: 'ins-row' }, h('span', null, U.t('slopedit.gfx.motion')), anim, h('span')));
  }
  /** The panel's nodes. Call once per render of the Effects tab. */
  GP.nodes = function () {
    tiles.length = 0;
    return [
      h('h4', { class: 'fx-h' }, U.t('slopedit.gfx.graphics_library')),
      controls(),
      h('div', { class: 'fx-grid gfx-grid' }, G.list().map(tile)),
      h('p', { class: 'fx-note' }, U.t('slopedit.gfx.shapes_are_clips_move_scale'))
    ];
  };
})();
