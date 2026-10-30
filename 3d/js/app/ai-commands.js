/* Slop 3D for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (app/main.js). Every scene change is one actions.commit (one undo step); scenes are built with the
 * model's own pieces (core/model.js presetSpec, defaultScene; core/ops.js importTree, setField) and exported with the
 * File menu's own writers (modelio.exportFiles, files.sceneBlob, the stage's capture). new_scene and build_scene replace
 * the open scene, and delete_object removes one: those three are destructive. Sets window.Slop3D.ai. */
(function () {
  'use strict';
  const S = window.Slop3D, M = S.model, O = S.ops, A = S.actions, st = S.state, s = st.s, F = S.files, C = window.SlopCmd;
  const SHAPES = Object.keys(M.PRESETS), V3 = { type: 'array', items: { type: 'number' }, maxItems: 3 };
  const vec = (name, description) => Object.assign({ name, description }, V3, { type: 'array' });
  const COL = (name, description) => ({ name, type: 'color', description });
  const N = (name, min, max, description, extra) => Object.assign({ name, type: 'number', min, max, description }, extra);
  const OBJ = { name: 'object', type: 'string', maxLength: 120, description: 'object name or id from app_state; the selected one when empty' };
  const OBJECT_ITEM = { type: 'object', properties: { kind: { type: 'string', enum: SHAPES.concat(['directional', 'ambient', 'group']) }, name: { type: 'string' },
    position: V3, rotation: V3, scale: V3, color: { type: 'string' }, roughness: { type: 'number' }, metallic: { type: 'number' }, opacity: { type: 'number' }, params: { type: 'object' } } };
  const list = [];
  const add = C.aiAdder('3d', list);   // shared/commands/commands.js

  const v3 = (v, name) => {
    let a = [].concat(v);
    if (a.length === 1 && typeof a[0] === 'string') a = a[0].split(/[\s,]+/).filter(Boolean);
    a = a.map(Number);
    if (a.length !== 3 || !a.every(Number.isFinite)) throw new Error(`${name} must be three numbers [x, y, z]`);
    return a;
  };
  function find(q) {
    const nodes = Object.values(s.doc.nodes);
    const n = q ? (s.doc.nodes[q] || nodes.find((x) => x.name.toLowerCase() === String(q).toLowerCase())) : s.doc.nodes[st.primary()];
    if (!n) throw new Error(q ? `No object “${q}” (names: ${nodes.map((x) => x.name).join(', ')})` : 'Nothing is selected: give object');
    return n;
  }
  /** An import tree (ops.importTree) from a plain object spec. */
  function treeOf(o) {
    const kind = o.kind || 'cube', spec = M.presetSpec(kind);
    if (!spec) throw new Error(`Unknown kind “${kind}”: ${SHAPES.join(', ')}, directional, ambient or group`);
    const t = JSON.parse(JSON.stringify(spec));
    if (o.name) t.name = String(o.name).slice(0, 80);
    t.transform = { p: o.position ? v3(o.position, 'position') : (t.transform && t.transform.p) || [0, 0, 0], r: o.rotation ? v3(o.rotation, 'rotation') : [0, 0, 0],
      s: o.scale != null ? (typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : v3(o.scale, 'scale')) : [1, 1, 1] };
    if (t.type === 'mesh') {
      t.geom = S.geometry.normalize(Object.assign({}, t.geom, o.params || {}, { kind }));
      const m = {};
      if (o.color) m.color = window.SlopCmdArgs.toColor(o.color) || o.color;
      for (const k of ['roughness', 'metallic', 'opacity']) if (o[k] != null) m[k] = Math.max(0, Math.min(1, +o[k]));
      t.material = M.material(m);
    }
    if (t.type === 'light' && o.color) t.light.color = window.SlopCmdArgs.toColor(o.color) || t.light.color;
    return t;
  }
  const where = (n) => `${n.name} (id ${n.id}) at ${n.transform.p.map((x) => +x.toFixed(3)).join(', ')}`;

  add('new_scene', 'New scene', [{ name: 'name', type: 'string', maxLength: 120, default: 'Untitled' }], (a) => {
    F.replaceScene(M.defaultScene(a.name), { name: a.name, dirty: true });
    return `Started the new scene “${a.name}” (a sun and an ambient light).`;
  }, { destructive: true, description: 'Start a new, empty scene (replaces the open one).' }); // i18n-ignore: the assistant's tool text (API)

  add('build_scene', 'Build a scene', [{ name: 'name', type: 'string', maxLength: 120, default: 'Untitled' },
    { name: 'objects', type: 'array', required: true, maxItems: 200, items: OBJECT_ITEM, description: '[{ kind, name, position [x,y,z], rotation [deg], scale, color, roughness, metallic, opacity, params }]' },
    COL('background', 'background colour')],
  (a) => {
    F.replaceScene(M.defaultScene(a.name), { name: a.name, dirty: true });
    const ids = A.addTrees(a.objects.map(treeOf));
    if (a.background) A.commit(Object.assign(M.clone(s.doc), { background: a.background }));
    return `Built “${a.name}” with ${ids.length} object${ids.length === 1 ? '' : 's'}: ${ids.map((id) => s.doc.nodes[id].name).join(', ')}.`;
  }, { destructive: true, description: 'Make a whole scene in one step from a list of objects (replaces the open one).' }); // i18n-ignore: the assistant's tool text (API)

  add('add_object', 'Add an object', [{ name: 'kind', type: 'enum', values: SHAPES.concat(['directional', 'ambient', 'group']), default: 'cube' }, { name: 'name', type: 'string', maxLength: 80 },
    vec('position', '[x, y, z]; y is up'), vec('rotation', 'degrees [x, y, z]'), N('scale', 0.001, 1000, 'uniform scale'), COL('color', 'surface or light colour'),
    N('roughness', 0, 1), N('metallic', 0, 1), N('opacity', 0, 1), { name: 'params', type: 'object', description: 'shape sizes, e.g. { "radius": 1 } or { "size": 2 }' }],
  (a) => { const id = A.importTree(treeOf(a)); return `Added ${where(s.doc.nodes[id])}.`; },
  { description: 'Add a cube, sphere, cylinder, cone, torus, plane, blob, light or group with its place and material.' }); // i18n-ignore: the assistant's tool text (API)

  add('add_model', 'Add a model', [{ name: 'file', type: 'string', maxLength: 300, description: 'a Slop Drive file (OBJ, STL, PLY, glTF, GLB, 3MF, DAE, FBX, or a picture)' }, // i18n-ignore: the assistant's tool text (API)
    { name: 'url', type: 'string', maxLength: 500, description: 'or a file on this site' }], // i18n-ignore: the assistant's tool text (API)
  async (a) => {
    await S.ai.sources();
    if (!a.file && !a.url) throw new Error('Give file (Slop Drive) or url (this site)');
    const f = a.file ? await SlopCmdSources.driveFile(a.file) : await SlopCmdSources.siteFile(a.url);
    const n0 = Object.keys(s.doc.nodes).length;
    if (!(await F.importBlob(f.blob, f.name))) throw new Error(`${f.name} could not be imported`);
    return `Imported ${f.name} (${Object.keys(s.doc.nodes).length - n0} objects): ${where(s.doc.nodes[st.primary()])}.`;
  }, { description: 'Import a 3D model or a picture from Slop Drive into the scene.' }); // i18n-ignore: the assistant's tool text (API)

  /** Several field changes on one node as one undo step. */
  function setFields(n, pairs, label) {
    let d = s.doc;
    for (const [path, v] of pairs) d = O.setField(d, n.id, path, v) || d;
    if (!pairs.length) throw new Error('Nothing to change');
    A.commit(d);
    return `${label} ${where(s.doc.nodes[n.id])}.`;
  }
  add('set_transform', 'Move, turn or scale', [OBJ, vec('position', '[x, y, z]'), vec('rotation', 'degrees [x, y, z]'), vec('scale', '[x, y, z]'), N('uniform_scale', 0.001, 1000, 'the same scale on every axis')],
    (a) => {
      const n = find(a.object), p = [];
      if (a.position) p.push(['transform.p', v3(a.position, 'position')]);
      if (a.rotation) p.push(['transform.r', v3(a.rotation, 'rotation')]);
      if (a.scale) p.push(['transform.s', v3(a.scale, 'scale')]);
      if (a.uniform_scale) p.push(['transform.s', [a.uniform_scale, a.uniform_scale, a.uniform_scale]]);
      return setFields(n, p, 'Moved');
    });
  add('set_material', 'Set material', [OBJ, COL('color', 'surface colour'), N('roughness', 0, 1), N('metallic', 0, 1), N('opacity', 0, 1)], (a) => {
    const n = find(a.object);
    if (n.type !== 'mesh') throw new Error(`${n.name} is not a shape`);
    return setFields(n, ['color', 'roughness', 'metallic', 'opacity'].filter((k) => a[k] != null).map((k) => ['material.' + k, a[k]]), 'Changed the material of');
  });
  add('set_light', 'Set light', [OBJ, COL('color', 'light colour'), N('intensity', 0, 20), { name: 'kind', type: 'enum', values: M.LIGHT_KINDS }], (a) => {
    const n = find(a.object);
    if (n.type !== 'light') throw new Error(`${n.name} is not a light`);
    return setFields(n, ['color', 'intensity', 'kind'].filter((k) => a[k] != null).map((k) => ['light.' + k, a[k]]), 'Changed the light');
  });
  add('set_shape', 'Set shape sizes', [OBJ, { name: 'params', type: 'object', required: true, description: 'e.g. { "radius": 1, "segments": 48 }' }], (a) => {
    const n = find(a.object);
    if (n.type !== 'mesh' || n.geom.kind === 'mesh') throw new Error(`${n.name} has no shape sizes`);
    return setFields(n, [['geom', S.geometry.normalize(Object.assign({}, n.geom, a.params, { kind: n.geom.kind }))]], 'Resized');
  });
  add('set_background', 'Set background', [COL('color', 'background colour')], (a) => { A.commit(Object.assign(M.clone(s.doc), { background: a.color })); return `The background is ${a.color}.`; });
  add('rename_object', 'Rename object', [OBJ, { name: 'name', type: 'string', required: true, maxLength: 80 }], (a) => setFields(find(a.object), [['name', a.name]], 'Renamed'));
  add('set_view', 'Set camera view', [{ name: 'view', type: 'enum', values: ['perspective', 'front', 'top', 'side'], default: 'perspective' }, { name: 'frame', type: 'boolean', default: true, description: 'fit everything in view' }], // i18n-ignore: the assistant's tool text (API)
    (a) => { S.app.ui.setView(a.view); if (a.frame) S.app.ui.frame([]); return `The camera shows the ${a.view} view.`; });
  add('delete_object', 'Delete object', [OBJ], (a) => { const n = find(a.object); A.remove([n.id]); return `Deleted ${n.name}.`; }, { destructive: true });
  add('undo', 'Undo', [N('steps', 1, 20, 'how many', { integer: true, default: 1 })], (a) => { let k = 0; while (k < a.steps && A.undo()) k++; return `Undid ${k} step${k === 1 ? '' : 's'}.`; });
  S.ai.exportCommand(add);

  C.register(list);
  C.provide({ state: S.ai.state, checkpoint: S.ai.checkpoint });
})();
