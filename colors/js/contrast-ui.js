/* Slop Colors: the contrast check. A text colour on a background, the WCAG 2 ratio (shared/color/contrast.js, the site's
 * one copy of the maths) and which levels it passes: AA and AAA for normal and large text, and 3:1 for UI parts and
 * graphics (WCAG 1.4.11). Swap, and Fix the text colour (the nearest colour that reaches AA, core/harmony.js suggest).
 * The sample shows the person's own pair, so it is left out of the site's contrast sweep (data-contrast-skip). Classic script. */
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => g.CO.state, M = () => g.SlopContrastMath;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  // [level, the label's key, its English, the ratio it needs]
  const ROWS = [['aaNormal', 'AA normal text', '4.5:1'], ['aaLarge', 'AA large text', '3:1'], ['aaaNormal', 'AAA normal text', '7:1'],   // i18n-ignore: the English names (colors.con.*)
    ['aaaLarge', 'AAA large text', '4.5:1'], ['ui', 'UI parts and graphics', '3:1']];   // i18n-ignore
  const KEYS = { aaNormal: 'aa_normal', aaLarge: 'aa_large', aaaNormal: 'aaa_normal', aaaLarge: 'aaa_large', ui: 'ui' };

  /** { ratio (2 decimals, rounded down as checkers do, so 4.499 is not shown as 4.5), levels } for two colours. */
  function check(fg, bg) {
    const r = M().ratioHex(fg, bg);
    return { ratio: Math.floor(r * 100) / 100, exact: r, levels: M().levels(r) };
  }
  function paint(s) {
    const fgIn = $('co-con-fg'), bgIn = $('co-con-bg');
    if (document.activeElement !== fgIn) fgIn.value = s.fg;
    if (document.activeElement !== bgIn) bgIn.value = s.bg;
    const c = check(s.fg, s.bg), box = $('co-sample');
    box.style.color = s.fg; box.style.background = s.bg;
    $('co-ratio').textContent = `${c.ratio.toFixed(2)} : 1`;
    $('co-verdicts').replaceChildren(...ROWS.map(([k, label, need]) => {
      const li = document.createElement('li'), ok = c.levels[k];
      li.className = 'co-verdict ' + (ok ? 'ok' : 'bad');
      li.dataset.level = k;
      const name = g.SlopI18n ? t('colors.con.' + KEYS[k]) : label;
      li.textContent = t(ok ? 'colors.con.pass' : 'colors.con.fail', { level: name, need });
      return li;
    }));
    $('co-con-fix').disabled = c.levels.aaNormal;
  }
  function swap() { const s = S().get(); S().set({ fg: s.bg, bg: s.fg }); }
  /** The text colour moved to the nearest one that reaches target (AA normal text: 4.5) on the background. */
  function fix(target = 4.5) {
    const s = S().get(), hex = g.SlopColors.harmony.suggest(s.fg, s.bg, target);
    if (!hex) throw new Error(t('colors.con.no_fix'));
    S().set({ fg: hex });
    return hex;
  }
  function wire() {
    for (const [id, key] of [['co-con-fg', 'fg'], ['co-con-bg', 'bg']]) {
      const inp = $(id);
      inp.addEventListener('input', () => { const h = g.SlopColors.convert.parse(inp.value); inp.setAttribute('aria-invalid', String(!h)); if (h) S().set({ [key]: h }); });
      inp.addEventListener('change', () => { inp.value = S().get()[key]; inp.removeAttribute('aria-invalid'); });
    }
    $('co-con-swap').addEventListener('click', swap);
    $('co-con-fix').addEventListener('click', () => { try { fix(); } catch (e) { g.SlopUI.toast(e.message); } });
  }
  g.CO.contrast = { check, paint, swap, fix, wire, ROWS };
})(window);
