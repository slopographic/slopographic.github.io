/* SlopContrast: a WCAG text contrast audit of a live page, for the test pages in tests/a11y/.
 *   SlopContrast.audit(win, { root, label }) -> { checked, image, fails: [{ sel, text, fg, bg, ratio, need }] }
 *   SlopContrast.ratio(rgbA, rgbB), SlopContrast.rgba(cssColor) -> [r, g, b, a] (0-255, a 0-1)
 *   SlopContrast.indicator(win, el) -> the contrast of el's focus outline or its background (the stronger) against what is
 *     behind it, or null when it has neither
 * Every visible text node (and the value or placeholder of every text field) is checked where it is drawn: the colour is the
 * computed one, faded by its own alpha and every opacity above it, over the layers under the text's centre
 * (elementsFromPoint, so an absolutely placed label over a panel is measured on that panel), down to the first opaque one.
 * A gradient counts as each of its stops (the worst is kept); text over a picture, canvas or video is counted as "image"
 * and not judged. Text covered by something else (behind a modal, scrolled away) is skipped.
 * The ratio itself is shared/color/contrast.js (SlopContrastMath), the one copy of the WCAG maths.
 * Needs 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold) and placeholders. An inactive control (disabled, aria-disabled,
 * inert, or in a box faded to 60 % or less that takes no pointer) is exempt in WCAG; it needs 2:1 here, so its label still
 * shows. */
(function (g) {
  'use strict';
  const cache = new Map();
  let ctx = null;
  /** Any CSS colour (rgb, color(srgb), oklab, color-mix results...) as [r, g, b, a], through a 1x1 canvas. */
  function rgba(s) {
    if (!s || s === 'transparent') return [0, 0, 0, 0];
    if (cache.has(s)) return cache.get(s);
    let out;
    const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
    if (m) out = [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4])];
    else {
      const a = /\/\s*([\d.]+%?)\s*\)$/.exec(s), alpha = a ? (a[1].endsWith('%') ? parseFloat(a[1]) / 100 : +a[1]) : 1;
      if (!ctx) { const c = document.createElement('canvas'); c.width = c.height = 1; ctx = c.getContext('2d', { willReadFrequently: true }); }
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s.replace(/\/\s*[\d.]+%?\s*\)$/, ')');   // opaque, so no premultiplied rounding; alpha kept apart
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], alpha];
    }
    cache.set(s, out);
    return out;
  }
  // the WCAG maths is the site's one copy (shared/color/contrast.js, loaded by the test page before this file)
  const M = g.SlopContrastMath;
  if (!M) throw new Error('tests/a11y/contrast.js needs shared/color/contrast.js on the page first');
  const ratio = M.ratio;
  /** c (with alpha a) over an opaque colour. */
  const over = (c, a, under) => [0, 1, 2].map((i) => c[i] * a + under[i] * (1 - a));
  const mix = (under, top, op) => (op >= 1 ? top : [0, 1, 2].map((i) => top[i] * op + under[i] * (1 - op)));
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const COLOR_RE = /(?:rgba?|color|oklab|oklch|lab|lch|hsla?|hwb)\([^()]*\)/g;
  const IMAGE_TAGS = new Set(['IMG', 'CANVAS', 'VIDEO', 'IFRAME', 'PICTURE', 'EMBED', 'OBJECT', 'image']);

  function sel(el) {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      let s = n.localName;
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      const cls = [...n.classList].slice(0, 2).join('.');
      if (cls) s += '.' + cls;
      parts.unshift(s);
    }
    return parts.join(' > ');
  }

  function audit(win, opts = {}) {
    const doc = win.document, cs = (el, p) => win.getComputedStyle(el, p);
    const vw = win.innerWidth, vh = win.innerHeight;
    const opCache = new Map();
    const opacityOf = (el) => { const v = parseFloat(cs(el).opacity); return isNaN(v) ? 1 : v; };
    const cumOpacity = (el) => {
      if (!el || el.nodeType !== 1) return 1;
      if (opCache.has(el)) return opCache.get(el);
      const v = opacityOf(el) * cumOpacity(el.parentElement);
      opCache.set(el, v);
      return v;
    };
    const rootDark = cs(doc.documentElement).colorScheme.includes('dark') && !cs(doc.documentElement).colorScheme.includes('light');
    const canvasBase = rootDark ? [18, 18, 18] : [255, 255, 255];
    const out = { checked: 0, image: 0, covered: 0, fails: [] };
    const seen = new Set();

    /** The text colour and the backdrop variants (one per gradient stop) where (x, y) of el is drawn, or a skip reason. */
    function measure(el, x, y, fgCss) {
      const stack = doc.elementsFromPoint(x, y);
      const idx = stack.findIndex((s) => s === el || s.contains(el));
      if (idx < 0) return 'covered';
      // el and the ancestors between it and the stack's hit are missing there when they ignore the pointer (a toast): then
      // what the stack has above them cannot be told from what is under them, and the text counts as on top
      const chain = [];
      for (let n = el; n && n !== stack[idx]; n = n.parentElement) chain.push(n);
      if (!chain.length) for (let k = 0; k < idx; k++) if (!el.contains(stack[k])) return 'covered';
      const below = chain.concat(stack.slice(idx));
      const layers = [];
      for (let k = 0; k < below.length; k++) {
        const s = below[k], st = cs(s);
        if (!(s === el || s.contains(el)) && (IMAGE_TAGS.has(s.localName) || IMAGE_TAGS.has(s.tagName) || (s.localName === 'svg' && !s.contains(el)))) return 'image';
        if (/url\(/.test(st.backgroundImage) || /url\(/.test(st.maskImage || '')) return 'image';
        const stops = st.backgroundImage !== 'none' ? (st.backgroundImage.match(COLOR_RE) || []).map(rgba) : [];
        const bg = rgba(st.backgroundColor);
        layers.push({ s, bg, stops, anc: s === el || s.contains(el) });
        if (bg[3] >= 0.999 && opacityOf(s) >= 0.999 && !stops.length && cumOpacity(s) >= 0.999) break;
        if (stops.length && stops.every((c) => c[3] >= 0.999) && cumOpacity(s) >= 0.999) break;
      }
      const fg = rgba(fgCss);
      // The variants: the gradient stops of the topmost gradient layer, else one.
      const gl = layers.find((l) => l.stops.length);
      const variants = gl ? gl.stops : [null];
      const res = [];
      for (const v of variants) {
        let bot = canvasBase;
        // bottom up: unrelated layers fade by their whole opacity; ancestors open an opacity group (handled top down below)
        const evalFrom = (i, under) => {
          if (i < 0) return { bg: under, fg: over(fg, fg[3], under) };
          const l = layers[i];
          let inside = l.bg[3] > 0 ? over(l.bg, l.bg[3], under) : under;
          const stop = l === gl ? v : l.stops[0];   // the gradient paints over the layer's colour
          if (stop && stop[3] > 0) inside = over(stop, stop[3], inside);
          if (!l.anc) return evalFrom(i - 1, mix(under, inside, cumOpacity(l.s)));
          const r = evalFrom(i - 1, inside), op = opacityOf(l.s);
          return { bg: mix(under, r.bg, op), fg: mix(under, r.fg, op) };
        };
        // ancestors above the last layer still fade the group: their opacity is in cumOpacity of the bottom layer's parent
        const r = evalFrom(layers.length - 1, bot);
        const above = cumOpacity(layers[layers.length - 1].s.parentElement);
        res.push({ bg: r.bg, fg: mix(bot, r.fg, above) });
      }
      return res;
    }

    function check(el, x, y, fgCss, need, text) {
      out.checked++;
      const m = measure(el, x, y, fgCss);
      if (m === 'covered') { out.covered++; return; }
      if (m === 'image') { out.image++; return; }
      let worst = null;
      for (const v of m) { const r = ratio(v.fg, v.bg); if (!worst || r < worst.r) worst = { r, v }; }
      if (worst.r + 1e-9 < need) {
        const key = sel(el) + '|' + text;
        if (seen.has(key)) return;
        seen.add(key);
        out.fails.push({ sel: sel(el), text, fg: hex(worst.v.fg), bg: hex(worst.v.bg), ratio: Math.round(worst.r * 100) / 100, need });
      }
    }
    const isLarge = (st) => { const px = parseFloat(st.fontSize), w = parseInt(st.fontWeight, 10) || 400; return px >= 24 || (px >= 18.66 && w >= 700); };
    const isDisabled = (el) => {
      if (el.closest(':disabled, [aria-disabled="true"], [disabled], [inert]')) return true;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = cs(n); if (parseFloat(c.opacity) <= 0.6 && c.pointerEvents === 'none') return true; }
      return false;
    };
    // a lone symbol (an arrow, ☀, ⋯) is an icon: 3:1 like any other graphic
    const need = (st, el, ph, text = '') => (isDisabled(el) ? 2 : (ph || isLarge(st) || /^[^\p{L}\p{N}]{1,2}$/u.test(text) ? 3 : 4.5));
    const inView = (r) => r.width >= 2 && r.height >= 2 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
    const centre = (r) => [Math.min(vw - 1, Math.max(0, r.left + Math.min(r.width / 2, 6))), Math.min(vh - 1, Math.max(0, r.top + r.height / 2))];

    const root = opts.root || doc.body;
    const tw = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = doc.createRange();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!/\S/.test(n.data)) continue;
      const el = n.parentElement;
      if (!el || el.closest('script, style, noscript, template, select, textarea, option, svg, canvas, [data-contrast-skip]')) continue;
      const st = cs(el);
      if (st.visibility !== 'visible' || parseFloat(st.fontSize) < 6) continue;
      if (/text/.test(st.backgroundClip || st.webkitBackgroundClip || '') || rgba(st.webkitTextFillColor || st.color)[3] === 0) { out.image++; continue; }
      range.selectNodeContents(n);
      const r = [...range.getClientRects()].find(inView);
      if (!r) continue;
      const [x, y] = centre(r);
      check(el, x, y, st.webkitTextFillColor || st.color, need(st, el, false, n.data.trim()), n.data.trim().slice(0, 40));
    }
    for (const el of root.querySelectorAll('input, textarea, select')) {
      if (el.type && /^(checkbox|radio|range|color|file|hidden|image|submit|button|reset)$/.test(el.type)) continue;
      if (el.closest('[data-contrast-skip]')) continue;
      const st = cs(el), r = el.getBoundingClientRect();
      if (st.visibility !== 'visible' || !inView(r)) continue;
      const val = el.localName === 'select' ? (el.selectedOptions[0] || {}).text : el.value;
      const ph = !val && el.placeholder;
      if (!val && !ph) continue;
      const fg = ph ? cs(el, '::placeholder').color : st.color;
      const pad = parseFloat(st.paddingLeft) || 0;
      check(el, Math.min(vw - 1, r.left + pad + 4), Math.min(vh - 1, r.top + r.height / 2), fg, need(st, el, !!ph), (ph ? 'placeholder: ' : '') + String(val || ph).slice(0, 40));
    }
    return out;
  }

  /** The contrast of el's focus indicator: its outline (when drawn) against what is behind the element, else its background
   * against its parent's. */
  function indicator(win, el) {
    const st = win.getComputedStyle(el);
    const behind = (n) => {
      const r = n.getBoundingClientRect(), stack = n.ownerDocument.elementsFromPoint(r.left + 2, r.top + 2);
      const i = stack.indexOf(n);
      let c = [255, 255, 255];
      const below = stack.slice(i + 1).reverse();
      for (const s of below) { const b = rgba(win.getComputedStyle(s).backgroundColor); if (b[3] > 0) c = over(b, b[3], c); }
      return c;
    };
    const base = behind(el), out = [];
    if (st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 1) {
      const o = rgba(st.outlineColor);
      out.push({ kind: 'outline', ratio: ratio(over(o, o[3], base), base) });
    }
    const b = rgba(st.backgroundColor);
    if (b[3] > 0) out.push({ kind: 'background', ratio: ratio(over(b, b[3], base), base) });
    return out.sort((x, y) => y.ratio - x.ratio)[0] || null;
  }

  g.SlopContrast = { audit, ratio, rgba, indicator };
})(typeof window !== 'undefined' ? window : globalThis);
