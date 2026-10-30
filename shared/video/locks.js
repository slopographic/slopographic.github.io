/* Shared video core (window.SlopVideo.locks): locked slots. A lock is { cut, slot, media, in, fill }: cut is the
   cut's number in the plan (0-based), slot the slot in it. apply() puts a locked slot's clip back after a new plan is
   made (Remix or Reshuffle), so only the unlocked slots change. The cut's timing is the new plan's. Pure. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const LK = (SV.locks = {});

  LK.has = (locks, cut, slot) => (locks || []).some((l) => l.cut === cut && l.slot === slot);
  /** The lock list with slot (cut, slot) toggled; item is the cut item to lock (ignored when unlocking). */
  LK.toggle = function (locks, cut, slot, item) {
    const list = (locks || []).slice();
    const i = list.findIndex((l) => l.cut === cut && l.slot === slot);
    if (i >= 0) list.splice(i, 1);
    else if (item) list.push({ cut, slot, media: item.media, in: item.in || 0, fill: item.fill || 'auto', pan: item.pan });
    return list;
  };
  /** Locks for every slot of cut (all locked, or all unlocked when every slot already is). */
  LK.toggleCut = function (locks, cut, beat) {
    const all = beat.every((it) => LK.has(locks, cut, it.slot));
    let list = (locks || []).filter((l) => l.cut !== cut);
    if (!all) for (const it of beat) list = list.concat([{ cut, slot: it.slot, media: it.media, in: it.in || 0, fill: it.fill || 'auto', pan: it.pan }]);
    return list;
  };
  /**
   * Puts each locked clip back into the plan (mutates plan.cuts). media: the bin items ({ id, kind, dur }). Locks whose
   * cut or slot is gone, or whose clip is no longer in the bin, are skipped. Returns the plan.
   */
  LK.apply = function (plan, locks, media) {
    if (!plan || !plan.cuts) return plan;
    const placed = new Map(); // cut -> media ids placed by locks
    for (const l of locks || []) {
      const beat = plan.cuts[l.cut], it = beat && beat.find((x) => x.slot === l.slot);
      const m = (media || []).find((x) => x.id === l.media);
      if (!it || !m) continue;
      const used = placed.get(l.cut) || new Set();
      if (used.has(m.id)) continue; // a locked cut never shows the same clip twice
      used.add(m.id); placed.set(l.cut, used);
      it.media = m.id;
      it.in = m.kind === 'image' ? 0 : Math.max(0, Math.min(l.in || 0, m.dur - it.dur));
      it.fill = l.fill || 'auto';
      if (l.pan) it.pan = l.pan;
    }
    // unlocked slots that now repeat a clip of their cut take a clip the cut does not use yet
    plan.cuts.forEach((beat, ci) => {
      const used = placed.get(ci) || new Set(), locked = new Set((locks || []).filter((l) => l.cut === ci).map((l) => l.slot));
      for (const it of beat) {
        if (locked.has(it.slot)) continue;
        if (!used.has(it.media)) { used.add(it.media); continue; }
        const free = (media || []).find((m) => !beat.some((x) => x.media === m.id) && !used.has(m.id));
        if (free) { it.media = free.id; it.in = free.kind === 'image' ? 0 : Math.max(0, Math.min(it.in || 0, free.dur - it.dur)); used.add(free.id); }
      }
      placed.set(ci, used);
    });
    return plan;
  };
})();
