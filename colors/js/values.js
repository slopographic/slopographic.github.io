/* Slop Colors: the current colour in the main view: the big swatch (the system colour picker under it) and one row per
 * format (HEX, RGB, HSL, OKLCH, CMYK). Typing in any row sets the colour and the others follow; each row has Copy. Under
 * them, "Use as text colour" and "Use as background" fill the contrast check. The rows are built once; paint(s) fills them,
 * except the one being typed in. The right panel keeps only the settings (js/panel.js). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.CO.state, X = () => g.SlopColors;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const LABELS = { hex: 'HEX', rgb: 'RGB', hsl: 'HSL', oklch: 'OKLCH', cmyk: 'CMYK' };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  let inputs = null;

  /** Says when a typed OKLCH colour is outside sRGB (it is shown with less chroma). */
  function gamutNote(text) {
    const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)/i.exec(text || ''), C = X().convert;
    const out = m && C.outOfGamut(m[2] ? +m[1] / 100 : +m[1], m[4] ? (+m[3] / 100) * 0.4 : +m[3], +m[5]);
    $('co-gamut').textContent = out ? t('colors.app.gamut') : '';
  }

  function row(k) {
    const li = el('li', 'co-value'), lab = el('label', 'co-vk', LABELS[k]), inp = el('input', 'co-vv'), b = el('button', 'sui-btn co-copy', t('ui.copy'));
    b.dataset.i18n = 'ui.copy';
    inp.type = 'text'; inp.id = 'co-in-' + k; inp.spellcheck = false; inp.autocomplete = 'off';
    lab.htmlFor = inp.id;
    b.type = 'button';
    b.addEventListener('click', () => g.CO.swatches.copy(inp.value, b));
    inp.addEventListener('input', () => {
      const h = X().convert.parse(inp.value);
      inp.setAttribute('aria-invalid', String(!h));
      if (h && h !== S().get().current) S().set({ current: h });
      if (k === 'oklch') gamutNote(inp.value);
    });
    inp.addEventListener('change', () => { inp.removeAttribute('aria-invalid'); inp.value = X().convert.format(S().get().current, k); });
    inputs[k] = inp;
    li.append(lab, inp, b);
    return li;
  }

  function build() {
    inputs = {};
    $('co-values').replaceChildren(...X().convert.KINDS.map(row));
    $('co-native').addEventListener('input', () => S().set({ current: $('co-native').value }));
    $('co-as-fg').addEventListener('click', () => S().set({ fg: S().get().current }));
    $('co-as-bg').addEventListener('click', () => S().set({ bg: S().get().current }));
  }

  function paint(s) {
    if (!inputs) build();
    const big = $('co-big'), active = document.activeElement, C = X().convert;
    big.style.background = s.current; big.style.color = g.CO.swatches.ink(s.current);
    $('co-big-hex').textContent = s.current;
    if (active !== $('co-native')) $('co-native').value = s.current;
    for (const [k, inp] of Object.entries(inputs)) {
      const v = C.format(s.current, k);
      if (active !== inp) inp.value = v;
      inp.nextElementSibling.setAttribute('aria-label', t('colors.app.copy_value', { fmt: LABELS[k], value: v }));
    }
    if (active !== inputs.oklch) $('co-gamut').textContent = '';
  }

  g.CO.values = { paint, inputs: () => inputs };
})(window);
