/* SlopVector — ui: the action registry (menus, shortcuts, context menus) */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function aboutDialog() { return $.aboutDialog.apply(this, arguments); }
  function applyDock() { return $.applyDock.apply(this, arguments); }
  function applyRulers() { return $.applyRulers.apply(this, arguments); }
  function docSetupDialog() { return $.docSetupDialog.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function isPanelVisible() { return $.isPanelVisible.apply(this, arguments); }
  function newDocDialog() { return $.newDocDialog.apply(this, arguments); }
  function pdfDialog() { return $.pdfDialog.apply(this, arguments); }
  function prefsDialog() { return $.prefsDialog.apply(this, arguments); }
  function rasterDialog() { return $.rasterDialog.apply(this, arguments); }
  function saveAsDialog() { return $.saveAsDialog.apply(this, arguments); }
  function savePrefs() { return $.savePrefs.apply(this, arguments); }
  function setTheme() { return $.setTheme.apply(this, arguments); }
  function shortcutsDialog() { return $.shortcutsDialog.apply(this, arguments); }
  function showPanel() { return $.showPanel.apply(this, arguments); }
  function swatches() { return $.swatches.apply(this, arguments); }
  function togglePanels() { return $.togglePanels.apply(this, arguments); }
  function transformDialog() { return $.transformDialog.apply(this, arguments); }

  /* ================= actions ================= */
  var A = SV.actions = {};
  /** 'file.exportSVG' → 'vector.act.file_export_svg': the key of an action's label (slopvector/i18n/en/actions*.js). */
  function actKey(id) { return 'vector.act.' + id.replace(/([a-z0-9])([A-Z]+)/g, '$1_$2').replace(/\./g, '_').toLowerCase(); }
  /** An action; its label reads the current language on every use (opts.key: a key of its own, e.g. a shared word). */
  function act(id, keys, run, opts) {
    var a = A[id] = Object.assign({ id: id, keys: keys || [], run: run }, opts || {}), key = a.key || actKey(id);
    Object.defineProperty(a, 'label', { get: function () { return SV.t(key); }, enumerable: true, configurable: true });
    return a;
  }
  function hasSel() { return S.sel.length > 0; }
  function hasMulti() { return S.sel.length > 1; }
  function selHas(type) { return SV.selObjs().some(function (o) { return SV.leaves(o).some(function (l) { return l.type === type; }) || o.type === type; }); }
  /** msg(on): the toast after the switch (none when left out). */
  function togglePref(k, msg) { return function () { S.prefs[k] = !S.prefs[k]; savePrefs(); SV.requestRender(true); if (msg) UI.toast(msg(S.prefs[k])); }; }

  act('file.new', ['mod+alt+n'], function () { newDocDialog(); });
  act('file.open', ['mod+o'], function () { SV.intake.open(); });
  act('file.place', ['mod+shift+p'], function () { SV.intake.place(); });
  act('file.openDrive', [], function () { SV.hub.openFromDrive(); });
  act('file.placeDrive', [], function () { SV.hub.placeFromDrive(); });
  act('file.sample', [], function () { SV.loadDoc(SV.sampleDoc(), { fit: true }); SV.commit('sample'); UI.toast(SV.t('vector.msg.say_hi')); });
  act('file.save', ['mod+s'], function () { SV.hub.save(); }, { key: 'menu.save' });
  act('file.saveAs', ['mod+shift+s'], function () { saveAsDialog(); });
  act('file.exportSVG', [], function () { IO.exportPlainSVG(); });
  act('file.exportBuffer', [], function () { SV.buffer.exportToBuffer(); });
  act('file.exportPNG', ['mod+shift+e'], function () { rasterDialog('png'); });
  act('file.exportJPG', [], function () { rasterDialog('jpg'); });
  act('file.exportPDF', [], function () { pdfDialog(false); });
  act('file.exportAI', [], function () { pdfDialog(true); });
  act('file.docSetup', ['mod+alt+p'], function () { docSetupDialog(); });
  act('file.downloadApp', [], function () { IO.downloadApp(); });
  act('file.home', [], function () { location.href = '../'; });

  act('edit.undo', ['mod+z'], function () { SV.undo(); }, { key: 'ui.undo', enabled: function () { return S.hIdx > 0; } });
  act('edit.redo', ['mod+shift+z'], function () { SV.redo(); }, { key: 'ui.redo', enabled: function () { return S.hIdx < S.history.length - 1; } });
  act('edit.cut', ['mod+x'], function () { C.copy(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } C.cut(); }, { key: 'ui.cut', enabled: hasSel });
  act('edit.copy', ['mod+c'], function () { C.copy(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } UI.toast(SV.t('vector.msg.copied')); }, { key: 'ui.copy', enabled: hasSel });
  act('edit.copyBuffer', [], function () { SV.buffer.copyAsBuffer(); }, { enabled: hasSel });
  act('edit.paste', ['mod+v'], function () {
    if (SV.buffer.pasteIfNewer()) return;
    if (S.clipboard) return C.paste();
    if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(function (t) { if (/<svg[\s>]/i.test(t)) IO.importSVGText(t, { place: true }); else UI.toast(SV.t('vector.msg.clipboard_empty')); }).catch(function () { UI.toast(SV.t('vector.msg.clipboard_empty')); });
    else UI.toast(SV.t('vector.msg.clipboard_empty'));
  }, { key: 'ui.paste' });
  act('edit.pasteFront', ['mod+f'], function () { C.paste('front'); });
  act('edit.pasteBack', ['mod+b'], function () { C.paste('back'); });
  act('edit.clear', [], function () { C.deleteSel(); }, { key: 'ui.delete', enabled: hasSel, keyText: 'Del' });
  act('edit.duplicate', ['mod+d'], function () { C.duplicate(); }, { key: 'ui.duplicate', enabled: hasSel });
  act('edit.prefs', ['mod+,'], function () { prefsDialog(); });
  act('edit.nav', [], function () { SlopNav.openModal('vector'); });

  act('object.group', ['mod+g'], function () { C.group(); }, { enabled: hasSel });
  act('object.ungroup', ['mod+shift+g'], function () { C.ungroup(); }, { enabled: function () { return SV.selObjs().some(function (o) { return o.type === 'group'; }); } });
  act('arrange.front', ['mod+shift+]'], function () { C.arrange('front'); }, { enabled: hasSel });
  act('arrange.forward', ['mod+]'], function () { C.arrange('forward'); }, { enabled: hasSel });
  act('arrange.backward', ['mod+['], function () { C.arrange('backward'); }, { enabled: hasSel });
  act('arrange.back', ['mod+shift+['], function () { C.arrange('back'); }, { enabled: hasSel });
  act('transform.move', ['mod+shift+m'], function () { transformDialog('move'); }, { enabled: hasSel });
  act('transform.rotate', [], function () { transformDialog('rotate'); }, { enabled: hasSel });
  act('transform.scale', [], function () { transformDialog('scale'); }, { enabled: hasSel });
  act('transform.reflect', [], function () { transformDialog('reflect'); }, { enabled: hasSel });
  act('transform.flipH', [], function () { C.flip('h'); }, { enabled: hasSel });
  act('transform.flipV', [], function () { C.flip('v'); }, { enabled: hasSel });
  act('transform.restoreAspect', [], function () { SV.restoreAspect(null); }, { enabled: function () { return !!SV.aspectTarget(); } });
  act('object.lock', ['mod+2'], function () { C.lockSel(); }, { enabled: hasSel });
  act('object.unlockAll', ['mod+alt+2'], function () { C.unlockAll(); });
  act('object.hide', ['mod+3'], function () { C.hideSel(); }, { enabled: hasSel });
  act('object.showAll', ['mod+alt+3'], function () { C.showAll(); });
  act('object.expand', [], function () { C.expand(); }, { enabled: hasSel });
  act('compound.make', ['mod+8'], function () { C.makeCompound(); }, { enabled: hasSel });
  act('compound.release', ['mod+alt+shift+8'], function () { C.releaseCompound(); }, { enabled: hasSel });
  act('clip.make', ['mod+7'], function () { C.makeClip(); }, { enabled: function () { return C.canMakeClip(); } });
  act('clip.release', ['mod+alt+7'], function () { C.releaseClip(); }, { enabled: function () { return C.canReleaseClip(); } });
  act('pf.unite', [], function () { C.pathfinder('union'); }, { enabled: hasMulti });
  act('pf.minus', [], function () { C.pathfinder('minus'); }, { enabled: hasMulti });
  act('pf.intersect', [], function () { C.pathfinder('intersect'); }, { enabled: hasMulti });
  act('pf.exclude', [], function () { C.pathfinder('xor'); }, { enabled: hasMulti });
  act('object.slopify', ['mod+alt+s'], function () { C.slopify(); }, { enabled: hasSel });

  act('type.alignLeft', [], function () { SV.applyFont('align', 'left'); }, { checked: function () { return S.font.align === 'left'; } });
  act('type.alignCenter', [], function () { SV.applyFont('align', 'center'); }, { checked: function () { return S.font.align === 'center'; } });
  act('type.alignRight', [], function () { SV.applyFont('align', 'right'); }, { checked: function () { return S.font.align === 'right'; } });
  function changeCase(fn) { return function () { var n = 0; SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.type === 'text') { l.text = fn(l.text); n++; } }); }); if (n) SV.commit('case'); else UI.toast(SV.t('vector.msg.select_text')); }; }
  act('type.upper', [], changeCase(function (t) { return t.toUpperCase(); }), { enabled: function () { return selHas('text'); } });
  act('type.lower', [], changeCase(function (t) { return t.toLowerCase(); }), { enabled: function () { return selHas('text'); } });
  act('type.title', [], changeCase(function (t) { return t.toLowerCase().replace(/(^|\s)(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }), { enabled: function () { return selHas('text'); } });
  act('type.ipsum', [], function () {
    var ip = ['Slop ipsum dolor sit amet, consectetur generative elit.', 'Six fingers, zero regrets, infinite content.', 'Engagement bait aliquam, hallucinatio maxima.']; // i18n-ignore: sample text stamped into the document
    var n = 0; SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (l.type === 'text') { l.text = ip[n % ip.length]; n++; } }); });
    if (n) SV.commit('ipsum'); else UI.toast(SV.t('vector.msg.select_text_object'));
  }, { enabled: function () { return selHas('text'); } });

  act('select.all', ['mod+a'], function () { SV.selectAll(); });
  act('select.none', ['mod+shift+a'], function () { SV.deselect(); });
  act('select.inverse', [], function () { C.selectInverse(); });
  act('select.sameFill', [], function () { C.selectSame('fill'); }, { enabled: hasSel });
  act('select.sameStroke', [], function () { C.selectSame('stroke'); }, { enabled: hasSel });
  act('select.layer', [], function () { C.selectLayer(); });

  act('view.zoomIn', ['mod+=', 'mod+shift+='], function () { SV.zoomStep(1); });
  act('view.zoomOut', ['mod+-'], function () { SV.zoomStep(-1); });
  act('view.fit', ['mod+0', '0'], function () { SV.fitArtboard(true); });
  act('view.actual', ['mod+1', '1'], function () { SV.actualSize(true); });
  act('view.outline', ['mod+y'], togglePref('outline'), { checked: function () { return S.prefs.outline; } });
  act('view.rulers', ['mod+r'], function () { S.prefs.rulers = !S.prefs.rulers; savePrefs(); applyRulers(); SV.requestRender(true); }, { checked: function () { return S.prefs.rulers; } });
  act('view.grid', ["mod+'"], togglePref('grid'), { checked: function () { return S.prefs.grid; } });
  act('view.snapGrid', ["mod+shift+'"], togglePref('snapGrid', function (on) { return on ? SV.t('vector.msg.snap_grid_on') : SV.t('vector.msg.snap_grid_off'); }), { checked: function () { return S.prefs.snapGrid; } });
  act('view.smart', ['mod+u'], togglePref('smart', function (on) { return on ? SV.t('vector.msg.smart_on') : SV.t('vector.msg.smart_off'); }), { checked: function () { return S.prefs.smart; } });
  act('view.guides', ['mod+;'], togglePref('guides'), { checked: function () { return S.prefs.guides; } });
  act('view.lockGuides', ['mod+alt+;'], togglePref('lockGuides'), { checked: function () { return S.prefs.lockGuides; } });
  act('view.clearGuides', [], function () { S.doc.guides = { h: [], v: [] }; SV.commit('clear guides'); });
  ['pro', 'light', 'classic'].filter(function (t) { return !window.SlopTheme || SlopTheme.has(t); }).forEach(function (t) {   // the site's themes
    act('theme.' + t, [], function () { setTheme(t); }, { checked: function () { return UI.st.currentTheme === t; } });
  });

  var PANEL_IDS = ['properties', 'appearance', 'layers', 'swatches', 'gradient', 'align', 'pathfinder'];
  /** The panels' names: keys (the dock tabs mark them, so they follow a language switch). */
  var PANEL_NAMES = { properties: 'vector.panel.properties', appearance: 'vector.panel.appearance', layers: 'vector.panel.layers', swatches: 'vector.panel.swatches', gradient: 'vector.panel.gradient', align: 'vector.panel.align', pathfinder: 'vector.panel.pathfinder' };
  PANEL_IDS.forEach(function (p) { act('window.' + p, [], function () { showPanel(p); }, { key: PANEL_NAMES[p], checked: function () { return isPanelVisible(p); } }); });
  act('window.togglePanels', [], function () { togglePanels(); }, { keyText: 'Tab', checked: function () { return S.prefs.panels; } });
  act('window.reset', [], function () { S.prefs.panels = true; UI.st.activeTabs = { a: 'properties', c: 'swatches' }; UI.st.collapsed = {}; savePrefs(); applyDock(); });
  // The colour picker, opened from the fill or stroke chip in the toolbar (the popover is anchored there).
  function editChip(which) { var el = document.querySelector('.fs.' + which); if (el) { S.focus = which; UI.editPaint(which, el); } }
  act('window.fillColor', [], function () { editChip('fill'); });
  act('window.strokeColor', [], function () { editChip('stroke'); });

  act('help.shortcuts', ['mod+/'], function () { shortcutsDialog(); }, { keyText: 'F1' });
  act('help.about', [], function () { aboutDialog(); });

  SV.runAction = function (id) {
    var a = A[id]; if (!a) return;
    if (a.enabled && !a.enabled()) return;
    if (S.editing && id.indexOf('type.') !== 0) SV.commitTextEdit();
    a.run();
  };
  SV.keymap = {};
  Object.keys(A).forEach(function (id) { A[id].keys.forEach(function (k) { SV.keymap[k] = id; }); });
  SV.keymap['mod+n'] = 'file.new';
  SV.keymap['mod+shift+/'] = 'help.shortcuts';
  // Ctrl/⌘+K is Search Commands in every app (SlopCmd's palette); Preferences is Ctrl/⌘+, (above).
  SV.keymap['mod+k'] = 'help.commands';

  $.A = A; $.PANEL_IDS = PANEL_IDS; $.PANEL_NAMES = PANEL_NAMES; $.act = act; $.actKey = actKey;
})();
