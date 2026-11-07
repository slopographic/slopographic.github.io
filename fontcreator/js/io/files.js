/* Slop Font: files in and out. In, one way only (shared/intake, spec 'fontcreator'): a font (.ttf, .otf, .woff, .woff2)
 * opens to edit; a project (.sfont) opens as it was saved; an SVG goes to "Draw from SVG" for the glyph on screen; a
 * picture goes to "Trace a picture" (a glyph, or a filled handwriting sheet). Out: the font as TTF, OTF, WOFF or WOFF2,
 * the project (.sfont, JSON), the CSS @font-face rule; as a download, to Slop Drive, or Open in… (SlopOuttake, the one
 * builder). Classic script. FC.io: register(), take(file), build(format), download(format), saveToDrive(format),
 * copyCss(), openInItems(), FORMATS, openBytes(bytes, name). */
(function (g) {
  'use strict';
  const S = () => g.FC.state, F = () => g.SlopFont, t = (k, v) => g.FC.t(k, v);
  // label: the format's English name for the assistant (API); the page shows fontcreator.format.<id>
  const FORMATS = Object.freeze([ // i18n-ignore
    { id: 'ttf', label: 'TrueType (.ttf)', ext: 'ttf', mime: 'font/ttf' }, { id: 'otf', label: 'OpenType CFF (.otf)', ext: 'otf', mime: 'font/otf' }, // i18n-ignore
    { id: 'woff2', label: 'WOFF2 for the web (.woff2)', ext: 'woff2', mime: 'font/woff2' }, { id: 'woff', label: 'WOFF for the web (.woff)', ext: 'woff', mime: 'font/woff' }, // i18n-ignore
    { id: 'sfont', label: 'Project to edit again (.sfont)', ext: 'sfont', mime: 'application/x-slop-font' }, // i18n-ignore
  ]);
  const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'];
  const extOf = (name) => (/\.[^.]+$/.exec(String(name || '').toLowerCase()) || [''])[0];

  async function openBytes(bytes, name) {
    const kind = F().sfnt.sniff(bytes);
    if (!kind) throw new Error(t('fontcreator.io.not_font', { name }));
    let raw = bytes;
    if (kind === 'woff2') raw = await g.FC.woff2.decompress(bytes);
    const r = F().importer.fromBytes(raw);
    S().load(r.project, t('fontcreator.io.undo_open', { name }));
    g.SlopUI.toast(t('fontcreator.io.opened', { font: `${r.project.info.family} ${r.project.info.style}`, n: r.project.glyphs.length }) + (r.note ? `; ${r.note}` : ''), 5000);
    return r;
  }
  async function take(file, ctx) {
    const ext = extOf(file.name), type = file.type || '';
    if (FONT_EXTS.includes(ext) || /^font\/|opentype|truetype|woff/.test(type)) { const r = await openBytes(new Uint8Array(await file.arrayBuffer()), file.name); return t('fontcreator.io.took_font', { font: r.project.info.family, n: r.project.glyphs.length }); }
    if (ext === '.sfont' || ext === '.json' || /json|x-slop-font/.test(type)) {
      if (!file.size && ext === '.sfont') { S().load(F().model.create({ family: file.name.replace(/\.sfont$/i, '').replace(/^Untitled font$/i, 'My Font') }), t('fontcreator.app.new_title')); return t('fontcreator.io.took_new'); } // i18n-ignore
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { throw new Error(t('fontcreator.io.not_project', { name: file.name })); }
      S().load(F().model.clean(obj), t('fontcreator.io.undo_open', { name: file.name }));
      return t('fontcreator.io.took_project', { font: S().project().info.family });
    }
    if (ext === '.svg' || type === 'image/svg+xml') { g.FC.svgUi.open(await file.text(), file.name); return t('fontcreator.io.took_svg', { name: file.name }); }
    if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp|avif|heic)$/i.test(file.name)) { await g.FC.traceUi.open(file, ctx); return t('fontcreator.io.took_picture', { name: file.name }); }
    throw new Error(t('fontcreator.io.not_any', { name: file.name }));
  }
  function register() {
    g.SlopIntake.register({
      id: 'fontcreator',
      accept: { types: ['font/*', 'application/font-woff', 'application/x-font-ttf', 'application/x-font-otf', 'application/vnd.ms-opentype', 'application/json', 'application/x-slop-font', 'image/*'],
        exts: [...FONT_EXTS, '.sfont', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'], get noun() { return t('fontcreator.io.noun'); }, allowEmpty: true },
      driveAccept: ['font/*', 'application/font-woff', 'application/x-font-ttf', 'application/octet-stream', 'application/json', 'application/x-slop-font', 'image/*'],
      process: take,
    });
  }
  async function build(format) {
    const p = S().project(), B = F().build, base = B.fileBase(p), fmt = format || S().settings().format;
    const f = FORMATS.find((x) => x.id === fmt);
    if (!f) throw new Error(`Unknown format “${fmt}”: ${FORMATS.map((x) => x.id).join(', ')}`);
    if (fmt === 'sfont') return { blob: new Blob([JSON.stringify(p)], { type: f.mime }), name: `${base}.sfont` };
    if (!F().model.stats(p).drawn) throw new Error(t('fontcreator.io.no_outlines'));
    let bytes;
    if (fmt === 'ttf') bytes = B.ttf(p);
    else if (fmt === 'otf') bytes = B.otf(p);
    else if (fmt === 'woff') bytes = await B.woff(p, g.FC.zlib.deflate);
    else bytes = await g.FC.woff2.compress(B.ttf(p));
    return { blob: new Blob([bytes], { type: f.mime }), name: `${base}.${f.ext}`, bytes };
  }
  async function download(format) {
    const o = await build(format);
    g.SlopUI.download(o.blob, o.name);
    if ((format || S().settings().format) === 'sfont') S().saved();
    return o.name;
  }
  async function saveToDrive(format) {
    const o = await build(format), p = S().project();
    const id = await g.SlopHub.put(o.blob, { name: o.name, type: o.blob.type, from: 'fontcreator', meta: { family: p.info.family, style: p.info.style, glyphs: p.glyphs.length } });
    if ((format || S().settings().format) === 'sfont') S().saved();
    g.SlopUI.toast(t('fontcreator.io.saved', { name: o.name }));
    return { id, name: o.name };
  }
  function css() {
    const p = S().project(), base = F().build.fileBase(p);
    return F().build.css(p, { woff2: `${base}.woff2`, woff: `${base}.woff`, ttf: `${base}.ttf` });
  }
  async function copyCss() {
    const rule = css();
    try { await navigator.clipboard.writeText(rule); g.SlopUI.toast(t('fontcreator.io.css_copied')); } catch (e) { g.SlopUI.toast(t('fontcreator.io.copy_failed')); }
    return rule;
  }
  function openInItems() {
    const p = S().project(), fmt = S().settings().format, f = FORMATS.find((x) => x.id === fmt) || FORMATS[0];
    if (!g.SlopOuttake) return [];
    return g.SlopOuttake.items({ get: async () => (await build(fmt)).blob, name: `${F().build.fileBase(p)}.${f.ext}`, type: f.mime, from: 'fontcreator', folder: true });
  }
  g.FC.io = { register, take, openBytes, build, download, saveToDrive, css, copyCss, openInItems, FORMATS };
})(window);
