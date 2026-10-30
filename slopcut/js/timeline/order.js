/* SlopCut: stacking order of video clips. The last video track is drawn on top, the first at the back. "Bring to
   front" moves the clip to the top video track when it has room there, otherwise to a new top track. "Send to back"
   does the same at the bottom. Only the chosen clips move; the others keep their tracks. */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model;

  /** True when a clip on track tk would overlap another clip there (ignoring `skip`). */
  function busy(p, tk, c) {
    const end = M.end(c);
    return p.clips.some((o) => o.id !== c.id && o.track === tk && o.start < end && M.end(o) > c.start);
  }
  /** Moves the clips to the top (front) or bottom (back) video track, making a new one when the target is busy. */
  function place(p, ids, front) {
    for (const id of ids) {
      const c = M.clip(p, id);
      if (!c || c.kind === 'audio') continue;
      const vt = M.videoTracks(p);
      if (!vt.length) continue;
      const edge = front ? vt[vt.length - 1] : vt[0];
      if (c.track === edge.id) continue;
      if (!busy(p, edge.id, c)) { c.track = edge.id; continue; }
      const t = M.addTrack(p, 'video');
      if (!front) { // addTrack puts a new video track last; move it to the bottom
        p.tracks = p.tracks.filter((x) => x.id !== t.id);
        p.tracks.splice(p.tracks.findIndex((x) => x.kind === 'video'), 0, t);
      }
      c.track = t.id;
    }
  }
  SE.order = {
    front: (ids) => SE.change(SE.util.t('slopedit.tl.bring_to_front'), (p) => place(p, ids, true)),
    back: (ids) => SE.change(SE.util.t('slopedit.tl.send_to_back'), (p) => place(p, ids, false)),
  };
})();
