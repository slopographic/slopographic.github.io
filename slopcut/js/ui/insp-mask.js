/* SlopCut: the Mask section of the Inspector (shape, position, size, corner radius, feather, expansion, area) and
   the mask items shared by the Clip menu and the clip context menu. Every field change is one undo step (coalesced
   while a slider is dragged). Drawing and handles: render/mask-input.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, MK = SE.mask, F = SE.fields, I = SE.inspector, C = SE.cmd;
  const h = U.h;
  const body = () => document.querySelector('#insp .insp-body');
  const maskOf = (id) => { const c = M.clip(SE.doc, id); return c ? c.mask : null; };
  /** Getter for one mask field of a clip (d when the clip has no mask). */
  const mg = (id, fn, d = 0) => () => { const m = maskOf(id); return m ? fn(m) : d; };
  /** Setter for one mask field, one undo step per field (key 'mask.<name>' coalesces a slider drag). */
  const ms = (id, name, label, fn) => I.clipSet(id, 'mask.' + name, label, (c, v) => { if (c.mask) fn(c.mask, v); });

  I.maskSection = function (c) {
    const id = c.id, m = c.mask, t = I.track;
    if (!m) {
      body().append(F.section(U.t('slopedit.menu.mask'), 'mask',
        h('p', { class: 'ins-note' }, U.t('slopedit.mask.a_mask_keeps_only_the')),
        h('div', { class: 'ins-actions' },
          ...MK.SHAPES.filter(([s]) => s !== 'path').map(([s, l]) => h('button', { type: 'button', class: 'btn sm', onclick: () => SE.act.maskAdd(s) }, U.w('mask', s, l))), // i18n-ignore: class names
          h('button', { type: 'button', class: 'btn sm', onclick: () => SE.act.maskTool('free') }, U.t('slopedit.mask.freehand')), // i18n-ignore: class names
          h('button', { type: 'button', class: 'btn sm', onclick: () => SE.act.maskTool('pen') }, U.t('slopedit.mask.pen_path'))))); // i18n-ignore: class names
      return;
    }
    const isPath = m.shape === 'path';
    const shapeRows = isPath ? [h('p', { class: 'ins-note' }, U.t('slopedit.mask.path_note', { n: m.pts.length }))]
      : [t(F.chips(U.t('slopedit.gfx.shape'), [['rect', U.t('slopedit.mask.rect')], ['ellipse', U.t('slopedit.mask.ellipse')], ['rrect', U.t('slopedit.mask.rounded')]], () => { const x = maskOf(id); return x ? x.shape : 'rect'; }, (v) => {
        SE.change(U.t('slopedit.mask.mask_shape'), (p) => { const x = M.clip(p, id).mask; x.shape = v; if (v === 'rrect' && !x.r) x.r = Math.min(x.w, x.h) * 0.2; });
      }))];
    body().append(F.section(U.t('slopedit.menu.mask'), 'mask',
      ...shapeRows,
      t(F.pair(U.t('slopedit.insp.centre'), { label: U.t('slopedit.mask.centre_x_px'), get: mg(id, (x) => x.x), set: ms(id, 'x', U.t('slopedit.mask.mask_position'), (x, n) => { x.x = Math.round(n); }) },
        { label: U.t('slopedit.mask.centre_y_px'), get: mg(id, (x) => x.y), set: ms(id, 'y', U.t('slopedit.mask.mask_position'), (x, n) => { x.y = Math.round(n); }) })),
      isPath ? null : t(F.pair(U.t('slopedit.exp.size'), { label: U.t('slopedit.mask.width_px'), get: mg(id, (x) => x.w), set: ms(id, 'w', U.t('slopedit.mask.mask_size'), (x, n) => { x.w = Math.max(0, Math.round(n)); }) },
        { label: U.t('slopedit.mask.height_px'), get: mg(id, (x) => x.h), set: ms(id, 'h', U.t('slopedit.mask.mask_size'), (x, n) => { x.h = Math.max(0, Math.round(n)); }) })),
      !isPath && m.shape === 'rrect' ? t(F.slider(U.t('slopedit.mask.corner_radius'), mg(id, (x) => x.r), ms(id, 'r', U.t('slopedit.mask.mask_radius'), (x, v) => { x.r = v; }), { min: 0, max: 400, step: 1, unit: 'px', reset: 0, hardMin: 0 })) : null,
      t(F.slider(U.t('slopedit.mask.feather'), mg(id, (x) => x.feather), ms(id, 'feather', U.t('slopedit.mask.mask_feather'), (x, v) => { x.feather = v; }), { min: 0, max: 200, step: 1, unit: 'px', reset: 0, hardMin: 0 })),
      t(F.slider(U.t('slopedit.mask.expansion'), mg(id, (x) => x.expand), ms(id, 'expand', U.t('slopedit.mask.mask_expansion'), (x, v) => { x.expand = v; }), { min: -200, max: 200, step: 1, unit: 'px', reset: 0 })),
      t(F.chips(U.t('slopedit.mask.area'), [['keep', U.t('slopedit.mask.keep_inside')], ['invert', U.t('slopedit.mask.keep_outside')]], () => { const x = maskOf(id); return x && x.invert ? 'invert' : 'keep'; }, (v) => {
        SE.change(U.t('slopedit.cmd.invert_mask'), (p) => { M.clip(p, id).mask.invert = v === 'invert'; });
      })),
      h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn sm' + (SE.maskInput && SE.maskInput.edit === id ? ' on' : ''), onclick: () => SE.act.maskEdit() }, U.t('slopedit.mask.edit_shape')), // i18n-ignore: class names
        h('button', { type: 'button', class: 'btn sm', onclick: () => SE.act.maskRemove() }, U.t('slopedit.cmd.remove_mask'))))); // i18n-ignore: class names
  };

  /** Mask items for a menu: add (sub-menu), remove, invert and edit. Disabled items follow the selection. */
  SE.maskMenu = function () {
    return [
      { label: U.t('slopedit.mask.add_mask'), sub: MK.SHAPES.filter(([s]) => s !== 'path').map(([s, l]) => ({ label: U.w('mask', s, l), act: () => SE.act.maskAdd(s) }))
        .concat(['-', { label: U.t('slopedit.mask.freehand_path'), act: () => SE.act.maskTool('free') }, { label: U.t('slopedit.mask.bezier_path_pen'), act: () => SE.act.maskTool('pen') }]) },
      C.item('mask.remove'), C.item('mask.invert'), C.item('mask.edit')
    ];
  };
})();
