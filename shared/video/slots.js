/* Shared video core (window.SlopVideo.slots): slot maths for a layout, as pure functions over plain arrays.
   A layout's slots is an array of clip ids (or null), one entry per slot of its template (grid.js / templates.js
   give the geometry). Slot i sits on video track i (SlopCut: V(i+1)). Every function returns a new array and
   leaves its input alone, so callers can test the result before they write it into a project. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const S = (SV.slots = {});
  const templates = () => SV.templates;

  /** Number of slots of a template id (0 when unknown). */
  S.count = (tplId) => { const t = templates().get(tplId); return t ? t.slots.length : 0; };
  /** Slot rectangles ({x, y, w, h}, fractions of the frame, origin top-left) of a template id; [] when unknown. */
  S.rects = (tplId) => { const t = templates().get(tplId); return t ? t.slots.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) : []; };
  /** A layout's slots with every slot empty. */
  S.empty = (tplId) => Array.from({ length: S.count(tplId) }, () => null);
  /** Slot under a point (fractions of the frame). Layered templates: the top-most (last) slot wins. Null when none. */
  S.cellAt = function (tplId, fx, fy) {
    const rs = S.rects(tplId);
    for (let i = rs.length - 1; i >= 0; i--) {
      const r = rs[i];
      if (fx >= r.x && fx < r.x + r.w && fy >= r.y && fy < r.y + r.h) return i;
    }
    return null;
  };
  /** Same length as n: extra slots are dropped, missing ones are null. */
  S.resize = (slots, n) => Array.from({ length: n }, (_, i) => slots[i] || null);
  /** Put id in slot i. If id already sits in another slot, the two swap, so a drag never duplicates a clip. */
  S.fill = function (slots, i, id) {
    const out = slots.slice();
    if (i < 0 || i >= out.length) return out;
    const k = id ? out.indexOf(id) : -1;
    if (k >= 0 && k !== i) out[k] = out[i] || null;
    out[i] = id || null;
    return out;
  };
  /** Swap the contents of slots i and j (a clip, or an empty slot). */
  S.swap = function (slots, i, j) {
    const out = slots.slice();
    if (i === j || i < 0 || j < 0 || i >= out.length || j >= out.length) return out;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };
  /** Empty slot i. The clip itself is not touched (SlopCut keeps it on the timeline). */
  S.free = function (slots, i) {
    const out = slots.slice();
    if (i >= 0 && i < out.length) out[i] = null;
    return out;
  };
  /** The filled slots as [{ slot, id }], in slot order. */
  S.filled = (slots) => slots.map((id, slot) => ({ slot, id })).filter((x) => x.id);
})();
