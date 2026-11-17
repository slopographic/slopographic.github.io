/* SlopVector — ui: status bar and rulers */
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
  function keyLabel() { return $.keyLabel.apply(this, arguments); }
  function setVal() { return $.setVal.apply(this, arguments); }

  /* ================= status bar ================= */
  var curPos = null;
  UI.setCursorPos = function (p) { curPos = p; var el = document.getElementById('sbPos'); if (el) el.textContent = 'X ' + SV.fmtNum(p.x) + '  Y ' + SV.fmtNum(p.y); };
  function buildStatus() {
    var sb = document.getElementById('statusbar');
    var zin = h('input', { class: 'zin mono', id: 'zoomIn', i18n: { 'aria-label': 'vector.status.zoom_level' }, type: 'text' });
    zin.addEventListener('change', function () { var v = parseFloat(zin.value); if (v > 0) SV.zoomTo(v / 100); zin.blur(); });
    zin.addEventListener('keydown', function (e) { if (e.key === 'Enter') zin.dispatchEvent(new Event('change')); });
    var zsel = h('select', { class: 'zsel', i18n: { 'aria-label': 'vector.status.zoom_presets' } }, [h('option', { value: '', text: '' })].concat([3200, 1600, 800, 400, 200, 150, 100, 66.67, 50, 33.33, 25, 12.5].map(function (z) { return h('option', { value: z, text: z + '%' }); })).concat([h('option', { value: 'fit', i18n: { text: 'vector.props.fit_artboard' } })]));
    zsel.addEventListener('change', function () { if (zsel.value === 'fit') SV.fitArtboard(); else if (zsel.value) SV.zoomTo(parseFloat(zsel.value) / 100); zsel.value = ''; });
    var zOut = h('button', { type: 'button', class: 'sbb', i18n: { 'aria-label': 'ui.zoom_out' }, text: '−', onclick: function () { SV.zoomStep(-1); } });
    var zIn = h('button', { type: 'button', class: 'sbb', i18n: { 'aria-label': 'ui.zoom_in' }, text: '+', onclick: function () { SV.zoomStep(1); } });
    SV.live(function () { zOut.title = SV.t('vector.status.zoom_out_tip', { key: keyLabel('mod+-') }); zIn.title = SV.t('vector.status.zoom_in_tip', { key: keyLabel('mod+=') }); });
    sb.appendChild(h('div', { class: 'sb-zoom' }, [zOut, zin, zsel, zIn]));
    sb.appendChild(h('span', { class: 'sb-item mono', id: 'sbArt' }));
    sb.appendChild(h('span', { class: 'sb-item mono', id: 'sbPos', text: 'X 0  Y 0' }));
    sb.appendChild(h('span', { class: 'sb-item', id: 'sbSel' }));
    sb.appendChild(h('span', { class: 'grow' }));
    sb.appendChild(h('span', { class: 'sb-item sb-flags', id: 'sbFlags' }));
    sb.appendChild(h('span', { class: 'sb-item sb-tool', id: 'sbTool' }));
    bind('status', function () {
      setVal(zin, (Math.round(S.view.zoom * 10000) / 100) + '%');
      document.getElementById('sbArt').textContent = SV.t('vector.status.artboard', { w: SV.fmtNum(S.doc.width), h: SV.fmtNum(S.doc.height) });
      var n = S.sel.length;
      document.getElementById('sbSel').textContent = n ? SV.t('vector.status.selected', { n: n }) : '';
      var flags = [];
      if (S.prefs.smart) flags.push(SV.t('vector.act.view_smart')); if (S.prefs.snapGrid) flags.push(SV.t('vector.status.snap')); if (S.prefs.outline) flags.push(SV.t('vector.act.view_outline'));
      document.getElementById('sbFlags').textContent = flags.join(' · ');
      var t = SV.TOOL_LIST.filter(function (x) { return x.id === S.tool; })[0];
      document.getElementById('sbTool').textContent = t ? t.name : '';
      var dirty = SV.isDirty();
      var title = S.doc.name + (dirty ? ' •' : '');
      document.getElementById('docTab').innerHTML = '<span class="dt-name">' + esc(S.doc.name) + '.svg</span><span class="dt-meta mono">@ ' + (Math.round(S.view.zoom * 1000) / 10) + '% (RGB/' + esc(S.prefs.outline ? SV.t('vector.act.view_outline') : SV.t('vector.status.preview')) + ')</span>' + (dirty ? '<span class="dt-dirty" title="' + esc(SV.t('vector.status.unsaved')) + '">●</span>' : '');
      document.getElementById('docTitle').textContent = title;
      document.title = (dirty ? '• ' : '') + 'SlopVector — Slopographic'; // i18n-ignore: app and site names
    });
  }

  /* ================= rulers ================= */
  function applyRulers() { document.getElementById('workspace').classList.toggle('no-rulers', !S.prefs.rulers); }
  UI.st.rulerColors = null;
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  SV.drawRulers = function () {
    if (!S.prefs.rulers) return;
    if (!UI.st.rulerColors) UI.st.rulerColors = { bg: cssVar('--ruler-bg') || '#2b2b2b', fg: cssVar('--ruler-fg') || '#999', tick: cssVar('--ruler-tick') || '#666', acc: cssVar('--accent-line') || '#d4ff3a' };
    ['rulerH', 'rulerV'].forEach(function (id) {
      var c = document.getElementById(id); if (!c) return;
      var horiz = id === 'rulerH', dpr = window.devicePixelRatio || 1, w = c.clientWidth, hh = c.clientHeight;
      if (!w || !hh) return;
      if (c.width !== round(w * dpr) || c.height !== round(hh * dpr)) { c.width = round(w * dpr); c.height = round(hh * dpr); }
      var x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = UI.st.rulerColors.bg; x.fillRect(0, 0, w, hh);
      var z = S.view.zoom, off = horiz ? S.view.x : S.view.y, len = horiz ? w : hh;
      var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000], major = steps[steps.length - 1];
      for (var i = 0; i < steps.length; i++) if (steps[i] * z >= 64) { major = steps[i]; break; }
      var minor = major / 10; if (minor * z < 4) minor = major / 5; if (minor * z < 4) minor = major / 2;
      x.strokeStyle = UI.st.rulerColors.tick; x.fillStyle = UI.st.rulerColors.fg; x.lineWidth = 1;
      x.font = '9px ' + (cssVar('--mono') || 'monospace'); x.textBaseline = 'top';
      var start = Math.floor(-off / z / minor) * minor, end = (len - off) / z;
      x.beginPath();
      for (var v = start; v <= end; v += minor) {
        var s = round(v * z + off) + 0.5, isMaj = abs(v / major - round(v / major)) < 1e-6, half = abs(v / (major / 2) - round(v / (major / 2))) < 1e-6;
        var tl = isMaj ? (horiz ? hh : w) : half ? (horiz ? hh : w) * 0.45 : (horiz ? hh : w) * 0.25;
        if (horiz) { x.moveTo(s, hh); x.lineTo(s, hh - tl); } else { x.moveTo(w, s); x.lineTo(w - tl, s); }
        if (isMaj) {
          var label = String(round(v));
          if (horiz) x.fillText(label, s + 3, 2);
          else { x.save(); x.translate(2, s + 3); x.rotate(PI / 2); x.translate(0, -9); x.fillText(label, 0, 0); x.restore(); }
        }
      }
      x.stroke();
      x.strokeStyle = UI.st.rulerColors.tick; x.beginPath(); if (horiz) { x.moveTo(0, hh - 0.5); x.lineTo(w, hh - 0.5); } else { x.moveTo(w - 0.5, 0); x.lineTo(w - 0.5, hh); } x.stroke();
      if (curPos) {
        var cp = round((horiz ? curPos.x : curPos.y) * z + off) + 0.5;
        x.strokeStyle = UI.st.rulerColors.acc; x.beginPath(); if (horiz) { x.moveTo(cp, 0); x.lineTo(cp, hh); } else { x.moveTo(0, cp); x.lineTo(w, cp); } x.stroke();
      }
    });
  };
  function bindRulers() {
    ['rulerH', 'rulerV'].forEach(function (id) {
      var c = document.getElementById(id);
      c.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var axis = id === 'rulerH' ? 'h' : 'v';
        S.guideDrag = { axis: axis, pos: 0, out: true };
        var stage = D.stage;
        var mv = function (ev) {
          var r = stage.getBoundingClientRect(), p = SV.toDoc(ev.clientX - r.left, ev.clientY - r.top);
          S.guideDrag.pos = axis === 'v' ? p.x : p.y;
          if (S.prefs.snapGrid) { var gs = S.prefs.gridSize; S.guideDrag.pos = round(S.guideDrag.pos / gs) * gs; }
          S.guideDrag.out = !(ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom);
          SV.requestRender();
        };
        var up = function () {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          S.prefs.guides = true;
          SV.endGuideDrag();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
    });
    document.getElementById('rulerCorner').addEventListener('dblclick', function () { SV.fitArtboard(); });
  }

  $.applyRulers = applyRulers; $.bindRulers = bindRulers; $.buildStatus = buildStatus;
})();
