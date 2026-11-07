/* SlopCut: the Inspector section for a graphic clip (kind 'graphic'): shape, colour, size, motion and the counter
   target. The shapes and motions come from shared/graphics (SlopGraphics); the renderer is render/graphics.js. */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, F = SE.fields, I = SE.inspector;
  const body = () => document.querySelector('#insp .insp-body');

  I.graphicSection = function (c) {
    const id = c.id, t = I.track, G = window.SlopGraphics;
    const gg = (k) => () => { const cc = M.clip(SE.doc, id); return cc && cc.gfx ? cc.gfx[k] : 0; };
    const gs = (k, label) => F.setter(label, id + ':gfx.' + k, (p, v) => { const cc = M.clip(p, id); if (cc) cc.gfx = Object.assign({}, cc.gfx, { [k]: v }); });
    const rows = [
      t(F.select(SE.util.t('slopedit.gfx.shape'), G.list().map((s) => [s.id, s.name]), gg('id'), gs('id', SE.util.t('slopedit.gfx.shape')))),
      t(F.color(SE.util.t('slopedit.gfx.colour'), gg('color'), gs('color', SE.util.t('slopedit.gfx.graphic_colour')))),
      t(F.slider(SE.util.t('slopedit.exp.size'), gg('size'), gs('size', SE.util.t('slopedit.gfx.graphic_size')), { min: 5, max: 100, step: 1, scale: 100, unit: '%', reset: 0.3, hardMin: 5, hardMax: 100 })),
      t(F.chips(SE.util.t('slopedit.gfx.motion'), G.ANIMS, gg('anim'), (v) => { gs('anim', SE.util.t('slopedit.gfx.graphic_motion'))(v); SE.history.breakCoalescing(); }))
    ];
    if (c.gfx.id === 'counter') rows.push(t(F.number(SE.util.t('slopedit.gfx.count_to'), gg('value'), gs('value', SE.util.t('slopedit.gfx.counter_target')), { min: 0, max: 1e9, step: 1 })));
    body().append(F.section(SE.util.t('slopedit.gfx.graphic'), 'sparkle', ...rows,
      SE.util.h('p', { class: 'ins-note' }, SE.util.t('slopedit.gfx.draw_on_bounce_and_pop'))));
  };
})();
