/* SlopCut: template and random-edit actions (SE.act.*), run by commands and menus.
   Templates apply to the selected timeline clips, else to the media picked in the bin (placed at the
   playhead), else give an empty layout at the playhead. With a layout already on, choosing a template re-flows it. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, T = SE.templates, L = SE.layout, R = SE.random, S = SE.seed, A = SE.app, act = SE.act;

  /** Bin items picked (Ctrl/Shift-click) that are ready to use. */
  R.picked = () => SE.doc.media.filter((m) => SE.bin.picked.has(m.id) && SE.media.ready(m.id));
  /** The media the random edit draws from: the picked items, or every ready item when none is picked. */
  R.pool = () => {
    const ready = SE.doc.media.filter((m) => SE.media.ready(m.id));
    const pk = ready.filter((m) => SE.bin.picked.has(m.id));
    return pk.length ? pk : ready;
  };

  act.openTemplates = () => SE.bin.show('templates');
  act.applyTemplate = function (id) {
    const tpl = T.get(id);
    if (!tpl) return;
    if (SE.doc.layout) {
      SE.change(U.t('slopedit.tpl.change_template'), (p) => L.setTemplate(p, id));
      A.status(tpl.name + ': ' + U.t('slopedit.tpl.reflowed'));
      return;
    }
    const ids = A.selectedIds().filter((x) => { const c = SE.model.clip(SE.doc, x); return c && c.kind !== 'audio'; });
    if (ids.length) {
      let n = 0;
      SE.change(U.t('slopedit.menu.apply_template'), (p) => { n = L.apply(p, id, ids); return n ? undefined : false; });
      if (n) A.status(tpl.name + ': ' + U.t('slopedit.tpl.filled', { k: n, n: tpl.slots.length }));
      return;
    }
    const metas = R.picked();
    if (metas.length) {
      const t = U.snapFrame(SE.player ? SE.player.time : 0, SE.doc.fps);
      let n = 0;
      SE.change(U.t('slopedit.menu.apply_template'), (p) => {
        const made = metas.slice(0, tpl.slots.length).map((m) => L.createMedia(p, m, t, tpl.dur));
        n = L.apply(p, id, made, { dur: tpl.dur });
      });
      A.status(tpl.name + ': ' + U.t('slopedit.tpl.placed', { n }));
      return;
    }
    // Nothing chosen: an empty layout at the playhead, one track and one cell per slot. Drag bin items into the cells.
    const t0 = U.snapFrame(SE.player ? SE.player.time : 0, SE.doc.fps);
    SE.change(U.t('slopedit.tpl.add_layout'), (p) => L.empty(p, id, t0));
    A.status(tpl.name + ': ' + U.t('slopedit.tpl.empty_slots', { n: tpl.slots.length }));
  };
  act.clearLayout = function () {
    if (!SE.doc.layout) return;
    SE.change(U.t('slopedit.tpl.clear_layout'), (p) => L.clear(p));
    A.status(U.t('slopedit.tpl.layout_cleared_the_clips_stay'));
  };
  /** Build a random edit from options (see R.norm). Returns the plan, or false when there is nothing to use. */
  act.randomEdit = function (o) {
    const plan = R.plan(o || {}, R.pool());
    if (!plan) { SlopUI.toast(U.t('slopedit.tpl.no_usable_clips_import_video')); return false; }
    SE.change(U.t('slopedit.rnd.random_edit'), (p) => { R.build(p, plan); });
    A.select([]);
    if (SE.player) SE.player.seek(0);
    SE.emit('settings', {});
    A.status(U.t('slopedit.tpl.random_done', { s: plan.total.toFixed(1), n: plan.cuts.length, seed: plan.seedHex }));
    return plan;
  };
  /** Same options as the last random edit with a new seed (or the given seed). */
  act.reshuffleRandom = function (seed) {
    const last = SE.doc.random;
    if (!last) { A.status(U.t('slopedit.tpl.make_a_random_edit_first')); return false; }
    return act.randomEdit({ target: last.target, pace: last.pace, aspect: last.aspect, size: last.size, tpl: last.tpl, switches: last.switches, layouts: last.layouts, seed: seed == null ? S.make() : seed });
  };
})();
