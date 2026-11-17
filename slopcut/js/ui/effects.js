/* SlopCut: the Effects tab. Transitions (ui/tr-preview.js), title presets, graphics (ui/graphics-panel.js),
   colour mattes and colour looks.
   Click to apply at the playhead / to the selection, or drag onto the timeline. Also the
   Speed/Duration and Sequence settings dialogs. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model;
  const h = U.h;
  const FX = SE.effectsPanel = {};

  /** Title presets; size/y are fractions of the frame height so they work at any resolution. */
  FX.TITLES = [ // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Headline', { str: 'Big headline', size: 0.12, anim: 'pop', bold: true }, 0], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Lower third', { str: 'Sloppo\nChief goo officer', size: 0.05, anim: 'slide', align: 'left', bg: '#000000b0', bold: true }, 0.3, -0.25], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Subtitle', { str: 'Subtitles go here', size: 0.045, anim: 'fade', bg: '#000000a0', bold: false, shadow: false }, 0.4], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Typewriter', { str: 'Once upon a time…', size: 0.07, anim: 'type', font: 'JetBrains Mono', bold: false }, 0], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Handwritten', { str: 'with love', size: 0.11, anim: 'rise', font: 'Caveat', color: '#d4ff3a', bold: false }, 0], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Outline', { str: 'OUTLINE', size: 0.14, anim: 'fade', color: '#ffffff', stroke: '#0a0a0a', strokeW: 6, font: 'Archivo' }, 0], // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
    ['Caption', { str: 'Caption text', size: 0.035, anim: 'fade', out: 'fade', align: 'center', bg: '#000000b0', bold: false, shadow: false }, 0.42] // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
  ];
  FX.MATTES = [['Black', '#000000'], ['White', '#ffffff'], ['Lime', '#d4ff3a'], ['Ink', '#1b1b22'], ['Sunset', '#ff6b4a'], ['Ocean', '#1f6feb']]; // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)
  FX.LOOKS = [['Warm', { temp: 35, sat: 10 }], ['Cool', { temp: -35 }], ['Punchy', { contrast: 25, sat: 30 }], ['B&W', { sat: -100, contrast: 15 }], ['Faded', { contrast: -25, bright: 8, sat: -20 }], ['Night', { bright: -25, temp: -40, sat: -30 }]]; // i18n-ignore: sample words put into the project, and English fallbacks of slopedit.def.* (U.w)

  /** Resolve a title preset for the current sequence size. */
  FX.titlePreset = function ([, tx, y, x]) {
    const p = SE.doc;
    return { text: Object.assign({}, tx, { size: Math.round(tx.size * p.h) }), y: Math.round((y || 0) * p.h), x: Math.round((x || 0) * p.w) };
  };
  function tile(label, icon, payload, onClick, swatch) {
    const b = h('button', { type: 'button', class: 'fx', draggable: 'true', title: label + ' (click to apply, or drag onto the timeline)', onclick: onClick },
      swatch ? h('span', { class: 'fx-sw', style: { background: swatch } }) : SE.icon(icon), h('span', null, label));
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-slopedit-fx', JSON.stringify(payload())); e.dataTransfer.effectAllowed = 'copy'; });
    b.addEventListener('dragend', () => { SE.timeline.ghost = null; SE.timeline.dirty(); });
    return b;
  }
  FX.render = function (list) {
    list.replaceChildren(
      ...SE.trPanel.nodes(),
      h('h4', { class: 'fx-h' }, U.t('slopedit.fx.titles')),
      h('div', { class: 'fx-grid' }, FX.TITLES.map((pr) => tile(U.w('title', pr[0], pr[0]), 'text', () => ({ kind: 'title', preset: FX.titlePreset(pr) }), () => SE.act.addTitle(FX.titlePreset(pr))))),
      ...SE.gfxPanel.nodes(),
      h('h4', { class: 'fx-h' }, U.t('slopedit.fx.colour_mattes')),
      h('div', { class: 'fx-grid' }, FX.MATTES.map(([l, c]) => tile(U.w('matte', l, l), null, () => ({ kind: 'color', color: c }), () => SE.act.addColor(c), c))),
      h('h4', { class: 'fx-h' }, U.t('slopedit.fx.effect_layer')),
      h('div', { class: 'fx-grid' }, h('button', { type: 'button', class: 'fx', title: U.t('slopedit.fx.adds_a_layer_that_applies'), onclick: () => SE.act.addEffect() }, SE.icon('sparkle'), h('span', null, U.t('slopedit.fx.random_effect')))),
      h('h4', { class: 'fx-h' }, U.t('slopedit.fx.colour_looks_selected_clips')),
      h('div', { class: 'fx-grid' }, FX.LOOKS.map(([l, v]) => h('button', { type: 'button', class: 'fx', onclick: () => applyLook(U.w('look', l, l), v) }, SE.icon('color'), h('span', null, U.w('look', l, l))))),
      ...(SE.clipPresets ? SE.clipPresets.sections() : []),
      h('p', { class: 'fx-note' }, U.t('slopedit.fx.tip_drop_a_transition_on')));
  };
  function applyLook(name, v) {
    const ids = SE.app.selectedIds().filter((id) => { const c = M.clip(SE.doc, id); return c && c.kind !== 'audio' && c.kind !== 'color'; });
    if (!ids.length) { SlopUI.toast(U.t('slopedit.fx.select_video_or_image_clips')); return; }
    SE.change(U.t('slopedit.fx.look', { name }), (p) => { for (const id of ids) Object.assign(M.clip(p, id), { bright: 0, contrast: 0, sat: 0, temp: 0 }, v); });
  }

  /* ------------------------------------------------------------ dialogs */
  SE.act.speedDialog = function () {
    const c = SE.app.primary();
    if (!c || !c.media || c.kind === 'image') { SlopUI.toast(U.t('slopedit.fx.select_a_video_or_audio')); return; }
    const pct = SlopUI.number(Math.round(c.speed * 100), 10, 1600, 5);
    const dur = SlopUI.number(U.round(c.dur, 3), 0.05, 36000, 0.01);
    pct.addEventListener('input', () => { dur.value = U.round(c.dur * c.speed / (pct.value / 100), 3); });
    dur.addEventListener('input', () => { pct.value = Math.round(c.dur * c.speed / dur.value * 100); });
    SlopUI.dialog({
      title: U.t('slopedit.fx.speed_duration'), cls: 'sui-narrow',
      body: h('div', null, SlopUI.field(U.t('slopedit.fx.speed'), pct, '%'), SlopUI.field(U.t('slopedit.fx.duration'), dur, 's'), h('p', { class: 'sui-p' }, U.t('slopedit.fx.later_clips_ripple_to_make'))),
      buttons: [{ label: U.t('slopedit.fx.cancel') }, { label: U.t('slopedit.fx.apply'), primary: true, act: () => { const s = U.clamp(+pct.value / 100, 0.1, 16); if (isFinite(s)) SE.change(U.t('slopedit.fx.speed'), (p) => SE.edit.setSpeed(p, c.id, s)); } }]
    });
  };
  SE.act.sequenceSettings = function () {
    const p = SE.doc;
    const size = SlopUI.select(M.PRESETS.concat([['custom', U.t('slopedit.fx.custom')]]), (M.PRESETS.find(([v]) => v === p.w + 'x' + p.h) || ['custom'])[0]);
    const w = SlopUI.number(p.w, 16, 7680, 2), hh = SlopUI.number(p.h, 16, 4320, 2);
    const fps = SlopUI.select([[24, '24'], [25, '25'], [30, '30'], [50, '50'], [60, '60']], p.fps);
    size.addEventListener('change', () => { if (size.value !== 'custom') { const [a, b] = size.value.split('x'); w.value = a; hh.value = b; } });
    SlopUI.dialog({
      title: U.t('slopedit.fx.sequence_settings'), cls: 'sui-narrow',
      body: h('div', null, SlopUI.field(U.t('slopedit.fx.preset'), size), SlopUI.field(U.t('slopedit.fx.width'), w, 'px'), SlopUI.field(U.t('slopedit.fx.height'), hh, 'px'), SlopUI.field(U.t('slopedit.fx.frame_rate'), fps, 'fps')),
      buttons: [{ label: U.t('slopedit.fx.cancel') }, { label: U.t('slopedit.fx.apply'), primary: true, act: () => SE.settings.apply({ w: U.clamp(Math.round(w.value / 2) * 2, 16, 7680), h: U.clamp(Math.round(hh.value / 2) * 2, 16, 4320), fps: +fps.value }) }]
    });
  };
})();
