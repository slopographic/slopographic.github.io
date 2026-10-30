/* Slop Image to 3D for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), loaded on demand
 * by SlopCmd.prepare() (app/main.js). They drive the page's own steps (SlopImg3D.app: openBlob, the option controls and
 * build) and its own writers (exporter.glbBytes, objText, s3d.sceneOf). Files come from Slop Drive or this site and go to
 * Slop Drive through shared/commands/sources.js. The page keeps no undo history, so each command is one step of its own
 * and the checkpoint puts the options back. import_depth_map adds a depth map picture to the open one. Sets SlopImg3D.ai. */
(function () {
  'use strict';
  const ns = window.SlopImg3D, P = ns.app, C = window.SlopCmd;
  const $ = (id) => document.getElementById(id);
  const list = [];
  const add = C.aiAdder('img3d', list);   // shared/commands/commands.js
  const sources = () => C.sources();   // shared/commands/sources.js, loaded once (commands.js)
  const settle = async () => { for (let i = 0; i < 600 && !P.idle(); i++) await new Promise((r) => setTimeout(r, 50)); };
  const OPTS = [['mode', 'select'], ['grid', 'select'], ['scale', 'range'], ['smooth', 'range'], ['size', 'range'], ['invert', 'check'], ['subject', 'check']];
  const values = () => Object.fromEntries(OPTS.map(([id, k]) => [id, k === 'check' ? $(id).checked : $(id).value]));
  function setControls(v) {
    for (const [id, k] of OPTS) if (v[id] != null) { if (k === 'check') $(id).checked = !!v[id]; else $(id).value = String(v[id]); }
    for (const [id, out] of [['scale', 'scaleVal'], ['smooth', 'smoothVal'], ['size', 'sizeVal']]) if ($(out)) $(out).textContent = (+$(id).value).toFixed(id === 'scale' ? 2 : id === 'size' ? 1 : 0);
  }
  function summary() {
    const S = P.state();
    if (!S.img) return 'No picture is open.';
    return `${S.item ? S.item.kind : 'nothing'} from ${S.img.name} (${S.img.W} × ${S.img.H} px)` + (S.prep ? `, a ${S.prep.gw} × ${S.prep.gh} grid, depth from ${S.prep.source === 'model' ? 'the depth model' : S.prep.source === 'map' ? 'the depth map ' + S.depth.name : 'brightness (fallback)'}` : '');
  }
  const GRIDS = [...$('grid').options].map((o) => o.value);

  add('new_from_picture', 'Make 3D from a picture', [{ name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive picture (name or id)' },
    { name: 'url', type: 'string', maxLength: 500, description: 'or a picture on this site' }],
  async (a) => {
    await sources();
    if (!a.file && !a.url) throw new Error('Give file (Slop Drive) or url (a picture on this site)');
    const f = a.file ? await SlopCmdSources.driveFile(a.file) : await SlopCmdSources.siteFile(a.url);
    await P.openBlob(f.blob, f.name);
    await settle();
    if (!P.state().img) throw new Error(`${f.name} was not opened: ${$('status').textContent}`);
    return `Made ${summary()}.`;
  }, { description: 'Open a picture and turn it into a 3D height-field mesh (or points or splats).' });

  add('import_depth_map', 'Use a depth map', [{ name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive depth map picture (name or id)' },
    { name: 'url', type: 'string', maxLength: 500, description: 'or one on this site' }],
  async (a) => {
    if (!P.state().img) throw new Error('Open a picture first (new_from_picture)');
    await sources();
    if (!a.file && !a.url) throw new Error('Give file (Slop Drive) or url (a picture on this site)');
    const f = a.file ? await SlopCmdSources.driveFile(a.file) : await SlopCmdSources.siteFile(a.url);
    await P.useDepthMap(f.blob, f.name);
    await settle();
    return `Now ${summary()}.`;
  }, { description: 'Add a depth map (a grayscale picture, brighter is nearer, e.g. from another depth tool) to the open picture; it is used as the depth in place of the model or brightness until another picture opens.' });

  add('set_options', 'Set the 3D options', [{ name: 'mode', type: 'enum', values: ['mesh', 'points', 'splats'] }, { name: 'grid', type: 'enum', values: GRIDS, description: 'grid cells on the long side' },
    { name: 'scale', type: 'number', min: 0, max: 1, description: 'depth (height of the nearest point)' }, { name: 'smooth', type: 'number', min: 0, max: 8, integer: true },
    { name: 'size', type: 'number', min: 0.3, max: 3, description: 'point and splat size' }, { name: 'invert', type: 'boolean', description: 'far becomes near' },
    { name: 'subject', type: 'boolean', description: 'only the subject (removes the background on this device)' }],
  async (a) => {
    if (!P.state().img) throw new Error('Open a picture first (new_from_picture)');
    setControls(a);
    await P.build();
    await settle();
    return `Now ${summary()}.`;
  });

  add('export_model', 'Export the 3D model', [{ name: 'format', type: 'enum', values: ['glb', 'obj', 's3d'], default: 'glb', description: 's3d opens in Slop 3D' },
    { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' }],
  async (a) => {
    const S = P.state();
    if (!S.item) throw new Error('Nothing to export yet: open a picture first');
    let blob, name = S.img.name;
    if (a.format === 'glb') { blob = new Blob([await ns.exporter.glbBytes(S.item, name, S.img.canvas)], { type: 'model/gltf-binary' }); name += '.glb'; }
    else if (a.format === 'obj') { blob = new Blob([await ns.exporter.objText(P.meshNow(), name)], { type: 'model/obj' }); name += '.obj'; }
    else { blob = new Blob([JSON.stringify(ns.s3d.sceneOf(P.meshNow(), { name, texture: ns.image.jpegUrl(S.img.canvas) }))], { type: 'application/x-slop-3d' }); name += '.s3d'; }
    const out = [];
    if (a.to !== 'download') { await sources(); out.push(`Saved ${name} to Slop Drive (id ${await SlopCmdSources.put(blob, name, 'img3d')})`); }
    if (a.to !== 'drive') { ns.exporter.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ') + '.';
  }, { description: 'Save the model as GLB (with the picture as its texture), OBJ, or a Slop 3D scene, to Slop Drive and/or a download.' });

  ns.ai = { setControls, values };
  C.register(list);
  C.provide({
    state: () => ({ app: 'Slop Image to 3D', open: summary(), options: values() }),
    checkpoint: () => { const v = values(); return () => { setControls(v); if (P.state().img) P.build(); return true; }; },
  });
})();
