/* Conversions between the watermark spec (spec.js) and the shapes saved before it, so old settings, project files,
 * .slopflow files and links still load. Pure. Adds to window.SlopWatermarkSpec (load spec.js and spec-layout.js first).
 *   fromCfg(cfg, logo) → spec      the one-mark engine setup of before ({ kind, text, font (a CSS stack), weight, colour,
 *                                   shadow, size, logoScale, opacity, position, tile, rotate, margin, logo? }): Slop
 *                                   Watermark's saved setup, PhotoSlop's PSD resource, SlopCut's project watermark
 *   toCfg(layer) → cfg              the other way, for one layer
 *   fromPdfLayers(layers, { w, h, asset }) → spec    Slop PDF's layers (pdf/js/core/watermark.js: sizes and offsets in
 *                                   points on a w × h page; asset(id) → { url, w, h, name }) on that reference page
 *   toPdfLayers(spec, W, H, { measure, asset }) → [SlopPdfWm layer]   the spec on one W × H page (points): sizes from the
 *                                   shorter side, the margin as an offset, tiles as one layer each. measure(pdfFont, text,
 *                                   size, layer) is the text width; asset(layer) is what the layer's asset field holds
 *   OPTIONS                         Slop Workflows' option schema for its Watermark step (shared/ops/watermark.js), made
 *                                   from FIELDS and SIZE (percent where the spec has fractions)
 *   fromOptions(options, { logoAspect }) → spec ; toOptions(spec) → options (flat when one plain mark, else spec: JSON) */
(function (root) {
  'use strict';
  const S = root.SlopWatermarkSpec || (typeof require === 'function' ? require('./spec.js') : null);
  if (!S || S.fromCfg) return;
  if (!S.placements && typeof require === 'function') require('./spec-layout.js');
  const F = S.FIELDS, FONTS = S.FONTS;

  /** The font key of a CSS stack (or a PDF font name). */
  function fontKey(v) {
    const s = String(v || '');
    for (const k of Object.keys(FONTS)) if (s === FONTS[k].css || s === FONTS[k].pdf || s === k) return k;
    return /mono|courier|consol/i.test(s) ? 'mono' : /(^|[^-])serif|georgia|times/i.test(s) && !/sans/i.test(s) ? 'serif' : 'sans';
  }

  function fromCfg(c, logo) {
    c = c || {};
    const kind = c.kind === 'logo' ? 'logo' : 'text';
    const L = { kind, text: c.text == null ? F.text.value : c.text, font: fontKey(c.font), bold: (Number(c.weight) || 600) >= 600, colour: c.colour,
      shadow: c.shadow, size: kind === 'logo' ? c.logoScale : c.size, opacity: c.opacity, position: c.position, tile: c.tile, rotate: c.rotate,
      margin: c.margin, logo: logo || c.logo || '', logoName: c.logoName || '' };
    return S.normalize({ layers: [L] });
  }
  function toCfg(L) {
    return { kind: L.kind, text: L.text, font: FONTS[L.font].css, weight: L.bold ? 600 : 400, colour: L.colour, shadow: L.shadow,
      size: L.kind === 'text' ? L.size : S.SIZE.text.value, logoScale: L.kind === 'logo' ? L.size : S.SIZE.logo.value,
      opacity: L.opacity, position: L.position, tile: L.tile, rotate: L.rotate, margin: L.margin, logo: L.logo || undefined };
  }

  function fromPdfLayers(list, o = {}) {
    const s = Math.min(o.w || 612, o.h || 792), asset = o.asset || (() => null);
    return S.normalize({ layers: (list || []).map((P) => {
      const a = P.kind === 'image' ? asset(P.asset) || {} : {};
      return { id: P.id, kind: P.kind === 'image' ? 'logo' : 'text', show: P.show !== false, text: P.text, font: fontKey(P.font), bold: !!P.bold,
        colour: P.colour, shadow: false, size: (P.size || 0) / s, opacity: P.opacity, position: P.anchor, margin: 0, dx: (P.dx || 0) / s,
        dy: (P.dy || 0) / s, rotate: -(P.rot || 0), pages: P.pages || '', logo: a.url || '', logoName: a.name || '', logoW: a.w || 0, logoH: a.h || 0 };
    }) });
  }
  function toPdfLayers(spec, W, H, o = {}) {
    const s = S.short(W, H), out = [], measure = o.measure, asset = o.asset || ((L) => L.logo);
    for (const L of S.visible(spec)) {
      if (L.kind === 'text' && !L.text.trim()) continue;
      if (L.kind === 'logo' && !L.logo) continue;
      const pdfFont = FONTS[L.font].pdf;
      const item = S.itemSize(L, W, H, measure ? (t, px) => measure(pdfFont, t, px, L) : null);
      const base = { kind: L.kind === 'logo' ? 'image' : 'text', text: L.text, font: pdfFont, bold: L.bold, colour: L.colour,
        size: L.kind === 'logo' ? item.w : item.px, opacity: L.opacity, rot: -L.rotate, pages: L.pages, asset: L.kind === 'logo' ? asset(L) : '', show: true };
      if (!L.tile) {
        const col = L.position.charAt(1), row = L.position.charAt(0), m = s * L.margin;
        out.push(Object.assign({ id: L.id, anchor: L.position, dx: (col === 'l' ? m : col === 'r' ? -m : 0) + L.dx * s, dy: (row === 't' ? m : row === 'b' ? -m : 0) + L.dy * s }, base));
        continue;
      }
      S.placements(L, W, H, item).items.forEach((p, i) => out.push(Object.assign({ id: L.id + '-' + i, anchor: 'mc', dx: p.cx - W / 2, dy: p.cy - H / 2 }, base)));
    }
    return out;
  }

  /* ---------- Slop Workflows: the Watermark step's options ---------- */
  const pct = (v) => Math.round(v * 1000) / 10;
  // the labels read the language each time (keys ui.wm.*, shared/i18n/ui/<code>/watermark.js): getters, never constants
  const tr = (k, v) => { const I = root.SlopI18n; return I && I.t ? I.t(k, v) : k; };
  const get = (o, f, fn) => Object.defineProperty(o, f, { get: fn, enumerable: true, configurable: true });
  /** An option labelled by a key (and hinted by hint, a key), or by a field of the spec's table (the same words). */
  const lab = (o, key, hint) => { get(o, 'label', typeof key === 'function' ? key : () => tr(key)); if (hint) get(o, 'hint', typeof hint === 'function' ? hint : () => tr(hint)); return o; };
  const ch = (v, k) => get([v], 1, () => tr(k));
  const sel = (f) => ({ type: 'select', options: f.options });
  const range = (f, o) => Object.assign({ type: 'number', min: pct(f.min), max: pct(f.max), step: 0.5, value: pct(f.value) }, o);
  const FONT_CSS = Object.keys(FONTS).map((k) => get([FONTS[k].css], 1, () => FONTS[k].label));
  const OPTIONS = [
    lab({ key: 'mark', type: 'select', value: 'text', options: [ch('text', 'ui.wm.mark_text'), ch('logo', 'ui.wm.mark_logo'), ch('both', 'ui.wm.mark_both')] }, 'ui.wm.mark'),
    lab({ key: 'text', type: 'text', value: F.text.value, placeholder: F.text.value }, () => F.text.label),
    lab({ key: 'logo', type: 'image', value: '' }, 'ui.wm.opt_logo', 'ui.wm.opt_logo_hint'),
    lab({ key: 'font', type: 'select', value: FONT_CSS[0][0], options: FONT_CSS }, () => F.font.label),
    lab({ key: 'colour', type: 'color', value: F.colour.value }, 'ui.wm.opt_colour'),
    lab({ key: 'shadow', type: 'checkbox', value: F.shadow.value }, () => F.shadow.label),
    lab(range(S.SIZE.text, { key: 'size' }), 'ui.wm.opt_size'),
    lab(range(S.SIZE.logo, { key: 'logoSize', step: 1 }), 'ui.wm.opt_logo_size'),
    lab({ key: 'opacity', type: 'range', min: pct(F.opacity.min), max: pct(F.opacity.max), value: pct(F.opacity.value) }, 'ui.wm.opt_opacity'),
    lab(Object.assign({ key: 'position', value: F.position.value }, sel(F.position)), () => F.position.label),
    lab(range(F.margin, { key: 'margin' }), 'ui.wm.opt_margin'),
    lab({ key: 'rotate', type: 'number', min: F.rotate.min, max: F.rotate.max, value: F.rotate.value }, 'ui.wm.opt_rotate'),
    lab({ key: 'tile', type: 'checkbox', value: F.tile.value }, 'ui.wm.opt_tile'),
    lab({ key: 'pages', type: 'text', value: '', placeholder: 'all' }, 'ui.wm.opt_pages', () => F.pages.hint),   // i18n-ignore: 'all' is a page range word the parser reads
    lab({ key: 'from', type: 'number', min: F.from.min, max: F.from.max, step: 0.1, value: 0 }, 'ui.wm.opt_from'),
    lab({ key: 'to', type: 'number', min: F.to.min, max: F.to.max, step: 0.1, value: 0 }, 'ui.wm.opt_to'),
    lab({ key: 'spec', type: 'watermark', value: '' }, 'ui.wm.opt_spec', 'ui.wm.opt_spec_hint'),
  ];
  const DEF = Object.fromEntries(OPTIONS.map((o) => [o.key, o.value]));

  function fromOptions(o = {}, { logoAspect = 0 } = {}) {
    if (o.spec && String(o.spec).trim()) { const sp = S.normalize(o.spec); if (sp.layers.length) return sp; }
    const v = Object.assign({}, DEF, o), mark = ['text', 'logo', 'both'].includes(v.mark) ? v.mark : 'text';
    const common = { opacity: Number(v.opacity) / 100, position: v.position, margin: Number(v.margin) / 100, rotate: Number(v.rotate) || 0,
      tile: !!v.tile, pages: v.pages || '', from: Number(v.from) || 0, to: Number(v.to) || 0 };
    const layers = [];
    const logoSize = Number(v.logoSize) / 100, textSize = Number(v.size) / 100;
    if (mark !== 'text') layers.push(Object.assign({ kind: 'logo', logo: v.logo || '', size: logoSize }, common));
    if (mark !== 'logo') {
      const T = Object.assign({ kind: 'text', text: v.text == null ? '' : String(v.text), font: fontKey(v.font), colour: v.colour, shadow: v.shadow !== false, size: textSize }, common);
      if (mark === 'both' && !v.tile) {
        // logo and text at one position: the text goes above the logo at the bottom, below it at the top and the middle
        const lh = logoSize * (logoAspect || 1), th = Math.max(0, textSize) * S.LINE, gap = 0.01, row = String(v.position || 'br').charAt(0);
        T.dy = row === 'b' ? -(lh + gap) : row === 't' ? lh + gap : (lh + th) / 2 + gap;
      }
      layers.push(T);
    }
    return S.normalize({ layers });
  }
  /** Options for a spec: the flat settings when it is one plain text or logo mark, else the whole spec as JSON. */
  function toOptions(spec) {
    const sp = S.normalize(spec), L = sp.layers[0];
    const flat = sp.layers.length === 1 && L.show && !L.dx && !L.dy && (L.kind === 'text' ? L.bold : true);
    if (!flat) return { spec: JSON.stringify(sp) };
    const o = { mark: L.kind, opacity: Math.round(L.opacity * 100), position: L.position, margin: pct(L.margin), rotate: L.rotate, tile: L.tile, pages: L.pages, from: L.from, to: L.to };
    if (L.kind === 'logo') Object.assign(o, { logo: L.logo, logoSize: Math.round(L.size * 100) });
    else Object.assign(o, { text: L.text, font: FONTS[L.font].css, colour: L.colour, shadow: L.shadow, size: pct(L.size) });
    return o;
  }

  Object.assign(S, { fontKey, fromCfg, toCfg, fromPdfLayers, toPdfLayers, OPTIONS, fromOptions, toOptions });
})(typeof window !== 'undefined' ? window : globalThis);
