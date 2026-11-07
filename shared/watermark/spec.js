/* The watermark spec: one definition of a watermark for every app and every kind of file (pictures, videos, PDFs).
 * Pure: no DOM. Classic script (window.SlopWatermarkSpec); ES modules import it for its side effect and read
 * globalThis.SlopWatermarkSpec; Node tests require it. Layout maths: spec-layout.js. Conversions: spec-convert.js.
 *
 *   spec  = { v: 1, name, layers: [layer] }                    layers bottom first (the last one is drawn on top)
 *   layer = { id, kind: 'text' | 'logo', show, text, font: 'sans' | 'serif' | 'mono', bold, colour, shadow,
 *             logo (a data: URL), logoName, logoW, logoH (the logo's own size in pixels, 0 when not known),
 *             size (text: the letter height; logo: its width; both fractions of the frame's shorter side),
 *             opacity (0 to 1), position (tl tc tr ml mc mr bl bc br), margin, dx, dy (fractions of the shorter side;
 *             dx to the right, dy down), rotate (degrees, clockwise), tile (repeat across the frame),
 *             pages ('' = every page; PDFs only), from, to (seconds; to 0 = until the end; videos only) }
 * Sizes are fractions of the shorter side, so one spec looks the same on a photo, a video frame and a PDF page.
 *
 *   FIELDS, SIZE, FONTS, POSITIONS, POSITION_LABELS      the one table of settings, ranges, defaults and words
 *   defaults() ; layerDefaults(kind, over) ; normalize(raw) → a clean spec (never throws) ; normalizeLayer(raw)
 *   check(spec) → '' or what to fix ; visible(spec) ; usesPages(spec) ; usesTime(spec) ; label(layer)
 *   active(layer, { page, pages, time }) → drawn there? ; parsePages(text, n) → [0-based page] (throws on bad text)
 *   addLayer, removeLayer, moveLayer, duplicateLayer, updateLayer, getLayer   pure list changes: a new spec each time */
(function (root, factory) {
  if (root.SlopWatermarkSpec && root.SlopWatermarkSpec.VERSION) return;   // loaded twice (a module and a script)
  const api = factory();
  root.SlopWatermarkSpec = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const VERSION = 1, MAX_LAYERS = 12;
  const POSITIONS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
  // Words through SlopI18n (shared/i18n/ui/<code>/watermark.js, keys ui.wm.*), read each time: getters, never constants
  const tr = (k, v) => { const I = globalThis.SlopI18n; return I && I.t ? I.t(k, v) : k; };
  const words = (o, map) => { for (const f of Object.keys(map)) Object.defineProperty(o, f, { get: () => tr(map[f]), enumerable: true, configurable: true }); return o; };
  const choice = (v, k) => Object.defineProperty([v], 1, { get: () => tr(k), enumerable: true });
  const POSITION_LABELS = words({}, Object.fromEntries(POSITIONS.map((p) => [p, 'ui.wm.pos_' + p])));
  /** The three font families: the CSS stack the canvas uses and the standard PDF font. */
  const FONTS = {
    sans: words({ css: 'Inter Tight, system-ui, sans-serif', pdf: 'Helvetica' }, { label: 'ui.wm.font_sans' }),
    serif: words({ css: 'Georgia, serif', pdf: 'Times' }, { label: 'ui.wm.font_serif' }),
    mono: words({ css: 'ui-monospace, Menlo, Consolas, monospace', pdf: 'Courier' }, { label: 'ui.wm.font_mono' }),
  };
  /** The size of each kind: a fraction of the shorter side (text: letter height; logo: width). */
  const SIZE = {
    text: words({ min: 0.005, max: 0.4, step: 0.005, value: 0.045, pct: true }, { label: 'ui.wm.size_text' }),
    logo: words({ min: 0.02, max: 1, step: 0.01, value: 0.2, pct: true }, { label: 'ui.wm.size_logo' }),
  };
  /** Every other setting of a layer. pct: shown and typed as a percent. The panel and the Workflows options use this.
   *  Each label is the key ui.wm.f_<field> (and the hint ui.wm.f_<field>_hint). */
  const FIELDS = {
    text: { type: 'text', value: '© Your name', max: 200 },   // i18n-ignore: the default mark is the person's content
    font: { type: 'select', value: 'sans', options: Object.keys(FONTS).map((k) => choice(k, 'ui.wm.font_' + k)) },
    bold: { type: 'checkbox', value: true },
    colour: { type: 'color', value: '#ffffff' },
    shadow: { type: 'checkbox', value: true },
    opacity: { type: 'range', min: 0, max: 1, step: 0.01, value: 0.5, pct: true },
    position: { type: 'select', value: 'br', options: POSITIONS.map((p) => choice(p, 'ui.wm.pos_' + p)) },
    margin: { type: 'range', min: 0, max: 0.3, step: 0.005, value: 0.03, pct: true },
    dx: { type: 'range', min: -1, max: 1, step: 0.005, value: 0, pct: true },
    dy: { type: 'range', min: -1, max: 1, step: 0.005, value: 0, pct: true },
    rotate: { type: 'range', min: -180, max: 180, step: 1, value: 0, unit: '°' },
    tile: { type: 'checkbox', value: false },
    pages: { type: 'text', value: '', max: 120 },
    from: { type: 'number', min: 0, max: 86400, step: 0.1, value: 0 },
    to: { type: 'number', min: 0, max: 86400, step: 0.1, value: 0 },
  };
  for (const k of Object.keys(FIELDS)) words(FIELDS[k], k === 'pages' ? { label: 'ui.wm.f_pages', hint: 'ui.wm.f_pages_hint' } : { label: 'ui.wm.f_' + k });

  let seq = 0;
  const uid = () => 'l' + Date.now().toString(36).slice(-5) + (++seq).toString(36) + Math.random().toString(36).slice(2, 5);
  const num = (v, lo, hi, d) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max, d = '') => (v == null ? d : String(v)).slice(0, max);

  function layerDefaults(kind, over) {
    const k = kind === 'logo' ? 'logo' : 'text', L = { id: uid(), kind: k, show: true };
    for (const f of Object.keys(FIELDS)) L[f] = FIELDS[f].value;
    Object.assign(L, { logo: '', logoName: '', logoW: 0, logoH: 0, size: SIZE[k].value });
    return over ? normalizeLayer(Object.assign(L, over, { kind: (over.kind || k) })) : L;
  }
  function defaults() { return { v: VERSION, name: '', layers: [layerDefaults('text')] }; }

  /** A clean layer: every field present, in range and of the right type; unknown fields dropped. */
  function normalizeLayer(raw) {
    const r = plain(raw) ? raw : {}, kind = r.kind === 'logo' || r.kind === 'image' ? 'logo' : 'text', L = { id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : uid(), kind, show: r.show !== false };
    for (const [k, f] of Object.entries(FIELDS)) {
      const v = r[k];
      if (f.type === 'checkbox') L[k] = v === undefined ? f.value : !!v;
      else if (f.type === 'text') L[k] = str(v, f.max, f.value);
      else if (f.type === 'select') L[k] = f.options.some(([o]) => o === v) ? v : f.value;
      else if (f.type === 'color') L[k] = /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : f.value;
      else L[k] = num(v, f.min, f.max, f.value);
    }
    const S = SIZE[kind];
    L.size = num(r.size, S.min, S.max, S.value);
    L.logo = typeof r.logo === 'string' && /^data:image\/[\w.+-]+[;,]/i.test(r.logo) ? r.logo : '';
    L.logoName = str(r.logoName, 120);
    L.logoW = num(r.logoW, 0, 1e5, 0); L.logoH = num(r.logoH, 0, 1e5, 0);
    if (L.to && L.to <= L.from) L.to = 0;
    return L;
  }

  /** A clean spec from anything: a spec, its JSON text, or an engine setup from before specs (see spec-convert.js). */
  function normalize(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    if (!plain(raw)) return defaults();
    if (!Array.isArray(raw.layers) && api.fromCfg && ('kind' in raw || 'logoScale' in raw || 'text' in raw)) return api.fromCfg(raw);
    const layers = (Array.isArray(raw.layers) ? raw.layers : []).filter(plain).slice(0, MAX_LAYERS).map(normalizeLayer);
    const seen = new Set();
    for (const L of layers) { if (seen.has(L.id)) L.id = uid(); seen.add(L.id); }
    return { v: VERSION, name: str(raw.name, 80).trim(), layers };
  }

  const visible = (spec) => (spec && spec.layers || []).filter((L) => L.show);
  const usesPages = (spec) => visible(spec).some((L) => !!String(L.pages || '').trim());
  const usesTime = (spec) => visible(spec).some((L) => L.from > 0 || L.to > 0);
  /** What stops the spec from drawing anything, in words for a person; '' when it is ready. */
  function check(spec) {
    const list = visible(spec);
    if (!list.length) return (spec && spec.layers && spec.layers.length) ? tr('ui.wm.check_hidden') : tr('ui.wm.check_empty');
    for (const L of list) {
      if (L.kind === 'text' && !L.text.trim()) return tr('ui.wm.check_text');
      if (L.kind === 'logo' && !L.logo) return tr('ui.wm.check_logo');
      if (L.pages) { try { parsePages(L.pages, Infinity); } catch (e) { return e.message; } }
    }
    return '';
  }
  function label(L) {
    if (L.kind === 'logo') return L.logoName ? tr('ui.wm.layer_logo_named', { name: L.logoName }) : tr('ui.wm.layer_logo');
    return L.text.trim() ? tr('ui.wm.layer_text', { text: L.text.trim().slice(0, 40) }) : tr('ui.wm.layer_empty');
  }

  /** Page indices (0-based, sorted) a page range names, for n pages. Syntax: 2, 1-3, 4-, last, odd, even, all; comma
   *  separated. Empty or "all" is every page. Throws a message a person can read on text it cannot read. */
  function parsePages(spec, n) {
    const total = n == null ? Infinity : n, finite = Number.isFinite(total), out = new Set();
    let s = String(spec == null ? '' : spec).trim().toLowerCase();
    const addAll = (test) => { for (let i = 0; finite && i < total; i++) if (!test || test(i + 1)) out.add(i); };
    if (!s) s = 'all';
    for (const raw of s.split(',')) {
      const p = raw.trim();
      if (!p) continue;
      if (p === 'all') { addAll(); continue; }
      if (p === 'odd') { addAll((k) => k % 2 === 1); continue; }
      if (p === 'even') { addAll((k) => k % 2 === 0); continue; }
      if (p === 'last') { if (finite && total > 0) out.add(total - 1); continue; }
      const m = /^(\d+)(?:\s*-\s*(\d+)?)?$/.exec(p);
      if (!m) throw new Error(tr('ui.wm.pages_bad', { text: p }));
      const a = +m[1], b = m[2] != null ? +m[2] : (p.indexOf('-') >= 0 ? total : a);
      if (a < 1 || b < a) throw new Error(tr('ui.wm.pages_bad_range', { text: p }));
      for (let k = a; k <= b && (finite ? k <= total : k <= a + 10000); k++) out.add(k - 1);
    }
    return Array.from(out).sort((x, y) => x - y);
  }
  /** Whether a layer is drawn here. ctx.page (0-based) with ctx.pages checks the page range (a PDF); ctx.time (seconds)
   *  checks the time range (a video). A range that cannot be read draws nowhere. */
  function active(L, ctx = {}) {
    if (!L || !L.show) return false;
    if (ctx.page != null && String(L.pages || '').trim()) {
      try { if (parsePages(L.pages, ctx.pages).indexOf(ctx.page) < 0) return false; } catch (e) { return false; }
    }
    if (ctx.time != null && (ctx.time < L.from || (L.to > 0 && ctx.time >= L.to))) return false;
    return true;
  }

  /* Pure list changes. Each returns a new spec; the input is never changed. */
  const getLayer = (spec, id) => spec.layers.find((L) => L.id === id) || null;
  const withLayers = (spec, layers) => Object.assign({}, spec, { layers });
  function addLayer(spec, layer, index) {
    if (spec.layers.length >= MAX_LAYERS) return spec;
    const out = spec.layers.slice(), at = index == null ? out.length : Math.max(0, Math.min(out.length, index));
    out.splice(at, 0, normalizeLayer(layer));
    return withLayers(spec, out);
  }
  const removeLayer = (spec, id) => withLayers(spec, spec.layers.filter((L) => L.id !== id));
  /** dir -1: one step down (drawn earlier, under the others); +1: one step up. At the edge nothing changes. */
  function moveLayer(spec, id, dir) {
    const out = spec.layers.slice(), i = out.findIndex((L) => L.id === id), j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= out.length) return spec;
    [out[i], out[j]] = [out[j], out[i]];
    return withLayers(spec, out);
  }
  function duplicateLayer(spec, id, newId) {
    const i = spec.layers.findIndex((L) => L.id === id);
    if (i < 0 || spec.layers.length >= MAX_LAYERS) return spec;
    const out = spec.layers.slice();
    out.splice(i + 1, 0, normalizeLayer(Object.assign({}, spec.layers[i], { id: newId || uid() })));
    return withLayers(spec, out);
  }
  const updateLayer = (spec, id, patch) => withLayers(spec, spec.layers.map((L) => (L.id === id ? normalizeLayer(Object.assign({}, L, patch, { id: L.id })) : L)));

  const api = { VERSION, MAX_LAYERS, POSITIONS, POSITION_LABELS, FONTS, SIZE, FIELDS, uid, defaults, layerDefaults, normalize, normalizeLayer,
    visible, usesPages, usesTime, check, label, parsePages, active, getLayer, addLayer, removeLayer, moveLayer, duplicateLayer, updateLayer };
  return api;
});
