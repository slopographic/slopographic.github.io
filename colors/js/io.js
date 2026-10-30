/* Slop Colors: files in and out. In, one way only (shared/intake, spec 'colors'): a picture opens in the eyedropper; a
 * palette file (.gpl, .ase, .json, a .css with custom properties) becomes the palette. Out: the palette in the chosen
 * format (core/formats.js, core/ase.js) as a download, to Slop Drive, copied as code, or Open in… another app
 * (SlopOuttake, the one builder: it also has Save to Slop Drive…). Classic script. */
(function (g) {
  'use strict';
  const S = () => g.CO.state, X = () => g.SlopColors;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);
  const PALETTE_EXTS = ['.gpl', '.ase', '.json', '.css'];
  const extOf = (name) => (/\.[^.]+$/.exec(String(name || '').toLowerCase()) || [''])[0];
  const isPalette = (f) => PALETTE_EXTS.includes(extOf(f.name)) || /json|css/.test(f.type || '');

  /** A palette from a palette file's bytes (by its extension, else by its content). */
  async function readPalette(file) {
    const ext = extOf(file.name), F = X().formats;
    if (ext === '.ase') return X().ase.read(new Uint8Array(await file.arrayBuffer()));
    const text = await file.text();
    if (ext === '.gpl' || /^GIMP Palette/.test(text)) return F.fromGpl(text);
    if (ext === '.css' || /--[\w-]+\s*:/.test(text)) return F.fromCss(text);
    return F.fromJson(text);
  }
  async function take(file) {
    if (isPalette(file)) {
      const p = await readPalette(file);
      S().set({ palette: p, current: p.colors[0].hex });
      return `palette ${p.name}`;
    }
    if (!/^image\//.test(file.type || '') && !/\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i.test(file.name)) throw new Error(t('colors.io.not_supported', { name: file.name }));
    const r = await g.CO.picture.load(file);
    return `${file.name} (${r.colors.length} colours)`;
  }
  function register() {
    g.SlopIntake.register({
      id: 'colors',
      accept: { types: ['image/*', 'application/json', 'text/css', 'text/plain'], exts: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.svg', ...PALETTE_EXTS],
        noun: 'colors.io.noun' },
      driveAccept: ['image/*', 'application/json', 'text/css', 'text/plain', 'application/octet-stream'],
      process: take,
    });
  }

  /** The palette in a format: { blob, name, text? }. */
  function build(format) {
    const s = S().get(), F = X().formats, f = F.FORMATS.find((x) => x.id === (format || s.format)) || F.FORMATS[0], p = s.palette;
    if (!p.colors.length) throw new Error(t('colors.io.empty'));
    const base = F.slug(p.name) || 'palette';
    if (f.id === 'ase') return { blob: new Blob([X().ase.write(p)], { type: f.mime }), name: `${base}.ase` };
    const text = f.id === 'css' ? F.toCss(p) : f.id === 'tailwind' ? F.toTailwind(p) : f.id === 'json' ? F.toJson(p) : F.toGpl(p);
    return { blob: new Blob([text], { type: f.mime }), name: f.id === 'tailwind' ? `${base}.tailwind.js` : `${base}.${f.ext}`, text };
  }
  function download(format) { const o = build(format); g.SlopUI.download(o.blob, o.name); return o.name; }
  async function saveToDrive(format) {
    const o = build(format), id = await g.SlopHub.put(o.blob, { name: o.name, from: 'colors', meta: { palette: S().get().palette } });
    g.SlopUI.toast(t('colors.io.saved', { name: o.name }));
    return { id, name: o.name };
  }
  async function copyCode(format) {
    const o = build(format);
    if (!o.text) throw new Error(t('colors.io.ase_binary'));
    try { await navigator.clipboard.writeText(o.text); g.SlopUI.toast(t('colors.io.copied', { name: o.name })); } catch (e) { g.SlopUI.toast(t('colors.app.copy_failed')); }
    return o.text;
  }
  function openInItems() {
    let o;
    try { o = build(); } catch (e) { return []; }
    return g.SlopOuttake ? g.SlopOuttake.items({ get: () => build().blob, name: o.name, type: o.blob.type, from: 'colors', folder: true }) : [];
  }
  g.CO.io = { register, take, readPalette, build, download, saveToDrive, copyCode, openInItems, isPalette };
})(window);
