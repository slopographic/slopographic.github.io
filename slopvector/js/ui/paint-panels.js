/* SlopVector — ui: Swatches, Gradient, Align and Pathfinder panels */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom, IO = SV.io, C = SV.cmd;
  var clone = SV.clone, getObj = SV.getObj, esc = SV.esc, fmt = G.fmt;
  var abs = Math.abs, min = Math.min, max = Math.max, round = Math.round, PI = Math.PI;
  var UI = SV.ui = SV.ui || {}; UI.st = UI.st || {};
  var IS_MAC = SV.IS_MAC;
  var $ = UI._p = UI._p || {};
  function bind() { return $.bind.apply(this, arguments); }
  function btn() { return $.btn.apply(this, arguments); }
  function chip() { return $.chip.apply(this, arguments); }
  function field() { return $.field.apply(this, arguments); }
  function gradCSS() { return $.gradCSS.apply(this, arguments); }
  function h() { return $.h.apply(this, arguments); }
  function hexToRgb() { return $.hexToRgb.apply(this, arguments); }
  function ibtn() { return $.ibtn.apply(this, arguments); }
  function numIn() { return $.numIn.apply(this, arguments); }
  function paintBG() { return $.paintBG.apply(this, arguments); }
  function rgbToHex() { return $.rgbToHex.apply(this, arguments); }
  function savePrefs() { return $.savePrefs.apply(this, arguments); }
  function seg() { return $.seg.apply(this, arguments); }
  function selIn() { return $.selIn.apply(this, arguments); }
  var I = $.I;
  var panelEls = $.panelEls;

  /* ---------- Swatches ---------- */
  var DEFAULT_SWATCHES = [null, '#ffffff', '#0a0a0a', '#f1ede4', '#d4ff3a', '#b8e600', '#7fae00', '#ff3d8b', '#ff7eb6', '#7a5cff', '#3a7bff', '#00c2b8', '#2ecc71', '#ffe14d', '#ff8a00', '#ff4d4d', '#8b5a2b', '#e6e6e6', '#bdbdbd', '#8a8a8a', '#4a4a4a', '#262626',
    { type: 'radial', cx: 0.4, cy: 0.35, r: 0.7, fx: 0.35, fy: 0.3, stops: [{ o: 0, c: '#f6ffc4', a: 1 }, { o: 0.45, c: '#d4ff3a', a: 1 }, { o: 1, c: '#6e9a00', a: 1 }], name: 'Slime' }, // i18n-ignore: swatch names (stored in the document)
    { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ o: 0, c: '#ff3d8b', a: 1 }, { o: 1, c: '#ff8a00', a: 1 }], name: 'Toxic Sunset' }, // i18n-ignore: swatch names (stored in the document)
    { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ o: 0, c: '#7a5cff', a: 1 }, { o: 1, c: '#00c2b8', a: 1 }], name: 'Synth' }, // i18n-ignore: swatch names (stored in the document)
    { type: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [{ o: 0, c: '#f1ede4', a: 1 }, { o: 1, c: '#0a0a0a', a: 1 }], name: 'Bone to Ink' }]; // i18n-ignore: swatch names (stored in the document)
  var selSwatch = -1;
  function swatches() { return S.doc.swatches || DEFAULT_SWATCHES; }
  /** Apply swatch i to 'fill' or 'stroke' (the swatch click and its context menu). */
  function applySwatch(i, which) { selSwatch = i; var v = clone(swatches()[i]); if (v && typeof v === 'object') delete v.name; SV.applyStyle(which, v); }
  /** Delete swatch i from the document's swatches. */
  function deleteSwatch(i) { var list = swatches().slice(); list.splice(i, 1); S.doc.swatches = list; selSwatch = -1; SV.commit('delete swatch'); }
  function buildSwatches() {
    var body = panelEls.swatches.body;
    var grid = h('div', { class: 'swgrid', id: 'swgrid', role: 'listbox', i18n: { 'aria-label': 'vector.panel.swatches' } });
    body.appendChild(grid);
    body.appendChild(h('div', { class: 'layers-foot' }, [
      h('span', { class: 'lcount', i18n: { text: 'vector.swatch.apply_to' } }), h('span', { class: 'lcount strong', id: 'swFocus' }), h('span', { class: 'grow' }),
      ibtn(I.plus, 'vector.swatch.new', function () {
        var p = SV.currentPaint(S.focus); if (p === undefined) return;
        var list = swatches().slice(); list.push(clone(p)); S.doc.swatches = list; SV.commit('add swatch'); UI.toast(SV.t('vector.swatch.added'));
      }),
      ibtn(I.trash, 'vector.swatch.delete', function () {
        if (selSwatch < 0) return UI.toast(SV.t('vector.swatch.pick_first'));
        deleteSwatch(selSwatch);
      })
    ]));
    var sig = '';
    bind('swatches', function () {
      document.getElementById('swFocus').textContent = S.focus === 'fill' ? SV.t('vector.paint.fill') : SV.t('vector.paint.stroke');
      var s = JSON.stringify([swatches(), selSwatch, document.documentElement.lang]); if (s === sig) return; sig = s;
      grid.innerHTML = '';
      swatches().forEach(function (p, i) {
        var b = h('button', { type: 'button', class: 'sw' + (p && typeof p === 'object' ? ' grad' : '') + (i === selSwatch ? ' on' : ''), role: 'option', title: !p ? SV.t('ui.none') : typeof p === 'string' ? p.toUpperCase() : (p.name || SV.t('vector.paint.gradient')), 'aria-label': !p ? SV.t('ui.none') : typeof p === 'string' ? p : (p.name || SV.t('vector.paint.gradient')) }, [h('span', { class: 'chip-in' })]);
        paintBG(b.firstChild, p);
        b.addEventListener('click', function (e) {
          if (e.altKey) { deleteSwatch(i); return; }
          applySwatch(i, S.focus);
        });
        grid.appendChild(b);
      });
    });
  }

  /* ---------- Gradient ---------- */
  var gStop = 0;
  function gradTargetPaint() { var p = SV.currentPaint(S.focus); return p && typeof p === 'object' ? p : null; }
  function setGrad(fn, commit) {
    var p = clone(gradTargetPaint()); if (!p) return;
    fn(p); SV.applyStyle(S.focus, p, { commit: commit !== false });
  }
  function buildGradient() {
    var body = panelEls.gradient.body, g = 'grad';
    var empty = h('div', { class: 'gempty' }, [h('div', { class: 'gpreview big', style: { background: 'linear-gradient(90deg,#fff,#d4ff3a)' } }), h('p', { class: 'tip' }), btn('vector.grad.apply', function () { SV.applyStyle(S.focus, SV.defaultGradient(SV.currentPaint(S.focus))); }, 'primary')]);
    var tipP = empty.querySelector('.tip');
    var ed = h('div', { class: 'geditor' });
    var target = seg(g, [['fill', 'vector.paint.fill', 'vector.grad.edit_fill'], ['stroke', 'vector.paint.stroke', 'vector.grad.edit_stroke']], function () { return S.focus; }, function (v) { S.focus = v; SV.requestRender(true); }, 'vector.grad.target');
    var typeSeg = seg(g, [['linear', 'vector.grad.linear', 'vector.paint.linear_gradient'], ['radial', 'vector.grad.radial', 'vector.paint.radial_gradient']], function () { var p = gradTargetPaint(); return p && p.type; }, function (v) {
      setGrad(function (p) { if (p.type === v) return; p.type = v; if (v === 'radial') { p.cx = p.cy = p.fx = p.fy = 0.5; p.r = 0.5; delete p.x1; delete p.y1; delete p.x2; delete p.y2; } else { p.x1 = 0; p.y1 = 0.5; p.x2 = 1; p.y2 = 0.5; delete p.cx; delete p.cy; delete p.r; delete p.fx; delete p.fy; } });
    }, 'vector.grad.type');
    var bar = h('div', { class: 'gbar', i18n: { title: 'vector.grad.bar_tip' } });
    var barFill = h('div', { class: 'gbar-fill' }); bar.appendChild(barFill);
    var stopsBox = h('div', { class: 'gstops' }); bar.appendChild(stopsBox);
    var angle = numIn(g, { label: 'vector.grad.angle', step: 1, get: function () { var p = gradTargetPaint(); if (!p || p.type !== 'linear') return null; return round(-Math.atan2(p.y2 - p.y1, p.x2 - p.x1) * 180 / PI); }, set: function (v) { setGrad(function (p) { var a = -v * PI / 180, c = Math.cos(a) / 2, s = Math.sin(a) / 2; p.x1 = 0.5 - c; p.y1 = 0.5 - s; p.x2 = 0.5 + c; p.y2 = 0.5 + s; }); }, enabled: function () { var p = gradTargetPaint(); return p && p.type === 'linear'; } });
    var stopChip = h('button', { type: 'button', class: 'chip small', i18n: { title: 'vector.grad.stop_color', 'aria-label': 'vector.grad.stop_color' } }, [h('span', { class: 'chip-in' })]);
    stopChip.addEventListener('click', function () {
      var p = gradTargetPaint(); if (!p) return; var sIdx = min(gStop, p.stops.length - 1);
      UI.pickColor(stopChip, p.stops[sIdx].c, function (hex) { setGrad(function (q) { q.stops[sIdx].c = hex; }, false); }, function (v, changed) { if (changed) SV.commit('gradient stop'); }, { title: SV.t('vector.grad.stop_title'), alpha: false });
    });
    var stopOp = numIn(g, { label: 'vector.grad.stop_opacity', min: 0, max: 100, get: function () { var p = gradTargetPaint(); if (!p) return null; var s = p.stops[min(gStop, p.stops.length - 1)]; return round((s.a == null ? 1 : s.a) * 100); }, set: function (v) { setGrad(function (p) { p.stops[min(gStop, p.stops.length - 1)].a = v / 100; }); }, cls: 'w44' });
    var stopLoc = numIn(g, { label: 'vector.grad.stop_location', min: 0, max: 100, get: function () { var p = gradTargetPaint(); if (!p) return null; return round(p.stops[min(gStop, p.stops.length - 1)].o * 100); }, set: function (v) { setGrad(function (p) { p.stops[min(gStop, p.stops.length - 1)].o = v / 100; }); }, cls: 'w44' });
    ed.appendChild(h('div', { class: 'arow' }, [target, typeSeg]));
    ed.appendChild(bar);
    ed.appendChild(h('div', { class: 'arow' }, [field('vector.grad.angle', angle, '°'), h('span', { class: 'grow' }), btn('vector.grad.reverse', function () { setGrad(function (p) { p.stops = p.stops.map(function (s) { return { o: 1 - s.o, c: s.c, a: s.a }; }).reverse(); }); }, 'small')]));
    ed.appendChild(h('div', { class: 'arow' }, [h('span', { class: 'alabel', i18n: { text: 'vector.grad.stop' } }), stopChip, field('vector.paint.opacity', stopOp, '%'), field('vector.grad.location', stopLoc, '%'), ibtn(I.trash, 'vector.grad.delete_stop', function () { setGrad(function (p) { if (p.stops.length > 2) { p.stops.splice(min(gStop, p.stops.length - 1), 1); gStop = 0; } }); })]));
    body.appendChild(empty); body.appendChild(ed);
    bar.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.gstop')) return;
      var p = gradTargetPaint(); if (!p) return;
      var r = bar.getBoundingClientRect(), o = SV.clamp((e.clientX - r.left) / r.width, 0, 1);
      var sorted = p.stops.slice().sort(function (a, b) { return a.o - b.o; }), c = sorted[0].c;
      for (var i = 0; i < sorted.length - 1; i++) if (o >= sorted[i].o && o <= sorted[i + 1].o) { var t = (o - sorted[i].o) / ((sorted[i + 1].o - sorted[i].o) || 1), A1 = hexToRgb(sorted[i].c), B1 = hexToRgb(sorted[i + 1].c); c = rgbToHex(A1[0] + (B1[0] - A1[0]) * t, A1[1] + (B1[1] - A1[1]) * t, A1[2] + (B1[2] - A1[2]) * t); }
      if (o > sorted[sorted.length - 1].o) c = sorted[sorted.length - 1].c;
      setGrad(function (q) { q.stops.push({ o: o, c: c, a: 1 }); gStop = q.stops.length - 1; });
    });
    var sig = '';
    bind(g, function () {
      var p = gradTargetPaint();
      empty.hidden = !!p; ed.hidden = !p;
      var solid = !!SV.currentPaint(S.focus);
      tipP.textContent = S.focus === 'fill' ? (solid ? SV.t('vector.grad.tip_fill_solid') : SV.t('vector.grad.tip_fill_none')) : (solid ? SV.t('vector.grad.tip_stroke_solid') : SV.t('vector.grad.tip_stroke_none'));
      if (!p) return;
      barFill.style.background = gradCSS(Object.assign({}, p, { type: 'linear', x1: 0, y1: 0, x2: 1, y2: 0 }));
      paintBG(stopChip.firstChild, p.stops[min(gStop, p.stops.length - 1)].c);
      var s = JSON.stringify([p.stops, gStop, document.documentElement.lang]); if (s === sig) return; sig = s;
      stopsBox.innerHTML = '';
      p.stops.forEach(function (st, i) {
        var m = h('div', { class: 'gstop' + (i === gStop ? ' on' : ''), style: { left: (st.o * 100) + '%' }, title: SV.t('vector.grad.stop_at', { pct: round(st.o * 100) }) }, [h('span', { style: { background: st.c } })]);
        m.addEventListener('pointerdown', function (e) {
          e.preventDefault(); e.stopPropagation(); gStop = i; sig = '';
          var r = bar.getBoundingClientRect(), moved = false, removed = false;
          var mv = function (ev) {
            moved = true;
            removed = ev.clientY - r.bottom > 30 && p.stops.length > 2;
            m.style.opacity = removed ? 0.3 : 1;
            var o = SV.clamp((ev.clientX - r.left) / r.width, 0, 1);
            setGrad(function (q) { q.stops[i].o = o; }, false);
          };
          var up = function () {
            window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
            if (removed) setGrad(function (q) { q.stops.splice(i, 1); gStop = 0; });
            else if (moved) SV.commit('gradient stop');
            else SV.requestRender(true);
          };
          window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        });
        stopsBox.appendChild(m);
      });
    });
  }

  /* ---------- Align ---------- */
  function buildAlign() {
    var body = panelEls.align.body, g = 'align';
    body.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.align.objects' } }));
    body.appendChild(h('div', { class: 'ibtnrow' }, [ibtn(I.alignL, 'vector.align.left', function () { C.align('left'); }), ibtn(I.alignHC, 'vector.align.hcenter', function () { C.align('hcenter'); }), ibtn(I.alignR, 'vector.align.right', function () { C.align('right'); }), ibtn(I.alignT, 'vector.align.top', function () { C.align('top'); }), ibtn(I.alignVC, 'vector.align.vcenter', function () { C.align('vcenter'); }), ibtn(I.alignB, 'vector.align.bottom', function () { C.align('bottom'); })]));
    body.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.align.distribute' } }));
    body.appendChild(h('div', { class: 'ibtnrow' }, [ibtn(I.distH, 'vector.align.dist_hcenter', function () { C.distribute('hcenter'); }), ibtn(I.distV, 'vector.align.dist_vcenter', function () { C.distribute('vcenter'); }), ibtn(I.spaceH, 'vector.align.dist_hspace', function () { C.distribute('hspace'); }), ibtn(I.spaceV, 'vector.align.dist_vspace', function () { C.distribute('vspace'); })]));
    body.appendChild(h('label', { class: 'fld col' }, [h('span', { class: 'fl', i18n: { text: 'vector.align.to' } }), selIn(g, [['selection', 'vector.guides.selection'], ['artboard', 'vector.guides.artboard']], function () { return S.prefs.alignTo; }, function (v) { S.prefs.alignTo = v; savePrefs(); }, 'vector.align.to')]));
  }
  /* ---------- Pathfinder ---------- */
  function buildPathfinder() {
    var body = panelEls.pathfinder.body;
    body.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.pf.shape_modes' } }));
    var pf = function (icon, key, id) { var b = h('button', { type: 'button', class: 'pfbtn', i18n: { title: key, 'aria-label': key }, html: icon, onclick: function () { SV.runAction(id); } }); b.appendChild(h('span', { i18n: { text: key } })); return b; };
    body.appendChild(h('div', { class: 'pfrow' }, [pf(I.unite, 'vector.act.pf_unite', 'pf.unite'), pf(I.minus, 'vector.act.pf_minus', 'pf.minus'), pf(I.intersect, 'vector.act.pf_intersect', 'pf.intersect'), pf(I.exclude, 'vector.act.pf_exclude', 'pf.exclude')]));
    body.appendChild(h('div', { class: 'psec-title', i18n: { text: 'vector.pf.paths' } }));
    body.appendChild(h('div', { class: 'btnrow' }, [btn('vector.pf.make_compound', function () { SV.runAction('compound.make'); }, 'small'), btn('vector.pf.release', function () { SV.runAction('compound.release'); }, 'small'), btn('vector.props.expand', function () { SV.runAction('object.expand'); }, 'small')]));
    var slop = h('button', { type: 'button', class: 'btn slop wide', html: I.slop, i18n: { title: 'vector.pf.slopify_tip' }, onclick: function () { SV.runAction('object.slopify'); } });
    slop.appendChild(h('span', { i18n: { text: 'vector.act.object_slopify' } }));
    body.appendChild(slop);
  }

  $.buildAlign = buildAlign; $.buildGradient = buildGradient; $.buildPathfinder = buildPathfinder; $.buildSwatches = buildSwatches; $.swatches = swatches; $.applySwatch = applySwatch; $.deleteSwatch = deleteSwatch;
})();
