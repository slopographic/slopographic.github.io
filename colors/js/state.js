/* Slop Colors: the page's one state, kept in this browser (localStorage 'slop-colors'; a private window simply starts
 * fresh). Every part of the page reads it and changes it through here, and redraws on change().
 *   current            the colour being looked at ('#rrggbb')
 *   palette            { name, colors: [{ hex, name? }] } (at most 64 colours)
 *   fg, bg             the contrast check's text and background colours
 *   harmony, scale, steps, k, format   the panel's choices (harmony and scale ids, scale steps, colours to find, export format)
 *   wheel              the colour wheel: rgb, ryb or oklch (colors/js/core/wheel.js)
 *   custom             the custom harmony's own colours (the base is current); a switch to custom without them starts
 *                      from the rule's colours (harmony.customFrom), so the wheel's handles stay where they were
 * The colour, the harmony and the wheel are also in the page's address (?color=3366cc&harmony=triadic&wheel=ryb, and
 * custom=hex,hex… for custom; shared/urlstate), so a link opens the same wheel; the address wins over this browser's copy.
 * CO.state.get(), set(patch), on(fn) → off, snapshot() / restore(s) (the assistant's checkpoint), DEFAULTS, MAX. */
(function (g) {
  'use strict';
  const KEY = 'slop-colors', MAX = 64;
  const DEFAULTS = Object.freeze({ current: '#3366cc', palette: { name: 'My palette', colors: [] }, fg: '#1f2937', bg: '#ffffff',
    harmony: 'complementary', scale: 'tints', steps: 6, k: 6, format: 'css', wheel: 'rgb', custom: null });
  const C = () => g.SlopColors.convert, H = () => g.SlopColors.harmony;
  const U = g.SlopUrlState;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const fns = new Set();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let s = clone(DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') s = Object.assign(s, saved);
  } catch (e) { /* no storage: start fresh */ }
  const known = (list, v, def) => (list.some((x) => x[0] === v) ? v : def);
  /** The address's part of the state ({} without one). */
  function fromUrl() {
    if (!U) return {};
    const out = {}, c = C().parse(U.get('color', '')), hm = U.get('harmony', ''), w = U.get('wheel', ''), cu = U.get('custom', '');
    if (c) out.current = c;
    if (hm) out.harmony = known(H().HARMONIES, hm, s.harmony);
    if (w) out.wheel = known(H().WHEELS, w, s.wheel);
    if (cu) out.custom = cu.split(',').map((x) => C().parse(x)).filter(Boolean);
    return out;
  }
  let urlTimer = 0;
  /** Writes the address a moment after the last change (a drag changes the colour many times a second). */
  function toUrl() {
    if (!U) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(() => U.set({ color: s.current.slice(1), harmony: s.harmony, wheel: s.wheel,
      custom: s.harmony === 'custom' && s.custom ? s.custom.map((x) => x.slice(1)).join(',') : null }), 250);
  }

  /** Checks a patch: colours parsed, numbers in range, the palette's colours cleaned and capped. */
  function clean(p) {
    const out = {};
    for (const k of ['current', 'fg', 'bg']) if (p[k] != null) { const h = C().parse(p[k]); if (!h) throw new Error(t('colors.app.not_colour', { text: p[k] })); out[k] = h; }
    if (p.palette) {
      const cols = (p.palette.colors || []).map((c) => ({ hex: C().parse(typeof c === 'string' ? c : c.hex), name: typeof c === 'object' && c.name ? String(c.name).slice(0, 60) : undefined }))
        .filter((c) => c.hex).slice(0, MAX).map((c) => (c.name ? c : { hex: c.hex }));
      out.palette = { name: String(p.palette.name == null ? s.palette.name : p.palette.name).slice(0, 80) || 'Palette', colors: cols };
    }
    for (const k of ['scale', 'format']) if (p[k] != null) out[k] = String(p[k]);
    if (p.harmony != null) out.harmony = known(H().HARMONIES, String(p.harmony), DEFAULTS.harmony);
    if (p.wheel != null) out.wheel = known(H().WHEELS, String(p.wheel), DEFAULTS.wheel);
    if (p.custom !== undefined) out.custom = Array.isArray(p.custom) ? p.custom.map((x) => C().parse(x)).filter(Boolean).slice(0, 7) : null;
    // into custom without its colours: the handles start where the rule had them
    if (out.harmony === 'custom' && s.harmony !== 'custom' && p.custom === undefined) {
      out.custom = H().customFrom(out.current || s.current, s.harmony, out.wheel || s.wheel);
    }
    if (p.steps != null) out.steps = Math.max(2, Math.min(12, Math.round(Number(p.steps)) || DEFAULTS.steps));
    if (p.k != null) out.k = Math.max(2, Math.min(12, Math.round(Number(p.k)) || DEFAULTS.k));
    return out;
  }
  function set(patch) {
    Object.assign(s, clean(patch || {}));
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not kept */ }
    toUrl();
    for (const fn of fns) { try { fn(s); } catch (e) { console.error(e); } }
    return s;
  }
  try { Object.assign(s, clean(fromUrl())); } catch (e) { /* a bad address: keep the saved state */ }
  const get = () => s;
  const on = (fn) => { fns.add(fn); return () => fns.delete(fn); };
  const snapshot = () => clone(s);
  const restore = (x) => set(clone(x));
  /** The palette with one more colour (not twice in a row the same one), or an error when it is full. */
  function addColor(hex, name) {
    const cols = s.palette.colors.slice(), h = C().parse(hex);
    if (!h) throw new Error(t('colors.app.not_colour', { text: hex }));
    if (cols.length >= MAX) throw new Error(t('colors.app.full', { n: MAX }));
    cols.push(name ? { hex: h, name } : { hex: h });
    set({ palette: { name: s.palette.name, colors: cols } });
    return cols.length;
  }
  g.CO = g.CO || {};
  g.CO.state = { get, set, on, snapshot, restore, addColor, DEFAULTS, MAX };
})(window);
