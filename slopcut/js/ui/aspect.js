/* SlopCut: Restore original aspect ratio for a clip with media (the monitor and timeline clip menus, the inspector's
   Transform section, the command palette). The clip scales uniformly, so its box changes shape only through its crop.
   The source ratio is the media's own un-cropped size. Restoring keeps the visible width and sets the vertical crop so
   the visible box has the source's ratio. One undo step. Exposes window.SE.aspect. */
(function () {
  'use strict';
  const SE = window.SE, M = SE.model, Aspect = window.SlopAspect;

  /** The source of a clip's picture (its media's size), or null for titles, colour and effects. */
  function sourceOf(p, c) {
    if (!c || !c.media || c.kind === 'title' || c.kind === 'color' || c.kind === 'effect') return null;
    const m = M.media(p, c.media);
    return m && m.w && m.h ? { src: { w: m.w, h: m.h } } : null;
  }
  /** True when restoring can act: the clip has a source ratio and some picture left after its crop. */
  function targetOf(p, c) {
    const s = sourceOf(p, c);
    if (!s || Aspect.ratio(s) === null) return null;
    return 1 - c.cropL - c.cropR > 0 && 1 - c.cropT - c.cropB > 0 ? s : null;
  }
  /** Sets the clip's vertical crop so its visible box has the source ratio. The visible width (and scale) stays. */
  function restore(id) {
    const c0 = M.clip(SE.doc, id); if (!c0 || !targetOf(SE.doc, c0)) return false;
    SE.change(SE.util.t('slopedit.insp.restore_aspect_ratio'), (p) => {
      const c = M.clip(p, id), m = M.media(p, c.media), s = sourceOf(p, c);
      const vw = 1 - c.cropL - c.cropR, vh = 1 - c.cropT - c.cropB;
      const want = Aspect.restore({ w: vw * m.w, h: vh * m.h }, s, 'w');
      const total = 1 - want.h / m.h, cur = c.cropT + c.cropB; // the vertical crop, split as it was
      if (cur > 0) { c.cropT = (total * c.cropT) / cur; c.cropB = (total * c.cropB) / cur; }
      else { c.cropT = total / 2; c.cropB = total / 2; }
    });
    return true;
  }
  SE.aspect = { sourceOf, targetOf, restore: (id) => restore(id) };
})();
