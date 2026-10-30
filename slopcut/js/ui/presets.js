/* SlopCut: clip presets (SlopPresets, shared/presets). The Effects panel lists the effect presets (a colour look: the clip's
 * temp, sat, contrast and bright) and the motion presets (animate-in keys, written like the Animation section writes them),
 * applied to the selected clips, one undo step each. "Save as preset…" reads the first selected clip back into the shared
 * names. Loaded after effects.js and anim.js. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, M = SE.model, h = U.h, SP = window.SlopPresets;
  const LOOK = ['bright', 'contrast', 'sat', 'temp'];
  const KEYED = ['x', 'y', 'scale', 'rot', 'opacity'];

  /** The selected clips that take effects (video and image clips). */
  const selected = () => SE.app.selectedIds().filter((id) => { const c = M.clip(SE.doc, id); return c && c.kind !== 'audio' && c.kind !== 'color'; });

  /** Writes a colour look preset to the clips. Unlisted looks reset to neutral, as the Look buttons do. */
  function applyLook(preset, ids) {
    const look = { bright: 0, contrast: 0, sat: 0, temp: 0 };
    for (const e of preset.params.effects) if (e.on !== false && e.type === 'colour-look') Object.assign(look, e.p);
    SE.change(U.t('slopedit.pre.preset', { name: preset.label }), (p) => { for (const id of ids) Object.assign(M.clip(p, id), look); });
  }
  /** Writes a motion preset as animate-in keys over the first part of each clip. Other keys are kept. */
  function applyMotion(preset, ids) {
    SE.change(U.t('slopedit.pre.animate_in', { name: preset.label }), (p) => {
      for (const id of ids) {
        const c = M.clip(p, id), cut = SP.motion.toCut(preset.params, p.w, p.h, c.dur), D = Math.min(preset.params.duration, c.dur);
        c.anim = c.anim || {};
        for (const prop of Object.keys(cut)) {
          const later = (c.anim[prop] || []).filter((k) => k.t > D + 1e-3);
          c.anim[prop] = cut[prop].concat(later);
        }
        SE.anim.tidy(c);
      }
    });
  }
  function apply(preset) {
    const ids = selected();
    if (!ids.length) { SlopUI.toast(U.t('slopedit.fx.select_video_or_image_clips')); return false; }
    if (preset.kind === 'effect') applyLook(preset, ids);
    else applyMotion(preset, ids);
  }
  /** The shared names of a clip's colour look (effect), or of its animate-in keys (motion), or null when it has neither. */
  function fromClip(c, kind, doc) {
    if (kind === 'effect') {
      if (!LOOK.some((k) => c[k])) return null;
      return { effects: [{ type: 'colour-look', p: Object.fromEntries(LOOK.map((k) => [k, c[k] || 0])) }] };
    }
    const tracks = {};
    let end = 0;
    for (const prop of KEYED) {
      const keys = (c.anim && c.anim[prop]) || [];
      if (!keys.length) continue;
      const div = prop === 'x' ? doc.w : prop === 'y' ? doc.h : 1;
      tracks[prop] = keys.map((k) => { end = Math.max(end, k.t); return Object.assign({ t: k.t, value: k.value / div }, k.ease ? { ease: k.ease } : {}); });
    }
    return Object.keys(tracks).length ? SP.motion.make(Math.max(end, 0.05), tracks) : null;
  }
  function saveDialog() {
    const ids = selected();
    if (!ids.length) { SlopUI.toast(U.t('slopedit.pre.select_a_clip_first')); return; }
    const c = M.clip(SE.doc, ids[0]);
    SP.openSave({
      app: 'slopedit', kinds: ['effect', 'motion'], title: U.t('slopedit.pre.save_clip_as_preset'),
      defaultName: 'My ' + (c.kind || 'clip') + ' look', // i18n-ignore: the preset's own name, stored in the user's library
      build: (kind) => fromClip(c, kind, SE.doc),
    });
  }
  const tile = (p) => h('button', { type: 'button', class: 'fx', title: p.description || p.label, onclick: () => apply(p) }, h('span', null, p.label));

  /** The sections the Effects panel shows below its built-in tiles. */
  SE.clipPresets = {
    sections() {
      const effects = SP.list({ kind: 'effect', app: 'slopedit' }), motion = SP.list({ kind: 'motion', app: 'slopedit' });
      return [
        h('h4', { class: 'fx-h' }, U.t('slopedit.pre.effect_presets_selected_clips')),
        h('div', { class: 'fx-grid' }, effects.map(tile)),
        h('h4', { class: 'fx-h' }, U.t('slopedit.pre.motion_presets_animate_in')),
        h('div', { class: 'fx-grid' }, motion.map(tile)),
        h('div', { class: 'fx-grid' },
          h('button', { type: 'button', class: 'fx', title: U.t('slopedit.pre.save_the_first_selected_clip'), onclick: saveDialog }, SE.icon('sparkle'), h('span', null, U.t('slopedit.pre.save_as_preset'))),
          h('button', { type: 'button', class: 'fx', title: U.t('slopedit.pre.browse_import_and_export_presets'), onclick: () => SP.openPicker({ app: 'slopedit', title: U.t('slopedit.pre.clip_presets'), onApply: apply }) }, SE.icon('sparkle'), h('span', null, U.t('slopedit.pre.all_presets')))),
      ];
    },
  };
  SP.useDrive().catch(() => null);
})();
