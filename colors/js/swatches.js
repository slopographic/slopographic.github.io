/* Slop Colors: swatches and the parts of the page drawn from them (the current colour and its values: js/values.js):
 * the palette (pick, move, rename, remove) and the rows made from the current colour (harmony, scale, ramp). The harmony
 * row is the colour wheel's colours (js/wheel.js): the rule and the wheel (RGB, RYB, OKLCH) of the state.
 * A swatch's label is in black or white, whichever reads better on it (shared/color/contrast.js). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.CO.state, X = () => g.SlopColors;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  /** Black or white, whichever has the more contrast on the colour. */
  const ink = (hex) => (g.SlopContrastMath.ratioHex(hex, '#000000') >= g.SlopContrastMath.ratioHex(hex, '#ffffff') ? '#000000' : '#ffffff');

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); if (btn) { btn.textContent = t('colors.app.copied'); setTimeout(() => { btn.textContent = t('ui.copy'); }, 1200); } }
    catch (e) { g.SlopUI.toast(t('colors.app.copy_failed')); }
  }

  /** One swatch: a button that picks the colour, and optional small buttons beside it. */
  function swatch(hex, o = {}) {
    const li = el('div', 'co-sw' + (o.selected ? ' is-on' : ''));
    li.setAttribute('role', 'listitem');
    const b = el('button', 'co-sw-btn');
    b.type = 'button';
    b.style.background = hex; b.style.color = ink(hex);
    b.dataset.hex = hex;
    b.append(el('span', 'co-sw-hex', o.label || hex));
    if (o.share != null) b.append(el('span', 'co-sw-share', Math.round(o.share * 100) + '%'));
    b.setAttribute('aria-label', (o.name ? o.name + ', ' : '') + hex + (o.share != null ? t('colors.app.share_of', { pct: Math.round(o.share * 100) }) : '') + (o.pickLabel ? '. ' + o.pickLabel : ''));
    if (o.selected) b.setAttribute('aria-current', 'true');
    b.addEventListener('click', () => (o.onPick || pick)(hex));
    li.append(b);
    if (o.tools) {
      const tools = el('div', 'co-sw-tools');
      for (const [label, aria, fn] of o.tools) { const x = el('button', 'co-sw-tool', label); x.type = 'button'; x.setAttribute('aria-label', aria); x.title = aria; x.addEventListener('click', fn); tools.append(x); }
      li.append(tools);
    }
    return li;
  }
  const pick = (hex) => S().set({ current: hex });

  function move(i, d) {
    const p = S().get().palette, cols = p.colors.slice(), j = i + d;
    if (j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    S().set({ palette: { name: p.name, colors: cols } });
  }
  function remove(i) {
    const p = S().get().palette, cols = p.colors.slice();
    cols.splice(i, 1);
    S().set({ palette: { name: p.name, colors: cols } });
  }
  function rename(i) {
    const p = S().get().palette, cols = p.colors.slice(), cur = cols[i];
    g.SlopUI.prompt(t('colors.app.rename_title'), t('colors.app.rename_name'), cur.name || '', { placeholder: cur.hex }).then((v) => {
      if (v == null) return;
      cols[i] = v.trim() ? { hex: cur.hex, name: v.trim() } : { hex: cur.hex };
      S().set({ palette: { name: p.name, colors: cols } });
    });
  }
  function palette(s) {
    const cols = s.palette.colors, box = $('co-palette');
    box.replaceChildren(...cols.map((c, i) => swatch(c.hex, { label: c.name || c.hex, name: c.name, selected: c.hex === s.current,
      tools: [['‹', t('colors.app.move_left', { name: c.name || c.hex }), () => move(i, -1)], ['›', t('colors.app.move_right', { name: c.name || c.hex }), () => move(i, 1)],
        ['✎', t('colors.app.rename_one', { name: c.name || c.hex }), () => rename(i)], ['×', t('colors.app.remove_one', { name: c.name || c.hex }), () => remove(i)]] })));
    $('co-pal-note').textContent = cols.length ? t('colors.app.pal_note', { n: cols.length, max: S().MAX }) : t('colors.app.pal_empty');
    $('co-pal-clear').disabled = !cols.length;
  }

  /** The rows made from the current colour; their colours, for "Use as the palette". */
  const made = { harmony: [], scale: [], ramp: [] };
  function generated(s) {
    const H = X().harmony;
    made.harmony = X().wheel.colours(s);   // the colour wheel's handles (js/wheel.js): one rule, one wheel
    made.scale = H.scale(s.current, s.scale, s.steps);
    const r = H.ramp(s.current);
    made.ramp = H.RAMP_KEYS.map((k) => ({ hex: r[k], name: String(k) }));
    const hm = H.HARMONIES.find((x) => x[0] === s.harmony) || H.HARMONIES[0], sc = H.SCALES.find((x) => x[0] === s.scale) || H.SCALES[0];
    const name = (kind, [id, en]) => (g.SlopI18n && g.SlopI18n.has('colors.' + kind + '.' + id) ? t('colors.' + kind + '.' + id) : en);
    $('co-harm-h').textContent = name('harmony', hm);
    $('co-scale-h').textContent = name('scale', sc);
    $('co-harmony').replaceChildren(...made.harmony.map((h) => swatch(h, { selected: h === s.current })));
    $('co-scale').replaceChildren(...made.scale.map((h) => swatch(h, { selected: h === s.current })));
    $('co-ramp').replaceChildren(...made.ramp.map((c) => swatch(c.hex, { label: c.name, name: c.name, selected: c.hex === s.current })));
  }
  function usePalette(which) {
    const s = S().get(), H = X().harmony, name = which === 'ramp' ? `${s.current} ramp` : `${s.current} ${which === 'harmony' ? s.harmony : s.scale}`;
    const cols = which === 'ramp' ? made.ramp : made[which].map((hex) => ({ hex }));
    S().set({ palette: { name, colors: cols } });
    return H && cols.length;
  }

  function wire() {
    $('co-pal-add').addEventListener('click', () => { try { S().addColor(S().get().current); } catch (e) { g.SlopUI.toast(e.message); } });
    $('co-pal-clear').addEventListener('click', () => S().set({ palette: { name: S().get().palette.name, colors: [] } }));
    for (const w of ['harmony', 'scale', 'ramp']) $(`co-${w === 'harmony' ? 'harm' : w}-use`).addEventListener('click', () => usePalette(w));
  }
  g.CO.swatches = { ink, swatch, copy, palette, generated, usePalette, made, move, remove, wire };
})(window);
