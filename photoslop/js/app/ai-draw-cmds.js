/* PhotoSlop for the assistant: the drawing and tool commands (SlopCmd with argument schemas, so the AI panel, Ctrl+K,
 * macros and WebMCP get them): new_document, add_svg_layer, gradient_fill, draw_shape, use_tool (any toolbox tool along
 * points, through the tool's own handlers), click_tool, brush_stroke, transform_layer and list_tools. The work is in
 * ai-draw.js and ai-tool-use.js. Loaded on demand by SlopCmd.prepare() (app/commands.js), before ai-commands.js. */
'use strict';

(function () {
  if (!window.SlopCmd || !SlopCmd.register) return;
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const E = (name, values, def, description) => ({ name, type: 'enum', values, default: def, description });
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const COL = (name, description) => S(name, description + ': #rrggbb, #rrggbbaa or a colour name', { maxLength: 40 });
  const POINTS = { name: 'points', type: 'array', maxItems: 5000, items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 },
    description: 'document pixels [[x, y], [x, y, pressure 0–1], …]; one point is a click' };
  const LAYER = [S('name', 'name of the new layer'), N('opacity', 0, 100, 100, 'layer opacity %'), E('blend', BLENDS.map((b) => b[0]), 'normal', 'layer blend mode')]; // i18n-ignore: the assistant's commands, their docs and replies are API
  const FIT = { name: 'fit', type: 'boolean', default: false, description: 'shrink and move it so it all stays inside the canvas' }; // i18n-ignore: the assistant's commands, their docs and replies are API
  const XY = [N('x', -16384, 16384, 0, 'left edge px'), N('y', -16384, 16384, 0, 'top edge px'), N('width', 1, 16384, undefined, 'px'), N('height', 1, 16384, undefined, 'px')]; // i18n-ignore: the assistant's commands, their docs and replies are API
  const TOOL_IDS = TOOLS.map((t) => t.id);
  const OPTIONS = { name: 'options', type: 'object', description: 'the tool\'s options (see list_tools), e.g. { "size": 40, "hardness": 0.8, "opacity": 0.5, "color": "#ff0000", "tol": 20 }' };
  const list = [];
  const add = window.SlopCmd.aiAdder('ps', list);   // shared/commands/commands.js

  add('new_document', 'New document', [N('width', 1, 16384, 1920, 'px', { integer: true }), N('height', 1, 16384, 1080, 'px', { integer: true }), // i18n-ignore: the assistant's commands, their docs and replies are API
    S('background', 'a colour, or transparent', { default: '#ffffff', maxLength: 40 }), S('name', 'document name', { default: 'Untitled' })], // i18n-ignore: the assistant's commands, their docs and replies are API
  aiNewDocument, { description: 'Start a new picture in a new tab with a size and a background (the open ones stay as they are).' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('add_svg_layer', 'Add SVG as a layer', [S('svg', 'the SVG markup: gradients, paths, text, filters (feTurbulence, feGaussianBlur…), blend modes. No scripts or outside links.', { required: true, maxLength: 400000 })].concat(XY, [FIT], LAYER), // i18n-ignore: the assistant's commands, their docs and replies are API
    aiSvgLayer, { description: 'Draw SVG you write (at document size unless width/height are given) into a new named layer. The best way to make illustrations, backgrounds, logos and textures.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('gradient_fill', 'Gradient fill', [E('type', ['linear', 'radial', 'conic'], 'linear'), // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'colors', type: 'array', maxItems: 32, items: { type: 'string' }, description: 'colours from start to end, evenly spaced (default foreground → background)' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'stops', type: 'array', maxItems: 32, items: { type: 'object', properties: { offset: { type: 'number' }, color: { type: 'string' } } }, description: 'or stops [{ offset 0–1, color }]' },
    N('angle', -360, 360, 0, 'degrees: 0 left → right, 90 top → bottom (linear and conic)'), N('center_x', 0, 1, 0.5, 'centre as a fraction of the width'), N('center_y', 0, 1, 0.5, 'of the height'), // i18n-ignore: the assistant's commands, their docs and replies are API
    N('radius', 0.01, 4, 0.5, 'radial size as a fraction of the diagonal'), E('target', ['layer', 'new_layer'], 'layer', 'the active layer, or a new layer'), N('opacity', 0, 100, 100, '%'), E('blend', BLENDS.map((b) => b[0]), 'normal'), S('name', 'name of a new layer')], // i18n-ignore: the assistant's commands, their docs and replies are API
  aiGradientFill, { description: 'Fill the selection (or the whole layer) with a linear, radial or conic gradient of any colours.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('draw_shape', 'Draw a shape', [E('kind', ['rect', 'rounded', 'ellipse', 'polygon', 'star', 'heart', 'line', 'points', 'path'], 'rect')].concat(XY, // i18n-ignore: the assistant's commands, their docs and replies are API
    [COL('fill', 'fill colour, or none (default foreground)'), COL('stroke', 'outline colour, or none'), N('stroke_width', 0, 500, 4, 'px'), N('radius', 0, 5000, undefined, 'corner radius (rect, rounded)'), // i18n-ignore: the assistant's commands, their docs and replies are API
      N('sides', 3, 64, 5, 'polygon sides or star points', { integer: true }), { name: 'points', type: 'array', maxItems: 5000, items: { type: 'array', items: { type: 'number' } }, description: 'for points and line: [[x, y], …]' }, // i18n-ignore: the assistant's commands, their docs and replies are API
      { name: 'closed', type: 'boolean', default: true, description: 'points: close the outline' }, S('path', 'for path: SVG path data, e.g. "M10 10 C 40 0 60 80 100 60 Z"', { maxLength: 100000 }), // i18n-ignore: the assistant's commands, their docs and replies are API
      N('blur', 0, 500, 0, 'soft edge in px'), FIT], LAYER), // i18n-ignore: the assistant's commands, their docs and replies are API
  aiDrawShape, { description: 'Draw a shape into a new layer: rectangle, rounded rectangle, ellipse, polygon, star, heart, line, a list of points or an SVG path.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('use_tool', 'Use a tool', [E('tool', TOOL_IDS, 'brush', 'any toolbox tool (list_tools)'), POINTS, OPTIONS, // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'shift', type: 'boolean', default: false, description: 'hold Shift (add to a selection, straight lines, square shapes)' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'alt', type: 'boolean', default: false, description: 'hold Alt (subtract from a selection, from the centre)' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'source', type: 'array', items: { type: 'number' }, description: 'clone stamp and healing: [x, y] to copy from (an Alt-click there first)' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    S('text', 'type tool: the words to type at the point', { maxLength: 5000 }), { name: 'apply', type: 'boolean', default: true, description: 'crop: apply the crop after the drag' }], // i18n-ignore: the assistant's commands, their docs and replies are API
  aiUseTool, { description: 'Drive any PhotoSlop tool along points in document pixels, exactly as a mouse or pen would: brush, pencil, eraser, clone (with source), healing, dodge/burn, smudge, blur, sharpen, sponge, bucket (one point), gradient (from → to), shapes, type, move, crop, marquees, lasso, polygonal lasso, magic wand, eyedropper (returns the colour).' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('click_tool', 'Click with a tool', [E('tool', TOOL_IDS, 'bucket'), N('x', -16384, 16384, undefined, 'px', { required: true }), N('y', -16384, 16384, undefined, 'px', { required: true }), OPTIONS, // i18n-ignore: the assistant's commands, their docs and replies are API
    { name: 'shift', type: 'boolean', default: false }, { name: 'alt', type: 'boolean', default: false }, S('text', 'type tool: the words', { maxLength: 5000 })], // i18n-ignore: the assistant's commands, their docs and replies are API
  (a) => aiUseTool(Object.assign({}, a, { points: [[a.x, a.y]] })), { description: 'One click with a tool: paint bucket, magic wand, eyedropper, type, a brush dab.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('brush_stroke', 'Brush stroke', [POINTS, E('tool', ['brush', 'pencil', 'eraser', 'blur', 'sharpen', 'smudge', 'dodge', 'sponge'], 'brush'), N('size', 1, 1000, undefined, 'px'), // i18n-ignore: the assistant's commands, their docs and replies are API
    N('hardness', 0, 100, undefined, '%'), N('opacity', 1, 100, undefined, '%'), N('flow', 1, 100, undefined, '%'), COL('color', 'paint colour (foreground)')], // i18n-ignore: the assistant's commands, their docs and replies are API
  (a) => { const o = {}; for (const k of ['size', 'hardness', 'opacity', 'flow', 'color']) if (a[k] != null) o[k] = a[k]; return aiUseTool({ tool: a.tool, points: a.points, options: o }); },
  { description: 'Paint one stroke along points with a brush size, hardness, opacity and colour (the Brush tool itself).' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('transform_layer', 'Transform layer', [N('scale', 1, 10000, undefined, '% both ways'), N('scale_x', 1, 10000, undefined, '% width'), N('scale_y', 1, 10000, undefined, '% height'), // i18n-ignore: the assistant's commands, their docs and replies are API
    N('rotate', -360, 360, 0, 'degrees clockwise'), N('move_x', -16384, 16384, 0, 'px'), N('move_y', -16384, 16384, 0, 'px'), E('interpolation', ['bicubic', 'bilinear', 'nearest'], 'bicubic')], // i18n-ignore: the assistant's commands, their docs and replies are API
  aiTransformLayer, { description: 'Scale, rotate and move the active layer (or the selected pixels) with Free Transform, in one step.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  add('list_tools', 'List the tools', [], () => psToolCatalog(), { description: 'Every toolbox tool with its options (for use_tool).', macro: false }); // i18n-ignore: the assistant's commands, their docs and replies are API

  SlopCmd.register(list);
})();
