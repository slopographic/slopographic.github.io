/* Slop 3D files: open, import, save to Slop Drive, download, OBJ export and PNG render. Everything stays in the
 * browser: files are read with FileReader and written as Blobs, and Slop Drive (SlopHub) is the only store.
 * Opening a .s3d replaces the scene; importing a model (OBJ, STL, PLY, glTF, GLB, 3MF, DAE, FBX, read by the shared 3D I/O
 * module through modelio.js) or an image adds to it. A model can be picked with its companion files (an OBJ's .mtl,
 * a glTF's .bin, textures). Exports: .s3d, OBJ, STL, PLY, GLB, glTF, USDZ and PNG. Sets window.Slop3D.files. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const M = S.model, A = S.actions, st = S.state, s = st.s;
  const MODELS = ['obj', 'stl', 'ply', 'gltf', 'glb', '3mf', 'dae', 'fbx'];   // the formats modelio.js reads
  const ACCEPT_UI = '.s3d,.json,' + MODELS.map((e) => '.' + e).join(',') + ',.mtl,.bin,.tga,.ktx2,image/*,model/*';
  const ACCEPT_DRIVE = ['application/x-slop-3d', 'model/*', 'image/*', 'text/plain', 'application/octet-stream', 'application/json', 'application/xml', 'application/x-ply'];
  const MAX_IMAGE = 8 * 1024 * 1024;
  const toast = (msg) => { if (window.SlopUI) SlopUI.toast(msg); };
  const t = S.t;
  const hub = () => window.SlopHub || null;
  const guard = () => { if (window.SlopGuard) SlopGuard.setUnsaved('3d', s.file.dirty); };
  const baseName = (n) => (String(n || 'Untitled').replace(/\.[^.]+$/, '') || 'Untitled');
  const extOf = (n) => (String(n || '').split('.').pop() || '').toLowerCase();

  function confirmDiscard() {
    return s.file.dirty && s.doc.roots.length
      ? SlopUI.confirm(t('3d.file.discard_title'), t('3d.file.discard_body'), t('3d.file.continue'), { danger: true })
      : Promise.resolve(true);
  }
  /** Replaces the whole document (new scene or opened file). */
  function replaceScene(doc, file) {
    s.doc = doc;
    s.sel = [];
    s.history.reset(doc);
    s.file = Object.assign({ name: 'Untitled', driveId: null, folderId: null, dirty: false }, file); // i18n-ignore: the scene's own name (file name)
    st.emit('doc', null);
    st.emit('sel');
    st.emit('file');
    guard();
  }
  async function newScene() {
    if (!(await confirmDiscard())) return;
    replaceScene(M.defaultScene('Untitled'), {});
  }

  /** Reads a File or a Drive record's blob: text for .s3d, a data URL for images (models are read by modelio.js). */
  const readText = (blob) => blob.text();
  const readDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error(t('3d.file.err_read_image'))); r.readAsDataURL(blob); });

  /** Imports an image as a standing plane textured with the picture (the picture is stored inside the file). */
  async function imageTree(blob, name) {
    if (blob.size > MAX_IMAGE) throw new Error(t('3d.file.err_image_big'));
    const url = await readDataUrl(blob);
    const dims = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res([im.naturalWidth || 1, im.naturalHeight || 1]); im.onerror = () => rej(new Error(t('3d.file.err_image_bad'))); im.src = url; });
    const aspect = dims[0] / dims[1], w = Math.min(4, Math.max(0.2, aspect));
    return { type: 'mesh', name, transform: { r: [90, 0, 0] }, geom: { kind: 'plane', width: w, depth: 1 },
      material: { color: '#ffffff', roughness: 0.9, metallic: 0, opacity: 1, map: url } };
  }
  /** Turns any supported blob into an import tree (with warnings). others: the files that came with it. Throws for
   *  unknown or broken files. */
  async function treeFor(blob, name, others = []) {
    const ext = extOf(name), base = baseName(name);
    if (MODELS.includes(ext)) return S.modelio.treeFor([{ name, blob }, ...others.map((f) => ({ name: f.name, blob: f }))], base);
    if (blob.type.startsWith('image/') || /^(png|jpe?g|gif|webp|bmp)$/.test(ext)) return { tree: await imageTree(blob, base), warnings: [] };
    throw new Error(t('3d.file.err_kind'));
  }

  /** Opens a file: a .s3d replaces the scene, a model or image goes into a new scene. */
  async function openBlob(blob, name, extra = {}) {
    const ext = extOf(name);
    try {
      if (ext === 's3d' || ext === 'json' || blob.type === S.format.MIME) {
        const r = S.format.parse(await readText(blob));
        if (!r.ok) { SlopUI.alert(t('3d.file.open_failed'), t('3d.file.not_scene', { errors: r.errors.join('\n') })); return false; }
        replaceScene(r.scene, { name: baseName(name), driveId: extra.driveId || null, folderId: extra.folderId ?? null, dirty: false });
        return true;
      }
      const { tree, warnings } = await treeFor(blob, name, extra.with || []);
      replaceScene(M.defaultScene(baseName(name)), { name: baseName(name), dirty: true });
      A.importTree(tree);
      if (warnings.length) toast(warnings[0]);
      return true;
    } catch (e) { SlopUI.alert(t('3d.file.open_failed'), e.message || String(e)); return false; }
  }
  /** Adds a model or image to the current scene (File > Import). */
  async function importBlob(blob, name, others = []) {
    try {
      const { tree, warnings } = await treeFor(blob, name, others);
      A.importTree(tree);
      toast(warnings.length ? warnings[0] : t('3d.file.imported', { name: baseName(name) }));
      return true;
    } catch (e) { SlopUI.alert(t('3d.file.import_failed'), e.message || String(e)); return false; }
  }
  /** The file to open among several picked: a scene or a model first; the others are its companions. */
  const mainOf = (list) => list.find((f) => ['s3d', 'json', ...MODELS].includes(extOf(f.name))) || list[0];
  /* The one way in (shared/intake, spec '3d', the whole batch: a model and its companions): File ▸ Open and Open from Slop
     Drive (mode 'open': replaces the scene, after asking when it has changes; a Drive scene stays linked), ?drive=<id> and
     a PWA launch (open), File ▸ Import, a drop on the view and a paste (they add to the scene). */
  async function read(files, ctx) {
    const f = mainOf(files), others = files.filter((x) => x !== f), rec = ctx.drive && ctx.drive.record;
    const ok = ctx.mode === 'open'
      ? await openBlob(f, f.name, Object.assign({ with: others }, rec ? { driveId: rec.id, folderId: rec.folderId } : {}))
      : await importBlob(f, f.name, others);
    if (!ok) throw new Error('could not be opened');
    return files.map((x) => x.name);
  }
  window.SlopIntake.register({
    id: '3d', accept: { any: true, noun: '3d.file.noun' }, driveAccept: ACCEPT_DRIVE, processAll: read,
    gate: async (batch) => batch.mode !== 'open' || confirmDiscard(),
  });
  const pick = (mode) => window.SlopIntake.pick({ to: '3d', mode, accept: ACCEPT_UI });
  const openDialog = () => pick('open'), importDialog = () => pick('import');
  const openFromDrive = () => window.SlopIntake.fromDrive({ to: '3d', mode: 'open' });
  /** What the page was opened with (?drive=<id>, a PWA launch). The drop target is the viewport. */
  async function launch() {
    const view = document.getElementById('view');
    if (view) window.SlopIntake.dropTarget(view, { to: '3d', mode: () => 'import' });
    await window.SlopIntake.launch({ to: '3d', mode: 'open' });
  }

  const sceneName = () => s.file.name || 'Untitled';
  function sceneBlob() { return new Blob([S.format.serialize(s.doc)], { type: S.format.MIME }); }
  function download(blob, name) { if (window.SlopUI) SlopUI.download(blob, name); }
  /** Saves to Slop Drive: updates the linked record, or asks for a folder the first time. */
  async function save() {
    const h = hub(), blob = sceneBlob(), name = sceneName() + '.s3d';
    if (!h) { download(blob, name); return; }
    try {
      if (s.file.driveId && (await h.get(s.file.driveId))) await h.update(s.file.driveId, { blob, name, type: S.format.MIME });
      else { const id = await h.saveToDrive(blob, name, { from: '3d' }); if (!id) return; s.file.driveId = id; }
      s.file.dirty = false;
      st.emit('file');
      guard();
      toast(t('3d.file.saved'));
    } catch (e) { toast(t('3d.file.save_failed', { error: String(e.message || e) })); }
  }
  function downloadScene() { download(sceneBlob(), sceneName() + '.s3d'); s.file.dirty = false; st.emit('file'); guard(); }
  /** Exports the visible meshes as obj, stl, ply, glb, gltf or usdz. Several files (an OBJ with its .mtl and textures)
   *  download as one zip. Resolves with the files (tests read them). */
  async function exportModel(format) {
    if (!s.doc.roots.length) { toast(t('3d.file.nothing_export')); return null; }
    try {
      const { files, notes } = await S.modelio.exportFiles(s.doc, format, sceneName());
      if (files.length === 1) download(files[0].blob, files[0].name);
      else {
        const { writeZip } = await import(new URL('../shared/office/zip.js', location.href).href);
        download(await writeZip(files.map((f) => ({ path: f.name, data: f.blob }))), `${sceneName()}-${format}.zip`);
      }
      toast(notes[0] || (files.length > 1 ? t('3d.file.zip_note', { format: format.toUpperCase(), n: files.length - 1 }) : t('3d.file.exported', { format: format.toUpperCase() })));
      return files;
    } catch (e) { toast(e.message || String(e)); return null; }
  }
  const exportObj = () => exportModel('obj');
  let stageRef = null;
  /** Renders the viewport to PNG at 1× or 2× the on-screen size. */
  async function exportPng(scale) {
    if (!stageRef) return;
    try { download(await stageRef.capture(scale), `${sceneName()}-${scale}x.png`); toast(t('3d.file.picture_saved')); }
    catch (e) { toast(e.message || t('3d.file.render_failed')); }
  }

  S.files = { newScene, openDialog, importDialog, openFromDrive, launch, save, downloadScene, exportObj, exportModel, exportPng, MODELS,
    bindStage(stage) { stageRef = stage; }, openBlob, importBlob, replaceScene, sceneBlob, ACCEPT_UI, confirmDiscard };
})();
