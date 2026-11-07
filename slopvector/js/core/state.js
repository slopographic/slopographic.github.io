/* SlopVector — core: constants, app state, utilities, object factories */
(function () {
  'use strict';
  var G = window.SVGeom;
  var SV = window.SV = window.SV || {};
  var SVGNS = 'http://www.w3.org/2000/svg';
  var abs = Math.abs, min = Math.min, max = Math.max, PI = Math.PI, round = Math.round;
  var fmt = G.fmt;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  var $ = SV._core = SV._core || {};
  function activeLayer() { return $.activeLayer.apply(this, arguments); }

  /* ================= constants ================= */
  var LAYER_COLORS = ['#4f8bff', '#ff4f7b', '#2fc65a', '#ffa21f', '#b45cff', '#00bcd4', '#ff6a3d', '#8f9bb3'];
  var FONTS = {
    'Inter Tight': "'Inter Tight', 'Inter', 'Helvetica Neue', Arial, sans-serif",
    'Archivo': "'Archivo', 'Arial Black', 'Helvetica Neue', Arial, sans-serif",
    'JetBrains Mono': "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace",
    'System UI': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    'Helvetica': "Helvetica, 'Helvetica Neue', Arial, sans-serif",
    'Arial': "Arial, Helvetica, sans-serif",
    'Georgia': "Georgia, 'Times New Roman', serif",
    'Times New Roman': "'Times New Roman', Times, serif",
    'Courier New': "'Courier New', Courier, monospace",
    'Verdana': "Verdana, Geneva, sans-serif",
    'Trebuchet MS': "'Trebuchet MS', sans-serif",
    'Impact': "Impact, 'Arial Black', sans-serif",
    'Comic Sans MS': "'Comic Sans MS', 'Comic Sans', cursive"
  };
  var BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
  /** Font weights and the keys of their names (Type ▸ Weight, the weight selects). */
  SV.WEIGHTS = [[300, 'vector.weight.light'], [400, 'vector.weight.regular'], [500, 'vector.weight.medium'], [600, 'vector.weight.semibold'], [700, 'vector.weight.bold'], [800, 'vector.weight.extrabold'], [900, 'vector.weight.black']];
  SV.FONTS = FONTS; SV.BLENDS = BLENDS; SV.LAYER_COLORS = LAYER_COLORS;
  SV.fontStack = function (fam) { return FONTS[fam] || ("'" + String(fam).replace(/'/g, '') + "', sans-serif"); };

  /* ================= state ================= */
  var S = SV.state = {
    doc: null,
    sel: [],                 // selected object ids
    psel: {},                // direct selection: objId -> [ 'si:i', ... ]
    activeLayer: null,
    view: { zoom: 1, x: 0, y: 0 },
    tool: 'select', spaceHand: false,
    style: { fill: '#d4ff3a', stroke: '#0a0a0a', sw: 2, cap: 'butt', join: 'miter', miter: 10, dash: null, opacity: 1, blend: 'normal', rule: 'nonzero' },
    focus: 'fill',
    font: { family: 'Inter Tight', size: 48, weight: 700, style: 'normal', align: 'left', lh: 1.2, tracking: 0 },
    shape: { radius: 16, sides: 6, points: 5, inner: 0.45 },
    brush: { size: 6 },
    prefs: { smart: true, grid: false, snapGrid: false, rulers: true, guides: true, outline: false, gridSize: 10, scaleStrokes: false, keyInc: 1, alignTo: 'selection', lockGuides: false, panels: true },
    history: [], hIdx: -1, savedIdx: 0, lastLabel: '', lastTime: 0,
    clipboard: null, clipText: '',
    op: null, hover: null, snapLines: [], marquee: null, editing: null, pen: null, readout: null,
    lastDup: null, docCounter: 1, fileName: null
  };

  /* ================= utilities ================= */
  function uid() { return Math.random().toString(36).slice(2, 10) + (Date.now() % 1e6).toString(36); }
  SV.uid = uid;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  SV.clone = clone;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  SV.esc = esc;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  SV.clamp = clamp;
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return e; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  SV.lsGet = lsGet; SV.lsSet = lsSet; SV.lsDel = lsDel;
  SV.modKey = function (e) { return IS_MAC ? e.metaKey : e.ctrlKey; };

  /* ================= words (slopvector/i18n/<code>/*.js, shared/i18n/APPS-HOWTO.md) ================= */
  // t('vector.<area>.<name>', vars): the chosen language, English when it lacks the key. onLang(fn) re-runs fn after a
  // language change, once the new tables are in (UI built once). mark(el, { text: key, title: key }) sets the words and
  // marks the element, so SlopI18n.apply() follows a switch. The UI helpers take a key (isKey) or plain text (tx).
  SV.t = function (key, vars) { var I = window.SlopI18n; return I ? I.t(key, vars) : key; };
  SV.onLang = function (fn) { var I = window.SlopI18n; return I && I.on ? I.on(fn) : function () {}; };
  SV.isKey = function (s) { return typeof s === 'string' && /^(vector|ui|menu)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(s); };
  SV.tx = function (s) { return SV.isKey(s) ? SV.t(s) : s; };
  SV.mark = function (el, keys) {
    var at = (el.getAttribute('data-i18n-attr') || '').split(';').filter(Boolean);
    Object.keys(keys).forEach(function (a) {
      var k = keys[a];
      if (a === 'text') { el.textContent = SV.t(k); el.setAttribute('data-i18n', k); return; }
      el.setAttribute(a, SV.t(k));
      at = at.filter(function (p) { return p.split(':')[0] !== a; }).concat([a + ':' + k]);
    });
    if (at.length) el.setAttribute('data-i18n-attr', at.join(';'));
    return el;
  };
  /** Sets one attribute ('text' for the text) to a key's words (marked) or to plain text. */
  SV.label = function (el, attr, s) {
    if (s == null || s === '') return el;
    if (SV.isKey(s)) { var o = {}; o[attr] = s; return SV.mark(el, o); }
    if (attr === 'text') el.textContent = s; else el.setAttribute(attr, s);
    return el;
  };
  /** Runs fn now and again after every language change (labels composed from words, which data-i18n cannot hold). */
  SV.live = function (fn) { fn(); SV.onLang(fn); };

  /* ================= object factories ================= */
  function mkStyle(o) { return Object.assign({ fill: null, stroke: null, sw: 1, cap: 'butt', join: 'miter', miter: 10, dash: null, opacity: 1, blend: 'normal', rule: 'nonzero' }, o || {}); }
  SV.mkStyle = mkStyle;
  function base(type, name, style) { return { id: uid(), type: type, name: name || '', hidden: false, locked: false, m: [1, 0, 0, 1, 0, 0], style: mkStyle(style) }; }
  SV.mk = {
    path: function (subs, style, name) { var o = base('path', name, style); o.subpaths = subs; return o; },
    d: function (d, style, name) { return SV.mk.path(G.parseD(d), style, name); },
    rect: function (x, y, w, h, rx, style, name) { var o = base('rect', name, style); o.x = x; o.y = y; o.w = w; o.h = h; o.rx = rx || 0; return o; },
    ellipse: function (cx, cy, rx, ry, style, name) { var o = base('ellipse', name, style); o.cx = cx; o.cy = cy; o.rx = rx; o.ry = ry; return o; },
    polygon: function (cx, cy, r, sides, style, name) { var o = base('polygon', name, style); o.cx = cx; o.cy = cy; o.r = r; o.sides = sides; return o; },
    star: function (cx, cy, r1, r2, points, style, name) { var o = base('star', name, style); o.cx = cx; o.cy = cy; o.r1 = r1; o.r2 = r2; o.points = points; return o; },
    text: function (x, y, text, font, style, name) { var o = base('text', name, style); o.x = x; o.y = y; o.text = text; o.font = Object.assign({ family: 'Inter Tight', size: 48, weight: 400, style: 'normal', align: 'left', lh: 1.2, tracking: 0 }, font || {}); return o; },
    image: function (asset, x, y, w, h, name) { var o = base('image', name, {}); o.asset = asset; o.x = x; o.y = y; o.w = w; o.h = h; return o; },
    group: function (children, name) { var o = base('group', name, {}); o.children = children; return o; },
    layer: function (name, color) { return { id: uid(), name: name, color: color || LAYER_COLORS[0], hidden: false, locked: false, expanded: true, children: [] }; }
  };
  var mk = SV.mk;
  SV.newDoc = function (w, h, name) {
    var d = { version: 1, name: name || ('Untitled-' + S.docCounter++), width: w || 1200, height: h || 800, layers: [mk.layer('Layer 1', LAYER_COLORS[0])], guides: { h: [], v: [] }, swatches: null, assets: {} }; // i18n-ignore: names stamped into the document
    return d;
  };

  $.LAYER_COLORS = LAYER_COLORS; $.S = S; $.clamp = clamp; $.clone = clone; $.esc = esc; $.lsDel = lsDel; $.lsGet = lsGet; $.lsSet = lsSet; $.mk = mk; $.uid = uid;
  SV.IS_MAC = IS_MAC;
})();
