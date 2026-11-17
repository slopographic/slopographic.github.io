/* Slop 3D boot: loads three.js from vendor/, builds the stage, camera, gizmo, objects, viewport, panels and
 * commands, wires the toolbar, and opens ?drive=<id> when this page was launched from Slop Drive.
 * Without WebGL the page says so and stays usable for file work. Exposes window.Slop3D.app (used by the tests). */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const st = S.state, s = st.s;
  const $ = (id) => document.getElementById(id);
  const t = S.t;

  function showNoGL(msg) {
    const box = $('nogl');
    box.textContent = msg;
    box.hidden = false;
    $('hint').hidden = true;
  }
  function wireToolbar() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-cmd]');
      if (b && !b.disabled && window.SlopCmd) { e.preventDefault(); SlopCmd.run(b.dataset.cmd); }
    });
    const snap = $('snap');
    for (const step of S.snap.STEPS) snap.append(new Option(step ? String(step) : t('3d.app.snap_off'), String(step)));
    S.onLang(() => { if (snap.options[0] && snap.options[0].value === '0') snap.options[0].text = t('3d.app.snap_off'); });
    snap.addEventListener('change', () => S.actions.setSnap(snap.value));
  }
  function statusLine(cam) {
    const meshes = Object.values(s.doc.nodes).filter((n) => n.type === 'mesh').length;
    const picked = st.primary() && s.doc.nodes[st.primary()];
    const name = picked ? t('3d.status.picked', { name: picked.name, type: S.typeLabel(picked) }) : t('3d.status.nothing');
    const VIEW = { front: '3d.status.front', top: '3d.status.top', side: '3d.status.side', perspective: '3d.status.perspective' };
    const view = cam && cam.st.view ? (VIEW[cam.st.view] ? t(VIEW[cam.st.view]) : cam.st.view) : t('3d.status.free');
    const parts = [t('3d.status.objects', { n: meshes })];
    if (s.sel.length > 1) parts.push(t('3d.status.selected', { n: s.sel.length }));
    parts.push(name, t('3d.status.view', { view }));
    if (s.snapStep > 0) parts.push(t('3d.status.snap', { step: String(s.snapStep) }));
    if (S.edit.active()) {
      const m = S.edit.mode(), n = S.edit.sel().ids.size;
      parts.push(t({ vertex: '3d.status.edit_vertex', edge: '3d.status.edit_edge', face: '3d.status.edit_face' }[m]),
        t({ vertex: '3d.status.sel_vertex', edge: '3d.status.sel_edge', face: '3d.status.sel_face' }[m], { n }));
      if (S.edit.info()) parts.push(S.edit.info());
    }
    $('status').textContent = parts.join(' · ');
  }
  /** Toolbar state for mesh edit mode: the Edit button's pressed state and the mode and Mesh buttons. */
  function editToolbar() {
    const on = S.edit.active();
    $('btnEdit').setAttribute('aria-pressed', String(on));
    $('editModes').hidden = !on;
    $('btnMesh').hidden = !on;
    for (const b of document.querySelectorAll('#editModes [data-cmd]')) b.setAttribute('aria-pressed', String(b.dataset.cmd === '3d.mesh.' + S.edit.mode()));
  }
  function setTitle() {
    const name = s.file.name || 'Untitled';
    $('docName').textContent = name + (s.file.dirty ? ' •' : '');
    document.title = (s.file.dirty ? '• ' : '') + name + ' — Slop 3D';
  }

  async function boot() {
    const canvas = $('view');
    wireToolbar();
    const rename = (id) => {
      const n = s.doc.nodes[id];
      if (!n || !window.SlopUI) return;
      SlopUI.prompt(t('ui.rename'), t('3d.insp.name'), n.name).then((v) => { if (v && v.trim()) S.actions.setField(id, 'name', v.trim()); });
    };
    S.outliner.create($('outliner'), { rename });
    S.inspector.create($('inspector'));
    S.onLang(() => st.emit('lang'));   // the outliner and the inspector in the new words
    st.on('file', setTitle);
    st.on('doc', setTitle);
    st.on('sel', setTitle);
    if (!S.stage.hasWebGL()) showNoGL(t('3d.app.no_webgl'));
    let THREE = null, stage = null;
    try {
      if (S.stage.hasWebGL()) { THREE = await S.stage.loadThree(); stage = S.stage.create(canvas, THREE); }
    } catch (e) { showNoGL(t('3d.app.no_start', { error: String(e.message || e) })); stage = null; }
    if (!stage) {
      S.onLang(() => statusLine(null));
      st.on('doc', () => statusLine(null));
      st.on('sel', () => statusLine(null));
      statusLine(null);
      await S.files.launch();
      document.body.dataset.ready = '1';
      return;
    }
    const cam = S.camera.create(THREE, stage);
    const gizmo = S.gizmo.create(THREE, stage.overlay);
    const objects = S.objects.create(THREE, stage.world, () => stage.request());
    const editview = S.editview.create(THREE);
    const view = S.viewport.create({ canvas, stage, cam, gizmo, objects, menus: S.menus });
    S.files.bindStage(stage);
    const applyView = () => {
      for (const it of objects.items.values()) if (it.mesh) it.mesh.material.wireframe = s.view.wire;
      stage.setGrid(s.view.grid);
      stage.setAxes(s.view.axes);
      stage.setBackground(s.doc.background || '#1d1e22');
      $('btnWire').setAttribute('aria-pressed', String(s.view.wire));
      $('btnGrid').setAttribute('aria-pressed', String(s.view.grid));
      stage.request();
    };
    const ui = { applyView, rename, frame: (ids) => view.frame(ids), setView: (name) => { cam.setView(name); view.redraw(); } };
    let cmds = S.commands.list(ui);
    if (window.SlopCmd) { SlopCmd.init({ app: '3d' }); SlopCmd.register(cmds); if (SlopCmd.provide) SlopCmd.provide({ prepare: aiPrepare }); }
    // a language change: the palette titles, the status bar and the panels in the new words
    S.onLang(() => {
      cmds = S.commands.list(ui);
      if (window.SlopCmd) SlopCmd.register(cmds);
      if (S.app) S.app.commands = cmds;
      statusLine(cam);
    });
    const sync = () => {
      objects.sync(s.doc, { selected: s.sel });
      applyView();
      statusLine(cam);
    };
    st.on('doc', sync);
    st.on('sel', sync);
    st.on('snap', () => statusLine(cam));
    const syncEdit = () => {
      if (!S.edit.active()) editview.clear();
      else { const it = objects.items.get(S.edit.node().id); editview.sync(it && it.obj, S.edit.mesh(), S.edit.sel()); }
      editToolbar();
      statusLine(cam);
      stage.request();
    };
    st.on('doc', syncEdit);
    st.on('sel', syncEdit);
    st.on('edit', syncEdit);
    new ResizeObserver(() => { stage.resize(); stage.request(); }).observe(canvas);
    S.app = { THREE, stage, cam, gizmo, objects, view, ui, commands: cmds, editview };
    S.configio.registerStub();
    cam.apply();
    sync();
    view.redraw();
    await S.files.launch();
    view.frame([]);
    document.body.dataset.ready = '1';
  }

  /** The assistant's commands with arguments (ai-io.js, ai-commands.js), loaded when the AI panel first asks. */
  function aiPrepare() {
    if (S.ai && S.ai.ready) return Promise.resolve();
    const one = (f) => new Promise((res, rej) => { const el = Object.assign(document.createElement('script'), { src: new URL('js/app/' + f, location.href).href, async: false }); el.onload = res; el.onerror = () => rej(new Error('Could not load ' + f)); document.head.append(el); });
    return one('ai-io.js').then(() => one('ai-commands.js')).then(() => { S.ai.ready = true; });
  }

  boot().catch((e) => { console.error(e); showNoGL(t('3d.app.app_no_start', { error: String(e.message || e) })); });
})();
