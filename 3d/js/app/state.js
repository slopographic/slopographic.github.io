/* Slop 3D app state: the document, the selection, the undo history, the file and the view flags.
 * A tiny event hub (on / emit) lets the panels redraw. Sets window.Slop3D.state. */
(function () {
  'use strict';
  const S = (window.Slop3D = window.Slop3D || {});
  const listeners = {};
  const history = S.history.createHistory({ limit: 300 });
  const s = {
    doc: S.model.defaultScene('Untitled'),
    sel: [],
    history,
    file: { name: 'Untitled', driveId: null, folderId: null, dirty: false }, // i18n-ignore: the scene's own name (file name)
    snapStep: 0,
    view: { wire: false, grid: true, axes: true },
  };
  history.reset(s.doc);

  function on(evt, fn) {
    (listeners[evt] = listeners[evt] || []).push(fn);
    return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); };
  }
  function emit(evt, arg) { for (const fn of listeners[evt] || []) fn(arg); }
  /** Selects ids (existing nodes only). The last id is the primary one (the inspector shows it). */
  function select(ids) {
    s.sel = [...new Set(ids)].filter((id) => s.doc.nodes[id]);
    emit('sel');
  }
  const primary = () => (s.sel.length ? s.sel[s.sel.length - 1] : null);

  /* The words (3d/i18n, shared/i18n/i18n.js): t(key, vars) reads the chosen language; onLang(fn) re-runs fn after a
     language change, once its tables are in (for UI built once). typeLabel(n): the object kind in the chosen language. */
  const t = (key, vars) => (window.SlopI18n ? SlopI18n.t(key, vars) : key);
  const onLang = (fn) => (window.SlopI18n && SlopI18n.on ? SlopI18n.on(fn) : () => {});
  const KINDS = { cube: '3d.type.cube', sphere: '3d.type.sphere', cylinder: '3d.type.cylinder', cone: '3d.type.cone', torus: '3d.type.torus', plane: '3d.type.plane', blob: '3d.type.blob' };
  function typeLabel(n) {
    if (!n) return '';
    if (n.type === 'light') return n.light.kind === 'ambient' ? t('3d.type.ambient') : t('3d.type.directional');
    if (n.type === 'group') return t('3d.type.group');
    if (n.geom.kind === 'mesh') return t('3d.type.mesh');
    return KINDS[n.geom.kind] ? t(KINDS[n.geom.kind]) : S.model.typeLabel(n);
  }
  S.t = t;
  S.onLang = onLang;
  S.typeLabel = typeLabel;

  S.state = { s, on, emit, select, primary };
})();
