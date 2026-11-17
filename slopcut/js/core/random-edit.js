/* SlopCut: the random edit as a project write. The plan (cuts, seed, switches) is pure and lives in
   shared/video (SlopVideo.random); SE.random is that module plus build(), which writes a plan into the project as
   ordinary clips inside one SE.change (one undo step). Slot i of the layout active at a cut's start is video
   track V(i+1); the switches are kept as p.segments for the Layout lane. */
(function () {
  'use strict';
  const SE = window.SE, SV = window.SlopVideo, U = SE.util, M = SE.model, L = SE.layout;
  const R = SE.random = Object.assign({}, SV.random);

  /** Write a plan into the project: replaces the timeline clips (call inside SE.change). */
  R.build = function (p, plan) {
    if (!plan) return 0;
    const meta = new Map(p.media.map((m) => [m.id, m]));
    if (plan.size) { p.w = plan.size.w; p.h = plan.size.h; } else L.setAspect(p, plan.aspect);
    p.clips = [];
    p.layout = null;
    p.segments = (plan.segments || []).filter((s) => s.layout).map((s) => ({ start: s.start, layout: s.layout }));
    for (let i = 0; i < plan.slots; i++) { L.ensureTrack(p, 'video', i); L.ensureTrack(p, 'audio', i); }
    for (const beat of plan.cuts) for (const it of beat) {
      const m = meta.get(it.media);
      if (!m) continue;
      const c = M.newClip({ kind: m.kind === 'image' ? 'image' : 'video', media: m.id, track: M.videoTracks(p)[it.slot].id, start: it.start, dur: it.dur, in: it.in });
      const r = R.regionFor(plan, it);
      if (r) Object.assign(c, L.fit(p, c, r));
      p.clips.push(c);
      if (m.kind === 'video' && m.hasAudio) {
        const a = M.newClip({ kind: 'audio', media: m.id, track: L.ensureTrack(p, 'audio', it.slot).id, start: it.start, dur: it.dur, in: it.in, link: U.uid('l') });
        c.link = a.link;
        p.clips.push(a);
      }
    }
    p.random = { seed: plan.seed, seedHex: plan.seedHex, target: plan.target, pace: plan.pace, aspect: plan.aspect, size: plan.size || null, tpl: plan.tpl, switches: !!plan.switches, layouts: plan.layouts, cuts: plan.cuts.length, total: plan.total };
    return plan.total;
  };
})();
