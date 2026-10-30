/* Slop PDF — right-hand properties panel: the panel host plus small form helpers. Each tool's
   panel registers itself in SP.panels.PANELS (see tools/*-panel*.js). */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, h = U.h, t = U.t;
  var P = SP.panels = {};
  var root, main, current = null, refreshers = [];

  /* ------------------------------------------------------------ helpers */
  function section(title, kids, opts) {
    opts = opts || {};
    return h('section', { class: 'pp-sec' + (opts.cls ? ' ' + opts.cls : '') }, title ? h('h3', { class: 'pp-h' }, title) : null, kids);
  }
  function row(label, ctrl, hint) { return h('label', { class: 'pp-row' }, h('span', { class: 'pp-label' }, label), ctrl, hint ? h('span', { class: 'pp-hint' }, hint) : null); }
  function btn(label, icon, onclick, cls, title) {
    return h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick: onclick, title: title || null, html: (icon ? U.icon(icon) : '') + '<span>' + U.esc(label) + '</span>' });
  }
  function seg(options, value, onChange, label) {
    var g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || null });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', role: 'radio', class: 'seg-b' + (String(o[0]) === String(value) ? ' on' : ''), 'aria-checked': String(o[0]) === String(value) ? 'true' : 'false', title: o[2] || null, html: o[1] });
      b.addEventListener('click', function () {
        U.$$('.seg-b', g).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); });
        b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(o[0]);
      });
      g.appendChild(b);
    });
    return g;
  }
  function select(options, value, onChange) {
    var s = h('select', { class: 'inp' }, options.map(function (o) { return h('option', { value: o[0], selected: String(o[0]) === String(value) }, o[1]); }));
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  function num(value, min, max, step, onChange) {
    var i = h('input', { class: 'inp num', type: 'number', value: value, min: min, max: max, step: step || 1, inputmode: 'decimal' }); // i18n-ignore
    i.addEventListener('input', function () { var v = parseFloat(i.value); if (!isNaN(v)) onChange(U.clamp(v, min, max)); });
    return i;
  }
  function text(value, onChange, ph, onCommit) {
    var i = h('input', { class: 'inp', type: 'text', value: value || '', placeholder: ph || '' });
    i.addEventListener('input', function () { onChange(i.value); });
    if (onCommit) i.addEventListener('change', function () { onCommit(i.value); });
    return i;
  }
  function slider(value, min, max, step, onChange, fmt) {
    var out = h('output', { class: 'sl-out' }, fmt ? fmt(value) : String(value));
    var r = h('input', { type: 'range', class: 'sl', min: min, max: max, step: step, value: value });
    r.addEventListener('input', function () { var v = parseFloat(r.value); out.textContent = fmt ? fmt(v) : String(v); onChange(v); });
    return h('div', { class: 'sl-wrap' }, r, out);
  }
  var SWATCHES = ['#111111', '#ffffff', '#e0245e', '#ff9f1c', '#ffe14d', '#c6f432', '#2ee6a8', '#1d4ed8', '#7c3aed'];
  function colorPicker(value, onChange, allowNone) {
    var wrap = h('div', { class: 'swatches' });
    var inp = h('input', { type: 'color', class: 'sw-input', value: value && value !== 'none' ? value : '#000000', 'aria-label': t('pdf.app.colour_custom') });
    function mark(v) { U.$$('.sw', wrap).forEach(function (s) { s.classList.toggle('on', s.dataset.c === v); }); }
    if (allowNone) {
      var n = h('button', { type: 'button', class: 'sw sw-none', 'data-c': 'none', title: t('ui.none'), 'aria-label': t('pdf.app.colour_none') });
      n.addEventListener('click', function () { mark('none'); onChange('none'); }); wrap.appendChild(n);
    }
    SWATCHES.forEach(function (c) {
      var s = h('button', { type: 'button', class: 'sw', 'data-c': c, title: c, 'aria-label': t('pdf.app.colour_n', { c: c }), style: { '--c': c } });
      s.addEventListener('click', function () { mark(c); inp.value = c; onChange(c); });
      wrap.appendChild(s);
    });
    inp.addEventListener('input', function () { mark(inp.value); onChange(inp.value); });
    wrap.appendChild(inp);
    mark(value || 'none');
    return wrap;
  }
  function check(label, checked, onChange) {
    var c = h('input', { type: 'checkbox', checked: !!checked });
    c.addEventListener('change', function () { onChange(c.checked); });
    return h('label', { class: 'chk' }, c, h('span', null, label));
  }
  function note(text, cls) { return h('p', { class: 'pp-note' + (cls ? ' ' + cls : '') }, text); }
  function needPages() {
    if (E.state.pages.length) return null;
    return section(null, [note(t('pdf.app.need_pages')), h('div', { class: 'btn-row' }, btn(t('pdf.app.open_pdf'), 'open', function () { SP.app.openDialog(); }, 'primary'), btn(t('pdf.app.try_sample'), 'sparkle', function () { SP.app.loadSample(); }))]);
  }
  P.helpers = { section: section, row: row, btn: btn, seg: seg, select: select, num: num, text: text, slider: slider, colorPicker: colorPicker, check: check, note: note, needPages: needPages, onRefresh: function (fn) { onRefresh(fn); } };

  /* -------------------------------------------------------------- core */
  /** The sidebar: the tool's panel (main, rebuilt on each show) above the dock (ui/dock.js: Layers, History). */
  P.init = function (el) { root = el; main = h('div', { class: 'pp-main' }); root.appendChild(main); if (SP.dock) SP.dock.mount(root); };
  P.show = function (tool) {
    current = tool; refreshers = [];
    main.innerHTML = '';
    var def = PANELS[tool] || PANELS.organize;
    main.appendChild(h('div', { class: 'pp-title' }, h('span', { html: U.icon(def.icon) }), h('h2', null, typeof def.title === 'function' ? def.title() : def.title))); // a function: the title in the current language
    var body = h('div', { class: 'pp-body' });
    main.appendChild(body);
    def.build(body);
  };
  /** Called on state changes; panels register small refreshers instead of rebuilding (keeps focus). */
  P.refresh = function (reason) { refreshers.forEach(function (fn) { try { fn(reason); } catch (e) { console.warn(e); } }); if (SP.dock) SP.dock.refresh(); };
  P.rebuild = function () { if (current) P.show(current); };
  // A language switch: the panel on screen is built again in the new words (its builder calls t()), and the dock follows
  U.onLang(function () { P.rebuild(); if (SP.dock && SP.dock.relabel) SP.dock.relabel(); });
  function onRefresh(fn) { refreshers.push(fn); fn(); }

  var PANELS = {};
  P.PANELS = PANELS;
})();
