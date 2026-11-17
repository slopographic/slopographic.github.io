/* SlopVector — ui: context menus, theme, prefs and UI refresh */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function act() { return $.act.apply(this, arguments); }
  function buildControlBar() { return $.buildControlBar.apply(this, arguments); }
  function controlContext() { return $.controlContext.apply(this, arguments); }
  function keyLabel() { return $.keyLabel.apply(this, arguments); }
  function newLayer() { return $.newLayer.apply(this, arguments); }
  function renderLayers() { return $.renderLayers.apply(this, arguments); }
  function runBinds() { return $.runBinds.apply(this, arguments); }
  function swatches() { return $.swatches.apply(this, arguments); }
  var A = $.A;

  /* ================= context menus (shared SlopUI kit) ================= */
  // Right-click and the Menu key / Shift+F10 open the menu of the target: canvas, layer, object, group,
  // text, swatch, dock tab and dock group (swatch, tab and group menus: ctxmenu-dock.js). Items run the menus' actions.
  function mi(id, label) {
    var a = A[id]; if (!a) return null;
    return { label: label || a.label, key: UI.actKey(a), disabled: a.enabled ? !a.enabled() : false, check: a.checked ? a.checked() : false, act: function () { SV.runAction(id); } };
  }
  /** The single selected text object (for Edit Text), or null. */
  function selectedText() { var o = S.sel.length === 1 ? getObj(S.sel[0]) : null; return o && o.type === 'text' && SV.isEditable(o) ? o : null; }
  UI.canvasMenu = function (x, y) {
    var any = S.sel.length > 0, txt = selectedText();
    var items = [];
    if (any) items.push({ label: SV.t('vector.act.transform_restore_aspect'), disabled: !SV.aspectTarget(), act: function () { SV.restoreAspect(SV.aspectKeepAt(x, y)); } }, '-');
    if (txt) items.push({ label: SV.t('vector.ctx.edit_text'), act: function () { SV.startTextEdit(txt, null); } }, '-');
    items.push(mi('edit.undo'), mi('edit.redo'), '-');
    if (any) items.push(mi('edit.cut'), mi('edit.copy'), mi('edit.copyBuffer'));
    if (S.clipboard) items.push(mi('edit.paste'), mi('edit.pasteFront'));
    if (any) {
      items.push(mi('edit.duplicate'), mi('edit.clear'), '-', mi('object.group'), mi('object.ungroup'),
        { label: SV.t('vector.menu.arrange'), sub: [mi('arrange.front'), mi('arrange.forward'), mi('arrange.backward'), mi('arrange.back')] },
        { label: SV.t('vector.menu.transform'), sub: [mi('transform.move'), mi('transform.rotate'), mi('transform.scale'), mi('transform.reflect'), '-', mi('transform.flipH'), mi('transform.flipV'), '-', mi('transform.restoreAspect')] },
        { label: SV.t('vector.menu.pathfinder'), sub: [mi('pf.unite'), mi('pf.minus'), mi('pf.intersect'), mi('pf.exclude')] },
        mi('compound.make'), mi('object.expand'), '-', mi('object.lock'), mi('object.hide'), '-', mi('object.slopify'));
    } else {
      items.push('-', mi('select.all'), mi('object.unlockAll'), mi('object.showAll'), '-', mi('view.fit'), mi('view.outline'), mi('view.grid'), mi('view.rulers'), '-', mi('file.docSetup'));
    }
    return window.SlopUI.menu(items, x, y);
  };
  /** Rename, show or hide, lock or unlock: shared by layer and object rows. */
  function rowItems(it, id) {
    return [
      { label: SV.t('ui.rename_dots'), act: function () { UI.st.renaming = id; UI.st.layersSig = ''; renderLayers(); } },
      { label: it.hidden ? SV.t('vector.layers.show') : SV.t('vector.layers.hide'), act: function () { it.hidden = !it.hidden; SV.commit(it.hidden ? 'hide' : 'show'); } },
      { label: it.locked ? SV.t('vector.layers.unlock') : SV.t('vector.props.lock'), act: function () { it.locked = !it.locked; SV.commit(it.locked ? 'lock' : 'unlock'); } }];
  }
  function layerItems(L) {
    return rowItems(L, L.id).concat(['-', { label: SV.t('vector.ctx.select_layer'), act: function () { C.selectLayer(); } }, { label: SV.t('vector.ctx.new_layer'), act: newLayer },
      { label: SV.t('vector.ctx.delete_layer'), disabled: S.doc.layers.length <= 1, act: function () { var i = S.doc.layers.indexOf(L); if (i < 0 || S.doc.layers.length <= 1) return; S.doc.layers.splice(i, 1); S.activeLayer = S.doc.layers[Math.max(0, i - 1)].id; SV.commit('delete layer'); } }]);
  }
  /** Object and group rows: a group selects its contents, a text object edits its text. */
  function objItems(o, id) {
    var pre = [];
    if (o.type === 'group') pre.push({ label: SV.t('vector.ctx.select_group'), act: function () { SV.select(SV.leaves(o).map(function (l) { return l.id; })); } }, '-');
    if (o.type === 'text') pre.push({ label: SV.t('vector.ctx.edit_text'), act: function () { SV.startTextEdit(o, null); } }, '-');
    return pre.concat(rowItems(o, id), ['-', mi('edit.duplicate'), mi('edit.clear'), '-', mi('arrange.front'), mi('arrange.back'), mi('object.group'), mi('object.ungroup')]);
  }
  UI.layerMenu = function (id, x, y) {
    var L = SV.getLayer(id), o = L ? null : getObj(id), it = L || o; if (!it) return null;
    var items;
    if (L) { S.activeLayer = id; SV.requestRender(true); items = layerItems(L); }
    else { if (SV.isEditable(o) && S.sel.indexOf(id) < 0) SV.select([id]); items = objItems(o, id); }
    return window.SlopUI.menu(items, x, y);
  };
  /** The menu for a dock or layer element (swatch, tab, group, layer row); null when none applies. */
  UI.menuForTarget = function (el, x, y) {
    if (!el || !el.closest) return null;
    var row = el.closest('.lrow'); if (row) return UI.layerMenu(row.getAttribute('data-id'), x, y);
    var sw = el.closest('#swgrid .sw'); if (sw) return UI.swatchMenu(Array.prototype.indexOf.call(sw.parentNode.children, sw), x, y);
    var tab = el.closest('.dock-tab'); if (tab) return UI.tabMenu(tab, x, y);
    var tabs = el.closest('.dock-tabs'); if (tabs) return UI.panelMenu(tabs.parentNode, x, y);
    return null;
  };
  function bindContextMenus() {
    D.stage.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (S.editing) SV.commitTextEdit();
      if (S.pen) SV.finishPen();
      var hit = SV.hitTest(SV.evDoc(e));
      if (hit) {
        var t = S.sel.indexOf(hit.obj.id) >= 0 ? hit.obj.id : hit.top.id;
        if (S.sel.indexOf(t) < 0) SV.select([t]);
      }
      UI.closeMenus();
      UI.canvasMenu(e.clientX, e.clientY);
    });
    document.getElementById('dock').addEventListener('contextmenu', function (e) {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      if (UI.menuForTarget(e.target, e.clientX, e.clientY)) e.preventDefault();
    });
    // Menu key / Shift+F10: the focused target's menu, or the canvas menu when the stage (or nothing) has focus
    document.addEventListener('keydown', function (e) {
      if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) || e.defaultPrevented) return;
      var a = document.activeElement || document.body;
      if (a.closest && a.closest('.sui-menu, input, textarea, select, [contenteditable="true"]')) return;
      var onStage = a === document.body || D.stage.contains(a);
      if (!onStage && !(a.closest && a.closest('.lrow, #swgrid .sw, .dock-tab, .dock-tabs'))) return;
      e.preventDefault();
      if (onStage) { var sr = D.stage.getBoundingClientRect(); UI.canvasMenu(sr.left + sr.width / 2, sr.top + sr.height / 2); return; }
      var r = a.getBoundingClientRect();
      UI.menuForTarget(a, r.left + 8, r.bottom);
    });
  }

  /* ================= theme & prefs ================= */
  UI.st.currentTheme = 'pro';
  function setTheme(t) {
    UI.st.currentTheme = t;
    document.documentElement.setAttribute('data-theme', t);
    SV.lsSet('slopvector.theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#e8e8e8' : t === 'classic' ? '#008080' : '#1e1e1e');
    var cs = document.querySelector('meta[name="color-scheme"]'); if (cs) cs.setAttribute('content', t === 'pro' ? 'dark' : 'light');
    UI.st.rulerColors = null;
    SV.requestRender(true);
  }
  UI.setTheme = setTheme;
  function savePrefs() { SV.lsSet('slopvector.prefs', JSON.stringify({ prefs: S.prefs, tabs: UI.st.activeTabs, collapsed: UI.st.collapsed })); }
  function loadPrefs() {
    try { var o = JSON.parse(SV.lsGet('slopvector.prefs') || 'null'); if (o) { Object.assign(S.prefs, o.prefs || {}); Object.assign(UI.st.activeTabs, o.tabs || {}); UI.st.collapsed = o.collapsed || {}; } } catch (e) { /* ignore */ }
    S.prefs.outline = false;
  }

  /* ================= update ================= */
  UI.update = function () {
    var ctx = controlContext(), sig = JSON.stringify([ctx.n > 0, Object.keys(ctx.types).sort(), ctx.tool, ctx.editing]);
    if (sig !== UI.st.cbSig) { UI.st.cbSig = sig; buildControlBar(ctx); }
    ['toolbar', 'cb', 'props', 'app', 'layers', 'swatches', 'grad', 'align', 'status'].forEach(runBinds);
    document.getElementById('stage').setAttribute('data-tool', S.tool);
  };
  // A language switch: rebuild the control bar and the layer rows and run every binding (their words come from t()).
  SV.onLang(function () { UI.st.cbSig = ''; UI.st.layersSig = ''; if (SV.requestRender) SV.requestRender(true); });

  $.bindContextMenus = bindContextMenus; $.loadPrefs = loadPrefs; $.mi = mi; $.savePrefs = savePrefs; $.setTheme = setTheme;
})();
