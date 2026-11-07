/* SlopCut: the Layout lane. p.segments is a list of layout switches { start, layout } (shared/video segments).
   Each switch holds until the next one. applyLane() refits every video clip to the slot region of the layout
   active at its start: a clip on track V(i+1) takes slot i. Clips past a layout's slot count are left as they are.
   The single-layout path (p.layout, templates in layout.js) is separate and unchanged. Call inside SE.change. */
(function () {
  'use strict';
  const SE = window.SE, SV = window.SlopVideo, M = SE.model, L = SE.layout, SEG = SV.segments, T = SV.templates;

  /** The switches of the project (never undefined: older projects have none). */
  L.lanes = (p) => p.segments || [];
  /** Replace the switches and refit the clips. */
  L.setSwitches = function (p, list) {
    p.segments = SEG.clean(list);
    return L.applyLane(p);
  };
  /** Refit video clips to their layout's slot regions. Returns how many clips were refitted. */
  L.applyLane = function (p) {
    const segs = SEG.norm(p.segments || [], Infinity);
    if (!segs.length) return 0;
    const vt = M.videoTracks(p);
    let n = 0;
    for (const c of p.clips) {
      if (c.kind === 'audio') continue;
      const i = vt.findIndex((t) => t.id === c.track);
      const seg = i >= 0 ? SEG.at(segs, c.start) : null;
      const r = seg && seg.layout && i < seg.slots ? T.region(T.get(seg.layout), i) : null;
      if (!r) continue;
      Object.assign(c, L.fit(p, c, r));
      n++;
    }
    return n;
  };
})();
