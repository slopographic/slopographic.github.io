/* SlopFaces: the detector's maths, with no DOM and no model. Decodes YuNet's raw outputs (strides 8, 16 and 32) into
 * boxes in source-image pixels, drops weak boxes (score threshold) and suppresses overlapping ones (greedy non-maximum
 * suppression). Boxes keep the five landmarks (kps) when the model gives them. Classic script; creates or extends window.SlopFaces. The model and its loader are in index.js.
 * Decoding follows OpenCV's FaceDetectorYN; see vendor/face/README.md. */
(function (g) {
  'use strict';
  const F = (g.SlopFaces = g.SlopFaces || {});
  const INPUT_SIZE = 640;
  const STRIDES = [8, 16, 32];
  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  /** Scale that letterboxes a w x h image into the model's square input (top-left aligned, as the model expects). */
  F.scaleFor = (w, h) => Math.min(INPUT_SIZE / w, INPUT_SIZE / h);

  /** Intersection over union of two boxes {x, y, w, h}. 0 when they do not touch. */
  F.iou = function (a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  };

  /** Keeps boxes with score >= minScore, most confident first, and drops a box that overlaps a kept one by more than
   * maxIou. At most `max` boxes. Boxes with a bad score or no area are dropped. Returns new objects. */
  F.filterBoxes = function (boxes, { minScore = 0.6, maxIou = 0.3, max = 400 } = {}) {
    const ok = (boxes || []).filter((b) => b && Number.isFinite(b.score) && b.score >= minScore && b.w > 0 && b.h > 0);
    ok.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const b of ok) {
      if (kept.length >= max) break;
      if (kept.every((k) => F.iou(k, b) <= maxIou)) kept.push(b);
    }
    return kept.map((b) => (b.kps ? { x: b.x, y: b.y, w: b.w, h: b.h, score: b.score, kps: b.kps } : { x: b.x, y: b.y, w: b.w, h: b.h, score: b.score }));
  };

  /** Decodes the raw YuNet outputs. out: { cls_8, obj_8, bbox_8, kps_8, cls_16, ... } as arrays or typed arrays (one
   * value per anchor, 4 box values per anchor). scale: the letterbox scale from scaleFor(). Returns boxes in source
   * pixels with score >= minScore (not yet suppressed: pass them to filterBoxes). */
  F.decodeYunet = function (out, { scale = 1, minScore = 0.6 } = {}) {
    const boxes = [];
    for (const st of STRIDES) {
      const cols = INPUT_SIZE / st;
      const cls = out['cls_' + st], obj = out['obj_' + st], bb = out['bbox_' + st], kp = out['kps_' + st];
      if (!cls || !obj || !bb) throw new Error('The face model returned an unexpected output.');
      for (let i = 0; i < cls.length; i++) {
        const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
        if (!(score >= minScore)) continue;
        const col = i % cols, row = Math.floor(i / cols);
        const cx = (col + bb[i * 4]) * st, cy = (row + bb[i * 4 + 1]) * st;
        const w = Math.exp(bb[i * 4 + 2]) * st, h = Math.exp(bb[i * 4 + 3]) * st;
        const box = { x: (cx - w / 2) / scale, y: (cy - h / 2) / scale, w: w / scale, h: h / scale, score };
        // Five landmarks (eyes, nose, mouth corners) in source pixels, when the model has them: the recogniser aligns on them.
        if (kp && kp.length >= (i + 1) * 10) box.kps = Array.from({ length: 5 }, (_, k) => [(((col + kp[i * 10 + 2 * k]) * st)) / scale, (((row + kp[i * 10 + 2 * k + 1]) * st)) / scale]);
        boxes.push(box);
      }
    }
    return boxes;
  };

  F.INPUT_SIZE = INPUT_SIZE;
})(typeof window !== 'undefined' ? window : globalThis);
