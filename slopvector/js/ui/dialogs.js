/* SlopVector — ui: dialogs on the shared SlopUI kit */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function act() { return $.act.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function keyLabel() { return $.keyLabel.apply(this, arguments); }
  function savePrefs() { return $.savePrefs.apply(this, arguments); }
  var A = $.A;
  var I = $.I;
  var t = SV.t;

  /* ================= dialogs (shared SlopUI kit) ================= */
  // Thin adapter: app dialogs describe { title, body, buttons:[{label, primary, danger, left, onClick}], cls }
  // and render through window.SlopUI (../shared/slopui.js), shared with PhotoSlop and Slop PDF.
  function dialog(opts) {
    var body = opts.body;
    if (typeof body === 'string') body = h('div', { class: 'sv-dlg-body', html: body });
    var specs = opts.buttons || [{ label: t('menu.ok'), primary: true }];
    var d = window.SlopUI.dialog({
      title: opts.title, body: body, dismissable: true,
      cls: 'sv-dlg ' + (opts.cls === 'wide' ? 'sui-wide' : (opts.cls || '')),
      buttons: specs.map(function (b) { return { label: b.label, primary: !!b.primary, danger: !!b.danger, act: b.onClick ? function () { return b.onClick(); } : undefined }; }),
      onClose: function (ok) { if (opts.onClose) opts.onClose(ok); }
    });
    var foot = d.box.querySelector('.sui-foot');
    if (foot) specs.forEach(function (b, i) { if (b.left && foot.children[i]) foot.children[i].classList.add('sv-left'); });
    return d;
  }
  UI.dialog = dialog;
  UI.handleGlobalKey = function (e) {
    if (UI.st.picker && e.key === 'Escape') { e.preventDefault(); UI.closePicker(); return true; }
    // SlopUI dialogs handle their own keys (and stop propagation); anything reaching us while one is open
    // came from outside it, so keep app shortcuts quiet.
    if (window.SlopUI && window.SlopUI.openDialogs > 0) {
      if (!(e.ctrlKey || e.metaKey) && !(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) e.preventDefault();
      return true;
    }
    // A SlopUI menu (menubar dropdown or context menu) owns arrows/Enter/Escape while it has focus.
    if (document.querySelector('.sui-menu')) {
      if (e.key === 'Escape') { UI.closeMenus(); e.preventDefault(); return true; }
      if (e.target && e.target.closest && e.target.closest('.sui-menu')) return true;
    }
    return false;
  };
  function form(fields) {
    var U = window.SlopUI, wrap = h('div', { class: 'sv-form' }), refs = {};
    fields.forEach(function (f) {
      if (f.type === 'note') { wrap.appendChild(h('p', { class: 'sui-p', html: f.html || esc(f.text) })); return; }
      var inp;
      if (f.type === 'select') inp = U.select(f.options, f.value);
      else if (f.type === 'checkbox') { var c = U.check(f.label, f.value); c.input.id = 'f-' + f.id; refs[f.id] = c.input; wrap.appendChild(h('div', { class: 'sv-check' }, [c.el])); return; }
      else if (f.type === 'text') { inp = U.el('input', { class: 'sui-input', type: 'text' }); inp.value = f.value; }
      else inp = U.number(f.value, f.min, f.max, f.step || 'any');
      inp.id = 'f-' + f.id;
      if (f.onChange) inp.addEventListener(f.type === 'select' ? 'change' : 'input', function () { f.onChange(inp.value, refs); });
      refs[f.id] = inp;
      wrap.appendChild(U.field(f.label, inp, f.unit));
    });
    return { el: wrap, refs: refs, val: function (id) { var r = refs[id]; if (!r) return null; if (r.type === 'checkbox') return r.checked; if (r.type === 'number') return parseFloat(r.value); return r.value; } };
  }
  // Artboard presets: [id, width, height]; the names are vector.dlg.preset_<id>.
  var PRESETS = [['letter', 612, 792], ['a4', 595.28, 841.89], ['square', 1080, 1080], ['hd', 1920, 1080], ['slop', 1200, 800], ['story', 1080, 1920], ['custom', null, null]];
  function presetOptions() { return PRESETS.map(function (p) { return [p[0], t(`vector.dlg.preset_${p[0]}`)]; }); }
  function presetChange(v, refs) { var p = PRESETS.filter(function (x) { return x[0] === v; })[0]; if (p && p[1]) { refs.w.value = p[1]; refs.h.value = p[2]; } }
  function newDocDialog() {
    var f = form([
      { id: 'name', label: t('vector.dlg.name'), type: 'text', value: 'Untitled-' + S.docCounter }, // i18n-ignore: the document's name
      { id: 'preset', label: t('vector.dlg.preset'), type: 'select', value: 'slop', options: presetOptions(), onChange: presetChange },
      { id: 'w', label: t('vector.props.width'), value: 1200, min: 1, max: 20000, unit: 'px' },
      { id: 'h', label: t('vector.props.height'), value: 800, min: 1, max: 20000, unit: 'px' },
      { type: 'note', text: t('vector.dlg.new_note') }
    ]);
    ['w', 'h'].forEach(function (k) { f.refs[k].addEventListener('input', function () { f.refs.preset.value = 'custom'; }); });
    dialog({ title: t('vector.dlg.new_title'), body: f.el, buttons: [{ label: t('menu.cancel') }, { label: t('vector.dlg.create'), primary: true, onClick: function () {
      var w = f.val('w'), hh = f.val('h'); if (!(w > 0 && hh > 0)) { UI.toast(t('vector.dlg.bad_size'), 'warn'); return false; }
      S.docCounter++;
      SV.loadDoc(SV.newDoc(w, hh, f.val('name') || 'Untitled'), { fit: true }); // i18n-ignore: the document's name
      S.fileName = null;
      SV.clearAutosave();
      SV.commit('new document'); SV.markSaved();
      UI.toast(t('vector.dlg.new_done', { w: String(w), h: String(hh) }));
    } }] });
  }
  function docSetupDialog() {
    var f = form([{ id: 'name', label: t('vector.dlg.name'), type: 'text', value: S.doc.name }, { id: 'w', label: t('vector.props.width'), value: S.doc.width, min: 1, unit: 'px' }, { id: 'h', label: t('vector.props.height'), value: S.doc.height, min: 1, unit: 'px' }, { id: 'preset', label: t('vector.dlg.preset'), type: 'select', value: 'custom', options: presetOptions(), onChange: presetChange }]);
    dialog({ title: t('vector.dlg.setup_title'), body: f.el, buttons: [{ label: t('menu.cancel') }, { label: t('menu.ok'), primary: true, onClick: function () { var w = f.val('w'), hh = f.val('h'); if (!(w > 0 && hh > 0)) return false; S.doc.width = w; S.doc.height = hh; S.doc.name = f.val('name') || S.doc.name; SV.commit('document setup'); SV.fitArtboard(); } }] });
  }
  function saveAsDialog() {
    return window.SlopUI.prompt(t('vector.dlg.save_as_title'), t('vector.dlg.file_name'), S.doc.name, { ok: t('menu.save') }).then(function (name) {
      if (name == null) return;
      IO.saveSVG((String(name).trim() || 'Untitled').replace(/\.svg$/i, '')); // i18n-ignore: a file name
    });
  }
  function rasterDialog(type) {
    var W = S.doc.width, H = S.doc.height, res = function (k) { return [String(k), t('vector.dlg.resolution_n', { k: String(k), w: String(W * k), h: String(H * k) })]; };
    var f = form([{ id: 'scale', label: t('vector.dlg.resolution'), type: 'select', value: '1', options: [res(1), res(2), res(4)] }].concat(type === 'png' ? [{ id: 'transparent', type: 'checkbox', label: t('vector.dlg.transparent'), value: false }] : [{ id: 'q', label: t('vector.dlg.quality'), value: 92, min: 10, max: 100, unit: '%' }]).concat([{ type: 'note', text: t('vector.dlg.raster_note', { w: String(W), h: String(H) }) }]));
    dialog({ title: t('vector.dlg.export_as', { type: type.toUpperCase() }), body: f.el, buttons: [{ label: t('menu.cancel') }, { label: t('menu.export'), primary: true, onClick: function () { IO.exportRaster(type, parseFloat(f.val('scale')) || 1, type === 'png' ? f.val('transparent') : false, type === 'jpg' ? (f.val('q') || 92) / 100 : undefined); } }] });
  }
  function pdfDialog(asAI) {
    var p = function (k) { return '<p class="sui-p">' + esc(t(k)) + '</p>'; };
    var body = asAI ? p('vector.dlg.ai_note1') + p('vector.dlg.ai_note2') : p('vector.dlg.pdf_note');
    dialog({ title: asAI ? t('vector.act.file_export_ai').replace(/…$/, '') : t('vector.dlg.export_as', { type: 'PDF' }), body: body, buttons: [{ label: t('menu.cancel') }, { label: t('menu.export'), primary: true, onClick: function () { IO.exportPDF(asAI); } }] });
  }
  function prefsDialog() {
    var f = form([{ id: 'inc', label: t('vector.dlg.key_inc'), value: S.prefs.keyInc, min: 0.01, unit: 'px' }, { id: 'grid', label: t('vector.dlg.grid_size'), value: S.prefs.gridSize, min: 1, unit: 'px' }, { id: 'scale', type: 'checkbox', label: t('vector.dlg.scale_strokes'), value: S.prefs.scaleStrokes }, { id: 'smart', type: 'checkbox', label: t('vector.dlg.smart'), value: S.prefs.smart }]);
    dialog({ title: t('vector.dlg.prefs_title'), body: f.el, buttons: [{ label: t('menu.cancel') }, { label: t('menu.ok'), primary: true, onClick: function () { S.prefs.keyInc = f.val('inc') || 1; S.prefs.gridSize = f.val('grid') || 10; S.prefs.scaleStrokes = f.val('scale'); S.prefs.smart = f.val('smart'); savePrefs(); SV.requestRender(true); } }] });
  }
  UI.shapeDialog = function (kind, p0) {
    var fields, make;
    var st = function () { return SV.newStyle(kind === 'line' ? 'line' : 'shape'); };
    if (kind === 'rect' || kind === 'rrect' || kind === 'ellipse') {
      fields = [{ id: 'w', label: t('vector.props.width'), value: 100, min: 0, unit: 'px' }, { id: 'h', label: t('vector.props.height'), value: 100, min: 0, unit: 'px' }];
      if (kind === 'rrect') fields.push({ id: 'r', label: t('vector.corner.radius'), value: S.shape.radius, min: 0, unit: 'px' });
      make = function (f) { var w = f.val('w'), hh = f.val('h'); if (!(w > 0 && hh > 0)) return null; return kind === 'ellipse' ? SV.mk.ellipse(p0.x + w / 2, p0.y + hh / 2, w / 2, hh / 2, st()) : SV.mk.rect(p0.x, p0.y, w, hh, kind === 'rrect' ? (S.shape.radius = f.val('r') || 0) : 0, st()); };
    } else if (kind === 'polygon') {
      fields = [{ id: 'r', label: t('vector.dlg.radius'), value: 50, min: 0, unit: 'px' }, { id: 'n', label: t('vector.cb.sides'), value: S.shape.sides, min: 3, max: 64 }];
      make = function (f) { var r = f.val('r'); if (!(r > 0)) return null; S.shape.sides = SV.clamp(round(f.val('n')) || 6, 3, 64); return SV.mk.polygon(p0.x, p0.y, r, S.shape.sides, st()); };
    } else if (kind === 'star') {
      fields = [{ id: 'r1', label: t('vector.dlg.radius_1'), value: 50, min: 0, unit: 'px' }, { id: 'r2', label: t('vector.dlg.radius_2'), value: 25, min: 0, unit: 'px' }, { id: 'n', label: t('vector.cb.points'), value: S.shape.points, min: 2, max: 64 }];
      make = function (f) { var r1 = f.val('r1'), r2 = f.val('r2'); if (!(r1 > 0)) return null; S.shape.points = SV.clamp(round(f.val('n')) || 5, 2, 64); return SV.mk.star(p0.x, p0.y, r1, r2, S.shape.points, st()); };
    } else if (kind === 'line') {
      fields = [{ id: 'l', label: t('vector.dlg.length'), value: 100, min: 0, unit: 'px' }, { id: 'a', label: t('vector.grad.angle'), value: 0, unit: '°' }];
      make = function (f) { var l = f.val('l'), a = -(f.val('a') || 0) * PI / 180; if (!(l > 0)) return null; return SV.mk.path([{ closed: false, pts: [G.A(p0.x, p0.y), G.A(p0.x + Math.cos(a) * l, p0.y + Math.sin(a) * l)] }], st()); };
    } else return;
    var f = form(fields);
    var title = kind === 'line' ? t('vector.dlg.line_options') : SV.t(`vector.tool.${kind}`);
    dialog({ title: title, body: f.el, buttons: [{ label: t('menu.cancel') }, { label: t('menu.ok'), primary: true, onClick: function () { var o = make(f); if (!o) { UI.toast(t('vector.dlg.size_zero'), 'warn'); return false; } if (SV.insertObj(o)) { SV.select([o.id]); SV.commit(kind); } } }] });
  };
  var lastT = { move: { h: 10, v: 0 }, rotate: { a: 45 }, scale: { u: 100, h: 100, v: 100, uni: true }, reflect: { axis: 'v' } };
  function transformDialog(kind) {
    if (!S.sel.length) return UI.toast(t('vector.dlg.select_first'));
    var b = SV.selBBox(), c = S.origin || { x: b.x + b.w / 2, y: b.y + b.h / 2 }, f, build;
    var hz = t('vector.guides.horizontal'), vt = t('vector.guides.vertical');
    if (kind === 'move') { f = form([{ id: 'h', label: hz, value: lastT.move.h, unit: 'px' }, { id: 'v', label: vt, value: lastT.move.v, unit: 'px' }]); build = function () { lastT.move = { h: f.val('h') || 0, v: f.val('v') || 0 }; return G.translate(lastT.move.h, lastT.move.v); }; }
    else if (kind === 'rotate') { f = form([{ id: 'a', label: t('vector.grad.angle'), value: lastT.rotate.a, unit: '°' }, { type: 'note', text: t('vector.dlg.rotate_note') }]); build = function () { lastT.rotate.a = f.val('a') || 0; return G.rotate(-lastT.rotate.a * PI / 180, c.x, c.y); }; }
    else if (kind === 'scale') {
      f = form([{ id: 'uni', type: 'checkbox', label: t('vector.dlg.uniform'), value: lastT.scale.uni }, { id: 'u', label: t('vector.tool.scale'), value: lastT.scale.u, unit: '%' }, { id: 'h', label: hz, value: lastT.scale.h, unit: '%' }, { id: 'v', label: vt, value: lastT.scale.v, unit: '%' }]);
      build = function () { var uni = f.val('uni'); lastT.scale = { uni: uni, u: f.val('u') || 100, h: f.val('h') || 100, v: f.val('v') || 100 }; var sx = (uni ? lastT.scale.u : lastT.scale.h) / 100, sy = (uni ? lastT.scale.u : lastT.scale.v) / 100; return G.scale(sx, sy, c.x, c.y); };
    } else {
      f = form([{ id: 'axis', label: t('vector.dlg.axis'), type: 'select', value: lastT.reflect.axis, options: [['h', hz], ['v', vt]] }]);
      build = function () { lastT.reflect.axis = f.val('axis') || 'v'; return lastT.reflect.axis === 'h' ? G.scale(1, -1, c.x, c.y) : G.scale(-1, 1, c.x, c.y); };
    }
    dialog({ title: t(`vector.dlg.${kind}_title`), body: f.el, buttons: [{ label: t('ui.copy'), left: true, onClick: function () { C.transformSel(build(), true, kind + ' copy'); } }, { label: t('menu.cancel') }, { label: t('menu.ok'), primary: true, onClick: function () { var M = build(); var a = kind === 'rotate' ? -lastT.rotate.a : 0; C.transformSel(M, false, kind); if (a) SV.selObjs().forEach(function (o) { if (o.type === 'path' || o.type === 'group') o.rot = SV.normAng((o.rot || 0) + a); }); } }] });
  }
  UI.transformDialog = transformDialog;
  function shortcutsDialog() {
    var wrap = h('div', { class: 'shortcuts' });
    var col1 = h('div', { class: 'sc-col' }), col2 = h('div', { class: 'sc-col' }), col3 = h('div', { class: 'sc-col' });
    function section(col, title, rows) {
      col.appendChild(h('h4', { text: title }));
      var tb = h('table', { class: 'sc-table' });
      rows.forEach(function (r) { tb.appendChild(h('tr', {}, [h('td', { text: r[0] }), h('td', {}, [h('kbd', { text: r[1] })])])); });
      col.appendChild(tb);
    }
    section(col1, t('vector.sc.tools'), SV.TOOL_LIST.map(function (tl) { return [tl.name, tl.key]; }).concat([[t('vector.sc.hand_temp'), 'Space'], [t('vector.sc.swap_focus'), 'X'], [t('vector.sc.swap_colors'), 'Shift+X'], [t('vector.sc.default_paint'), 'D'], [t('vector.sc.paint_modes'), ', . /']]));
    function fromActs(ids) { return ids.map(function (id) { var a = A[id]; return [a.label.replace('…', ''), a.keyText || keyLabel(a.keys[0])]; }).filter(function (r) { return r[1]; }); }
    section(col2, t('vector.sc.file_edit'), fromActs(['file.new', 'file.open', 'file.place', 'file.save', 'file.saveAs', 'file.exportPNG', 'file.docSetup', 'edit.undo', 'edit.redo', 'edit.cut', 'edit.copy', 'edit.paste', 'edit.pasteFront', 'edit.pasteBack', 'edit.duplicate', 'select.all', 'select.none', 'edit.prefs']).concat([[t('ui.delete'), 'Del / Backspace'], [t('vector.sc.nudge'), t('vector.sc.arrow_keys')], [t('vector.sc.move_dialog'), 'Enter']]));
    section(col3, t('vector.sc.object_view'), fromActs(['object.group', 'object.ungroup', 'arrange.front', 'arrange.forward', 'arrange.backward', 'arrange.back', 'transform.move', 'object.lock', 'object.unlockAll', 'object.hide', 'object.showAll', 'compound.make', 'object.slopify', 'view.zoomIn', 'view.zoomOut', 'view.fit', 'view.actual', 'view.outline', 'view.rulers', 'view.grid', 'view.snapGrid', 'view.smart', 'view.guides', 'window.togglePanels', 'help.shortcuts']).concat([[t('vector.sc.constrain'), 'Shift'], [t('vector.sc.from_centre'), 'Alt'], [t('vector.tool.zoom'), t('vector.sc.zoom_keys', { mod: IS_MAC ? '⌘' : 'Ctrl' })]]));
    wrap.appendChild(col1); wrap.appendChild(col2); wrap.appendChild(col3);
    dialog({ title: t('vector.act.help_shortcuts'), body: wrap, cls: 'wide', buttons: [{ label: t('menu.close'), primary: true }] });
  }
  function aboutDialog() {
    var site = '\u0001', link = '<a href="../">Slopographic</a>';
    var path = '<b>' + esc(t('menu.file') + ' → ' + t('vector.about.download_app')) + '</b>';
    var body = '<div class="about"><div class="about-mark">' + I.drop + '</div><div><h3>SlopVector</h3><p class="mono">' + esc(t('vector.about.version', { build: String(SV.BUILD || '2026.10') })) + '</p>' +
      '<p>' + esc(t('vector.about.blurb')) + '</p>' +
      '<p>' + esc(t('vector.about.part_of', { site: site })).replace(site, link) + '</p>' +
      '<p class="sui-p">' + esc(t('vector.about.tip', { path: site })).replace(site, path) + '</p></div></div>';
    dialog({ title: t('vector.act.help_about'), body: body, buttons: [{ label: t('vector.about.download_app'), left: true, onClick: function () { IO.downloadApp(); } }, { label: t('menu.close'), primary: true }] });
  }

  $.aboutDialog = aboutDialog; $.dialog = dialog; $.docSetupDialog = docSetupDialog; $.newDocDialog = newDocDialog; $.pdfDialog = pdfDialog; $.prefsDialog = prefsDialog; $.rasterDialog = rasterDialog; $.saveAsDialog = saveAsDialog; $.shortcutsDialog = shortcutsDialog; $.transformDialog = transformDialog;
})();
