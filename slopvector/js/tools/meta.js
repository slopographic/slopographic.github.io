/* SlopVector — tools: icons, tool list, cursors, tool switching */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state, D = SV.dom;
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round, hypot = Math.hypot;
  var clone = SV.clone, getObj = SV.getObj, find = SV.find, C = SV.cmd = SV.cmd || {};
  var $ = SV._tools = SV._tools || {};
  function addAnchor() { return $.addAnchor.apply(this, arguments); }
  function deleteAnchor() { return $.deleteAnchor.apply(this, arguments); }

  /* ================= tool metadata ================= */
  function ic(d, filled) { return '<svg viewBox="0 0 24 24" aria-hidden="true" class="' + (filled ? 'ic-fill' : 'ic') + '">' + d + '</svg>'; }
  SV.ICONS = {
    select: ic('<path d="M6 3.5l12 7.6-5.4 1.2 3.3 6-2.3 1.2-3.2-6.1L6 17.6z"/>', true),
    direct: ic('<path d="M6 3.5l12 7.6-5.4 1.2 3.3 6-2.3 1.2-3.2-6.1L6 17.6z"/>'),
    pen: ic('<path d="M12 3l5 8-3 8h-4l-3-8z"/><path d="M12 3v7"/><circle cx="12" cy="11.5" r="1.4"/><path d="M9.5 21h5"/>'),
    addAnchor: ic('<path d="M10 4l4 7-2.4 7H8.4L6 11z"/><path d="M17 15v6M14 18h6"/>'),
    deleteAnchor: ic('<path d="M10 4l4 7-2.4 7H8.4L6 11z"/><path d="M14 18h6"/>'),
    convertAnchor: ic('<path d="M4 19l8-14 8 14"/><circle cx="12" cy="5" r="1.6"/>'),
    pencil: ic('<path d="M4 20l1.2-4.6L16 4.6a1.9 1.9 0 0 1 2.7 0l.7.7a1.9 1.9 0 0 1 0 2.7L8.6 18.8z"/><path d="M14.5 6l3.5 3.5"/>'),
    brush: ic('<path d="M20 4c-3 1.5-7.5 6-9.4 8.8l1.6 1.6C15 12.5 18.5 7 20 4z"/><path d="M10.2 13.6c-2.2-.3-3.7 1.2-3.9 3-.2 1.6-1 2.4-2.3 2.6 3.8 1.6 7.6.2 7.8-3.6z"/>'),
    type: ic('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
    line: ic('<path d="M5 19L19 5"/>'),
    rect: ic('<rect x="4" y="6" width="16" height="12"/>'),
    rrect: ic('<rect x="4" y="6" width="16" height="12" rx="4"/>'),
    ellipse: ic('<ellipse cx="12" cy="12" rx="8" ry="7"/>'),
    polygon: ic('<path d="M12 3.5l7.5 4.3v8.4L12 20.5l-7.5-4.3V7.8z"/>'),
    star: ic('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>'),
    eyedropper: ic('<path d="M14 6l4 4M12.5 7.5l4 4-8 8H4.5v-4z"/><path d="M15 4.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L18 10.5 13.5 6z" class="f"/>'),
    hand: ic('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6 6.5-2.6 0-4-1.3-5.4-3.6L4 13.6a1.4 1.4 0 0 1 2.3-1.5L8 14"/>'),
    zoom: ic('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/>'),
    rotate: ic('<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3v4.2h-4.2"/>'),
    scale: ic('<rect x="4" y="10" width="10" height="10"/><path d="M11 4h9v9M20 4l-8 8"/>'),
    scissors: ic('<circle cx="6.5" cy="17" r="2.6"/><circle cx="17.5" cy="17" r="2.6"/><path d="M8.3 15L17 4M15.7 15L7 4"/>'),
    gradient: ic('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 20L20 4" class="thin"/><path d="M4 14l6-6M10 20l10-10"/>')
  };
  // name: the tool's name in the current language (vector.tool.<id in snake case>, slopvector/i18n/en/tools.js).
  SV.TOOL_LIST = [
    { id: 'select', key: 'V' }, { id: 'direct', key: 'A' },
    { id: 'pen', key: 'P' }, { id: 'addAnchor', key: '+' },
    { id: 'deleteAnchor', key: '−' }, { id: 'convertAnchor', key: 'Shift+C' },
    { id: 'pencil', key: 'N' }, { id: 'brush', key: 'B' },
    { id: 'type', key: 'T' }, { id: 'line', key: '\\' },
    { id: 'rect', key: 'M' }, { id: 'rrect', key: 'Shift+M' },
    { id: 'ellipse', key: 'L' }, { id: 'polygon', key: 'Shift+L' },
    { id: 'star', key: 'Shift+S' }, { id: 'rotate', key: 'R' },
    { id: 'scale', key: 'S' }, { id: 'scissors', key: 'C' },
    { id: 'gradient', key: 'G' }, { id: 'eyedropper', key: 'I' },
    { id: 'hand', key: 'H' }, { id: 'zoom', key: 'Z' }
  ];
  SV.TOOL_LIST.forEach(function (tl) {
    var k = 'vector.tool.' + tl.id.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    Object.defineProperty(tl, 'name', { get: function () { return SV.t(k); }, enumerable: true });
  });
  var TOOLS = SV.TOOLS = {};
  var TOOL_KEYS = { v: 'select', a: 'direct', p: 'pen', '=': 'addAnchor', '-': 'deleteAnchor', 'shift+c': 'convertAnchor', 'shift+=': 'addAnchor', n: 'pencil', b: 'brush', t: 'type', '\\': 'line', m: 'rect', 'shift+m': 'rrect', l: 'ellipse', 'shift+l': 'polygon', 'shift+s': 'star', r: 'rotate', s: 'scale', c: 'scissors', g: 'gradient', i: 'eyedropper', h: 'hand', z: 'zoom' };

  /* cursors */
  function cur(svg, x, y, fb) { return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' + svg + '</svg>') + '") ' + x + ' ' + y + ', ' + fb; }
  var penBase = '<path d="M4 3l9 4-3 3-3 9z" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/><circle cx="7.6" cy="10.4" r="1.2" fill="#000"/>';
  var CURSORS = {
    direct: cur('<path d="M3 2l12 7.6-5.4 1.2 3.3 6-2.3 1.2-3.2-6.1L3 16.1z" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/>', 3, 2, 'default'),
    pen: cur(penBase + '<path d="M15 16h0" />', 4, 3, 'crosshair'),
    penAdd: cur(penBase + '<path d="M18 14v7M14.5 17.5h7" stroke="#000" stroke-width="1.8"/>', 4, 3, 'crosshair'),
    penDel: cur(penBase + '<path d="M14.5 17.5h7" stroke="#000" stroke-width="1.8"/>', 4, 3, 'crosshair'),
    penClose: cur(penBase + '<circle cx="18" cy="17.5" r="3" fill="none" stroke="#000" stroke-width="1.6"/>', 4, 3, 'crosshair'),
    penCont: cur(penBase + '<path d="M15 20l3-5 3 5" fill="none" stroke="#000" stroke-width="1.6"/>', 4, 3, 'crosshair'),
    convert: cur('<path d="M3 20l8-15 8 15" fill="none" stroke="#fff" stroke-width="3.4"/><path d="M3 20l8-15 8 15" fill="none" stroke="#000" stroke-width="1.6"/>', 11, 5, 'crosshair'),
    eyedropper: cur('<path d="M3 21l1-4 9-9 3 3-9 9z" fill="#fff" stroke="#000" stroke-width="1.2"/><path d="M14 5l2-2a2 2 0 0 1 3 0l2 2a2 2 0 0 1 0 3l-2 2z" fill="#000"/>', 3, 21, 'crosshair'),
    rotate: cur('<path d="M18 9a7 7 0 1 0 0 6" fill="none" stroke="#fff" stroke-width="4"/><path d="M18 9a7 7 0 1 0 0 6" fill="none" stroke="#000" stroke-width="1.6"/><path d="M15 4l3.6 5.2L13 10" fill="none" stroke="#000" stroke-width="1.6"/>', 12, 12, 'alias'),
    scissors: cur('<circle cx="6" cy="18" r="3" fill="#fff" stroke="#000" stroke-width="1.4"/><circle cx="18" cy="18" r="3" fill="#fff" stroke="#000" stroke-width="1.4"/><path d="M8 16L18 3M16 16L6 3" stroke="#000" stroke-width="1.6"/>', 12, 9, 'crosshair')
  };
  SV.CURSORS = CURSORS;
  var TOOL_CURSOR = { select: 'default', direct: CURSORS.direct, pen: CURSORS.pen, addAnchor: CURSORS.penAdd, deleteAnchor: CURSORS.penDel, convertAnchor: CURSORS.convert, pencil: 'crosshair', brush: 'crosshair', type: 'text', line: 'crosshair', rect: 'crosshair', rrect: 'crosshair', ellipse: 'crosshair', polygon: 'crosshair', star: 'crosshair', rotate: 'crosshair', scale: 'crosshair', scissors: CURSORS.scissors, gradient: 'crosshair', eyedropper: CURSORS.eyedropper, hand: 'grab', zoom: 'zoom-in' };
  function setCursor(c) { if (D.stage.style.cursor !== c) D.stage.style.cursor = c; }
  SV.updateCursor = function (alt) {
    var t = S.spaceHand ? 'hand' : S.tool;
    if (S.op && S.op.kind === 'pan') return setCursor('grabbing');
    if (t === 'zoom') return setCursor(alt ? 'zoom-out' : 'zoom-in');
    setCursor(TOOL_CURSOR[t] || 'default');
  };

  SV.setTool = function (id) {
    if (!SV.TOOL_LIST.some(function (t) { return t.id === id; })) return;
    if (S.editing) SV.commitTextEdit();
    if (S.pen && id !== 'pen') SV.finishPen();
    if (S.tool === id) return;
    S.tool = id; S.origin = null; S.hover = null;
    if (id === 'direct') { /* keep object selection, no points */ }
    SV.updateCursor();
    SV.requestRender(true);
  };

  $.CURSORS = CURSORS; $.TOOLS = TOOLS; $.TOOL_KEYS = TOOL_KEYS; $.cur = cur; $.setCursor = setCursor;
})();
