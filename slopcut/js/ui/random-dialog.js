/* SlopCut: the Random edit dialog. Target length, pace, frame size (a preset), the layout (none, a template,
   or a random grid from the list), optional random switches over time, and the seed. The cut list is planned
   live from the same seed Build uses, so what you see is what gets built. Reshuffle draws a new seed and keeps
   the dialog open. Build replaces the timeline in one undoable step. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, R = SE.random, T = SE.templates, S = SE.seed, SV = window.SlopVideo, h = U.h, act = SE.act;
  const GRIDS = ['grid-1x2', 'grid-2x2', 'grid-1x3', 'grid-2x3', 'grid-3x3'];

  act.randomDialog = function () {
    const pool = R.pool();
    const last = SE.doc.random || {};
    const seedNow = S.make();
    const target = SlopUI.number(last.target || 30, R.TARGET[0], R.TARGET[1], 1);
    const pace = SlopUI.select(R.PACES, last.pace || 'medium');
    const size = SlopUI.select(SV.presets.LIST.map((x) => [x.id, x.name]), (SV.presets.LIST.find((x) => x.w === (last.size || {}).w && x.h === (last.size || {}).h) || SV.presets.LIST[2]).id);
    const tpl = SlopUI.select([['', U.t('slopedit.rnd.none_one_clip_after_another')], ['random', U.t('slopedit.rnd.random_grid_from_the_list')]]
      .concat(T.list.map((t) => [t.id, U.t('slopedit.rnd.per_cut', { name: t.name, n: t.slots.length })])), last.tpl || '');
    const switches = SlopUI.check(U.t('slopedit.rnd.switch_layouts_at_random_points'), !!last.switches);
    const pick = new Map(GRIDS.map((id) => [id, SlopUI.check(U.t('slopedit.rnd.cells', { name: T.get(id).name, n: T.get(id).slots.length }), true)]));
    const seed = h('input', { class: 'inp', type: 'text', value: S.hex(seedNow), 'aria-label': U.t('slopedit.insp.seed'), spellcheck: 'false', autocomplete: 'off', maxlength: '32' });
    const summary = h('p', { class: 'sui-p rd-sum', role: 'status' });
    const list = h('ol', { class: 'rd-list', 'aria-label': U.t('slopedit.rnd.cuts_in_order') });
    const src = pool.length
      ? U.t(SE.bin.picked.size ? 'slopedit.rnd.picked' : 'slopedit.rnd.in_bin', { n: pool.length })
      : U.t('slopedit.rnd.no_ready_clips_yet_import');
    const layouts = () => GRIDS.filter((id) => pick.get(id).input.checked);
    const opts = () => {
      const sz = SV.presets.get(size.value);
      return { target: +target.value, pace: pace.value, size: { w: sz.w, h: sz.h }, aspect: sz.aspect, tpl: tpl.value || null,
        switches: switches.input.checked, layouts: layouts(), seed: S.parse(seed.value) };
    };
    const preview = () => {
      const o = opts();
      seed.value = S.hex(o.seed);
      const plan = R.plan(o, pool);
      list.replaceChildren();
      if (!plan) { summary.textContent = src; return null; }
      summary.textContent = U.t('slopedit.rnd.summary', { cuts: plan.cuts.length, s: plan.total.toFixed(1), used: plan.used, clips: plan.clips, layouts: U.t('slopedit.rnd.layouts', { n: plan.segments.length }), seed: plan.seedHex });
      plan.cuts.forEach((beat, i) => list.append(h('li', null, (i + 1) + '. ' + beat.map((x) => {
        const m = SE.doc.media.find((mm) => mm.id === x.media);
        return (m ? m.name : '?') + ' (in ' + x.in.toFixed(2) + ' s)';
      }).join(' | ') + ' · ' + beat[0].start.toFixed(1) + ' s · ' + beat[0].dur.toFixed(2) + ' s')));
      return plan;
    };
    const els = [target, pace, size, tpl, switches.input, ...[...pick.values()].map((c) => c.input)];
    els.forEach((el) => el.addEventListener('change', preview));
    seed.addEventListener('change', preview);
    seed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); preview(); } });
    const body = h('div', { class: 'rd' },
      h('div', { class: 'rd-fields' },
        SlopUI.field(U.t('slopedit.rnd.target_length'), target, 's'), SlopUI.field(U.t('slopedit.rnd.pace'), pace), SlopUI.field(U.t('slopedit.insp.frame_size'), size), SlopUI.field(U.t('slopedit.rnd.layout'), tpl),
        SlopUI.field(U.t('slopedit.insp.seed'), seed)),
      h('div', { class: 'rd-grids' }, switches.el, h('div', { class: 'rd-pick' }, [...pick.values()].map((c) => c.el))),
      h('p', { class: 'sui-p rd-src' }, src),
      summary, list,
      h('p', { class: 'sui-p rd-note' }, U.t('slopedit.rnd.the_same_seed_options_and')));
    SlopUI.dialog({
      title: U.t('slopedit.rnd.random_edit'), cls: 'rd-dlg',
      body,
      buttons: [
        { label: U.t('slopedit.fx.cancel') },
        { label: U.t('slopedit.rnd.reshuffle'), act: () => { seed.value = S.hex(S.make()); preview(); return false; } },
        {
          label: SE.doc.clips.length ? U.t('slopedit.rnd.build_replaces_timeline') : U.t('slopedit.rnd.build_edit'), primary: true,
          act: () => { if (!pool.length) { SlopUI.toast(U.t('slopedit.rnd.import_video_or_still_images')); return false; } return act.randomEdit(opts()) ? undefined : false; }
        }
      ]
    });
    preview();
  };
})();
