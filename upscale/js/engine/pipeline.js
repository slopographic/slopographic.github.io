/* Slop Upscale pipeline (page side): enlarges one picture (a canvas) tile by tile through the engine, so the memory
 * used by the model stays bounded whatever the picture size. Each tile's core is painted into the output canvas as
 * soon as it arrives, so the picture fills in while it runs. Classic script; sets SlopUpscalePipeline.
 *   run(src, o) → Promise<HTMLCanvasElement>
 *     src: canvas with the picture;  o.scale: 2 or 4;  o.model: a model id, or null for Lanczos only
 *     o.bytes: the model file, for an opt-in model that is not bundled;  o.tile / o.overlap: tile and margin in px
 *     o.onProgress(done, total);  o.signal: { cancelled: bool } (checked between tiles)
 *   check(W, H, scale)  → null, or the reason the result is too large */
(function (root) {
  'use strict';
  const T = root.SlopUpscaleTiling, E = root.SlopUpscaleEngine;
  const MAX_OUT = 64e6, MAX_SIDE = 16384;
  // the reason in the page's language; English when the page has no tables (a test page)
  const tr = (k, en, v) => (root.SlopI18n && root.SlopI18n.has(k) ? root.SlopI18n.t(k, v) : en);

  /** Null when the result fits; otherwise the reason. */
  function check(W, H, scale) {
    const ow = W * scale, oh = H * scale;
    if (ow > MAX_SIDE || oh > MAX_SIDE) return tr('upscale.run.too_big', `The result would be ${ow} × ${oh} px. The largest side is ${MAX_SIDE} px.`, { w: String(ow), h: String(oh), max: String(MAX_SIDE) });   // i18n-ignore: English fallback
    if (ow * oh > MAX_OUT) return tr('upscale.run.too_many', `The result would be ${(ow * oh / 1e6).toFixed(1)} megapixels. The limit is ${MAX_OUT / 1e6}. Use 2× or a smaller picture.`, { mp: (ow * oh / 1e6).toFixed(1), max: String(MAX_OUT / 1e6) });   // i18n-ignore: English fallback
    return null;
  }

  async function run(src, o) {
    const W = src.width, H = src.height, s = o.scale;
    const why = check(W, H, s);
    if (why) throw new Error(why);
    const plan = T.plan(W, H, { tile: o.tile || 128, overlap: o.overlap == null ? 16 : o.overlap });
    const out = document.createElement('canvas');
    out.width = W * s; out.height = H * s;
    const octx = out.getContext('2d');
    const sctx = src.getContext('2d', { willReadFrequently: true });
    if (o.model) await E.load(o.model, o.bytes || null);
    let done = 0;
    for (const t of plan.tiles) {
      if (o.signal && o.signal.cancelled) throw new Error('Cancelled');
      const img = sctx.getImageData(t.src.x, t.src.y, t.src.w, t.src.h);
      const r = await E.tile(o.model || null, img.data, t.src.w, t.src.h, s);
      const core = T.cropRGBA(r.rgba, r.w, T.scaleRect(t.inner, s));
      octx.putImageData(new ImageData(core, t.core.w * s, t.core.h * s), t.core.x * s, t.core.y * s);
      if (o.onProgress) o.onProgress(++done, plan.tiles.length);
    }
    return out;
  }

  root.SlopUpscalePipeline = { run, check, limits: { MAX_OUT, MAX_SIDE } };
})(typeof window !== 'undefined' ? window : globalThis);
