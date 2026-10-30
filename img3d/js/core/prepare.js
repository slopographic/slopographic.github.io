/* Slop Image to 3D: turns a picture into the grids the meshes are built from. Pure (no DOM, no ONNX).
 * prepare(rgba, W, H, opts) → { gw, gh, aspect, depth, colors, mask, source }.
 *   rgba: RGBA bytes (W*H*4), e.g. ImageData.data.
 *   opts.grid: long side of the output grid (default 128).
 *   opts.depth: { data: Float32 (any size, higher = nearer), w, h, source? } from the depth model ('model') or a depth
 *     map picture ('map'), or null for the fallback.
 *   opts.mask: { data: Float32 0..1 (any size), w, h } subject mask (1 = subject), or null for no separation.
 *   opts.invert: flip the depth (default false).
 * The fallback is brightness (Rec. 709 luminance, brighter reads as nearer). It is not real depth: source says so. */
(function (root) {
  'use strict';
  const ns = (root.SlopImg3D = root.SlopImg3D || {});
  const hf = ns.hf;

  /** Luminance 0..1 of RGBA bytes at full size. */
  function luminance(rgba, W, H) {
    const out = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
    return out;
  }

  function prepare(rgba, W, H, opts = {}) {
    const { gw, gh } = hf.gridFor(W, H, opts.grid || 128);
    const n = gw * gh;
    const colors = new Float32Array(n * 3);
    for (let c = 0; c < 3; c++) {
      const plane = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) plane[i] = rgba[i * 4 + c] / 255;
      const r = hf.resample(plane, W, H, gw, gh);
      for (let i = 0; i < n; i++) colors[i * 3 + c] = Math.min(1, Math.max(0, r[i]));
    }
    let depth, source;
    if (opts.depth && opts.depth.data) {
      depth = hf.normalize(hf.resample(opts.depth.data, opts.depth.w, opts.depth.h, gw, gh));
      source = opts.depth.source || 'model';
    } else {
      depth = hf.normalize(hf.resample(luminance(rgba, W, H), W, H, gw, gh));
      source = 'luminance';
    }
    if (opts.invert) for (let i = 0; i < n; i++) depth[i] = 1 - depth[i];
    let mask = null;
    if (opts.mask && opts.mask.data) mask = Float32Array.from(hf.resample(opts.mask.data, opts.mask.w, opts.mask.h, gw, gh));
    return { gw, gh, aspect: W / H, depth, colors, mask, source };
  }

  ns.prepare = prepare;
  ns.luminance = luminance;
})(typeof window !== 'undefined' ? window : globalThis);
