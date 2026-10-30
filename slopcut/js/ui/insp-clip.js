/* SlopCut: inspector sections for clips: transform, crop, colour, fades, transition (visual),
   text (titles) and audio (volume, fades, keyframes). */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, F = SE.fields, I = SE.inspector;
  const h = U.h;
  const body = () => document.querySelector('#insp .insp-body');

  I.visualSections = function (c) {
    const id = c.id, get = (k, d) => I.clipGet(id, k, d), set = (k, l) => I.clipSet(id, k, l), t = I.track;
    body().append(F.section(U.t('slopedit.insp.transform'), 'select',
      t(F.pair(U.t('slopedit.insp.position'), { label: 'X offset (px)', get: get('x'), set: (v) => set('x', U.t('slopedit.insp.position'))(Math.round(v)) }, { label: 'Y offset (px)', get: get('y'), set: (v) => set('y', U.t('slopedit.insp.position'))(Math.round(v)) })),
      t(F.slider(U.t('slopedit.insp.scale'), get('scale', 1), set('scale', U.t('slopedit.insp.scale')), { step: 1, scale: 100, unit: '%', reset: 1, hardMin: SE.fit.SCALE.min * 100, hardMax: SE.fit.SCALE.max * 100,
        curve: { steps: SE.fit.SCALE.steps, to: SE.fit.toSlider, from: SE.fit.fromSlider } })),
      h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.insp.scale_the_picture_to_cover'), onclick: () => fill(id, 'fill') }, U.t('slopedit.insp.fill_frame')), // i18n-ignore: class names
        h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.insp.scale_the_whole_picture_to'), onclick: () => fill(id, 'fit') }, U.t('slopedit.insp.fit_frame'))), // i18n-ignore: class names
      t(F.slider(U.t('slopedit.insp.rotation'), get('rot'), set('rot', U.t('slopedit.insp.rotation')), { min: -180, max: 180, step: 1, unit: '°', reset: 0 })),
      t(F.slider(U.t('slopedit.insp.opacity'), get('opacity', 1), set('opacity', U.t('slopedit.insp.opacity')), { min: 0, max: 100, step: 1, scale: 100, unit: '%', reset: 1, hardMin: 0, hardMax: 100 })),
      c.kind !== 'title' ? h('div', null,
        t(F.slider(U.t('slopedit.insp.crop_left'), get('cropL'), set('cropL', U.t('slopedit.insp.crop')), { min: 0, max: 50, scale: 100, reset: 0, hardMin: 0, hardMax: 100 })).el,
        t(F.slider(U.t('slopedit.insp.crop_right'), get('cropR'), set('cropR', U.t('slopedit.insp.crop')), { min: 0, max: 50, scale: 100, reset: 0, hardMin: 0, hardMax: 100 })).el,
        t(F.slider(U.t('slopedit.insp.crop_top'), get('cropT'), set('cropT', U.t('slopedit.insp.crop')), { min: 0, max: 50, scale: 100, reset: 0, hardMin: 0, hardMax: 100 })).el,
        t(F.slider(U.t('slopedit.insp.crop_bottom'), get('cropB'), set('cropB', U.t('slopedit.insp.crop')), { min: 0, max: 50, scale: 100, reset: 0, hardMin: 0, hardMax: 100 })).el) : null,
      h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => SE.change(U.t('slopedit.insp.centre'), (p) => { const cc = M.clip(p, id); cc.x = 0; cc.y = 0; }) }, U.t('slopedit.insp.centre')), // i18n-ignore: class names
        h('button', { type: 'button', class: 'btn sm', disabled: !SE.aspect.targetOf(SE.doc, c), title: U.t('slopedit.insp.set_the_visible_box_back'), onclick: () => SE.aspect.restore(id) }, U.t('slopedit.insp.restore_aspect_ratio'))))); // i18n-ignore: class names
    if (c.kind !== 'color') body().append(F.section(U.t('slopedit.gfx.colour'), 'color',
      t(F.slider(U.t('slopedit.insp.brightness'), get('bright'), set('bright', U.t('slopedit.insp.brightness')), { min: -100, max: 100, reset: 0 })),
      t(F.slider(U.t('slopedit.insp.contrast'), get('contrast'), set('contrast', U.t('slopedit.insp.contrast')), { min: -100, max: 100, reset: 0 })),
      t(F.slider(U.t('slopedit.insp.saturation'), get('sat'), set('sat', U.t('slopedit.insp.saturation')), { min: -100, max: 100, reset: 0 })),
      t(F.slider(U.t('slopedit.insp.temperature'), get('temp'), set('temp', U.t('slopedit.insp.temperature')), { min: -100, max: 100, reset: 0 })),
      h('div', { class: 'ins-actions' }, ...[['Warm', { temp: 35, sat: 10 }], ['Cool', { temp: -35 }], ['Punchy', { contrast: 25, sat: 30 }], ['B&W', { sat: -100, contrast: 15 }], ['Faded', { contrast: -25, bright: 8, sat: -20 }]].map(([en, v], i, all, l = U.w('look', en, en)) =>
        h('button', { type: 'button', class: 'btn sm', onclick: () => SE.change(U.t('slopedit.insp.colour_look'), (p) => Object.assign(M.clip(p, id), { bright: 0, contrast: 0, sat: 0, temp: 0 }, v)) }, l))))); // i18n-ignore: class names
    body().append(F.section(U.t('slopedit.insp.fades_transition'), 'transition',
      t(F.slider(U.t('slopedit.insp.fade_in'), get('fadeIn'), set('fadeIn', U.t('slopedit.insp.fade_in')), { min: 0, max: Math.min(10, c.dur), step: 0.05, unit: 's', reset: 0, hardMin: 0 })),
      t(F.slider(U.t('slopedit.insp.fade_out'), get('fadeOut'), set('fadeOut', U.t('slopedit.insp.fade_out')), { min: 0, max: Math.min(10, c.dur), step: 0.05, unit: 's', reset: 0, hardMin: 0 })),
      t(F.select(U.t('slopedit.insp.transition_in'), [['', U.t('slopedit.insp.none')]].concat(U.wl('tr', M.TRANSITIONS)), () => (M.clip(SE.doc, id) && M.clip(SE.doc, id).trIn ? M.clip(SE.doc, id).trIn.type : ''), (v) => SE.change(v ? U.t('slopedit.insp.transition') : U.t('slopedit.cmd.remove_transition'), (p) => SE.edit.setTransition(p, id, v || null, (M.clip(p, id).trIn && M.clip(p, id).trIn.dur) || 1)))),
      c.trIn ? t(F.slider(U.t('slopedit.fx.duration'), () => { const cc = M.clip(SE.doc, id); return cc && cc.trIn ? cc.trIn.dur : 1; }, (v) => SE.change(U.t('slopedit.insp.transition_length'), (p) => { const cc = M.clip(p, id); SE.edit.setTransition(p, id, cc.trIn.type, v); }, { key: 'insp:trdur' + id }), { min: 0.1, max: Math.min(5, c.dur), step: 0.05, unit: 's' })) : null,
      !M.prevAdjacent(SE.doc, c) && c.trIn ? h('p', { class: 'ins-note' }, U.t('slopedit.insp.no_clip_right_before_this')) : null));
  };
  function fill(id, mode) {
    SE.change(mode === 'fill' ? U.t('slopedit.insp.fill_frame') : U.t('slopedit.insp.fit_frame'), (p) => { const c = M.clip(p, id); SE.fit.clip(p, c, c.media && M.media(p, c.media), mode); });
  }
  /** Font choices: the standard list, then the bundled and downloaded families of shared/fonts (when the picker loaded). */
  function fontOptions() {
    const names = [...M.FONTS];
    if (window.SlopFonts) for (const n of SlopFonts.names()) if (!names.includes(n)) names.push(n);
    return names.map((f) => [f, f]);
  }
  I.textSection = function (c) {
    const id = c.id, t = I.track;
    const tg = (k) => () => { const cc = M.clip(SE.doc, id); return cc ? cc.text[k] : ''; };
    const ts = (k, l) => F.setter(l || U.t('slopedit.insp.text'), id + ':text.' + k, (p, v) => { const cc = M.clip(p, id); if (cc) cc.text = Object.assign({}, cc.text, { [k]: v }); });
    const tb = t(F.text(U.t('slopedit.insp.text'), tg('str'), ts('str'), { multiline: true }));
    const fontF = t(F.select(U.t('slopedit.insp.font'), fontOptions(), tg('font'), ts('font', U.t('slopedit.insp.font'))));
    body().append(F.section(U.t('slopedit.insp.text'), 'text', tb,
      fontF,
      t(F.slider(U.t('slopedit.exp.size'), tg('size'), ts('size', U.t('slopedit.insp.text_size')), { min: 8, max: 400, step: 1, unit: 'px', hardMin: 4 })),
      t(F.chips(U.t('slopedit.insp.style'), [['b', U.t('slopedit.insp.bold')], ['i', U.t('slopedit.insp.italic')], ['s', U.t('slopedit.insp.shadow')]], () => { const x = M.clip(SE.doc, id); return x ? [x.text.bold && 'b', x.text.italic && 'i', x.text.shadow && 's'].filter(Boolean) : []; },
        (v) => { const k = { b: 'bold', i: 'italic', s: 'shadow' }[v]; ts(k, U.t('slopedit.insp.text_style'))(!M.clip(SE.doc, id).text[k]); SE.history.breakCoalescing(); })),
      t(F.chips(U.t('slopedit.insp.align'), [['left', U.t('slopedit.insp.left')], ['center', U.t('slopedit.insp.centre')], ['right', U.t('slopedit.insp.right')]], tg('align'), (v) => { ts('align', U.t('slopedit.insp.align'))(v); SE.history.breakCoalescing(); })),
      t(F.color(U.t('slopedit.gfx.colour'), tg('color'), ts('color', U.t('slopedit.insp.text_colour')))),
      t(F.color(U.t('slopedit.insp.outline'), tg('stroke'), ts('stroke', U.t('slopedit.insp.outline_colour')))),
      t(F.slider(U.t('slopedit.insp.outline_width'), tg('strokeW'), ts('strokeW', U.t('slopedit.insp.outline_width')), { min: 0, max: 20, step: 0.5, unit: 'px', hardMin: 0 })),
      t(F.chips(U.t('slopedit.insp.box'), [['', U.t('slopedit.insp.none')], ['#000000b0', U.t('slopedit.insp.dark')], ['#ffffffd0', U.t('slopedit.app.light')], ['#d4ff3a', U.t('slopedit.insp.lime')]], tg('bg'), (v) => { ts('bg', U.t('slopedit.insp.text_box'))(v); SE.history.breakCoalescing(); })),
      t(F.chips(U.t('slopedit.insp.animation_in'), U.wl('tanim', SE.text.ANIMS), tg('anim'), (v) => { ts('anim', U.t('slopedit.insp.text_animation'))(v); SE.history.breakCoalescing(); })),
      t(F.chips(U.t('slopedit.insp.animation_out'), U.wl('tout', SE.text.OUTS), () => { const x = M.clip(SE.doc, id); return x && x.text.out ? x.text.out : 'same'; }, (v) => { ts('out', U.t('slopedit.insp.text_exit'))(v); SE.history.breakCoalescing(); }))));
    I.textInput = tb.input;
    // The font list is the shared picker (shared/fonts/picker.js): bundled and downloaded families, and Get more.
    if (window.SlopFonts) SlopFonts.attach(fontF.el.querySelector('select'), { value: c.text.font, legacy: M.FONTS, onPick: () => SE.emit('frame', {}) });
  };
  I.audioSection = function (c) {
    const id = c.id, t = I.track, get = (k) => I.clipGet(id, k);
    const db = () => { const v = M.clip(SE.doc, id); return v ? 20 * Math.log10(Math.max(1e-4, v.vol)) : 0; };
    body().append(F.section(U.t('slopedit.insp.audio'), 'speaker',
      t(F.slider(U.t('slopedit.insp.volume'), db, (v) => SE.change(U.t('slopedit.insp.volume'), (p) => { M.clip(p, id).vol = U.round(v <= -59.5 ? 0 : Math.pow(10, v / 20), 4); }, { key: 'insp:vol' + id }), { min: -60, max: 12, step: 0.5, unit: 'dB', reset: 0, dec: 1 })),
      t(F.slider(U.t('slopedit.insp.fade_in'), get('afIn'), I.clipSet(id, 'afIn', U.t('slopedit.insp.audio_fade_in')), { min: 0, max: Math.min(10, c.dur), step: 0.05, unit: 's', reset: 0, hardMin: 0 })),
      t(F.slider(U.t('slopedit.insp.fade_out'), get('afOut'), I.clipSet(id, 'afOut', U.t('slopedit.insp.audio_fade_out')), { min: 0, max: Math.min(10, c.dur), step: 0.05, unit: 's', reset: 0, hardMin: 0 })),
      h('p', { class: 'ins-note' }, U.t('slopedit.insp.vol_keys', { n: c.keys ? c.keys.length : 0 })),
      h('div', { class: 'ins-actions' },
        h('button', { type: 'button', class: 'btn sm', onclick: () => SE.cmd.run('clip.volKey') }, U.t('slopedit.insp.keyframe_at_playhead')), // i18n-ignore: class names
        c.keys ? h('button', { type: 'button', class: 'btn sm', onclick: () => SE.change(U.t('slopedit.insp.clear_keyframes'), (p) => { M.clip(p, id).keys = null; }) }, U.t('slopedit.insp.clear_keyframes')) : null))); // i18n-ignore: class names
  };
})();
