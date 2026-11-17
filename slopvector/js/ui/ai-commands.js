/* SlopVector for the assistant (and Ctrl+K, macros, WebMCP): SlopCmd commands with argument schemas
 * (shared/commands/args.js), all 'sv.ai.*', hidden from the palette. Each runs SlopVector's own code: the object factories
 * (SV.mk), SV.insertObj, the SVG import (IO.importSVGText), SV.cmd (group, arrange, align, distribute, pathfinder,
 * transformSel, deleteSel), SV.applyStyle-like style edits and SV.commit, so every command is one undo step.
 * Loaded on demand by SlopCmd.prepare() (ui/commands.js) after ai-io.js (SV.ai). */
(function () {
  'use strict';
  var SV = window.SV, S = SV.state, G = window.SVGeom, C = SV.cmd, IO = SV.io, AI = SV.ai, SC = window.SlopCmd;
  if (!SC || !SC.register) return;
  var N = function (name, min, max, def, description, extra) { return Object.assign({ name: name, type: 'number', min: min, max: max, default: def, description: description }, extra || {}); };
  var Str = function (name, description, extra) { return Object.assign({ name: name, type: 'string', maxLength: 300, description: description }, extra || {}); };
  var E = function (name, values, def, description) { return { name: name, type: 'enum', values: values, default: def, description: description }; };
  var B = function (name, def, description) { return { name: name, type: 'boolean', default: def, description: description }; };
  var OBJ = Str('object', 'an object id or name from app_state; the selection when empty');
  var PAINT = function (name, d) { return Str(name, d + ': #rrggbb, #rrggbbaa, a colour name, or none', { maxLength: 40 }); };
  var FIT = B('fit', false, 'shrink and move it so it stays inside the artboard');
  var list = [];
  function add(tool, title, args, run, extra) {
    list.push(Object.assign({ id: 'sv.ai.' + tool.replace(/_/g, '-'), tool: tool, title: title, group: 'AI', hidden: true, destructive: false, args: args,
      when: function () { return !!S.doc && !S.editing; },
      run: function (a) { return run(a || (window.SlopCmdArgs ? SlopCmdArgs.defaults(args) : {})); } }, extra || {}));
  }
  /** A paint value: null for none, a colour, or an error. */
  function paint(v, what) {
    if (v == null || v === '') return undefined;
    if (/^(none|transparent)$/i.test(String(v))) return null;
    var c = window.SlopCmdArgs.toColor(v);
    if (!c) throw new Error('“' + v + '” is not a colour (' + what + ')');
    return c;
  }
  function styleOf(a) {
    var st = {}, f = paint(a.fill, 'fill'), s = paint(a.stroke, 'stroke');
    st.fill = f === undefined ? S.style.fill : f;
    st.stroke = s === undefined ? (a.stroke_width ? S.style.stroke : null) : s;
    st.sw = a.stroke_width != null ? a.stroke_width : S.style.sw;
    if (a.opacity != null) st.opacity = a.opacity / 100;
    return SV.mkStyle(st);
  }
  /** Puts a new object on the active layer as one step, selected, and says where it landed. */
  function place(o, a, label) {
    if (a.name) o.name = String(a.name).slice(0, 80);
    if (a.fit) AI.fit(o);
    if (!SV.insertObj(o)) throw new Error('The active layer is locked or hidden');
    SV.select([o.id]); SV.commit(label);
    return 'Added ' + (o.name ? '“' + o.name + '”' : 'a ' + o.type) + ' (id ' + o.id + ').' + AI.boxNote('It', SV.objBBox(o)); // i18n-ignore: AI tool text written for agents (API)
  }
  /** Folds the last two history steps into one (a command that commits twice). */
  function fold() { if (S.hIdx > 1) { S.history.splice(S.hIdx - 1, 1); S.hIdx--; } }
  function withSel(ids, fn) { SV.select(ids); var r = fn(); return r; }
  var boxOf = function () { return AI.boxNote('The selection', SV.selBBox(S.sel)); }; // i18n-ignore: AI tool text written for agents (API)

  add('new_document', 'New document', [N('width', 1, 20000, 1200, 'px', { integer: true }), N('height', 1, 20000, 800, 'px', { integer: true }),
    PAINT('background', 'a background rectangle colour; none for a clear artboard'), Str('name', 'document name', { default: 'Untitled' })],
  function (a) {
    var d = SV.newDoc(a.width, a.height, a.name);
    SV.loadDoc(d, { fit: true }); S.fileName = null;
    var bg = paint(a.background, 'background');
    if (bg) d.layers[0].children.push(SV.mk.rect(0, 0, a.width, a.height, 0, { fill: bg }, 'Background'));
    SV.commit('new document');
    return 'New ' + a.width + ' × ' + a.height + ' document “' + d.name + '”' + (bg ? ' with a ' + bg + ' background' : '') + '. Undo brings the old one back.';
  }, { destructive: true, description: 'Replace the open drawing with a new, empty one (Undo brings the old one back).' }); // i18n-ignore: AI tool text written for agents (API)

  add('add_svg', 'Add SVG', [Str('svg', 'SVG markup: paths, shapes, text, gradients. No scripts or outside links.', { required: true, maxLength: 400000 }),
    N('x', -20000, 20000, undefined, 'centre x; the artboard centre when empty'), N('y', -20000, 20000, undefined, 'centre y'), Str('name', 'name of the new object or group'), FIT],
  function (a) {
    AI.checkSvg(a.svg);
    var at = { x: a.x != null ? a.x : S.doc.width / 2, y: a.y != null ? a.y : S.doc.height / 2 };
    var o = IO.importSVGText(a.svg, { at: at, name: a.name || 'Placed SVG' });
    if (!o) throw new Error('Nothing in that SVG could be imported');
    if (a.fit) { AI.fit(o); if (SV.commit('fit')) fold(); }
    return 'Imported the SVG as editable objects (' + (o.type === 'group' ? o.children.length + ' in a group, ' : '') + 'id ' + o.id + ').' + AI.boxNote('It', SV.objBBox(o)); // i18n-ignore: AI tool text written for agents (API)
  }, { description: 'Import SVG you write as editable SlopVector objects (paths, shapes, text, gradients) in one step.' }); // i18n-ignore: AI tool text written for agents (API)

  add('add_shape', 'Add shape', [E('kind', ['rect', 'ellipse', 'polygon', 'star', 'line', 'path'], 'rect'), N('x', -20000, 20000, 0, 'left px'), N('y', -20000, 20000, 0, 'top px'),
    N('width', 0.1, 40000, 200, 'px'), N('height', 0.1, 40000, 200, 'px'), N('radius', 0, 20000, 0, 'rect corner radius'), N('sides', 3, 64, 6, 'polygon sides / star points', { integer: true }),
    N('inner', 0.05, 0.95, 0.45, 'star inner radius as a fraction'), Str('d', 'for path: SVG path data, e.g. "M0 0 L100 0 L50 80 Z"', { maxLength: 100000 }),
    PAINT('fill', 'fill (default the current fill)'), PAINT('stroke', 'outline'), N('stroke_width', 0, 1000, undefined, 'px'), N('opacity', 0, 100, 100, '%'), Str('name', 'object name'), FIT],
  function (a) {
    var st = styleOf(a), x = a.x, y = a.y, w = a.width, h = a.height, o;
    if (a.kind === 'rect') o = SV.mk.rect(x, y, w, h, a.radius, st);
    else if (a.kind === 'ellipse') o = SV.mk.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, st);
    else if (a.kind === 'polygon') o = SV.mk.polygon(x + w / 2, y + h / 2, Math.min(w, h) / 2, a.sides, st);
    else if (a.kind === 'star') o = SV.mk.star(x + w / 2, y + h / 2, Math.min(w, h) / 2, Math.min(w, h) / 2 * a.inner, a.sides, st);
    else if (a.kind === 'line') { if (!st.stroke) st.stroke = S.style.stroke || '#000000'; st.fill = null; o = SV.mk.d('M' + x + ' ' + y + ' L' + (x + w) + ' ' + (y + h), st); }
    else { if (!a.d) throw new Error('Give d: SVG path data'); o = SV.mk.d(a.d, st); if (!o.subpaths.length) throw new Error('That path data has no points'); }
    return place(o, a, a.kind);
  }, { description: 'Add a rectangle, ellipse, polygon, star, line or path with fill, outline and opacity.' }); // i18n-ignore: AI tool text written for agents (API)

  add('add_text', 'Add text', [Str('text', 'the words; \\n starts a new line', { required: true, maxLength: 5000 }), N('x', -20000, 20000, undefined, 'x of the first baseline; centred when empty'),
    N('y', -20000, 20000, undefined, 'baseline y'), E('font', Object.keys(SV.FONTS), 'Inter Tight'), N('size', 1, 2000, 48, 'px'), N('weight', 100, 900, 700, '', { step: 100 }),
    E('align', ['left', 'center', 'right'], 'left'), PAINT('color', 'text colour (default the current fill)'), Str('name', 'object name'), FIT],
  function (a) {
    var o = SV.mk.text(0, 0, a.text, { family: a.font, size: a.size, weight: a.weight, align: a.align }, { fill: paint(a.color, 'color') || S.style.fill || '#000000' });
    var b = SV.objBBox(o), half = { left: -b.w / 2, center: 0, right: b.w / 2 }[a.align];
    o.x = a.x != null ? a.x : S.doc.width / 2 + half;
    o.y = a.y != null ? a.y : S.doc.height / 2 + a.size / 3;
    SV.clearTextCache();
    return place(o, a, 'text');
  }, { description: 'Add a text object with font, size, weight, alignment and colour.' }); // i18n-ignore: AI tool text written for agents (API)

  add('set_style', 'Set style', [OBJ, PAINT('fill', 'fill'), PAINT('stroke', 'outline'), N('stroke_width', 0, 1000, undefined, 'px'), N('opacity', 0, 100, undefined, '%'),
    E('blend', SV.BLENDS, undefined, 'blend mode'), Str('rename', 'new name')],
  function (a) {
    var ids = AI.targets(a.object), f = paint(a.fill, 'fill'), s = paint(a.stroke, 'stroke');
    ids.forEach(function (id) {
      var top = SV.getObj(id);
      SV.leaves(top).forEach(function (o) {
        if (!o.style || o.type === 'group' || o.type === 'image') return;
        if (f !== undefined) o.style.fill = f; if (s !== undefined) o.style.stroke = s; if (a.stroke_width != null) o.style.sw = a.stroke_width;
      });
      if (a.opacity != null) top.style.opacity = a.opacity / 100;
      if (a.blend) top.style.blend = a.blend;
      if (a.rename) top.name = String(a.rename).slice(0, 80);
    });
    SV.select(ids); SV.commit('style');
    return 'Restyled ' + ids.length + ' object' + (ids.length === 1 ? '' : 's') + '.';
  }, { description: 'Change the fill, outline, opacity, blend mode or name of an object (or the selection).' }); // i18n-ignore: AI tool text written for agents (API)

  add('transform', 'Transform', [OBJ, N('move_x', -40000, 40000, 0, 'px'), N('move_y', -40000, 40000, 0, 'px'), N('scale', 1, 100000, undefined, '% both ways'),
    N('scale_x', 1, 100000, undefined, '% width'), N('scale_y', 1, 100000, undefined, '% height'), N('rotate', -360, 360, 0, 'degrees clockwise, around the centre'), FIT],
  function (a) {
    var ids = AI.targets(a.object); SV.select(ids);
    var b = SV.selBBox(ids), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var sx = (a.scale_x != null ? a.scale_x : a.scale != null ? a.scale : 100) / 100, sy = (a.scale_y != null ? a.scale_y : a.scale != null ? a.scale : 100) / 100;
    var M = G.mul(G.translate(a.move_x, a.move_y), G.mul(G.rotate(a.rotate * Math.PI / 180, cx, cy), G.scale(sx, sy, cx, cy)));
    ids.forEach(function (id) { SV.transformObj(SV.getObj(id), M); if (a.fit) AI.fit(SV.getObj(id)); });
    SV.select(ids); SV.commit('transform');
    return 'Transformed ' + ids.length + ' object' + (ids.length === 1 ? '' : 's') + '.' + boxOf();
  }, { description: 'Move, scale and rotate an object (or the selection) with numbers.' }); // i18n-ignore: AI tool text written for agents (API)

  add('select_objects', 'Select objects', [{ name: 'objects', type: 'array', items: { type: 'string' }, maxItems: 500, description: 'ids or names; empty selects nothing' }, B('all', false, 'select everything')],
  function (a) {
    if (a.all) SV.selectAll(); else SV.select([].concat.apply([], (a.objects || []).map(AI.targets)));
    return S.sel.length + ' selected.' + (S.sel.length ? boxOf() : '');
  });
  var many = function (q) { return q && q.length ? [].concat.apply([], q.map(AI.targets)) : AI.targets(''); };
  var OBJS = { name: 'objects', type: 'array', items: { type: 'string' }, maxItems: 500, description: 'ids or names; the selection when empty' };
  add('align', 'Align', [OBJS, E('how', ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'], 'hcenter'), E('to', ['selection', 'artboard'], 'selection')],
  function (a) { var keep = S.prefs.alignTo; S.prefs.alignTo = a.to; try { withSel(many(a.objects), function () { C.align(a.how); }); } finally { S.prefs.alignTo = keep; } return 'Aligned ' + S.sel.length + ' (' + a.how + ').' + boxOf(); });
  add('distribute', 'Distribute', [OBJS, E('how', ['hcenter', 'vcenter', 'hspace', 'vspace'], 'hspace')], function (a) {
    var ids = many(a.objects); if (ids.length < 3) throw new Error('Distribute needs three or more objects');
    withSel(ids, function () { C.distribute(a.how); }); return 'Distributed ' + ids.length + ' objects.';
  });
  add('pathfinder', 'Combine shapes', [OBJS, E('op', ['union', 'minus', 'intersect', 'xor'], 'union', 'minus cuts the front shapes out of the back one')], function (a) {
    var ids = many(a.objects); if (ids.length < 2) throw new Error('Combine needs two or more shapes');
    var np = withSel(ids, function () { return C.pathfinder(a.op); });
    if (!np) throw new Error('The shapes do not overlap, or text and images were chosen');
    return 'Combined into one path (id ' + np.id + ').' + AI.boxNote('It', SV.objBBox(np)); // i18n-ignore: AI tool text written for agents (API)
  });
  add('group', 'Group', [OBJS, Str('name', 'group name')], function (a) { withSel(many(a.objects), function () { C.group(); }); var g = SV.getObj(S.sel[0]); if (a.name) { g.name = String(a.name).slice(0, 80); if (SV.commit('rename')) fold(); } return 'Grouped (id ' + g.id + ').'; });
  add('ungroup', 'Ungroup', [OBJ], function (a) { withSel(AI.targets(a.object), function () { C.ungroup(); }); return S.sel.length + ' objects after ungrouping.'; });
  add('arrange', 'Arrange', [OBJ, E('how', ['front', 'forward', 'backward', 'back'], 'front')], function (a) { withSel(AI.targets(a.object), function () { C.arrange(a.how); }); return 'Moved ' + a.how + '.'; });
  add('delete_object', 'Delete object', [OBJ], function (a) { var ids = AI.targets(a.object); withSel(ids, function () { C.deleteSel(); }); return 'Deleted ' + ids.length + ' object' + (ids.length === 1 ? '' : 's') + '.'; }, { destructive: true });
  add('export', 'Export', [E('format', ['svg', 'png', 'jpg', 'pdf'], 'svg'), E('to', ['drive', 'download', 'both'], 'drive'), N('scale', 0.1, 8, 1, 'raster scale'),
    Str('background', 'raster background colour; transparent when empty (PNG)', { maxLength: 40 }), Str('name', 'file name without extension', { maxLength: 120 })],
  AI.export, { description: 'Export the artwork as editable SVG, PNG, JPG or PDF to Slop Drive (other apps can open it) and/or a download.' }); // i18n-ignore: AI tool text written for agents (API)
  add('undo', 'Undo', [N('steps', 1, 20, 1, '', { integer: true })], function (a) { var n = 0; while (n < a.steps && S.hIdx > 0) { SV.undo(); n++; } return 'Undid ' + n + ' step' + (n === 1 ? '' : 's') + '.'; });

  SC.register(list);
  SC.provide({ state: AI.state, checkpoint: AI.checkpoint });
})();
