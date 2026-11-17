/* SlopCutout pipeline, part 2: edge-aware refinement. Needs pipeline.js first (same global).
 *  - guidedUpsample: a fast colour guided filter (He et al. 2010/2015) that lifts the model's low-res
 *    mask to full resolution so the edge follows the photo (hair, fur, soft edges) instead of the blurry
 *    bilinear upscale. Coefficients are solved at a work resolution (≤ 1024 px) and applied per pixel at
 *    full resolution, so memory stays O(full mask) even for 24 MP photos.
 *  - decontaminate: replaces the colour of semi-transparent edge pixels with an estimate of the pure
 *    foreground colour (I = aF + (1-a)B solved with local F/B estimates), which removes colour fringing. */
(function (root) {
  'use strict';
  const P = root.SlopCutoutPipeline;
  const clamp = P.clamp;

  /** Bilinear lookup helper for a low-res multi-plane float image sampled at full-res coordinates. */
  function sampler(gw, gh, W, H) {
    const sx = gw / W, sy = gh / H;
    const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W);
    for (let x = 0; x < W; x++) { const u = clamp((x + 0.5) * sx - 0.5, 0, gw - 1); x0[x] = Math.floor(u); x1[x] = Math.min(x0[x] + 1, gw - 1); fx[x] = u - x0[x]; }
    const row = { r0: 0, r1: 0, fy: 0 };
    return {
      row(y) { const v = clamp((y + 0.5) * sy - 0.5, 0, gh - 1), y0 = Math.floor(v); row.r0 = y0 * gw; row.r1 = Math.min(y0 + 1, gh - 1) * gw; row.fy = v - y0; },
      at(plane, x) {
        const a = plane[row.r0 + x0[x]] + (plane[row.r0 + x1[x]] - plane[row.r0 + x0[x]]) * fx[x];
        const b = plane[row.r1 + x0[x]] + (plane[row.r1 + x1[x]] - plane[row.r1 + x0[x]]) * fx[x];
        return a + (b - a) * row.fy;
      },
    };
  }
  /** Work size for a W×H image: the long side capped at `work`. */
  P.workSize = (W, H, work = 1024) => { const s = Math.min(1, work / Math.max(W, H)); return [Math.max(1, Math.round(W * s)), Math.max(1, Math.round(H * s))]; };
  /** Planar float RGB (0..1) of an RGBA image resized to gw×gh. */
  function planes(rgba, W, H, gw, gh) {
    const s = gw === W && gh === H ? rgba : P.resample(rgba, W, H, 4, gw, gh), n = gw * gh;
    const r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) { r[i] = s[i * 4] / 255; g[i] = s[i * 4 + 1] / 255; b[i] = s[i * 4 + 2] / 255; }
    return [r, g, b];
  }
  const mul = (a, b) => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * b[i]; return o; };

  /**
   * Upscale a low-res mask (Float32 0..1, mw×mh) to W×H guided by the full-res RGBA image.
   * opts: { work = 1024, r (work-res radius, default ≈ long side / 170), eps = 1e-4 }. Returns Uint8ClampedArray.
   */
  P.guidedUpsample = function (rgba, W, H, low, mw, mh, opts = {}) {
    const [gw, gh] = P.workSize(W, H, opts.work || 1024), n = gw * gh;
    const r = opts.r || Math.max(2, Math.round(Math.max(gw, gh) / 170)), eps = opts.eps || 1e-4;
    const [Ir, Ig, Ib] = planes(rgba, W, H, gw, gh), p = P.resize1(low, mw, mh, gw, gh);
    const box = (a) => P.boxBlur(a, gw, gh, r);
    const mr = box(Ir), mg = box(Ig), mb = box(Ib), mp = box(p);
    const cr = box(mul(Ir, p)), cg = box(mul(Ig, p)), cb = box(mul(Ib, p));
    const vrr = box(mul(Ir, Ir)), vrg = box(mul(Ir, Ig)), vrb = box(mul(Ir, Ib)), vgg = box(mul(Ig, Ig)), vgb = box(mul(Ig, Ib)), vbb = box(mul(Ib, Ib));
    const ar = new Float32Array(n), ag = new Float32Array(n), ab = new Float32Array(n), bb = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const covr = cr[i] - mr[i] * mp[i], covg = cg[i] - mg[i] * mp[i], covb = cb[i] - mb[i] * mp[i];
      const a11 = vrr[i] - mr[i] * mr[i] + eps, a12 = vrg[i] - mr[i] * mg[i], a13 = vrb[i] - mr[i] * mb[i];
      const a22 = vgg[i] - mg[i] * mg[i] + eps, a23 = vgb[i] - mg[i] * mb[i], a33 = vbb[i] - mb[i] * mb[i] + eps;
      // Inverse of the symmetric 3×3 covariance (+eps·I) via cofactors.
      const c11 = a22 * a33 - a23 * a23, c12 = a13 * a23 - a12 * a33, c13 = a12 * a23 - a13 * a22;
      const c22 = a11 * a33 - a13 * a13, c23 = a13 * a12 - a11 * a23, c33 = a11 * a22 - a12 * a12;
      const det = a11 * c11 + a12 * c12 + a13 * c13, k = det !== 0 ? 1 / det : 0;
      ar[i] = (c11 * covr + c12 * covg + c13 * covb) * k;
      ag[i] = (c12 * covr + c22 * covg + c23 * covb) * k;
      ab[i] = (c13 * covr + c23 * covg + c33 * covb) * k;
      bb[i] = mp[i] - ar[i] * mr[i] - ag[i] * mg[i] - ab[i] * mb[i];
    }
    const Ar = box(ar), Ag = box(ag), Ab = box(ab), B = box(bb);
    const out = new Uint8ClampedArray(W * H), S = sampler(gw, gh, W, H), k = 1 / 255;
    for (let y = 0; y < H; y++) {
      S.row(y);
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const q = S.at(Ar, x) * rgba[i * 4] * k + S.at(Ag, x) * rgba[i * 4 + 1] * k + S.at(Ab, x) * rgba[i * 4 + 2] * k + S.at(B, x);
        out[i] = q * 255 + 0.5;
      }
    }
    return out;
  };
  /** Plain bilinear upscale of a low-res Float32 mask to a Uint8 mask (no edge refinement). */
  P.plainUpsample = (low, mw, mh, W, H) => P.toU8(P.resize1(low, mw, mh, W, H));

  /**
   * Edge colour decontamination. rgba: full-res image, alpha: Uint8 mask (same size).
   * Returns a new RGBA array whose partially transparent pixels carry the estimated foreground colour.
   * opts: { work = 1024, r (work-res radius), strength = 1 }.
   */
  P.decontaminate = function (rgba, alpha, W, H, opts = {}) {
    const [gw, gh] = P.workSize(W, H, opts.work || 1024), n = gw * gh, strength = opts.strength == null ? 1 : opts.strength;
    const r = opts.r || Math.max(2, Math.round(Math.max(gw, gh) / 128));
    const [Ir, Ig, Ib] = planes(rgba, W, H, gw, gh);
    const a = gw === W && gh === H ? P.toF32(alpha) : P.resample(alpha, W, H, 1, gw, gh).map((v) => v / 255);
    // Weights favour clean pixels (nearly opaque for F, nearly transparent for B) over mixed ones.
    const ia = a.map((v) => (1 - v) * (1 - v) * (1 - v));
    for (let i = 0; i < n; i++) a[i] = a[i] * a[i] * a[i];
    const blur = (x) => P.boxBlur(P.boxBlur(x, gw, gh, r), gw, gh, r);
    const wa = blur(a), wb = blur(ia);
    const Fr = blur(mul(Ir, a)), Fg = blur(mul(Ig, a)), Fb = blur(mul(Ib, a));
    const Br = blur(mul(Ir, ia)), Bg = blur(mul(Ig, ia)), Bb = blur(mul(Ib, ia));
    for (let i = 0; i < n; i++) {
      const ka = 1 / Math.max(wa[i], 1e-4), kb = 1 / Math.max(wb[i], 1e-4);
      Fr[i] *= ka; Fg[i] *= ka; Fb[i] *= ka; Br[i] *= kb; Bg[i] *= kb; Bb[i] *= kb;
    }
    const out = new Uint8ClampedArray(rgba), S = sampler(gw, gh, W, H), F = [Fr, Fg, Fb], Bk = [Br, Bg, Bb];
    for (let y = 0; y < H; y++) {
      S.row(y);
      for (let x = 0, i = y * W; x < W; x++, i++) {
        const al = alpha[i];
        if (al <= 1 || al >= 254) continue;
        const t = al / 255, conf = clamp((t - 0.1) / 0.7, 0, 1);
        for (let c = 0; c < 3; c++) {
          const I = rgba[i * 4 + c] / 255, fh = S.at(F[c], x), bh = S.at(Bk[c], x);
          const solved = clamp((I - (1 - t) * bh) / t, 0, 1);
          const f = solved * conf + fh * (1 - conf);
          out[i * 4 + c] = (I + (f - I) * strength) * 255 + 0.5;
        }
      }
    }
    return out;
  };

  /**
   * The full "finish" step from a base mask: matte levels → brush edits → feather → decontaminate → RGBA.
   * s: { threshold = .5, softness = 1, feather = 0, decontaminate = true }. Returns { mask, cutout }.
   */
  P.finish = function (rgba, W, H, base, edit, s = {}) {
    let mask = P.matte(base, s.threshold == null ? 0.5 : s.threshold, s.softness == null ? 1 : s.softness);
    if (edit) P.applyEdit(mask, edit);
    if (s.feather > 0) mask = P.feather(mask, W, H, s.feather);
    const rgb = s.decontaminate === false ? rgba : P.decontaminate(rgba, mask, W, H, { strength: s.decontaminateStrength });
    return { mask, cutout: P.compose(rgb, mask) };
  };
})(typeof self !== 'undefined' ? self : globalThis);
