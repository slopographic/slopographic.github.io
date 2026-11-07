/* SlopVector — core: undo history, autosave, document load, selection */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function getObj() { return $.getObj.apply(this, arguments); }
  function layerOf() { return $.layerOf.apply(this, arguments); }
  function leaves() { return $.leaves.apply(this, arguments); }
  function localSubs() { return $.localSubs.apply(this, arguments); }
  function lsDel() { return $.lsDel.apply(this, arguments); }
  function lsGet() { return $.lsGet.apply(this, arguments); }
  function lsSet() { return $.lsSet.apply(this, arguments); }
  var S = $.S;
  var mk = $.mk;

  /* ================= history ================= */
  function snapshot() {
    return JSON.stringify({ doc: S.doc, sel: S.sel, layer: S.activeLayer }, function (k, v) { return k === 'assets' ? undefined : v; });
  }
  SV.snapshot = snapshot;
  SV.commit = function (label) {
    var snap = snapshot();
    if (S.history[S.hIdx] === snap) { SV.requestRender(true); return false; }
    var now = Date.now();
    if (label && label === S.lastLabel && label === 'nudge' && now - S.lastTime < 900 && S.hIdx > 0 && S.hIdx !== S.savedIdx) {
      S.history[S.hIdx] = snap;
    } else {
      S.history.length = S.hIdx + 1;
      S.history.push(snap);
      if (S.history.length > 200) { S.history.shift(); S.savedIdx--; }
      S.hIdx = S.history.length - 1;
    }
    S.lastLabel = label || ''; S.lastTime = now;
    SV.scheduleAutosave();
    SV.requestRender(true);
    return true;
  };
  function restore(snap) {
    var o = JSON.parse(snap), assets = S.doc.assets || {};
    S.doc = o.doc; S.doc.assets = assets;
    S.sel = (o.sel || []).filter(function (id) { return !!getObj(id); });
    S.psel = {};
    S.activeLayer = o.layer;
    S.pen = null; S.op = null; S.hover = null;
    SV.clearTextCache();
    SV.requestRender(true);
  }
  SV.undo = function () {
    if (S.editing) return;
    if (S.pen) SV.finishPen();
    if (S.hIdx <= 0) return SV.toast(SV.t('ui.undo.nothing'));
    S.hIdx--; restore(S.history[S.hIdx]); SV.scheduleAutosave();
  };
  SV.redo = function () {
    if (S.editing) return;
    if (S.hIdx >= S.history.length - 1) return SV.toast(SV.t('vector.msg.nothing_redo'));
    S.hIdx++; restore(S.history[S.hIdx]); SV.scheduleAutosave();
  };
  SV.revert = function () { if (S.hIdx >= 0) restore(S.history[S.hIdx]); };
  SV.resetHistory = function () { S.history = [snapshot()]; S.hIdx = 0; S.savedIdx = 0; };
  SV.isDirty = function () { return S.hIdx !== S.savedIdx; };
  SV.markSaved = function () { S.savedIdx = S.hIdx; SV.requestRender(true); };

  /* ================= autosave ================= */
  var AUTOSAVE_KEY = 'slopvector.autosave.v1', autosaveTimer = null, quotaWarned = false;
  SV.scheduleAutosave = function () {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(SV.autosaveNow, 700);
  };
  SV.autosaveNow = function () {
    var payload;
    try { payload = JSON.stringify({ savedAt: Date.now(), doc: S.doc, fileName: S.fileName }); } catch (e) { return; }
    var r = lsSet(AUTOSAVE_KEY, payload);
    if (r !== true) {
      // retry without raster assets
      var lite;
      try { lite = JSON.stringify({ savedAt: Date.now(), doc: Object.assign({}, S.doc, { assets: {} }), fileName: S.fileName, lite: true }); } catch (e2) { return; }
      var r2 = lsSet(AUTOSAVE_KEY, lite);
      if (!quotaWarned) { quotaWarned = true; SV.toast(r2 === true ? SV.t('vector.msg.autosave_no_images') : SV.t('vector.msg.autosave_off'), 'warn'); }
    }
  };
  SV.clearAutosave = function () { clearTimeout(autosaveTimer); lsDel(AUTOSAVE_KEY); };
  SV.loadAutosave = function () {
    var raw = lsGet(AUTOSAVE_KEY); if (!raw) return null;
    try { var o = JSON.parse(raw); if (o && o.doc && o.doc.layers) return o; } catch (e) { /* ignore */ }
    return null;
  };

  /* ================= document load ================= */
  SV.loadDoc = function (doc, opts) {
    opts = opts || {};
    if (!doc.guides) doc.guides = { h: [], v: [] };
    if (!doc.assets) doc.assets = {};
    if (!doc.layers || !doc.layers.length) doc.layers = [mk.layer('Layer 1')];
    S.doc = doc; S.sel = []; S.psel = {}; S.pen = null; S.op = null; S.editing = null;
    S.activeLayer = doc.layers[doc.layers.length - 1].id;
    SV.clearTextCache(); SV.resetRenderCache();
    if (opts.resetHistory) SV.resetHistory();
    if (opts.fit !== false) SV.fitArtboard();
    SV.requestRender(true);
  };

  /* ================= selection helpers ================= */
  SV.select = function (ids, opts) {
    S.sel = ids.filter(function (id, i) { return ids.indexOf(id) === i && getObj(id); });
    if (!opts || !opts.keepPoints) S.psel = {};
    if (S.sel.length) { var L = layerOf(S.sel[S.sel.length - 1]); if (L) S.activeLayer = L.id; }
    SV.requestRender(true);
  };
  SV.selectAll = function () {
    if (S.tool === 'type' && S.editing) return;
    var ids = [];
    S.doc.layers.forEach(function (L) { if (L.hidden || L.locked) return; L.children.forEach(function (o) { if (!o.hidden && !o.locked) ids.push(o.id); }); });
    if (S.tool === 'direct') {
      S.psel = {};
      ids.forEach(function (id) { var o = getObj(id); leaves(o).forEach(function (l) { selectAllPoints(l); }); });
    }
    SV.select(ids, { keepPoints: S.tool === 'direct' });
  };
  function selectAllPoints(o) {
    if (o.type === 'text' || o.type === 'image' || o.type === 'group') return;
    var keys = []; localSubs(o).forEach(function (sp, si) { sp.pts.forEach(function (a, i) { keys.push(si + ':' + i); }); });
    S.psel[o.id] = keys;
  }
  SV.selectAllPoints = selectAllPoints;
  SV.deselect = function () { if (S.pen) SV.finishPen(); SV.select([]); };
})();
