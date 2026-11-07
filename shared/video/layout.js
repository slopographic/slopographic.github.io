/* Shared video core (window.SlopVideo.layout): pure layout geometry. fit() gives the transform that puts
   a picture inside a region (aspect kept, letterboxed). A slot i of a layout lives on video track i (V(i+1) in
   SlopCut). Project-specific placement (tracks, clips, undo) stays in each app. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const L = (SV.layout = {});
  const round = (v, k = 5) => { const f = Math.pow(10, k); return Math.round(v * f) / f; };

  /**
   * Transform (x, y, scale) that fits a media of size media {w, h} inside region r of a frame {w, h}.
   * x and y are the centre offsets in pixels from the frame centre; scale multiplies the media size.
   */
  L.fit = function (frame, media, r) {
    const mw = (media && media.w) || frame.w, mh = (media && media.h) || frame.h;
    const b = Math.min(frame.w / mw, frame.h / mh);
    const dw = mw * b, dh = mh * b;
    return {
      x: round((r.x + r.w / 2 - 0.5) * frame.w, 3),
      y: round((r.y + r.h / 2 - 0.5) * frame.h, 3),
      scale: round(Math.min((r.w * frame.w) / dw, (r.h * frame.h) / dh), 5)
    };
  };
  /** Video track index of slot i (slot 0 is the bottom track). */
  L.trackOf = (slot) => slot;
  /** Frame size as {w, h} after the layout's aspect (if any) is applied to size. */
  L.round = round;
})();
