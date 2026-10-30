/* Slop Colors for the assistant (the AI panel, Ctrl+K forms, macros and WebMCP): SlopCmd commands with argument schemas,
 * loaded on demand by SlopCmd.prepare() (commands.js). Each one is the page's own work (CO.state, CO.picture, CO.io…), so
 * the person sees every change, and "Undo all AI changes" is the state snapshot (commands.js checkpoint).
 *   new_palette        name, colors[]                  a new palette (replaces the one on the page)
 *   add_colors         colors[]                        colours into the palette (any CSS or CMYK form)
 *   add_from_picture   file (Slop Drive) | url, count  opens the picture and adds its main colours
 *   set_color          color                           the current colour; returns it in every format
 *   convert_color      color                           read-only: the colour as HEX, RGB, HSL, OKLCH and CMYK
 *   make_palette       from harmony | scale | ramp, kind, steps   the palette made from the current colour
 *   remove_color       index (1 = first)               rename_palette  name
 *   check_contrast     fg, bg                          read-only: the WCAG ratio and the levels it passes
 *   fix_contrast       fg?, bg?, level AA | AAA | large   the nearest text colour that passes
 *   export_palette     format, to drive | download | both
 *   set_wheel          harmony?, wheel?, colors?      the colour wheel's rule (custom: colors are its own handles) and
 *                                                     wheel (rgb, ryb, oklch); returns the wheel's colours
 *   move_wheel_handle  handle, hue?, saturation?, brightness?   one handle moved, as a drag does (1 = the base colour)
 *   read_wheel         read-only: the handles with their colour and place */
(function (g) {
  'use strict';
  const C = g.SlopCmd, CO = g.CO, X = g.SlopColors;
  if (!C || C.get('colors.ai.new-palette')) return;
  const FORMATS = X.formats.FORMATS.map((f) => f.id);
  const COLORS = { name: 'colors', type: 'array', items: { type: 'string' }, maxItems: 64, description: 'colours as #hex, rgb(), hsl(), oklch() or cmyk()' };
  const add = (tool, title, args, run, extra) => Object.assign({ id: 'colors.ai.' + tool.replace(/_/g, '-'), tool, title, group: 'AI', hidden: true, destructive: false, args,
    run: (a) => run(a || g.SlopCmdArgs.defaults(args)) }, extra);
  const parse = (c) => { const h = X.convert.parse(c); if (!h) throw new Error(`“${c}” is not a colour`); return h; };
  const said = () => { const p = CO.state.get().palette; return `“${p.name}” has ${p.colors.length} colour${p.colors.length === 1 ? '' : 's'}: ${p.colors.map((c) => c.hex).join(', ') || 'none'}.`; };
  async function pictureFile(a) {
    const S = g.SlopCmdSources;
    if (a.file) { const r = await S.driveFile(a.file); return new File([r.blob], r.name, { type: r.type || r.blob.type }); }
    if (a.url) { const r = await S.siteFile(a.url); return new File([r.blob], r.name, { type: r.blob.type }); }
    throw new Error('Give a file (a Slop Drive name or id) or a url (a picture on this site)');
  }
  const H = X.harmony, WH = X.wheel;
  /** The wheel as the assistant reads it: hue on that wheel, saturation (OKLCH: chroma, % of the rim) and brightness. */
  const wheel = () => {
    const s = CO.state.get(), r1 = (x) => Math.round(x * 10) / 10, at = CO.wheel.places();
    return { harmony: s.harmony, wheel: s.wheel, handles: WH.colours(s).map((hex, i) => ({ handle: i + 1, hex, hue: r1(at[i].a), saturation: r1(at[i].r * 100), brightness: r1(at[i].v * 100) })) };
  };
  C.register([
    add('new_palette', 'New palette', [{ name: 'name', type: 'string', maxLength: 80, default: 'My palette' }, COLORS], (a) => {
      CO.state.set({ palette: { name: a.name || 'My palette', colors: (a.colors || []).map((c) => ({ hex: parse(c) })) } });
      return said();
    }, { destructive: true, description: 'Start a new palette (the one on the page is replaced), optionally with colours.' }),
    add('add_colors', 'Add colours to the palette', [Object.assign({ required: true }, COLORS)], (a) => {
      for (const c of a.colors || []) CO.state.addColor(parse(c));
      return said();
    }),
    add('add_from_picture', 'Add the main colours of a picture', [{ name: 'file', type: 'string', maxLength: 300, description: 'Slop Drive name or id' },
      { name: 'url', type: 'string', maxLength: 500, description: 'a picture on this site' }, { name: 'count', type: 'number', integer: true, min: 2, max: 12, default: 6 }], async (a) => {
      CO.state.set({ k: a.count || 6 });
      await CO.picture.load(await pictureFile(a));
      CO.picture.addAll();
      return `Found ${CO.picture.colors().length} main colours. ` + said();
    }, { description: 'Open a picture and put its main colours (k-means) in the palette.' }),
    add('set_color', 'Set the current colour', [{ name: 'color', type: 'string', required: true, maxLength: 80 }], (a) => {
      CO.state.set({ current: parse(a.color) });
      return X.convert.all(CO.state.get().current);
    }),
    add('convert_color', 'Convert a colour', [{ name: 'color', type: 'string', required: true, maxLength: 80 }], (a) => X.convert.all(parse(a.color)), { readOnly: true,
      description: 'A colour in every format: HEX, RGB, HSL, OKLCH and CMYK (naive, no ICC profile).' }),
    add('make_palette', 'Make a palette from the current colour', [{ name: 'from', type: 'enum', values: ['harmony', 'scale', 'ramp'], default: 'harmony' },
      { name: 'kind', type: 'enum', values: [...X.harmony.HARMONIES, ...X.harmony.SCALES].map((x) => x[0]), description: 'the harmony (complementary, triadic…) or the scale (tints, shades, tones)' },
      { name: 'steps', type: 'number', integer: true, min: 2, max: 12, description: 'colours in a scale' }], (a) => {
      const patch = {};
      if (a.kind) patch[X.harmony.SCALES.some((x) => x[0] === a.kind) ? 'scale' : 'harmony'] = a.kind;
      if (a.steps) patch.steps = a.steps;
      CO.state.set(patch);
      CO.swatches.generated(CO.state.get());
      CO.swatches.usePalette(a.from || 'harmony');
      return said();
    }, { destructive: true }),
    add('remove_color', 'Remove a colour from the palette', [{ name: 'index', type: 'number', integer: true, min: 1, max: 64, required: true, description: '1 is the first colour' }], (a) => {
      const p = CO.state.get().palette;
      if (a.index > p.colors.length) throw new Error(`The palette has ${p.colors.length} colours`);
      CO.swatches.remove(a.index - 1);
      return said();
    }),
    add('rename_palette', 'Rename the palette', [{ name: 'name', type: 'string', required: true, maxLength: 80 }], (a) => {
      CO.state.set({ palette: { name: a.name, colors: CO.state.get().palette.colors } });
      return said();
    }),
    add('check_contrast', 'Check the contrast of two colours', [{ name: 'fg', type: 'string', required: true, maxLength: 80, description: 'text colour' },
      { name: 'bg', type: 'string', required: true, maxLength: 80, description: 'background colour' }], (a) => {
      CO.state.set({ fg: parse(a.fg), bg: parse(a.bg) });
      const c = CO.contrast.check(CO.state.get().fg, CO.state.get().bg);
      return { ratio: c.ratio, passes: c.levels };
    }, { description: 'The WCAG 2 contrast ratio of a text colour on a background, and which levels (AA, AAA, large text, UI) it passes.' }),
    add('fix_contrast', 'Fix the text colour to pass', [{ name: 'fg', type: 'string', maxLength: 80 }, { name: 'bg', type: 'string', maxLength: 80 },
      { name: 'level', type: 'enum', values: ['AA', 'AAA', 'large'], default: 'AA' }], (a) => {
      const patch = {};
      if (a.fg) patch.fg = parse(a.fg);
      if (a.bg) patch.bg = parse(a.bg);
      CO.state.set(patch);
      const hex = CO.contrast.fix(a.level === 'AAA' ? 7 : a.level === 'large' ? 3 : 4.5);
      return `The text colour is now ${hex}: ${CO.contrast.check(hex, CO.state.get().bg).ratio}:1 on ${CO.state.get().bg}.`;
    }),
    add('export_palette', 'Export the palette', [{ name: 'format', type: 'enum', values: FORMATS, default: 'css' },
      { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }], async (a) => {
      CO.state.set({ format: a.format });
      const out = [];
      if (a.to !== 'download') { const r = await CO.io.saveToDrive(a.format); out.push(`Saved ${r.name} to Slop Drive (id ${r.id})`); }
      if (a.to !== 'drive') out.push(`downloaded ${CO.io.download(a.format)}`);
      return out.join(' and ') + '.';
    }, { description: 'The palette as CSS variables, a Tailwind config, JSON, an Adobe .ase or a GIMP .gpl file, to Slop Drive and/or a download.' }),
    add('set_wheel', 'Set the colour wheel', [{ name: 'harmony', type: 'enum', values: H.HARMONIES.map((x) => x[0]), description: 'the rule linking the handles; brightness is Shades, custom lets each handle move on its own' },   // i18n-ignore: for the assistant (English: API)
      { name: 'wheel', type: 'enum', values: H.WHEELS.map((x) => x[0]), description: 'rgb (HSB), ryb (the artist\'s wheel) or oklch (perceptual)' },   // i18n-ignore: for the assistant (English: API)
      Object.assign({}, COLORS, { maxItems: 7, description: 'custom only: the other handles\' colours (the base is the current colour)' })], (a) => {   // i18n-ignore: for the assistant (English: API)
      const patch = {};
      if (a.harmony) patch.harmony = a.harmony;
      if (a.wheel) patch.wheel = a.wheel;
      if (a.colors && a.colors.length) { patch.harmony = 'custom'; patch.custom = a.colors.map(parse); }
      CO.state.set(patch);
      return wheel();
    }, { description: 'The colour wheel: its harmony rule and wheel (RGB, RYB, OKLCH). Its colours are the harmony row in Made from this colour.' }),   // i18n-ignore: for the assistant (English: API)
    add('move_wheel_handle', 'Move a handle on the colour wheel', [{ name: 'handle', type: 'number', integer: true, min: 1, max: 8, default: 1, description: '1 is the base colour' },   // i18n-ignore: for the assistant (English: API)
      { name: 'hue', type: 'number', min: 0, max: 360, description: 'degrees on the wheel in use' }, { name: 'saturation', type: 'number', min: 0, max: 100, description: '% from the centre (OKLCH: chroma)' },   // i18n-ignore: for the assistant (English: API)
      { name: 'brightness', type: 'number', min: 0, max: 100, description: 'HSB brightness (OKLCH: lightness)' }], (a) => {   // i18n-ignore: for the assistant (English: API)
      const to = {};
      if (a.hue != null) to.a = a.hue;
      if (a.saturation != null) to.r = a.saturation / 100;
      if (a.brightness != null) to.v = a.brightness / 100;
      CO.wheel.moveHandle((a.handle || 1) - 1, to);
      return wheel();
    }, { description: 'Move one handle as a drag does: the base sets the current colour and the others follow the rule; in custom each handle moves on its own.' }),   // i18n-ignore: for the assistant (English: API)
    add('read_wheel', 'Read the colour wheel', [], () => wheel(), { readOnly: true, description: 'The wheel\'s harmony, model and handles (colour, hue, saturation, brightness).' }),   // i18n-ignore: for the assistant (English: API)
  ]);
})(window);
