/* SlopVector — ui: Layers panel */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function bind() { return $.bind.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function ibtn() { return $.ibtn.apply(this, arguments); }
  var A = $.A;
  var I = $.I;
  var panelEls = $.panelEls;

  /* ---------- Layers ---------- */
  UI.st.layersSig = ''; UI.st.renaming = null;
  var expandedObjs = {};
  function buildLayers() {
    var body = panelEls.layers.body;
    var list = h('div', { class: 'layers', id: 'layersList', role: 'tree', i18n: { 'aria-label': 'vector.panel.layers' } });
    var foot = h('div', { class: 'layers-foot' }, [
      h('span', { class: 'lcount mono', id: 'layerCount' }), h('span', { class: 'grow' }),
      ibtn(I.plus, 'vector.layers.new', function () { newLayer(); }),
      ibtn(I.trash, 'vector.layers.delete', function () { deleteLayerOrSel(); })
    ]);
    body.appendChild(list); body.appendChild(foot);
    list.addEventListener('click', onLayerClick);
    list.addEventListener('dblclick', onLayerDbl);
    list.addEventListener('pointerdown', onLayerDown);
    bind('layers', renderLayers);
  }
  function newLayer() {
    var n = S.doc.layers.length + 1, L = SV.mk.layer('Layer ' + n, SV.LAYER_COLORS[(n - 1) % SV.LAYER_COLORS.length]); // i18n-ignore: a name stored in the document
    var idx = S.doc.layers.indexOf(SV.activeLayer());
    S.doc.layers.splice(idx + 1, 0, L); S.activeLayer = L.id;
    SV.commit('new layer');
  }
  function deleteLayerOrSel() {
    if (S.sel.length) { C.deleteSel(); return; }
    if (S.doc.layers.length <= 1) return UI.toast(SV.t('vector.layers.need_one'));
    var L = SV.activeLayer(), i = S.doc.layers.indexOf(L);
    S.doc.layers.splice(i, 1); S.activeLayer = S.doc.layers[max(0, i - 1)].id;
    SV.commit('delete layer');
  }
  function layerSigNow() {
    return JSON.stringify([document.documentElement.lang, S.doc.layers.map(function (L) { return [L.id, L.name, L.hidden, L.locked, L.expanded, L.color, sigKids(L.children)]; }), S.sel, S.activeLayer, expandedObjs, UI.st.renaming]);
  }
  function sigKids(arr) { return arr.map(function (o) { return [o.id, o.name, o.hidden, o.locked, o.type, o.type === 'text' ? o.text.slice(0, 24) : '', o.type === 'group' ? sigKids(o.children) : 0]; }); }
  function renderLayers() {
    var ae = document.activeElement;
    if (UI.st.renaming && ae && ae.classList && ae.classList.contains('lrename')) return;
    var sig = layerSigNow(); if (sig === UI.st.layersSig) return; UI.st.layersSig = sig;
    var list = document.getElementById('layersList'); list.innerHTML = '';
    var selSet = new Set(S.sel), anySelIn = function (o) { if (selSet.has(o.id)) return true; return o.type === 'group' && o.children.some(anySelIn); };
    for (var li = S.doc.layers.length - 1; li >= 0; li--) {
      var L = S.doc.layers[li];
      var lsel = L.children.some(anySelIn);
      list.appendChild(row(L, 'layer', 0, L.color, L.id === S.activeLayer, lsel, L.expanded, L.children.length > 0, L));
      if (L.expanded) addKids(list, L.children, 1, L, selSet, anySelIn);
    }
    document.getElementById('layerCount').textContent = SV.t('vector.layers.count', { n: S.doc.layers.length });
    var ri = list.querySelector('.lrename');
    if (ri) { ri.focus(); ri.select(); }
  }
  function addKids(list, arr, depth, L, selSet, anySelIn) {
    for (var i = arr.length - 1; i >= 0; i--) {
      var o = arr[i], isG = o.type === 'group', exp = !!expandedObjs[o.id];
      list.appendChild(row(o, 'obj', depth, L.color, false, selSet.has(o.id), exp, isG, L, anySelIn(o) && !selSet.has(o.id)));
      if (isG && exp) addKids(list, o.children, depth + 1, L, selSet, anySelIn);
    }
  }
  function row(o, kind, depth, color, active, selected, expanded, canExpand, L, partial) {
    var name = kind === 'layer' ? o.name : SV.objDisplayName(o);
    var r = h('div', { class: 'lrow ' + kind + (active ? ' active' : '') + (selected && kind === 'obj' ? ' selected' : '') + (o.hidden ? ' is-hidden' : '') + (o.locked ? ' is-locked' : ''), 'data-id': o.id, 'data-kind': kind, role: 'treeitem', 'aria-selected': selected ? 'true' : 'false', style: { '--depth': depth, '--lc': color } });
    var t = SV.t;
    r.appendChild(h('button', { type: 'button', class: 'leye', title: o.hidden ? t('vector.layers.show') : t('vector.layers.hide'), 'aria-label': o.hidden ? t('vector.layers.show_name', { name: name }) : t('vector.layers.hide_name', { name: name }), html: o.hidden ? I.eyeOff : I.eye }));
    r.appendChild(h('button', { type: 'button', class: 'llock' + (o.locked ? ' on' : ''), title: o.locked ? t('vector.layers.unlock') : t('vector.props.lock'), 'aria-label': o.locked ? t('vector.layers.unlock_name', { name: name }) : t('vector.layers.lock_name', { name: name }), html: o.locked ? I.lock : I.unlock }));
    r.appendChild(h('span', { class: 'lind' }));
    r.appendChild(canExpand ? h('button', { type: 'button', class: 'ltw' + (expanded ? ' open' : ''), 'aria-label': expanded ? t('vector.layers.collapse') : t('vector.layers.expand'), html: I.caret }) : h('span', { class: 'ltw-sp' }));
    if (kind === 'layer') r.appendChild(h('span', { class: 'lcolor' }));
    else r.appendChild(h('span', { class: 'ltype', html: typeGlyph(o) }));
    if (UI.st.renaming === o.id) {
      var inp = h('input', { class: 'lrename', type: 'text', value: o.name || name, 'aria-label': t('ui.rename') });
      var done = function (save) { if (UI.st.renaming !== o.id) return; UI.st.renaming = null; UI.st.layersSig = ''; if (save && inp.value.trim()) { o.name = inp.value.trim(); SV.commit('rename'); } else { UI.st.layersSig = ''; SV.requestRender(true); } };
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      inp.addEventListener('blur', function () { done(true); });
      r.appendChild(inp);
    } else r.appendChild(h('span', { class: 'lname', text: name, title: name }));
    r.appendChild(h('button', { type: 'button', class: 'ltarget' + (selected ? ' on' : '') + (partial ? ' part' : ''), title: kind === 'layer' ? t('vector.layers.select_all') : t('vector.layers.select'), 'aria-label': t('vector.layers.select_name', { name: name }) }));
    return r;
  }
  function typeGlyph(o) {
    var m = { path: '<path d="M4 18C8 6 16 18 20 6"/>', rect: '<rect x="5" y="7" width="14" height="10"/>', ellipse: '<ellipse cx="12" cy="12" rx="7" ry="5"/>', polygon: '<path d="M12 5l7 4v6l-7 4-7-4V9z"/>', star: '<path d="M12 4l2.3 5 5.2.6-3.9 3.5 1.1 5.2L12 15.6l-4.7 2.7 1.1-5.2-3.9-3.5 5.2-.6z"/>', text: '<path d="M6 7V5h12v2M12 5v14M9 19h6"/>', image: '<rect x="4" y="5" width="16" height="14"/><path d="M4 16l5-5 4 4 2-2 5 5"/>', group: '<rect x="4" y="4" width="10" height="10"/><rect x="10" y="10" width="10" height="10"/>' };
    return '<svg viewBox="0 0 24 24" class="ic">' + (m[o.type] || m.path) + '</svg>';
  }
  function findLayerOrObj(id) { var L = SV.getLayer(id); if (L) return { kind: 'layer', o: L }; var o = getObj(id); return o ? { kind: 'obj', o: o } : null; }
  var layerDrag = null, lastRowClick = { id: null, t: 0 };
  function onLayerClick(e) {
    if (layerDrag && layerDrag.moved) return;
    var r = e.target.closest('.lrow'); if (!r) return;
    var id = r.getAttribute('data-id'), f = findLayerOrObj(id); if (!f) return;
    var now = Date.now(), isDbl = lastRowClick.id === id && now - lastRowClick.t < 450 && !!e.target.closest('.lname');
    lastRowClick = { id: id, t: isDbl ? 0 : now };
    if (isDbl) { UI.st.renaming = id; UI.st.layersSig = ''; renderLayers(); return; }
    var o = f.o;
    if (e.target.closest('.leye')) { o.hidden = !o.hidden; if (o.hidden) S.sel = S.sel.filter(function (s) { var obj = getObj(s); return obj && SV.isEditable(obj); }); SV.commit(o.hidden ? 'hide' : 'show'); return; }
    if (e.target.closest('.llock')) { o.locked = !o.locked; if (o.locked) S.sel = S.sel.filter(function (s) { var obj = getObj(s); return obj && SV.isEditable(obj); }); SV.commit(o.locked ? 'lock' : 'unlock'); return; }
    if (e.target.closest('.ltw')) { if (f.kind === 'layer') { o.expanded = !o.expanded; SV.requestRender(true); } else { expandedObjs[id] = !expandedObjs[id]; SV.requestRender(true); } return; }
    if (f.kind === 'layer') {
      S.activeLayer = id;
      if (e.target.closest('.ltarget')) { if (o.hidden || o.locked) return UI.toast(o.hidden ? SV.t('vector.layers.is_hidden') : SV.t('vector.layers.is_locked'), 'warn'); SV.select(o.children.filter(function (c) { return !c.hidden && !c.locked; }).map(function (c) { return c.id; })); return; }
      SV.requestRender(true); return;
    }
    if (!SV.isEditable(o)) { UI.toast(o.locked ? SV.t('vector.layers.obj_locked') : SV.t('vector.layers.obj_hidden'), 'warn'); return; }
    if (e.shiftKey || e.ctrlKey || e.metaKey) { var ns = S.sel.slice(), k = ns.indexOf(id); if (k >= 0) ns.splice(k, 1); else ns.push(id); SV.select(ns); }
    else SV.select([id]);
    if (S.tool === 'direct') { S.psel = {}; SV.leaves(o).forEach(function (l) { SV.selectAllPoints(l); }); }
  }
  function onLayerDbl(e) {
    var r = e.target.closest('.lrow'); if (!r || !e.target.closest('.lname') || UI.st.renaming) return;
    UI.st.renaming = r.getAttribute('data-id'); UI.st.layersSig = ''; renderLayers();
  }
  function onLayerDown(e) {
    var r = e.target.closest('.lrow'); if (!r || e.target.closest('button') || e.target.closest('input') || e.button !== 0) return;
    layerDrag = { id: r.getAttribute('data-id'), kind: r.getAttribute('data-kind'), y0: e.clientY, x0: e.clientX, moved: false, pid: e.pointerId };
    var list = document.getElementById('layersList');
    var mv = function (ev) {
      if (!layerDrag) return;
      if (!layerDrag.moved && abs(ev.clientY - layerDrag.y0) < 5) return;
      layerDrag.moved = true; ev.preventDefault();
      list.classList.add('dragging');
      var el = document.elementFromPoint(ev.clientX, ev.clientY), tr = el && el.closest ? el.closest('.lrow') : null;
      list.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(function (x) { x.classList.remove('drop-before', 'drop-after', 'drop-into'); });
      layerDrag.target = null;
      if (!tr || tr.getAttribute('data-id') === layerDrag.id) return;
      var rr = tr.getBoundingClientRect(), rel = (ev.clientY - rr.top) / rr.height, tk = tr.getAttribute('data-kind');
      var pos = rel < 0.5 ? 'before' : 'after';
      if (layerDrag.kind === 'obj' && tk === 'layer' && rel > 0.25 && rel < 0.75) pos = 'into';
      if (layerDrag.kind === 'layer' && tk !== 'layer') return;
      tr.classList.add('drop-' + pos);
      layerDrag.target = { id: tr.getAttribute('data-id'), kind: tk, pos: pos };
    };
    var up = function () {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      list.classList.remove('dragging');
      list.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(function (x) { x.classList.remove('drop-before', 'drop-after', 'drop-into'); });
      var d = layerDrag;
      setTimeout(function () { layerDrag = null; }, 0);
      if (!d || !d.moved || !d.target) return;
      applyLayerDrop(d);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }
  function applyLayerDrop(d) {
    var tgt = d.target;
    if (d.kind === 'layer') {
      var Ls = S.doc.layers, src = SV.getLayer(d.id), dst = SV.getLayer(tgt.id); if (!src || !dst) return;
      Ls.splice(Ls.indexOf(src), 1);
      var di = Ls.indexOf(dst);
      Ls.splice(tgt.pos === 'before' ? di + 1 : di, 0, src);
      SV.commit('reorder layers'); return;
    }
    var f = SV.find(d.id); if (!f) return;
    var obj = f.obj;
    if (tgt.kind === 'obj') { var tObj = getObj(tgt.id); if (!tObj) return; if ((function c(o) { if (o.id === tgt.id) return true; return o.type === 'group' && o.children.some(c); })(obj)) return; }
    f.arr.splice(f.idx, 1);
    if (tgt.kind === 'layer') {
      var L = SV.getLayer(tgt.id);
      if (tgt.pos === 'into' || tgt.pos === 'after') L.children.push(obj); else { var li = S.doc.layers.indexOf(L), above = S.doc.layers[li + 1] || L; above.children.unshift(obj); }
      L.expanded = true;
    } else {
      var tf = SV.find(tgt.id); if (!tf) { f.arr.splice(f.idx, 0, obj); return; }
      tf.arr.splice(tgt.pos === 'before' ? tf.idx + 1 : tf.idx, 0, obj);
    }
    SV.commit('reorder');
  }

  $.buildLayers = buildLayers; $.newLayer = newLayer; $.renderLayers = renderLayers; $.row = row;
})();
