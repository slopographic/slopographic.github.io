/* SlopClean: the controller. Opens pictures through the one intake (shared/intake, spec 'clean': Open, a drop, a paste,
 * Slop Drive ?drive=<id>, a PWA launch), cleans them with the chosen
 * categories, and hands out the results: a download (one file, or a zip through the shared SlopZip), a copy saved to
 * Slop Drive, or (only for a picture opened from Drive, after a confirmation) a replaced original. Classic script. */
(function () {
  'use strict';
  const CL = (window.CL = window.CL || {});
  const UI = () => window.SlopUI, H = () => window.SlopHub;
  const $ = (id) => document.getElementById(id);
  const t = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);
  const S = (CL.state = { items: [], remove: window.SlopClean.resolve({}) });
  let timer = 0;

  /** Read and add pictures, then clean them with the current choices. */
  async function addFiles(files, extra = {}) {
    const list = [...files].filter(Boolean);
    if (!list.length) return;
    for (const f of list) S.items.push(await CL.io.load(f, f.name, extra));
    await runClean();
  }
  async function runClean() {
    for (const it of S.items) await CL.io.clean(it, S.remove);
    render();
  }
  /** Choices changed: clean again after a short pause, so a run of clicks does one pass. */
  function changed() { clearTimeout(timer); timer = setTimeout(runClean, 120); render(); }

  function removeAll() {
    S.remove = window.SlopClean.resolve({});
    runClean();
  }
  function forget(item) {
    if (item.thumb) URL.revokeObjectURL(item.thumb);
    S.items = S.items.filter((x) => x !== item);
    render();
  }
  const blobOf = (item) => new Blob([item.out.bytes], { type: item.out.mime });

  function download(item) { UI().download(blobOf(item), CL.io.copyName(item.name)); }
  async function downloadAll() {
    const ready = S.items.filter((x) => x.out);
    if (!ready.length) return UI().toast(t('clean.toast.nothing'));
    if (ready.length === 1) return download(ready[0]);
    UI().toast(t('clean.toast.zipping'));
    const zip = await window.SlopZip.zip(ready.map((x) => ({ name: CL.io.copyName(x.name), data: blobOf(x), time: Date.now() })));
    UI().download(zip, 'slop-clean.zip');
  }
  /** Copies only: each cleaned picture is written as a new Drive file in the folder the person picks. */
  async function saveAll(only) {
    const ready = (only ? [only] : S.items).filter((x) => x.out);
    if (!ready.length) return UI().toast(t('clean.toast.nothing'));
    const folderId = await H().pickFolder({ title: t('clean.dlg.save_title'), start: await H().appFolderId('clean') });
    if (folderId === undefined) return;
    for (const it of ready) await H().put(blobOf(it), { name: CL.io.copyName(it.name), from: 'clean', folderId });
    UI().toast(t('clean.toast.saved_n', { n: ready.length }));
  }
  /** Overwrites the Drive file this picture was opened from. Asks first, and says it cannot be undone. */
  async function replace(item) {
    if (!item.driveId || !item.out) return;
    const ok = await UI().confirm(t('clean.dlg.replace_title'), t('clean.dlg.replace_body', { name: item.name }),
      t('clean.dlg.replace_ok'), { danger: true });
    if (!ok) return;
    await H().update(item.driveId, { blob: blobOf(item), type: item.out.mime });
    item.blob = blobOf(item); item.bytes = item.out.bytes;
    item.findings = window.SlopClean.inspect(item.bytes).findings; item.size = item.bytes.length; item.out = null;
    UI().toast(t('clean.toast.replaced'));
    render();
  }

  function render() {
    const found = S.items.reduce((n, it) => n + it.findings.length, 0);
    const gone = S.items.reduce((n, it) => n + (it.out ? it.findings.length - it.out.after.length : 0), 0);
    $('cl-stat').textContent = S.items.length
      ? [t('clean.stat.pictures', { n: S.items.length }), t('clean.stat.found', { n: found }), t('clean.stat.removed', { n: gone })].join(' · ')
      : '';
    $('cl-all').disabled = !S.items.some((x) => x.out);
    $('cl-save-all').disabled = $('cl-all').disabled;
    CL.report.render(S, { view: CL.report.view, download, save: (it) => saveAll(it), replace, close: forget });
    CL.choices.render(S, changed);
    if (window.SlopGuard && SlopGuard.setUnsaved) SlopGuard.setUnsaved('clean', S.items.some((x) => x.out));
  }

  /** The one way in: every source reaches addFiles (a picture from Slop Drive keeps its record: Replace original). */
  function registerIntake() {
    window.SlopIntake.register({
      id: 'clean', accept: { types: ['image/*'], exts: ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'], noun: 'clean.app.a_picture' },
      processAll: async (files, ctx) => {
        for (const f of files) S.items.push(await CL.io.load(f, f.name, f.slopDrive ? { driveId: f.slopDrive.id } : {}));
        await runClean();
        return files.map((f) => f.name);
      },
    });
    window.SlopIntake.dropTarget(document.body, { to: 'clean' });
  }
  const openPicker = () => window.SlopIntake.pick({ to: 'clean', accept: CL.io.ACCEPT });

  function wire() {
    $('cl-open').addEventListener('click', openPicker);
    $('cl-open-empty').addEventListener('click', openPicker);
    $('cl-remove-all').addEventListener('click', removeAll);
    $('cl-all').addEventListener('click', downloadAll);
    $('cl-save-all').addEventListener('click', () => saveAll());
    if (window.SlopCmd && SlopCmd.init) SlopCmd.init({ app: 'clean' });
    // the assistant's commands with arguments (ai-commands.js; shared/commands/sources.js finds Drive files), loaded when first asked
    if (window.SlopCmd && SlopCmd.provide) SlopCmd.provide({ prepare: () => SlopCmd.sources().then(() => script('js/app/ai-commands.js')) });
    // titles and groups in the current language; a language change registers them again (the palette follows)
    const commands = () => [
      { id: 'cl.open', title: t('clean.app.open'), group: t('menu.file'), keys: ['Mod+O'], run: openPicker, keywords: ['add', 'import', 'photo'] },
      { id: 'cl.download', title: t('clean.cmd.download'), group: t('menu.file'), keys: ['Mod+S'], run: downloadAll, keywords: ['zip', 'save'] },
      { id: 'cl.remove-all', title: t('clean.cmd.remove_all'), group: t('menu.edit'), keys: ['Shift+Mod+R'], run: removeAll, keywords: ['strip', 'clean'] },
    ];
    if (window.SlopCmd && SlopCmd.register) SlopCmd.register(commands());
    // a language change: the commands, the counts, the cards and the choices again, in the new language
    if (window.SlopI18n && window.SlopI18n.on) window.SlopI18n.on(() => { if (window.SlopCmd && SlopCmd.register) SlopCmd.register(commands()); render(); });
  }

  const script = (src) => new Promise((res, rej) => document.head.append(Object.assign(document.createElement('script'),
    { src: new URL(src, HERE).href, async: false, onload: res, onerror: () => rej(new Error('Could not load ' + src)) })));
  const HERE = new URL('../../', (document.currentScript && document.currentScript.src) || location.href).href;   // clean/

  async function boot() {
    registerIntake();
    wire();
    render();
    await window.SlopIntake.launch({ to: 'clean' });
  }
  document.addEventListener('DOMContentLoaded', boot);
  CL.app = { addFiles, runClean, render, state: S };
})();
