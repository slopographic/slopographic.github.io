/* SlopCut: the Inspector. With nothing selected it shows the sequence settings; with a clip it shows
   timing, transform (position, scale, rotation, opacity, crop), colour, fades, transition, speed,
   text (titles) and audio (volume, fades, keyframes). Builders for clip sections: insp-clip.js; keyframes and the
   random effect layer: insp-anim.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, F = SE.fields;
  const h = U.h;
  const I = SE.inspector = { fields: [] };
  let root, body, shownKey = '';

  /** Setter that applies to the selected clip with this id (and keeps one undo step per drag). */
  I.clipSet = (id, prop, label, fn) => F.setter(label, id + ':' + prop, (p, v) => { const c = M.clip(p, id); if (c) fn ? fn(c, v, p) : (c[prop] = v); });
  I.clipGet = (id, prop, d = 0) => () => { const c = M.clip(SE.doc, id); return c ? c[prop] : d; };
  const track = (f) => { I.fields.push(f); return f; };
  I.track = track;

  /* ------------------------------------------------------------ sequence */
  SE.settings = {
    apply(o) {
      SE.change(U.t('slopedit.fx.sequence_settings'), (p) => { Object.assign(p, o); });
      SE.emit('settings', {});
    }
  };
  function sequence() {
    const p = SE.doc, set = (k) => (v) => SE.settings.apply({ [k]: v });
    const presets = M.PRESETS.concat([['custom', U.t('slopedit.fx.custom')]]);
    const cur = () => (M.PRESETS.find(([v]) => v === SE.doc.w + 'x' + SE.doc.h) || ['custom'])[0];
    body.append(
      h('div', { class: 'ins-title' }, SE.icon('film'), h('b', null, U.t('slopedit.cmd.sequence'))),
      F.section(U.t('slopedit.exp.format'), 'sliders',
        track(F.select(U.t('slopedit.insp.frame_size'), presets, cur, (v) => { if (v !== 'custom') { const [w, hh] = v.split('x').map(Number); SE.settings.apply({ w, h: hh }); } })),
        track(F.pair('W × H', { label: U.t('slopedit.fx.width'), get: () => SE.doc.w, set: (v) => SE.settings.apply({ w: U.clamp(Math.round(v / 2) * 2, 16, 7680) }) }, { label: U.t('slopedit.fx.height'), get: () => SE.doc.h, set: (v) => SE.settings.apply({ h: U.clamp(Math.round(v / 2) * 2, 16, 4320) }) })),
        track(F.select(U.t('slopedit.fx.frame_rate'), [[24, '24 fps'], [25, '25 fps'], [30, '30 fps'], [50, '50 fps'], [60, '60 fps']], () => SE.doc.fps, (v) => set('fps')(+v))),
        track(F.color(U.t('slopedit.insp.background'), () => SE.doc.bg, set('bg')))),
      F.section(U.t('slopedit.insp.project'), 'info',
        h('p', { class: 'ins-note' }, [U.t('slopedit.insp.n_clips', { n: p.clips.length }), U.t('slopedit.insp.n_tracks', { n: p.tracks.length }), U.t('slopedit.insp.n_markers', { n: p.markers.length }), U.timecode(M.duration(p), p.fps)].join(' · ')),
        h('p', { class: 'ins-note' }, U.t('slopedit.insp.select_a_clip_on_the'))));
  }

  /* ------------------------------------------------------------ clip */
  function clipPanel(c) {
    const id = c.id, p = SE.doc;
    const KC = { video: '--clip-video', audio: '--clip-audio', image: '--clip-image', title: '--clip-title', color: '--clip-color' };
    const n = SE.app.selectedIds().length;
    body.append(h('div', { class: 'ins-title' }, h('span', { class: 'ins-sw', style: { background: 'var(' + KC[c.kind] + ')' } }), h('b', null, M.label(p, c)), n > 1 ? h('span', { class: 'ins-note' }, '+' + (n - 1) + ' more') : null));
    const fps = p.fps;
    body.append(F.section(U.t('slopedit.insp.timing'), 'film',
      track(F.number(U.t('slopedit.insp.start'), I.clipGet(id, 'start'), (v) => SE.change(U.t('slopedit.insp.move_clip'), (d) => SE.edit.move(d, [id], Math.max(0, v) - M.clip(d, id).start, 0)), { step: 1 / fps, unit: 's' })),
      track(F.number(U.t('slopedit.fx.duration'), I.clipGet(id, 'dur'), (v) => SE.change(U.t('slopedit.fx.duration'), (d) => SE.edit.trim(d, id, 'out', M.clip(d, id).start + Math.max(1 / fps, v))), { step: 1 / fps, unit: 's' })),
      c.media && c.kind !== 'image' ? track(F.number(U.t('slopedit.insp.source_in'), I.clipGet(id, 'in'), (v) => SE.change(U.t('slopedit.insp.source_in'), (d) => { const cc = M.clip(d, id); cc.in = U.clamp(v, 0, Math.max(0, M.srcLen(d, cc) - cc.dur * cc.speed)); }), { step: 1 / fps, unit: 's' })) : null,
      c.media && c.kind !== 'image' ? track(F.slider(U.t('slopedit.fx.speed'), I.clipGet(id, 'speed', 1), (v) => SE.change(U.t('slopedit.fx.speed'), (d) => SE.edit.setSpeed(d, id, v), { key: 'insp:speed' + id }), { min: 10, max: 400, step: 5, scale: 100, unit: '%', reset: 1 })) : null));
    if (c.kind !== 'audio' && c.kind !== 'effect') I.visualSections(c);
    if (c.kind !== 'audio' && c.kind !== 'effect') body.append(I.animSection(c));
    if (c.kind === 'video' || c.kind === 'image' || c.kind === 'title' || c.kind === 'color') I.maskSection(c);
    if (c.kind === 'effect') body.append(I.effectSection(c));
    if (c.kind === 'graphic') I.graphicSection(c);
    if (c.kind === 'title') I.textSection(c);
    if (c.kind === 'color') body.append(F.section(U.t('slopedit.insp.matte'), 'color', track(F.color(U.t('slopedit.gfx.colour'), I.clipGet(id, 'color'), I.clipSet(id, 'color', U.t('slopedit.insp.matte_colour'))))));
    if (c.kind === 'audio') I.audioSection(c);
    body.append(h('div', { class: 'ins-actions' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => SE.cmd.run('edit.split') }, SE.icon('split'), U.t('slopedit.insp.split')), // i18n-ignore: class names
      h('button', { type: 'button', class: 'btn sm', onclick: () => SE.cmd.run('edit.delete') }, SE.icon('trash'), U.t('ui.delete')), // i18n-ignore: class names
      h('button', { type: 'button', class: 'btn sm', title: U.t('slopedit.insp.transform_colour_fades_volume_keyframes'), onclick: () => SE.cmd.run('clip.reset') }, U.t('slopedit.insp.reset_all')))); // i18n-ignore: class names
  }

  I.render = function () {
    if (!root) return;
    const c = SE.app.primary();
    const key = c ? c.id + ':' + c.kind + ':' + (c.trIn ? 1 : 0) + ':' + SE.app.selectedIds().length + ':' + (c.keys ? c.keys.length : 0) + ':' + (c.mask ? 1 : 0) : 'seq:' + SE.doc.clips.length;
    if (key === shownKey) { I.fields.forEach((f) => f.sync()); return; }
    shownKey = key;
    I.fields = [];
    const scroll = body.scrollTop;
    body.replaceChildren();
    if (c) clipPanel(c); else sequence();
    body.scrollTop = scroll;
  };
  /** A language change: the panel draws again even when the selection is the same. */
  I.relabel = function () { shownKey = null; I.render(); };
  I.focusText = function () {
    if (SE.app.isPhone()) SE.app.setPane('insp');
    setTimeout(() => { const t = body.querySelector('textarea'); if (t) { t.focus(); t.select(); } }, 30);
  };
  I.init = function (el) {
    root = el;
    body = h('div', { class: 'insp-body' });
    root.append(h('div', { class: 'pane-head' }, h('span', { class: 'pane-title' }, U.t('slopedit.app.inspector'))), body);
    const r = U.debounce(I.render, 30);
    SE.on('select', () => { shownKey = ''; I.render(); });
    SE.on('change', r); SE.on('settings', r); SE.on('doc', () => { shownKey = ''; I.render(); });
    I.render();
  };
})();
