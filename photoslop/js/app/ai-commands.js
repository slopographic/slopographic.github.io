/* PhotoSlop for the assistant: SlopCmd commands with argument schemas (shared/commands/args.js), so the Slop AI panel
 * can do real edits ("blur the background" → select_subject, invert_selection, gaussian_blur radius 8). Loaded on demand
 * by SlopCmd.prepare() with ai-ops.js and ai-tools.js; also registers the state provider and the checkpoint.
 * The commands are hidden from the palette (the menus already have the same actions with their dialogs). Each is one
 * undo step; delete and crop are destructive and the panel asks first. */
'use strict';

(function () {
  if (!window.SlopCmd || !SlopCmd.register) return;
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const E = (name, values, def, description) => ({ name, type: 'enum', values, default: def, description });
  const B = (name, def, description) => ({ name, type: 'boolean', default: def, description });
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const hasSel = () => !!D.sel, hasLayer = () => !!activeLayer();
  const list = [];
  const add = window.SlopCmd.aiAdder('ps', list);   // shared/commands/commands.js

  /* adjustments and filters */
  add('brightness_contrast', 'Brightness/Contrast', [N('brightness', -150, 150, 0, 'negative darkens'), N('contrast', -100, 100, 0)], (a) => aiFilter('brightness', { b: a.brightness, c: a.contrast })); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('hue_saturation', 'Hue/Saturation', [N('hue', -180, 180, 0, 'degrees'), N('saturation', -100, 100, 0, '-100 is grey'), N('lightness', -100, 100, 0), B('colorize', false)],
    (a) => aiFilter('huesat', { h: a.hue, s: a.saturation, l: a.lightness, colorize: a.colorize }));
  add('levels', 'Levels', [E('preset', ['custom', 'brighten', 'darken', 'more-contrast', 'less-contrast', 'lift-shadows', 'auto'], 'custom'), N('black', 0, 253, 0, 'input black point'), N('gamma', 0.1, 9.99, 1, 'midtones; above 1 brightens', { step: 0.01 }), N('white', 2, 255, 255, 'input white point')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => (a.preset === 'auto' ? aiFilter('autocontrast', {}, tr('photoslop.ai.step_levels_auto')) : aiFilter('levels', a.preset === 'custom' ? { inB: a.black, gamma: a.gamma, inW: a.white } : LEVELS_PRESETS[a.preset], tr('photoslop.ai.step_levels'))));
  add('curves', 'Curves', [E('preset', Object.keys(CURVES_PRESETS), 'more-contrast')], (a) => aiFilter('curves', { curve: curvesParam(CURVES_PRESETS[a.preset]) }, tr('photoslop.ai.step_curves'))); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('gaussian_blur', 'Gaussian blur', [N('radius', 0.1, 250, 4, 'px', { step: 0.1 })], (a) => aiFilter('gauss', { r: a.radius }), { description: 'Blur the active layer, or only the selection when there is one.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('motion_blur', 'Motion blur', [N('angle', -180, 180, 0, 'degrees'), N('distance', 1, 400, 30, 'px', { integer: true })], (a) => aiFilter('motion', { a: a.angle, dist: a.distance })); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('sharpen', 'Sharpen', [N('amount', 1, 500, 120, '%', { integer: true }), N('radius', 0.1, 100, 2, 'px', { step: 0.1 }), N('threshold', 0, 255, 2, 'levels', { integer: true })], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => aiFilter('unsharp', { amt: a.amount, r: a.radius, t: a.threshold }, tr('photoslop.ai.step_sharpen')));
  add('add_noise', 'Add noise', [N('amount', 0.1, 100, 12, '%', { step: 0.1 }), B('monochromatic', false)], (a) => aiFilter('noise', { amt: a.amount, mono: a.monochromatic })); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('desaturate', 'Black and white', [], () => aiFilter('desaturate', {}), { description: 'Make the active layer greyscale.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('vignette', 'Vignette', [N('amount', 0, 100, 55, '%'), N('size', 10, 150, 75, '%')], (a) => aiFilter('vignette', { amt: a.amount, size: a.size })); // i18n-ignore: the assistant's commands, their docs and replies are API

  /* selection */
  add('select_subject', 'Select subject', [], async () => { aiLayer(false); const b = Hist.idx; await selectSubject(); if (Hist.idx === b) throw new Error('No subject was found'); return `Selected the subject (${D.sel.bounds.w} × ${D.sel.bounds.h} px).`; }, // i18n-ignore: the assistant's commands, their docs and replies are API
    { description: 'Select the main subject (person, object) with the on-device model.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('select_all', 'Select all', [], () => selectAll()); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('invert_selection', 'Invert selection', [], () => selectInverse(), { description: 'Swap selected and unselected areas (for example to work on the background).' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('deselect', 'Deselect', [], () => deselect(), { when: hasSel }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('crop_to_selection', 'Crop to selection', [], () => { cropTo(D.sel.bounds, true); fitView(); }, { when: hasSel, destructive: true }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('crop', 'Crop to a ratio', [E('ratio', PS_RATIOS, '1:1', 'width:height, kept around the centre; 1:1 is a square')], (a) => psCropRatio(a.ratio), // i18n-ignore: the assistant's commands, their docs and replies are API
    { destructive: true, description: 'Crop the whole image to a ratio around its centre (1:1 is a square).' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('filter', 'Apply a filter', [{ name: 'filter', type: 'enum', required: true, values: FILTERS.filter((f) => f.id && !f.sep && f.fn && f.menu !== 'style').map((f) => f.id), description: 'filter id' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    S('params', 'the filter settings as JSON, the rest at their defaults', { maxLength: 20000 })], // i18n-ignore: the assistant's commands, their docs and replies are API
  (a) => aiFilter(a.filter, a.params ? JSON.parse(a.params) : {}, FILTER_BY_ID[a.filter].name.replace('…', '')), { ai: false, description: 'Any filter with its settings: what a macro records from the filter dialogs.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  /* image */
  add('image_size', 'Image size', [N('width', 1, 16384, undefined, 'px', { integer: true }), N('height', 1, 16384, undefined, 'px', { integer: true }), B('keep_aspect', true), E('resample', ['bicubic', 'bilinear', 'nearest'], 'bicubic')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => { const r = aiImageSize(a); fitView(); return r; }, { description: 'Scale the whole image to a new size in px.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('canvas_size', 'Canvas size', [N('width', 1, 16384, undefined, 'px', { integer: true }), N('height', 1, 16384, undefined, 'px', { integer: true }), E('anchor', Object.keys(ANCHORS), 'center'), E('fill', ['transparent', 'background', 'foreground', 'white', 'black'], 'transparent')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => { aiCanvasSize(a); fitView(); return `The canvas is now ${D.w} × ${D.h} px.`; }, { description: 'Add or cut canvas around the image without scaling it.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('rotate', 'Rotate', [E('angle', ['90', '-90', '180'], '90', '90 is clockwise'), E('target', ['image', 'layer'], 'image')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => { const k = { 90: 'cw', '-90': 'ccw', 180: '180' }[a.angle]; if (a.target === 'layer') transformLayerQuick(k); else transformCanvas(k); fitView(); });
  add('flip', 'Flip', [E('direction', ['horizontal', 'vertical'], 'horizontal'), E('target', ['image', 'layer'], 'image')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => { const k = a.direction === 'vertical' ? 'flipV' : 'flipH'; if (a.target === 'layer') transformLayerQuick(k); else transformCanvas(k); });

  /* layers */
  add('new_layer', 'New layer', [S('name', 'layer name')], (a) => { const L = addLayer(a.name ? { name: a.name } : {}); return `Added “${L.name}”.`; }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('duplicate_layer', 'Duplicate layer', [], () => duplicateLayer(), { when: hasLayer }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('delete_layer', 'Delete layer', [S('layer', 'name of the layer; the active one when empty')], (a) => { const L = aiFindLayer(a.layer); deleteLayer(L.id); return `Deleted “${L.name}”.`; }, { destructive: true }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('select_layer', 'Make a layer active', [S('layer', 'layer name', { required: true })], (a) => { const L = aiFindLayer(a.layer); D.activeId = L.id; UI.editMask = false; emit('doc'); return `“${L.name}” is the active layer.`; }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('set_layer', 'Layer settings', [S('layer', 'layer name; the active one when empty'), N('opacity', 0, 100, undefined, '%'), E('blend', BLENDS.map((b) => b[0]), undefined, 'blend mode'), B('visible', undefined), S('rename', 'new name')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => {
      const L = aiFindLayer(a.layer), p = {};
      if (a.opacity != null) p.opacity = a.opacity / 100; if (a.blend) p.blend = a.blend; if (a.visible != null) p.visible = a.visible; if (a.rename) p.name = a.rename.slice(0, 80);
      if (!Object.keys(p).length) throw new Error('Nothing to change: give opacity, blend, visible or rename');
      setLayerProps(L.id, p, tr('photoslop.ai.step_layer_props'));
      return `“${p.name || L.name}”: ` + Object.entries(p).map(([k, v]) => `${k} ${k === 'opacity' ? Math.round(v * 100) + '%' : v}`).join(', ') + '.';
    }, { description: 'Change a layer’s opacity, blend mode, visibility or name.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('fill', 'Fill with colour', [{ name: 'color', type: 'color', default: '#000000', description: 'colour such as #ff8800 or red' }, N('opacity', 1, 100, 100, '%')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => { aiLayer(); fillSelection(a.color, tr('photoslop.ai.step_fill'), a.opacity / 100); return `Filled ${D.sel ? 'the selection' : 'the layer'} with ${a.color}.`; }, { description: 'Fill the selection (or the whole active layer) with a colour.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('add_text', 'Add text', [S('text', 'the words', { required: true, maxLength: 500 }), N('size', 4, 1000, 96, 'px', { integer: true }), { name: 'color', type: 'color', default: '#000000' }, // i18n-ignore: the assistant's commands, their docs and replies are API
    E('position', ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'right'], 'center'), N('x', -16384, 16384, undefined, 'left edge px, overrides position'), N('y', -16384, 16384, undefined, 'top edge px'), // i18n-ignore: the assistant's commands, their docs and replies are API
    E('font', TYPE_FONTS, undefined), B('bold', true), B('fit', false, 'shrink the size so all the text stays inside the canvas')], aiAddText, { description: 'Add an editable text layer.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  /* output, undo, on-device AI */
  add('export', 'Export', [E('format', ['png', 'jpeg', 'webp'], 'png'), N('quality', 1, 100, 90, 'JPEG/WebP quality', { integer: true }), E('scale', ['25', '50', '100', '200'], '100', '% of the size'), B('transparent', true, 'PNG only')], // i18n-ignore: the assistant's commands, their docs and replies are API
    (a) => aiExport(Object.assign({}, a, { scale: Number(a.scale) })), { description: 'Download the image as a file.', macro: false });   // a macro's file is written by Workflows // i18n-ignore: the assistant's commands, their docs and replies are API
  add('undo', 'Undo', [N('steps', 1, 20, 1, '', { integer: true })], (a) => { let n = 0; while (n < a.steps && Hist.idx > 0) { undo(); n++; } return `Undid ${n} step${n === 1 ? '' : 's'}.`; }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('remove_background', 'Remove background', [E('mode', ['mask', 'delete'], 'mask', 'mask hides it (undoable, editable); delete erases it')], aiRemoveBackground, { when: hasLayer, description: 'Hide the background of the active layer with the on-device model.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('upscale', 'Upscale (AI)', [E('scale', ['2', '4'], '2')], aiUpscale, { description: 'Enlarge the whole image 2× or 4× with the on-device upscaler.' }); // i18n-ignore: the assistant's commands, their docs and replies are API
  add('denoise', 'Denoise', [E('strength', ['light', 'medium', 'strong'], 'medium')], aiDenoise, { when: hasLayer, description: 'Smooth grain and noise while keeping edges.' }); // i18n-ignore: the assistant's commands, their docs and replies are API

  SlopCmd.register(list);
  SlopCmd.provide({ state: aiState, checkpoint: aiCheckpoint });
})();
