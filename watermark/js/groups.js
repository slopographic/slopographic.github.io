/* Slop Watermark: sorting files into shape groups (by the picture, the video frame or the first PDF page), and the
 * per-group override of the shared watermark. Pure (no DOM). Classic script. Exposes window.WMGroups.
 *   classify(w, h) → 'portrait' | 'landscape' | 'square' | 'panorama'
 *   summarise(items) → [{ kind, label, items, first, sizeText, text }] in KINDS order, only the groups with files
 *   overrideFrom(spec) → an override from the shared watermark (off) ; clean(raw, spec) → a saved override or null
 *   applyOverride(spec, ov) → the watermark a file of that group gets: the shared one, or with the group's position,
 *     opacity and size (a scale of every layer's size: 1 is the shared size) when its override is on
 *   SCALE: the range of that scale */
(function () {
  'use strict';
  /** The shape thresholds. Change them here only.
   *  tol: a file is portrait or landscape when one side is MORE than tol longer than the other (0.10 = 10 percent).
   *  panoramaMax / panoramaMin: width / height above panoramaMax or below panoramaMin is a panorama. */
  const THRESHOLDS = { tol: 0.10, panoramaMax: 2.2, panoramaMin: 0.45 };
  const KINDS = ['portrait', 'landscape', 'square', 'panorama'];
  /* The words, in the current language (watermark/i18n); English when the tables are not loaded (the pure tests). */
  const I = () => window.SlopI18n;
  const tr = (k, v, en) => (I() && I().has(k) ? I().t(k, v) : en);
  const EN = { portrait: 'Portrait', landscape: 'Landscape', square: 'Square', panorama: 'Panorama' };
  /** A group's name (watermark.group.<kind>). */
  const label = (kind) => tr('watermark.group.' + kind, null, EN[kind]);
  const SCALE = { min: 0.25, max: 3, step: 0.05 };
  const S = window.SlopWatermarkSpec;

  /** The group of a file by its size in pixels. Panorama is checked first; a file with no size is a square. */
  function classify(w, h) {
    if (!(w > 0 && h > 0)) return 'square';
    const T = THRESHOLDS, r = w / h;
    if (r > T.panoramaMax || r < T.panoramaMin) return 'panorama';
    if (w > h * (1 + T.tol)) return 'landscape';
    if (h > w * (1 + T.tol)) return 'portrait';
    return 'square';
  }

  /** The groups that have files, with the count and the size range (the shorter side, which the watermark scales by). */
  function summarise(items) {
    const out = [];
    for (const kind of KINDS) {
      const list = items.filter((x) => x.group === kind);
      if (!list.length) continue;
      const sides = list.map((x) => Math.min(x.w, x.h));
      const min = Math.min(...sides), max = Math.max(...sides), n = list.length;
      const pics = list.every((x) => !x.media || x.media === 'picture'), noun = (pics ? 'picture' : 'file') + (n === 1 ? '' : 's');
      const size = min === max ? String(min) : tr('watermark.group.range', { min: String(min), max: String(max) }, min + ' to ' + max);
      const text = tr('watermark.group.text_' + (pics ? 'pictures' : 'files'), { label: label(kind), n, size }, label(kind) + ', ' + n + ' ' + noun + ', ' + size + ' px');
      out.push({ kind, label: label(kind), items: list, first: list[0], sizeText: size + ' px', text });
    }
    return out;
  }

  /** An override that starts from the shared watermark (its top layer), and is off. */
  function overrideFrom(spec) {
    const L = spec.layers[spec.layers.length - 1] || S.layerDefaults('text');
    return { on: false, position: L.position, opacity: L.opacity, scale: 1 };
  }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  /** A saved override, checked: only one that is on is kept; a bad field falls back to the shared watermark. A group
   *  saved before layers had its own size (size or logoScale): that becomes the scale of the shared size. */
  function clean(raw, spec) {
    if (!raw || raw.on !== true) return null;
    const base = overrideFrom(spec), L = spec.layers[spec.layers.length - 1];
    let scale = num(raw.scale, NaN);
    if (!isFinite(scale) && L) { const old = L.kind === 'logo' ? raw.logoScale : raw.size; scale = num(old, 0) > 0 ? old / L.size : 1; }
    return { on: true, position: S.POSITIONS.includes(raw.position) ? raw.position : base.position, opacity: Math.min(1, num(raw.opacity, base.opacity)),
      scale: Math.min(SCALE.max, Math.max(SCALE.min, isFinite(scale) ? scale : 1)) };
  }
  /** The watermark for a file of a group: the shared one, or with the group's position, opacity and size when it is on. */
  function applyOverride(spec, ov) {
    if (!ov || !ov.on) return spec;
    return S.normalize(Object.assign({}, spec, { layers: spec.layers.map((L) => Object.assign({}, L, { position: ov.position, opacity: ov.opacity, size: L.size * (ov.scale || 1) })) }));
  }

  window.WMGroups = { THRESHOLDS, KINDS, label, SCALE, classify, summarise, overrideFrom, clean, applyOverride };
})();
