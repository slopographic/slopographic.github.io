/* Slop 3D for the assistant: export_scene (the File menu's own writers: .s3d, OBJ, STL, PLY, GLB, glTF, USDZ through
 * modelio.exportFiles, a PNG through the stage's capture) to Slop Drive and/or a download, files from Slop Drive
 * (shared/commands/sources.js, loaded on demand), the state summary and the checkpoint for "Undo all AI changes".
 * Loaded before ai-commands.js. Sets window.Slop3D.ai. */
(function () {
  'use strict';
  const S = window.Slop3D, M = S.model, A = S.actions, st = S.state, s = st.s, F = S.files;
  const HERE = (document.currentScript && document.currentScript.src) || location.href;
  const AI = (S.ai = {});
  AI.sources = () => window.SlopCmd.sources();   // shared/commands/sources.js, loaded once (commands.js)

  /** The scene as one file: { blob, name }. Several files (an OBJ with its .mtl and textures) come as one zip. */
  AI.fileOf = async function (format, scale = 1) {
    const name = s.file.name || 'Untitled';
    if (format === 's3d') return { blob: F.sceneBlob(), name: name + '.s3d' };
    if (format === 'png') {
      if (!S.app || !S.app.stage) throw new Error('The viewport is not ready');
      return { blob: await S.app.stage.capture(scale), name: `${name}.png` };
    }
    if (!s.doc.roots.length) throw new Error('The scene is empty');
    const { files } = await S.modelio.exportFiles(s.doc, format, name);
    if (files.length === 1) return files[0];
    const { writeZip } = await import(new URL('../../../shared/office/zip.js', HERE).href);
    return { blob: await writeZip(files.map((f) => ({ path: f.name, data: f.blob }))), name: `${name}-${format}.zip` };
  };
  AI.exportCommand = function (add) {
    add('export_scene', 'Export the scene', [{ name: 'format', type: 'enum', values: ['glb', 'gltf', 'obj', 'stl', 'ply', 'usdz', 's3d', 'png'], default: 'glb' },
      { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }, { name: 'scale', type: 'number', min: 1, max: 4, default: 1, integer: true, description: 'PNG: times the viewport size' }], // i18n-ignore: the assistant's tool text (API)
    async (a) => {
      const f = await AI.fileOf(a.format, a.scale), out = [];
      if (a.to !== 'download') { await AI.sources(); out.push(`Saved ${f.name} to Slop Drive (id ${await SlopCmdSources.put(f.blob, f.name, '3d')})`); }
      if (a.to !== 'drive' && window.SlopUI) { SlopUI.download(f.blob, f.name); out.push(`downloaded ${f.name}`); }
      return out.join(' and ') + '.';
    }, { description: 'Save the scene as GLB, glTF, OBJ, STL, PLY, USDZ, .s3d or a PNG picture, to Slop Drive and/or a download.' }); // i18n-ignore: the assistant's tool text (API)
  };

  AI.state = function () {
    const nodes = Object.values(s.doc.nodes).slice(0, 80).map((n) => ({ id: n.id, name: n.name, type: n.type, kind: n.type === 'mesh' ? n.geom.kind : n.type === 'light' ? n.light.kind : 'group',
      position: n.transform.p, rotation: n.transform.r, scale: n.transform.s, color: n.material ? n.material.color : n.light ? n.light.color : undefined, visible: n.visible, parent: n.parent }));
    return { app: 'Slop 3D', scene: s.file.name || 'Untitled', unsaved: !!s.file.dirty, background: s.doc.background, objects: nodes, selected: s.sel.slice(), up: 'y', units: 'metres' };
  };
  /** The scene as it is now; the rollback puts it back as one more undo step. */
  AI.checkpoint = function () {
    const snap = M.clone(s.doc), file = Object.assign({}, s.file);
    return () => {
      if (JSON.stringify(s.doc) === JSON.stringify(snap)) return true;
      if (snap.roots.join() !== s.doc.roots.join() && file.name !== s.file.name) F.replaceScene(snap, file);
      else A.commit(snap);
      return true;
    };
  };
})();
