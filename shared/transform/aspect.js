/* Shared transform helper: the original aspect ratio of an object and how to restore it.
   Used by Free Transform (PhotoSlop), the object handles (SlopVector), resize (Slides) and the clip box (Slop Cut).
   window.SlopAspect: ratio(obj) and restore(box, original, keep). Classic script, no dependencies. See HANDOFF.md. */
(function (root) {
  'use strict';
  const ok = (n) => typeof n === 'number' && isFinite(n) && n > 0;

  /** The object's source ratio (width / height of its un-cropped source, from obj.src = { w, h }), or null when unknown.
      Crop and rotation do not change it: a cropped object keeps the ratio of the whole source, and a turned one keeps its own ratio. */
  function ratio(obj) {
    const s = obj && obj.src;
    return s && ok(s.w) && ok(s.h) ? s.w / s.h : null;
  }

  /** A ratio from a number, an object with src, or a { w, h } size. Null when there is none. */
  function toRatio(v) {
    if (typeof v === 'number') return ok(v) ? v : null;
    if (!v) return null;
    if ('src' in v) return ratio(v);
    return ok(v.w) && ok(v.h) ? v.w / v.h : null;
  }

  /** The box { w, h } (current size) with the original ratio. keep 'w' (the default) keeps the width and sets the
      height; keep 'h' keeps the height and sets the width. Without a usable ratio the box comes back unchanged. */
  function restore(box, original, keep) {
    const w = box ? box.w : 0, h = box ? box.h : 0, r = toRatio(original);
    if (!r || !(w >= 0) || !(h >= 0)) return { w, h };
    return keep === 'h' ? { w: h * r, h } : { w, h: w / r };
  }

  const api = { ratio, restore };
  root.SlopAspect = api;
})(typeof window !== 'undefined' ? window : globalThis);
