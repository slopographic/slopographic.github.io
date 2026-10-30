/* Shared video core (window.SlopVideo.timing): per-slot timing inside a cut. Modes: 'same' (every slot switches at the
   cut's start, the current behaviour), 'stagger' (each slot starts at its own offset, a random amount up to
   o.stagger seconds, and ends with the cut) and 'random' (each slot plays a random length between o.min and o.max,
   never past the cut). Videos: 'through' plays from the clip's start (in 0, up to the cut or the clip's end), 'random'
   starts at a random point and plays the slot's length. holds() then gives each slot's clip its window: it holds until
   the next clip in that slot, the end of its layout span, or the end of the reel. Pure, uses only the rng it is given. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const TM = (SV.timing = {});
  const round = (v, k = 2) => { const f = Math.pow(10, k); return Math.round(v * f) / f; };

  /** [[id, label]] in the chosen language (getters: read them when the list is shown; labels: ui.video.timing / vplay). */
  Object.defineProperty(TM, 'MODES', { enumerable: true, get: () => SV.words('timing', ['same', 'stagger', 'random']) });
  Object.defineProperty(TM, 'VIDEO', { enumerable: true, get: () => SV.words('vplay', ['through', 'random']) });
  TM.LEN = { min: 1, max: 3, stagger: 1 };

  /**
   * Timing of one cut. picks: media objects ({ id, kind, dur }) in slot order; start, d: the cut's start and length;
   * o: { timing, video, min, max, stagger }; rng: a generator. Returns [{ media, slot, start, dur, in }].
   */
  TM.apply = function (picks, start, d, o, rng) {
    const mode = o.timing || 'same', lo = Math.min(+o.min || TM.LEN.min, +o.max || TM.LEN.max), hi = Math.max(+o.min || TM.LEN.min, +o.max || TM.LEN.max);
    return picks.map((m, slot) => {
      let s = start, len = d;
      if (mode === 'stagger') { const off = Math.min(d * 0.5, Math.max(0, +o.stagger || 0) * rng()); s = start + off; len = d - off; }
      else if (mode === 'random') len = Math.min(d, lo + (hi - lo) * rng());
      len = Math.max(0.01, round(len));
      let inPt = 0;
      if (m.kind === 'video' && o.video === 'random') {
        const room = m.dur - len;
        inPt = room > 0 ? round(rng() * room) : 0;
      }
      return { media: m.id, slot, start: round(s), dur: len, in: inPt };
    });
  };
  /**
   * Gives each item its hold: the time its clip stays on its slot. holds to the next item in the same slot, the end
   * of its layout span (segs, from SlopVideo.segments) or total. Mutates and returns cuts.
   */
  TM.holds = function (cuts, total, segs) {
    const bySlot = new Map();
    for (const it of cuts.flat()) { if (!bySlot.has(it.slot)) bySlot.set(it.slot, []); bySlot.get(it.slot).push(it); }
    const spanEnd = (t) => { const s = (segs || []).find((x) => t >= x.start - 1e-6 && t < x.end - 1e-6); return s ? s.end : total; };
    for (const list of bySlot.values()) {
      list.sort((a, b) => a.start - b.start);
      list.forEach((it, i) => { const next = i + 1 < list.length ? list[i + 1].start : total; it.hold = round(Math.min(next, spanEnd(it.start))); });
    }
    return cuts;
  };
})();
