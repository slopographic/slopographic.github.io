/* Slop Resize: target geometry. Pure functions with no DOM, so the node test (tests/node/resize-size.test.mjs) can run them.
 * Classic script; exposes window.SlopResize.size (and a plain global SlopResize under node's vm).
 *
 * A spec (what the form and the saved presets hold, see normalize):
 *   mode      'size'  a box w × h (either side may be 0: that side follows the picture)
 *             'bytes' the same box, plus a file size limit that the image encoder honours (images only)
 *             'scale' a percentage of the source (scale)
 *             'long'  the longer edge in pixels (long)
 *   keepRatio true keeps the picture's proportions. false stretches it to the box (fill is then ignored).
 *   fill      'fit' letterboxes the picture into the box (bg fills the rest), 'cover' fills the box and crops
 *             (anchor says what stays), 'stretch' is the same as keepRatio false, 'within' shrinks the output to
 *             the picture's own size inside the box, with no padding.
 *   anchor    where a cover crop or a fit letterbox sits: center, top, bottom, left, right, top-left, …
 *   bg        '#rrggbb' or 'transparent' (the colour behind a fit letterbox)
 *   even      round both sides to even numbers (video needs it; dims() can force it with opts.even)
 *   resample  'best' shrinks in halving steps with high smoothing (the default); 'nearest' keeps hard pixels
 *
 * dims(src, spec, opts) → { w, h, x, y, dw, dh, fill }
 *   w × h   the output size.
 *   x, y, dw, dh   where the picture is drawn inside the output (it can run past the edges for cover).
 *   fill    'fit' | 'cover' when the box decided the placement, otherwise 'none' (draw it across the whole output). */
(function (g) {
  'use strict';
  const NS = (g.SlopResize = g.SlopResize || {});
  const S = (NS.size = {});
  /** A word in the page's language (shared/i18n), or the English given when there is no table (a test page, node). */
  NS.tr = NS.tr || function (k, en, v) {
    const I = g.SlopI18n;
    if (I && I.has(k)) return I.t(k, v);
    return String(en).replace(/\{(\w+)\}/g, (m, n) => (v && n in v ? String(v[n]) : m));
  };
  const MAX_SIDE = 16384, MAX_AREA = 100e6; // images; video passes opts.max (8192)
  const MODES = ['size', 'bytes', 'scale', 'long'];
  const FILLS = ['fit', 'cover', 'stretch', 'within'];
  const RESAMPLE = ['best', 'nearest'];
  /** Anchor name → [ax, ay] in 0…1 (0 = left/top, 1 = right/bottom). */
  const ANCHORS = { center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5], 'top-left': [0, 0], 'top-right': [1, 0], 'bottom-left': [0, 1], 'bottom-right': [1, 1] };
  S.ANCHORS = Object.keys(ANCHORS);
  S.FILLS = FILLS.slice();
  S.MODES = MODES.slice();
  S.MAX_SIDE = MAX_SIDE;
  S.RESAMPLE = RESAMPLE.slice();

  const num = (v, d = 0) => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : d; };
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** Round to the nearest even integer, at least 2 (video needs even sides). */
  S.even = (n) => Math.max(2, Math.round(n / 2) * 2);
  /** Whole pixels, at least 1. */
  S.px = (n) => Math.max(1, Math.round(n));

  /** Clean a spec from a form or a saved preset: strings become numbers and unknown values fall back to defaults. */
  S.normalize = function (s = {}) {
    return {
      mode: MODES.includes(s.mode) ? s.mode : 'size',
      w: Math.max(0, Math.round(num(s.w))),
      h: Math.max(0, Math.round(num(s.h))),
      scale: Math.min(400, Math.max(1, num(s.scale, 50))),
      long: Math.max(0, Math.round(num(s.long))),
      keepRatio: s.keepRatio !== false,
      fill: FILLS.includes(s.fill) ? s.fill : 'fit',
      anchor: hasOwn(ANCHORS, s.anchor) ? s.anchor : 'center',
      bg: /^#[0-9a-f]{6}$/i.test(s.bg || '') ? s.bg.toLowerCase() : 'transparent',
      even: !!s.even,
      resample: RESAMPLE.includes(s.resample) ? s.resample : 'best',
      maxBytes: Math.max(0, Math.round(num(s.maxBytes))),
    };
  };

  /** Keep-ratio lock: the other side for a side that was typed. which is 'w' or 'h'; ratio is the picture's width ÷
   *  height. Derives from the typed value only (never from a rounded one), so editing does not drift. Returns 0 when
   *  there is nothing to derive from. even rounds the derived side to an even number, as the output does. */
  S.lockSide = function (which, value, ratio, even) {
    const v = num(value);
    if (!(v > 0 && ratio > 0)) return 0;
    const n = which === 'w' ? v / ratio : v * ratio;
    return even ? S.even(n) : S.px(n);
  };

  /** Whether the Keep aspect ratio lock rewrites the other side of the box as one is typed. Fit and Cover make exactly
   *  the box that was asked for (the picture keeps its shape inside it, letterboxed or cropped), so the lock leaves
   *  their box alone; Fit inside and Stretch follow the picture. A side left at 0 still follows the picture in any fill. */
  S.locksBox = (fill) => fill !== 'fit' && fill !== 'cover';

  /** Output size and picture placement for a source of src = { w, h }. Throws on a size that cannot be made. */
  S.dims = function (src, spec, opts = {}) {
    const sw = num(src && src.w), sh = num(src && src.h);
    if (!(sw > 0 && sh > 0)) throw new Error(NS.tr('resize.err.no_size', 'The picture has no size to resize'));
    const s = S.normalize(spec);
    const even = !!(opts.even || s.even), max = opts.max || MAX_SIDE;
    let w, h, boxed = false, contained = false;
    if (s.mode === 'scale' || s.mode === 'long') {
      const f = s.mode === 'scale' ? s.scale / 100 : (s.long || Math.max(sw, sh)) / Math.max(sw, sh);
      w = sw * f; h = sh * f;
    } else if (!s.w && !s.h) {
      w = sw; h = sh;
    } else if (!s.keepRatio) {
      w = s.w || sw; h = s.h || sh;
    } else if (!s.w || !s.h) {
      // one side given: the other follows the picture's proportions
      if (s.w) { w = s.w; h = (s.w * sh) / sw; } else { h = s.h; w = (s.h * sw) / sh; }
    } else if (s.fill === 'within') {
      const f = Math.min(s.w / sw, s.h / sh);
      w = sw * f; h = sh * f; contained = true;
    } else {
      w = s.w; h = s.h; boxed = s.fill === 'fit' || s.fill === 'cover';
    }
    if (even) {
      // a contained size must never grow past the box, so it rounds down; everything else rounds to nearest
      const ev = (n) => (contained ? Math.max(2, Math.floor(n / 2) * 2) : S.even(n));
      w = ev(w); h = ev(h);
    } else { w = S.px(w); h = S.px(h); }
    if (w > max || h > max || w * h > MAX_AREA) throw new Error(NS.tr('resize.err.too_large', 'Output {w} × {h} is too large (the limit is {max} px a side)', { w: String(w), h: String(h), max: String(max) }));
    let x = 0, y = 0, dw = w, dh = h;
    if (boxed) {
      const f = s.fill === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
      dw = sw * f; dh = sh * f;
      const [ax, ay] = ANCHORS[s.anchor];
      x = (w - dw) * ax || 0; y = (h - dh) * ay || 0; // || 0 turns a -0 into 0
    }
    return { w, h, x, y, dw, dh, fill: boxed ? s.fill : 'none' };
  };

  /** Size presets for the target menu. Groups are shown as optgroups. */
  S.PRESETS = [
    { id: 'sq1080', group: 'Common', label: 'Square 1080 × 1080', w: 1080, h: 1080 },
    { id: 'story', group: 'Common', label: 'Vertical 1080 × 1920', w: 1080, h: 1920 },
    { id: 'fhd', group: 'Common', label: 'Full HD 1920 × 1080', w: 1920, h: 1080 },
    { id: 'hd', group: 'Common', label: 'HD 1280 × 720', w: 1280, h: 720 },
    { id: 'uhd', group: 'Common', label: '4K UHD 3840 × 2160', w: 3840, h: 2160 },
    { id: 'icon', group: 'Common', label: 'Icon 512 × 512', w: 512, h: 512 },
    { id: 'og', group: 'Social', label: 'Link preview (Open Graph) 1200 × 630', w: 1200, h: 630 },
    { id: 'ig-portrait', group: 'Social', label: 'Instagram portrait 1080 × 1350', w: 1080, h: 1350 },
    { id: 'x-post', group: 'Social', label: 'X / Twitter post 1600 × 900', w: 1600, h: 900 },
    { id: 'yt-thumb', group: 'Social', label: 'YouTube thumbnail 1280 × 720', w: 1280, h: 720 },
    { id: 'pin', group: 'Social', label: 'Pinterest pin 1000 × 1500', w: 1000, h: 1500 },
    { id: 'fb-cover', group: 'Social', label: 'Facebook cover 851 × 315', w: 851, h: 315 },
    { id: 'li-banner', group: 'Social', label: 'LinkedIn banner 1584 × 396', w: 1584, h: 396 },
    { id: 'email-banner', group: 'Email', label: 'Email banner 600 × 200', w: 600, h: 200 },
    { id: 'email-width', group: 'Email', label: 'Email width 600 px (height follows)', w: 600, h: 0 },
  ];
  /** A preset's label and group in the page's language (the PRESETS keep the English). */
  S.presetLabel = (p) => NS.tr('resize.preset.' + p.id.replace(/-/g, '_'), p.label);
  S.groupLabel = (group) => NS.tr('resize.preset.g_' + group.toLowerCase(), group);
  S.presetById = (id) => S.PRESETS.find((p) => p.id === id) || null;
  /** The settings change a size preset makes: a box that keeps the picture's proportions, fitted. */
  S.applyPreset = (p) => ({ mode: 'size', w: p.w, h: p.h, keepRatio: true, fill: 'fit' });
})(typeof window !== 'undefined' ? window : globalThis);
