/* Slop Press — the Tools panel (left) with fill/stroke chips. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util, S = PR.state, K = PR.kit, A = PR.actions, H = PR.history;
  var UI = PR.ui = PR.ui || {};
  var TOOLS = [['select', 'select', 'tool.select'], ['text', 'text', 'tool.text'], '-', ['frame', 'frame', 'tool.frame'], ['rect', 'rect', 'tool.rect'], ['ellipse', 'ellipse', 'tool.ellipse'],
    ['line', 'line', 'tool.line'], ['polygon', 'polygon', 'tool.polygon'], '-', ['hand', 'hand', 'tool.hand'], ['zoom', 'zoom', 'tool.zoom']];

  /** The fill/stroke the chips show: the selection's, or the defaults for new shapes. */
  function paintTarget() { var its = PR.selected().filter(function (it) { return !S.text; }); return its.length ? its[0] : S.defaults; }
  UI.setPaint = function (key, color) {
    var its = S.text ? [] : PR.selected();
    if (its.length) { its.forEach(function (it) { it[key] = color; if (key === 'stroke' && color && !it.sw) it.sw = 1; }); H.commit(U.t(key === 'fill' ? 'press.tool.undo_fill' : 'press.tool.undo_stroke')); }
    else if (S.text && key === 'fill') PR.format.char({ color: color || '#000000' });
    else S.defaults[key] = color;
    PR.emit('defaults'); UI.refreshTools();
  };
  UI.buildToolbar = function () {
    var bar = U.$('#toolbar'); bar.innerHTML = '';
    TOOLS.forEach(function (t) {
      if (t === '-') { bar.append(U.h('div', { class: 'tool-sep' })); return; }
      var c = A.get(t[2]);
      var b = U.h('button', { type: 'button', class: 'tool', 'data-tool': t[0], 'aria-label': c ? c.title : t[0], html: K.icon(t[1]) });
      b.addEventListener('click', function () { A.run(t[2]); });
      bar.append(b);
    });
    var chips = U.h('div', { class: 'paint-chips' });
    var fill = U.h('button', { type: 'button', class: 'pchip fill', title: U.t('press.tool.fill_tip'), 'aria-label': U.t('press.tool.fill_label') });
    var stroke = U.h('button', { type: 'button', class: 'pchip stroke', title: U.t('press.tool.stroke_tip'), 'aria-label': U.t('press.tool.stroke_label') });
    fill.addEventListener('click', function () { K.colorPopover(fill, paintTarget().fill, function (c) { UI.setPaint('fill', c); }); });
    stroke.addEventListener('click', function () { K.colorPopover(stroke, paintTarget().stroke, function (c) { UI.setPaint('stroke', c); }); });
    chips.append(fill, stroke); bar.append(U.h('div', { class: 'tool-sep' }), chips);
    UI.refreshTools();
  };
  UI.refreshTools = function () {
    U.$$('#toolbar .tool').forEach(function (b) {
      var t = b.getAttribute('data-tool'), id = 'tool.' + t, k = A.keyFor(id);
      b.classList.toggle('on', S.tool === t);
      var c = A.get(id), name = c ? c.title : t;
      b.title = k ? U.t('press.tool.title_key', { name: name, key: k }) : name;
      b.setAttribute('aria-label', name);
    });
    var pt = paintTarget(), f = U.$('.pchip.fill'), s = U.$('.pchip.stroke');
    if (f) { f.title = U.t('press.tool.fill_tip'); f.setAttribute('aria-label', U.t('press.tool.fill_label')); }
    if (s) { s.title = U.t('press.tool.stroke_tip'); s.setAttribute('aria-label', U.t('press.tool.stroke_label')); }
    if (S.text) { var cur = PR.format.current(); pt = { fill: cur && cur.char.color, stroke: null }; }
    if (f) { f.style.background = pt.fill ? U.css(pt.fill) : ''; f.classList.toggle('none', !pt.fill); }
    if (s) { s.style.background = pt.stroke ? U.css(pt.stroke) : ''; s.classList.toggle('none', !pt.stroke); }
  };
  PR.on('tool', function () { UI.refreshTools(); });
  PR.on('select', function () { UI.refreshTools(); });
  PR.on('textsel', function () { UI.refreshTools(); });
  PR.on('keys', function () { UI.refreshTools(); });
  // after a language change the command titles are registered again (ui/commands.js): read them on the next turn
  U.onLang(function () { setTimeout(function () { if (U.$('#toolbar .tool')) UI.refreshTools(); }, 0); });
})();
