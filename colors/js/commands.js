/* Slop Colors: SlopCmd commands (Ctrl+K and the shortcut editor) for the page's own actions, and the assistant's commands
 * with arguments (ai-commands.js), loaded by SlopCmd.prepare() when the AI panel (or WebMCP, a macro) first asks, after
 * shared/commands/sources.js. The colour wheel's: "Wheel: set harmony to …" for each harmony, "Wheel: use the … wheel" for
 * RGB, RYB and OKLCH, "Wheel: go to the colour wheel". Classic script, after main.js. */
(function (g) {
  'use strict';
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const load = (src) => new Promise((res, rej) => {
    const s = Object.assign(document.createElement('script'), { src: new URL(src, HERE).href });
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
  function init() {
    const C = g.SlopCmd, CO = g.CO;
    if (!C || !CO || !CO.state) return;
    C.init({ app: 'colors' });
    const has = () => CO.state.get().palette.colors.length > 0;
    const safe = (fn) => () => Promise.resolve().then(fn).catch((e) => g.SlopUI.toast(e.message));
    const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
    const H = g.SlopColors.harmony, named = (kind, id, en) => (g.SlopI18n && g.SlopI18n.has(`colors.${kind}.${id}`) ? t(`colors.${kind}.${id}`) : en);
    // the colour wheel (js/wheel.js): one command per harmony and per wheel, and one to go to it
    const wheel = () => [
      ...H.HARMONIES.map(([id, en]) => ({ id: 'colors.wheel.rule.' + id, title: t('colors.cmd.wheel_rule', { rule: named('harmony', id, en) }), group: t('colors.cmd.g_wheel'),
        keywords: ['wheel', 'harmony', id, en.toLowerCase()], run: () => CO.wheel.setRule(id) })),
      ...H.WHEELS.map(([id, en]) => ({ id: 'colors.wheel.model.' + id, title: t('colors.cmd.wheel_model', { wheel: named('wheel', id, en) }), group: t('colors.cmd.g_wheel'),
        keywords: ['wheel', 'model', id, en.toLowerCase()], run: () => CO.wheel.setModel(id) })),
      { id: 'colors.wheel.focus', title: t('colors.cmd.wheel_focus'), group: t('colors.cmd.g_wheel'), keywords: ['wheel', 'hue', 'colour wheel', 'color wheel'], run: () => CO.wheel.focus() },
    ];
    // titles and groups in the current language: built again on a language change
    const list = () => [
      { id: 'colors.open', title: t('colors.cmd.open'), group: t('menu.file'), keywords: ['image', 'photo', 'gpl', 'ase', 'import'], run: () => g.SlopIntake.pick({ to: 'colors' }) },
      { id: 'colors.download', title: t('colors.cmd.download'), group: t('menu.file'), keywords: ['export', 'css', 'tailwind', 'json', 'ase', 'gpl'], when: has, run: safe(() => CO.io.download()) },
      { id: 'colors.drive', title: t('colors.cmd.drive'), group: t('menu.file'), when: has, run: safe(() => CO.io.saveToDrive()) },
      { id: 'colors.copy', title: t('colors.cmd.copy'), group: t('menu.edit'), when: has, run: safe(() => CO.io.copyCode()) },
      { id: 'colors.add', title: t('colors.cmd.add'), group: t('colors.cmd.g_palette'), keywords: ['swatch', 'save colour'], run: safe(() => CO.state.addColor(CO.state.get().current)) },
      { id: 'colors.clear', title: t('colors.cmd.clear'), group: t('colors.cmd.g_palette'), when: has, run: () => CO.state.set({ palette: { name: CO.state.get().palette.name, colors: [] } }) },
      { id: 'colors.harmony', title: t('colors.cmd.harmony'), group: t('colors.cmd.g_palette'), keywords: ['complementary', 'triadic', 'analogous'], run: () => CO.swatches.usePalette('harmony') },
      { id: 'colors.ramp', title: t('colors.cmd.ramp'), group: t('colors.cmd.g_palette'), keywords: ['tailwind', 'shades', 'scale'], run: () => CO.swatches.usePalette('ramp') },
      { id: 'colors.swap', title: t('colors.cmd.swap'), group: t('colors.cmd.g_contrast'), keywords: ['contrast', 'wcag'], run: () => CO.contrast.swap() },
      { id: 'colors.fix', title: t('colors.cmd.fix'), group: t('colors.cmd.g_contrast'), keywords: ['contrast', 'wcag', 'accessible'], run: safe(() => CO.contrast.fix()) },
      { id: 'colors.screen', title: t('colors.cmd.screen'), group: t('colors.cmd.g_colour'), keywords: ['eyedropper', 'picker'], when: () => typeof g.EyeDropper === 'function', run: safe(() => CO.picture.pickScreen()) },
      ...wheel(),
    ];
    C.register(list());
    if (g.SlopI18n && g.SlopI18n.on) g.SlopI18n.on(() => C.register(list()));
    C.provide({
      prepare: () => (g.SlopCmdSources ? Promise.resolve() : load('../../shared/commands/sources.js')).then(() => (C.get('colors.ai.new-palette') ? null : load('ai-commands.js'))),
      state: () => {
        const s = CO.state.get(), c = CO.contrast.check(s.fg, s.bg);
        return { app: 'Slop Colors', current: g.SlopColors.convert.all(s.current), palette: s.palette, contrast: { fg: s.fg, bg: s.bg, ratio: c.ratio, levels: c.levels },
          picture: CO.picture.info(), pictureColors: CO.picture.colors().map((d) => d.hex), format: s.format,
          wheel: { model: s.wheel, harmony: s.harmony, colors: g.SlopColors.wheel.colours(s) } };
      },
      checkpoint: () => { const snap = CO.state.snapshot(); return () => CO.state.restore(snap); },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
