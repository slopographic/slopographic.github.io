/* Slop PDF find — highlights. One SVG rect per match box, in page points (the same unrotated space as the annotations,
   so the highlights scale with the page and turn with it). The current match is drawn stronger. The SVG sits in each
   page's layer under the text layer and the annotations. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util, E = SP.engine, S = SP.editor._, F = window.SlopPdfFind;
  F.results = []; F.cur = -1; F.version = 0;
  /** Sets the matches and the current index, and marks every page's highlights for a repaint. */
  F.setResults = function (list, cur) { F.results = list || []; F.cur = cur == null ? -1 : cur; F.version++; };
  /** Paints one page slot's highlights (skipped while the matches are the same as last time). */
  F.paintSlot = function (s) {
    var p = E.pageById(s.pid); if (!p) return;
    var key = F.version + ':' + s.pid;
    if (s.hitsKey === key) return;
    s.hitsKey = key;
    var svg = s.layer.querySelector('.pv-hits');
    var items = [];
    F.results.forEach(function (m, i) { if (m.pid === s.pid) items.push({ m: m, i: i }); });
    if (!items.length) { if (svg) svg.remove(); return; }
    var g = E.geom(p);
    if (!svg) {
      svg = U.s('svg', { class: 'pv-hits', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
      s.layer.insertBefore(svg, s.layer.querySelector('.pv-textlayer') || s.svg);
    }
    svg.setAttribute('viewBox', '0 0 ' + g.W + ' ' + g.H);
    svg.replaceChildren();
    items.forEach(function (it) {
      it.m.boxes.forEach(function (b) {
        svg.appendChild(U.s('rect', { x: U.round(b.x, 2), y: U.round(b.y, 2), width: U.round(b.w, 2), height: U.round(b.h, 2), class: 'hit' + (it.i === F.cur ? ' cur' : ''), 'data-hit': it.i }));
      });
    });
  };
  /** Paints the highlights on every page slot (slots that are not rasterised yet get them when they are). */
  F.paintAll = function () { S.slots.forEach(function (s) { F.paintSlot(s); }); };
})();
