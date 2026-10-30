/* SlopVector — ui: paint swatches and the colour picker */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function btn() { return $.btn.apply(this, arguments); }
  function dialog() { return $.dialog.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function row() { return $.row.apply(this, arguments); }
  function showPanel() { return $.showPanel.apply(this, arguments); }
  function swatches() { return $.swatches.apply(this, arguments); }

  /* ================= paint helpers ================= */
  function gradCSS(g) {
    var stops = g.stops.slice().sort(function (a, b) { return a.o - b.o; }).map(function (s) { return rgba(s.c, s.a == null ? 1 : s.a) + ' ' + round(s.o * 100) + '%'; }).join(', ');
    if (g.type === 'radial') return 'radial-gradient(circle at ' + round((g.fx != null ? g.fx : g.cx) * 100) + '% ' + round((g.fy != null ? g.fy : g.cy) * 100) + '%, ' + stops + ')';
    var ang = Math.atan2((g.y2 - g.y1), (g.x2 - g.x1)) * 180 / PI + 90;
    return 'linear-gradient(' + round(ang) + 'deg, ' + stops + ')';
  }
  UI.gradCSS = gradCSS;
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function paintBG(el, p) {
    el.classList.toggle('none', !p);
    el.style.background = !p ? '' : typeof p === 'string' ? p : gradCSS(p);
  }
  UI.paintBG = paintBG;
  function paintLabel(p) { if (!p) return SV.t('ui.none'); if (typeof p === 'string') return p.toUpperCase(); return p.type === 'radial' ? SV.t('vector.paint.radial_gradient') : SV.t('vector.paint.linear_gradient'); }

  /* ================= colour conversions & picker ================= */
  function hexToRgb(hex) {
    hex = String(hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex.slice(0, 6), 16); if (isNaN(n)) n = 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + SV.clamp(round(v), 0, 255).toString(16)).slice(-2); }).join(''); }
  UI.hexToRgb = hexToRgb; UI.rgbToHex = rgbToHex;
  UI.st.picker = null;
  // Recent colours and the palette live in localStorage (shared picker: list() / add()).
  var PALETTE = ['#0a0a0a', '#ffffff', '#f1ede4', '#d4ff3a', '#ff3d8b', '#7a5cff', '#00c2b8', '#ff8a00', '#ffe14d', '#3a7bff', '#ff4d4d', '#2ecc71'];
  var RECENTS = {
    list: function () { try { return JSON.parse(SV.lsGet('slopvector.recentColors') || '[]') || []; } catch (e) { return []; } },
    add: function (hex) { SV.lsSet('slopvector.recentColors', JSON.stringify(SlopColor.recentAdd(RECENTS.list(), hex, 12))); },
  };
  /** Records a colour used outside the picker (the eyedropper) in the recent row. */
  UI.noteRecent = function (hex) { if (hex) RECENTS.add(hex); };
  UI.closePicker = function (cancel) {
    if (!UI.st.picker) return false;
    var p = UI.st.picker; UI.st.picker = null;
    p.el.remove();
    document.removeEventListener('pointerdown', p.outside, true);
    if (!cancel && p.changed && p.hex) p.cp.commit();
    if (p.onDone) p.onDone(cancel ? undefined : p.value, p.changed);
    return true;
  };
  // opts: {allowNone, allowGradient, title, alpha}. onInput runs on every change (live); onDone once when closed.
  UI.pickColor = function (anchor, initial, onInput, onDone, opts) {
    UI.closePicker();
    opts = opts || {};
    var hex = typeof initial === 'string' ? initial : (initial && initial.stops ? initial.stops[0].c : '#d4ff3a');
    var el = h('div', { class: 'picker', role: 'dialog', 'aria-label': opts.title || SV.t('vector.paint.picker') });
    var head = h('div', { class: 'picker-head' }, [h('span', { text: opts.title || SV.t('vector.paint.color') }), h('button', { class: 'xbtn', type: 'button', 'aria-label': SV.t('menu.close'), html: '&times;', onclick: function () { UI.closePicker(); } })]);
    var st = { el: el, hex: hex, value: initial, changed: false, onDone: onDone };
    st.cp = SlopColorPicker.create({
      value: hex, recents: RECENTS, palette: PALETTE, alpha: opts.alpha !== false,
      onChange: function (c) { st.hex = c; st.value = c; st.changed = true; if (onInput) onInput(c); },
    });
    var foot = h('div', { class: 'pk-foot' });
    if (opts.allowNone) foot.appendChild(h('button', { class: 'btn small', type: 'button', text: SV.t('ui.none'), onclick: function () { st.value = null; st.changed = true; onInput && onInput(null); UI.closePicker(); } }));
    if (opts.allowGradient) foot.appendChild(h('button', { class: 'btn small', type: 'button', text: SV.t('vector.paint.gradient_dots'), onclick: function () { UI.closePicker(); opts.allowGradient(); } }));
    foot.appendChild(h('span', { class: 'grow' }));
    foot.appendChild(h('button', { class: 'btn small primary', type: 'button', text: SV.t('ui.done'), onclick: function () { UI.closePicker(); } }));
    el.appendChild(head); el.appendChild(st.cp.el); el.appendChild(foot);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') UI.closePicker(); });
    document.body.appendChild(el);
    // position
    var r = anchor.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight;
    var left = r.left, top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = max(8, r.top - ph - 6);
    el.style.left = max(8, left) + 'px'; el.style.top = max(8, top) + 'px';
    st.outside = function (e) { if (!el.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) UI.closePicker(); };
    setTimeout(function () { document.addEventListener('pointerdown', st.outside, true); }, 0);
    UI.st.picker = st;
    return st;
  };
  // edit fill/stroke of selection via UI.st.picker
  function editPaint(which, anchor) {
    S.focus = which;
    var cur = SV.currentPaint(which), before = SV.snapshot();
    UI.pickColor(anchor, cur, function (hex) {
      SV.applyStyle(which, hex, { commit: false });
    }, function (val, changed) {
      if (changed) SV.commit('color ' + which); else SV.requestRender(true);
    }, { allowNone: true, title: which === 'fill' ? SV.t('vector.paint.fill') : SV.t('vector.paint.stroke'), allowGradient: function () { var p = SV.currentPaint(which); if (!p || typeof p !== 'object') SV.applyStyle(which, SV.defaultGradient(p)); showPanel('gradient'); } });
    void before;
  }
  UI.editPaint = editPaint;

  $.editPaint = editPaint; $.gradCSS = gradCSS; $.hexToRgb = hexToRgb; $.paintBG = paintBG; $.paintLabel = paintLabel; $.rgbToHex = rgbToHex;
})();
