/* SlopVector — ui: control bindings and the tools panel */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function editPaint() { return $.editPaint.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function paintBG() { return $.paintBG.apply(this, arguments); }

  var L = SV.label;   // L(el, attr, keyOrText): the helpers below take a key (marked, follows a switch) or plain text

  /* ================= bindings ================= */
  var binds = {};
  function bind(group, fn) { (binds[group] = binds[group] || []).push(fn); }
  function runBinds(group) { (binds[group] || []).forEach(function (f) { try { f(); } catch (e) { if (window.console) console.warn(e); } }); }
  function setVal(inp, v) { if (document.activeElement !== inp) inp.value = v; }
  function numIn(group, opts) {
    var inp = h('input', { class: 'num mono' + (opts.cls ? ' ' + opts.cls : ''), type: 'number', step: opts.step || 1, min: opts.min, max: opts.max });
    L(inp, 'aria-label', opts.label); L(inp, 'title', opts.title || opts.label);
    inp.addEventListener('change', function () { var v = parseFloat(inp.value); if (isNaN(v)) return; if (opts.min != null) v = max(opts.min, v); if (opts.max != null) v = min(opts.max, v); opts.set(v); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { inp.blur(); } });
    bind(group, function () { var v = opts.get(); setVal(inp, v == null || isNaN(v) ? '' : (Math.round(v * 100) / 100)); inp.disabled = opts.enabled ? !opts.enabled() : false; });
    return inp;
  }
  function field(label, input, unit, title) { return L(h('label', { class: 'fld' }, [L(h('span', { class: 'fl' }), 'text', label), input, unit ? h('span', { class: 'fu', text: unit }) : null]), 'title', title); }
  function selIn(group, options, get, set, label) {
    var s = L(L(h('select', { class: 'sel' }), 'aria-label', label), 'title', label);
    options.forEach(function (o) { s.appendChild(L(h('option', { value: o[0] }), 'text', o[1])); });
    s.addEventListener('change', function () { set(s.value); });
    bind(group, function () { var v = get(); if (document.activeElement !== s) s.value = v == null ? '' : String(v); });
    return s;
  }
  /** Font family select backed by the shared picker: standard names, bundled and downloaded families, and a
   * Get more and Fonts buttons after it (the second and third children of the returned span). */
  function fontSel(group, get, set, label) {
    var s = L(L(h('select', { class: 'sel' }), 'aria-label', label), 'title', label);
    // The shared picker is stripped from the offline build; there the standard list stays.
    var pick = window.SlopFonts ? window.SlopFonts.attach(s, { legacy: Object.keys(SV.FONTS), onPick: function (f) { set(f); } }) : null;
    if (!pick) {
      Object.keys(SV.FONTS).forEach(function (f) { s.appendChild(h('option', { value: f, text: f })); });
      s.addEventListener('change', function () { set(s.value); });
    }
    bind(group, function () {
      var v = get();
      if (document.activeElement === s) return;
      if (v && !Array.prototype.some.call(s.options, function (o) { return o.value === v; })) s.add(new Option(v, v));
      s.value = v == null ? '' : String(v);
    });
    return h('span', { class: 'font-pick' }, [s, pick ? pick.button : null, pick ? pick.fontsButton : null]);
  }
  function seg(group, items, get, set, label) {
    var wrap = L(h('div', { class: 'seg', role: 'group' }), 'aria-label', label);
    items.forEach(function (it) {
      // it: [value, icon html or a key, title (key or text)]
      var b = h('button', { type: 'button', class: 'segb' });
      if (SV.isKey(it[1])) L(b, 'text', it[1]); else b.innerHTML = it[1];
      L(L(b, 'title', it[2] || it[0]), 'aria-label', it[2] || it[0]);
      b.addEventListener('click', function () { set(it[0]); });
      wrap.appendChild(b);
      bind(group, function () { b.classList.toggle('on', get() === it[0]); b.setAttribute('aria-pressed', get() === it[0] ? 'true' : 'false'); });
    });
    return wrap;
  }
  function ibtn(icon, title, onclick, cls) { var b = L(L(h('button', { type: 'button', class: 'ibtn' + (cls ? ' ' + cls : ''), html: icon }), 'title', title), 'aria-label', title); b.addEventListener('click', onclick); return b; }
  function btn(text, onclick, cls, title) { return L(L(h('button', { type: 'button', class: 'btn' + (cls ? ' ' + cls : ''), onclick: onclick }), 'text', text), 'title', title); }
  function chip(group, which, small) {
    var b = h('button', { type: 'button', class: 'chip ' + which + (small ? ' small' : ''), i18n: which === 'fill' ? { title: 'vector.paint.fill_chip_tip', 'aria-label': 'vector.paint.fill_color' } : { title: 'vector.paint.stroke_chip_tip', 'aria-label': 'vector.paint.stroke_color' } }, [h('span', { class: 'chip-in' })]);
    b.addEventListener('click', function () { editPaint(which, b); });
    bind(group, function () { paintBG(b.firstChild, SV.currentPaint(which)); });
    return b;
  }

  /* selection info */
  function firstLeaf() { var o = SV.selObjs()[0]; if (!o) return null; return SV.leaves(o).filter(function (l) { return l.style && l.type !== 'image'; })[0] || SV.leaves(o)[0] || o; }
  function firstOfType(t) { var r = null; SV.selObjs().forEach(function (o) { SV.leaves(o).forEach(function (l) { if (!r && l.type === t) r = l; }); }); return r; }
  function curStyle() { var l = firstLeaf(); return l && l.style ? l.style : S.style; }
  UI.curStyle = curStyle;
  var TYPES = ['path', 'rect', 'ellipse', 'polygon', 'star', 'text', 'image', 'group'];
  /** An object type's name: vector.obj.<type>, 'Object' for an unknown one. */
  function typeName(type) { return TYPES.indexOf(type) >= 0 ? SV.t(`vector.obj.${type}`) : SV.t('vector.obj.object'); }
  function selLabel() {
    var objs = SV.selObjs();
    if (!objs.length) return SV.t('vector.obj.no_selection');
    if (objs.length > 1) return SV.t('vector.obj.n_objects', { n: objs.length });
    var o = objs[0];
    if (o.type === 'path' && o.subpaths.length > 1) return SV.t('vector.obj.compound');
    if (o.type === 'path' && o.subpaths.length === 1 && o.subpaths[0].pts.length === 2 && !o.subpaths[0].closed) return SV.t('vector.obj.line');
    if (o.type === 'rect' && o.rx > 0) return SV.t('vector.obj.rrect');
    return typeName(o.type);
  }
  SV.objDisplayName = function (o) {
    if (o.name) return o.name;
    if (o.type === 'text') return o.text.split('\n')[0].slice(0, 24) || '<' + typeName('text') + '>';
    return '<' + typeName(o.type) + '>';
  };

  /* ================= toolbar ================= */
  function buildToolbar() {
    var tb = document.getElementById('toolbar');
    var grid = h('div', { class: 'tools', role: 'toolbar', i18n: { 'aria-label': 'vector.toolbar.tools' } });
    SV.TOOL_LIST.forEach(function (t) {
      var b = h('button', { type: 'button', class: 'tool', 'data-tool': t.id, html: SV.ICONS[t.id] });
      SV.live(function () { var s = SV.t('vector.toolbar.tool_tip', { name: t.name, key: t.key }); b.title = s; b.setAttribute('aria-label', s); });
      b.addEventListener('pointerdown', function (e) { if (e.button === 0) { e.preventDefault(); SV.setTool(t.id); } });
      b.addEventListener('click', function (e) { if (e.detail === 0) SV.setTool(t.id); });
      grid.appendChild(b);
      bind('toolbar', function () { var on = S.tool === t.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    });
    tb.appendChild(grid);
    // fill / stroke widget
    var fs = h('div', { class: 'fswidget', i18n: { 'aria-label': 'vector.toolbar.fill_stroke' } });
    var fillB = h('button', { type: 'button', class: 'fs fill', i18n: { title: 'vector.toolbar.fill_tip', 'aria-label': 'vector.paint.fill' } }, [h('span', { class: 'chip-in' })]);
    var strokeB = h('button', { type: 'button', class: 'fs stroke', i18n: { title: 'vector.toolbar.stroke_tip', 'aria-label': 'vector.paint.stroke' } }, [h('span', { class: 'chip-in' }), h('span', { class: 'hole' })]);
    function fsClick(which, el) { return function () { if (S.focus === which) editPaint(which, el); else { S.focus = which; SV.requestRender(true); } }; }
    fillB.addEventListener('click', fsClick('fill', fillB));
    strokeB.addEventListener('click', fsClick('stroke', strokeB));
    fillB.addEventListener('contextmenu', function (e) { e.preventDefault(); S.focus = 'fill'; editPaint('fill', fillB); });
    strokeB.addEventListener('contextmenu', function (e) { e.preventDefault(); S.focus = 'stroke'; editPaint('stroke', strokeB); });
    var swapB = h('button', { type: 'button', class: 'fs-mini swapb', i18n: { title: 'vector.toolbar.swap_tip', 'aria-label': 'vector.toolbar.swap' }, html: '<svg viewBox="0 0 16 16"><path d="M3 5h7a3 3 0 0 1 3 3v5M11 11l2 2 2-2M5 3L3 5l2 2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>', onclick: function () { SV.swapFillStroke(); } });
    var defB = h('button', { type: 'button', class: 'fs-mini defb', i18n: { title: 'vector.toolbar.default_tip', 'aria-label': 'vector.toolbar.default' }, html: '<svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="7" height="7" fill="#fff" stroke="#000"/><rect x="5.5" y="5.5" width="7" height="7" fill="none" stroke="#000" stroke-width="2"/></svg>', onclick: function () { SV.defaultFillStroke(); } });
    fs.appendChild(h('div', { class: 'fs-stack' }, [strokeB, fillB, swapB, defB]));
    var modes = h('div', { class: 'fs-modes' }, [
      h('button', { type: 'button', class: 'fs-mode', i18n: { title: 'vector.toolbar.mode_color_tip', 'aria-label': 'vector.toolbar.mode_color' }, html: '<span class="m-solid"></span>', onclick: function () { var p = SV.currentPaint(S.focus); SV.applyStyle(S.focus, typeof p === 'string' ? p : (p && p.stops ? p.stops[p.stops.length - 1].c : '#d4ff3a')); } }),
      h('button', { type: 'button', class: 'fs-mode', i18n: { title: 'vector.toolbar.mode_gradient_tip', 'aria-label': 'vector.paint.gradient' }, html: '<span class="m-grad"></span>', onclick: function () { var p = SV.currentPaint(S.focus); SV.applyStyle(S.focus, p && typeof p === 'object' ? p : SV.defaultGradient(p)); } }),
      h('button', { type: 'button', class: 'fs-mode', i18n: { title: 'vector.toolbar.mode_none_tip', 'aria-label': 'ui.none' }, html: '<span class="m-none"></span>', onclick: function () { SV.applyStyle(S.focus, null); } })
    ]);
    fs.appendChild(modes);
    tb.appendChild(fs);
    bind('toolbar', function () {
      paintBG(fillB.firstChild, SV.currentPaint('fill')); paintBG(strokeB.firstChild, SV.currentPaint('stroke'));
      fillB.classList.toggle('front', S.focus === 'fill'); strokeB.classList.toggle('front', S.focus === 'stroke');
    });
  }

  $.fontSel = fontSel; $.bind = bind; $.binds = binds; $.btn = btn; $.buildToolbar = buildToolbar; $.chip = chip; $.curStyle = curStyle; $.field = field; $.firstOfType = firstOfType; $.ibtn = ibtn; $.numIn = numIn; $.runBinds = runBinds; $.seg = seg; $.selIn = selIn; $.selLabel = selLabel; $.setVal = setVal;
})();
