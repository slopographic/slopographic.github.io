// Slop Effects commands with arguments (shared/commands/args.js), for the Slop AI panel, WebMCP and macros: a new
// project, layers, properties and keyframes, effects, animate in and out, random motion, reorder, media from Slop Drive,
// a render saved to Slop Drive, and a PNG frame or the project file to Slop Drive or a download (ai-export.js). They call
// the app's own actions and model through the store, and each is one undo step (oneStep folds the actions a command
// calls). They show in the command palette too: there a command runs with its defaults, or opens the app's own dialog.
// Helpers: ai-ops.js. Classic script: window.SlopEffects.aiCmd.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const N = (name, min, max, def, description, extra) => Object.assign({ name, type: 'number', min, max, default: def, description }, extra);
  const E = (name, values, def, description) => ({ name, type: 'enum', values, default: def, description });
  const B = (name, description) => ({ name, type: 'boolean', description });
  const T = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const COLOR = (name, description, def) => ({ name, type: 'color', default: def, description });

  /** Registers the commands. ctx: the same parts cmd.js gets ({ S, act, ka, io, renderDialog, compDialog }). */
  function init(ctx) {
    const C = g.SlopCmd;
    if (!C || !C.register) return;
    const { S, act, io } = ctx, D = ns.defs, L = ns.layers, K = ns.keys;
    const ops = ns.aiOps.create(ctx);

    /** Runs fn (which may call several actions) as one undo step labelled label. */
    function oneStep(label, fn) {
      const before = S.doc, hist = S.hist;
      let out;
      try { out = fn(); } catch (e) { if (S.doc !== before) { S.doc = before; S.hist = hist; S.tidy(); S.emit('doc'); } throw e; }
      if (S.doc !== before) { S.hist = ns.history.push(hist, before); S.lastLabel = label; }
      return out;
    }
    const pick = (L0) => { if (S.sel.layer !== L0.id) S.select({ layer: L0.id, keys: [], fx: null }); return L0; };
    const LAYER = T('layer', 'layer id (l1), name or stack index (0 is the top); the selected layer when empty');
    const PROP = E('property', D.PROP_NAMES, 'position', 'position and anchor in px, scale in %, rotation in degrees, opacity 0–100');
    const XYV = [N('x', -100000, 100000, undefined, 'x (or the width scale) for position, anchor, scale'), N('y', -100000, 100000, undefined, 'y (or the height scale)'),
      N('value', -100000, 100000, undefined, 'the number for rotation or opacity; for scale it sets both')];
    const EASES = D.EASES.filter((e) => e[0] !== 'bezier').map((e) => e[0]);
    const union = D.paramUnion();
    const FX_PARAMS = Object.keys(union).map((k) => (union[k].colour ? COLOR(k, 'colour (shadow, glow)') : N(k, union[k].min, union[k].max, undefined, 'used by: ' + D.EFFECT_KINDS.filter((kind) => D.EFFECTS[kind].params[k]).join(', '))));
    const FX_HELP = D.EFFECT_KINDS.map((k) => `${k} (${Object.keys(D.EFFECTS[k].params).join(', ')})`).join('; ');
    const SIZE_IDS = D.SIZES.map((s) => s.id);
    const COMP = [E('size', SIZE_IDS, undefined, 'a social size: ' + D.SIZES.map((s) => `${s.id} ${s.w}×${s.h}`).join(', ')),
      N('width', 16, 7680, undefined, 'px (even)', { integer: true }), N('height', 16, 4320, undefined, 'px (even)', { integer: true }),
      E('fps', D.FPS.map(String), undefined, 'frames per second'), N('duration', 0.1, 600, undefined, 'seconds'),
      COLOR('background', 'background colour, or "transparent"')];
    /** A composition patch from the arguments (a size first, then width and height override it). */
    function compPatch(a) {
      const p = {};
      const sz = a.size && a.size !== 'custom' ? D.SIZES.find((s) => s.id === a.size) : null;
      if (sz) { p.width = sz.w; p.height = sz.h; }
      if (a.width != null) p.width = a.width;
      if (a.height != null) p.height = a.height;
      if (a.fps != null) p.fps = Number(a.fps);
      if (a.duration != null) p.duration = a.duration;
      if (a.background) p.background = /^#[0-9a-f]{6}00$/i.test(a.background) ? 'transparent' : a.background.slice(0, 7);
      return p;
    }
    const compText = (c) => `${c.width}×${c.height}, ${c.fps} fps, ${c.duration} s, background ${c.background}`;
    function setParams(layerId, fx, a) {
      const used = [], skipped = [];
      for (const k of Object.keys(union)) {
        if (a[k] == null) continue;
        if (!D.EFFECTS[fx.kind].params[k]) { skipped.push(k); continue; }
        S.edit('Set effect', (d) => L.setEffectParam(d, layerId, fx.id, k, a[k]));
        used.push(k);
      }
      return { used, skipped };
    }
    const paramText = (layerId, fxId, r) => {
      const f = ns.core.findLayer(S.doc, layerId).effects.find((x) => x.id === fxId);
      return (r.used.length ? ' ' + r.used.map((k) => `${k} ${f.params[k]}`).join(', ') + '.' : '') + (r.skipped.length ? ` ${f.kind} has no ${r.skipped.join(', ')}, so those were ignored.` : '');
    };

    const list = [];
    /** palette(): what the command does from the palette or a key (no arguments); default: run with the defaults. */
    function add(tool, title, group, args, run, extra = {}) {
      const { palette } = extra;
      delete extra.palette;
      list.push(Object.assign({ id: 'fx.ai.' + tool.replace(/_/g, '-'), tool, title, group, destructive: false, args,
        run: (a, rctx) => (a == null && palette ? palette() : run(a || (g.SlopCmdArgs ? g.SlopCmdArgs.defaults(args) : {}), rctx || {})) }, extra));
    }

    add('new_project', 'New project with a size and length', 'File', [T('name', 'project name', { default: 'Untitled' })].concat(COMP), (a) => {
      const comp = ns.core.normComp(Object.assign({}, ns.io.DEFAULT_COMP, compPatch(a)));
      S.replace(ns.core.newDoc({ name: a.name || 'Untitled', comp }), 'New project');
      S.setFile({ name: '', driveId: '' });
      return `Started “${S.doc.name}”: ${compText(S.doc.comp)}. The old project was replaced (Undo brings it back).`;
    }, { destructive: true, palette: () => io.newProject(), description: 'Start a new empty project (replaces the open one). Pick a social size or a width and height, the frame rate, length and background.' });

    add('set_composition', 'Composition size, length and background', 'Composition', [T('name', 'rename the project')].concat(COMP), (a) => oneStep('Composition', () => {
      const p = compPatch(a);
      if (!Object.keys(p).length && !a.name) throw new Error('Nothing to change: give a size, width, height, fps, duration, background or name');
      if (Object.keys(p).length) act.setComp(p);
      if (a.name) act.renameProject(a.name);
      return `Composition: ${compText(S.doc.comp)}.`;
    }), { palette: () => ctx.compDialog(), description: 'Change the composition: social size, width, height, frame rate, length in seconds, background, or the project name.' });

    add('add_layer', 'Add a layer with settings', 'Layer', [E('type', ['text', 'solid', 'shape', 'null'], 'text'), T('name', 'layer name'),
      T('text', 'the words of a text layer', { maxLength: 2000 }), T('font', 'font family for text, for example Inter'), N('size', 4, 1000, undefined, 'text size in px', { integer: true }),
      COLOR('color', 'text colour, solid colour or shape fill'), E('shape', D.SHAPES.map((s) => s[0]), undefined, 'shape kind'),
      N('width', 1, 7680, undefined, 'px (solid and shape)'), N('height', 1, 4320, undefined, 'px'), N('x', -4000, 4000, undefined, 'centre x in px'), N('y', -4000, 4000, undefined, 'centre y in px'),
      N('opacity', 0, 100, undefined, '%')], (a) => oneStep('Add ' + a.type, () => {
      const o = { name: a.name || undefined, text: a.text || undefined, font: a.font || undefined, shape: a.shape, w: a.width, h: a.height };
      if (a.type === 'text') o.size = a.size || 120;
      if (a.type === 'solid' && a.color) o.color = a.color;
      const id = act.addLayer(a.type, o);
      if (a.color && a.type === 'text') S.edit('Text colour', (d) => L.setSource(d, id, { color: a.color }));
      if (a.color && a.type === 'shape') S.edit('Shape fill', (d) => L.setSource(d, id, { fill: a.color }));
      const lay = ns.core.findLayer(S.doc, id);
      if (a.x != null || a.y != null) S.edit('Position', (d) => L.setBase(d, id, 'position', [a.x != null ? a.x : lay.base.position[0], a.y != null ? a.y : lay.base.position[1]]));
      if (a.opacity != null) S.edit('Opacity', (d) => L.setBase(d, id, 'opacity', a.opacity));
      return `Added ${a.type} layer ${id} (“${lay.name}”).`;
    }), { palette: () => act.addLayer('text', { size: 120 }), description: 'Add a text, solid, shape or null layer on top of the selected one, with its text, font, size, colour and position.' });

    add('set_layer_property', 'Set a layer property', 'Layer', [LAYER, PROP].concat(XYV, [N('time', 0, 600, undefined, 'seconds; moves the playhead there (used when the property has keyframes)')]), (a) => {
      const lay = ops.layer(a.layer);
      if (a.time != null) S.seek(a.time);
      const v = ops.valueFor(lay, a.property, a, S.playhead);
      const keyed = act.isKeyed(S.doc, lay.id, a.property);
      act.setValue(a.property, v, lay.id);
      return `${lay.name}: ${a.property} ${ops.show(v)}${keyed ? ` (a keyframe at ${S.playhead} s)` : ''}.`;
    }, { description: 'Set position, anchor, scale, rotation or opacity of a layer. When the property is animated it sets a keyframe at the playhead (or at time).' });

    add('add_keyframe', 'Add a keyframe', 'Keyframes', [LAYER, PROP].concat(XYV, [N('time', 0, 600, undefined, 'seconds; the playhead when empty'),
      E('ease', EASES, 'linear', 'easing from this key to the next')]), (a) => {
      const lay = ops.layer(a.layer), t = ops.time(a.time);
      const has = a.x != null || a.y != null || a.value != null;
      const v = has ? ops.valueFor(lay, a.property, a, t) : ns.values.valuesAt(S.doc, lay, t)[a.property];
      S.edit('Add keyframe', (d) => K.setKeyAt(d, lay.id, a.property, t, Array.isArray(v) ? v.slice() : v, a.ease));
      return `${lay.name}: ${a.property} keyframe at ${t} s, ${ops.show(v)}, ${a.ease}.`;
    }, { description: 'Animate: put a keyframe on a layer property at a time, with its value and the easing to the next key. Two keys make it move.' });

    add('add_effect', 'Add an effect with settings', 'Effects', [LAYER, E('kind', D.EFFECT_KINDS, 'glow', 'effect kind')].concat(FX_PARAMS), (a) => oneStep('Add effect', () => {
      const lay = pick(ops.layer(a.layer));
      act.addEffect(a.kind);
      const fx = ns.core.findLayer(S.doc, lay.id).effects.slice(-1)[0];
      const r = setParams(lay.id, fx, a);
      return `Added ${a.kind} (${fx.id}) to ${lay.name}.` + paramText(lay.id, fx.id, r);
    }), { description: 'Add an effect to a layer, with its settings (values outside the range are clamped). Kinds and settings: ' + FX_HELP + '.' });

    add('set_effect', 'Change an effect', 'Effects', [LAYER, T('effect', 'effect id (e2) or kind; the selected or last effect when empty'), B('on', 'turn the effect on or off')].concat(FX_PARAMS), (a) => oneStep('Set effect', () => {
      const lay = ops.layer(a.layer), fx = ops.effect(lay, a.effect);
      if (a.on != null) S.edit(a.on ? 'Enable effect' : 'Disable effect', (d) => L.setEffectOn(d, lay.id, fx.id, a.on));
      const r = setParams(lay.id, fx, a);
      if (a.on == null && !r.used.length) throw new Error(`Nothing to change. ${fx.kind} takes: ${Object.keys(D.EFFECTS[fx.kind].params).join(', ')}, on`);
      return `${lay.name}: ${fx.kind} (${fx.id})${a.on != null ? (a.on ? ' on' : ' off') : ''}.` + paramText(lay.id, fx.id, r);
    }), { description: 'Change the settings of an effect a layer already has, or turn it on or off.' });

    add('remove_effect', 'Remove an effect', 'Effects', [LAYER, T('effect', 'effect id (e2) or kind; the selected or last effect when empty')], (a) => {
      const lay = pick(ops.layer(a.layer)), fx = ops.effect(lay, a.effect);
      act.removeEffect(fx.id);
      return `Removed ${fx.kind} (${fx.id}) from ${lay.name}.`;
    }, { destructive: true, description: 'Remove one effect from a layer.' });

    add('animate', 'Animate a layer in or out', 'Motion', [LAYER, E('direction', ['in', 'out'], 'in', 'in: at the start; out: at the end'), E('preset', ns.motion.PRESET_IDS, 'fade-in')], (a) => {
      const lay = ops.layer(a.layer);
      S.edit(`Animate ${a.direction}`, (d) => ns.motion.animate(d, lay.id, a.direction, a.preset));
      return `${lay.name} animates ${a.direction} with ${a.preset}.`;
    }, { description: 'A ready-made entrance or exit (fade-in, slide-up, pop, spin-in) on a layer, from where it rests.' });

    add('random_motion', 'Random motion with a seed', 'Motion', [LAYER, N('seed', 0, 4294967295, 1, 'the same seed gives the same motion', { integer: true }),
      T('properties', 'comma list of position, scale, rotation, opacity', { default: 'position,scale,rotation,opacity' }), N('every', 0.04, 10, 0.5, 'seconds between keys'),
      N('from', 0, 600, undefined, 'start, seconds'), N('to', 0, 600, undefined, 'end, seconds'), E('ease', EASES, 'easeInOutQuad')], (a) => {
      const lay = ops.layer(a.layer), props = String(a.properties).split(/[\s,]+/).filter(Boolean);
      S.edit('Random motion', (d) => ns.motion.randomMotion(d, lay.id, { seed: a.seed, props, every: a.every, from: a.from, to: a.to, ease: a.ease }));
      return `${lay.name}: random ${props.join(', ')} with seed ${a.seed}.`;
    }, { palette: () => ctx.focusMotion(), description: 'Seeded random keyframes (wiggle) on a layer, inside the composition.' });

    add('delete_layer', 'Delete a layer', 'Layer', [LAYER], (a) => {
      const lay = pick(ops.layer(a.layer));
      act.removeLayer();
      return `Deleted ${lay.id} (“${lay.name}”).`;
    }, { destructive: true, description: 'Delete a layer with its keyframes and effects.' });

    add('duplicate_layer', 'Duplicate a layer', 'Layer', [LAYER], (a) => {
      const lay = pick(ops.layer(a.layer));
      act.duplicateLayer();
      return `Duplicated ${lay.name} as ${S.sel.layer}.`;
    }, { description: 'Copy a layer with its keyframes and effects, just above it.' });

    add('move_layer', 'Reorder a layer', 'Layer', [LAYER, E('to', ['up', 'down', 'top', 'bottom'], 'up', 'up brings it forward'), N('steps', 1, 100, 1, 'for up and down', { integer: true })], (a) => oneStep('Move layer', () => {
      const lay = pick(ops.layer(a.layer)), at = () => S.doc.layers.findIndex((l) => l.id === lay.id);
      const n = a.to === 'top' ? at() : a.to === 'bottom' ? S.doc.layers.length - 1 - at() : a.steps;
      for (let i = 0; i < n; i++) act.moveLayer(a.to === 'up' || a.to === 'top' ? -1 : 1);
      return `${lay.name} is now at position ${at()} of ${S.doc.layers.length} (0 is the top).`;
    }), { description: 'Move a layer up or down the stack, or to the top or bottom.' });

    add('edit_layer', 'Edit a layer', 'Layer', [LAYER, T('rename', 'new name'), B('hidden', 'hide or show'), T('text', 'new words for a text layer', { maxLength: 2000 }),
      T('font', 'font family'), N('size', 4, 1000, undefined, 'text size in px', { integer: true }), COLOR('color', 'text colour, solid colour or shape fill'),
      T('parent', 'parent layer id or name; "none" to unparent')], (a) => oneStep('Edit layer', () => {
      const lay = ops.layer(a.layer), done = [], src = {};
      if (a.rename) { S.edit('Rename layer', (d) => L.rename(d, lay.id, a.rename)); done.push('renamed'); }
      if (a.hidden != null) { S.edit('Hide layer', (d) => L.setHidden(d, lay.id, a.hidden)); done.push(a.hidden ? 'hidden' : 'shown'); }
      if (lay.type === 'text') { if (a.text) src.text = a.text; if (a.font) src.font = a.font; if (a.size) src.size = a.size; if (a.color) src.color = a.color; }
      else if (a.text || a.font || a.size) throw new Error(`${lay.name} is a ${lay.type} layer, not text`);
      if (a.color && lay.type === 'solid') src.color = a.color;
      if (a.color && lay.type === 'shape') src.fill = a.color;
      if (Object.keys(src).length) { S.edit('Layer source', (d) => L.setSource(d, lay.id, src)); done.push(Object.keys(src).join(', ')); }
      if (a.parent) { const p = /^none$/i.test(a.parent) ? null : ops.layer(a.parent).id; S.edit('Parent layer', (d) => L.setParent(d, lay.id, p)); done.push(p ? 'parent ' + p : 'no parent'); }
      if (!done.length) throw new Error('Nothing to change: give rename, hidden, text, font, size, color or parent');
      return `${lay.id}: ${done.join(', ')}.`;
    }), { description: 'Rename, hide or show a layer, change its text, font, size or colour, or parent it to another layer.' });

    add('add_media_from_drive', 'Add media from Slop Drive by id', 'Layer', [T('drive_id', 'the Slop Drive file id'), T('name', 'or a part of the file name')], (a) => ops.addMedia(a),
      { palette: () => io.importFromDrive(), description: 'Add an image or video from Slop Drive as a new layer, by its file id or name.' });

    add('render', 'Render to Slop Drive', 'File', [E('format', ['webm', 'mp4', 'png'], 'webm', 'webm or mp4 video (real time), png: a zip of frames'), E('range', ['all', 'range'], 'all', 'range: only the play range'),
      E('save', ['drive', 'download'], 'drive'), T('name', 'file name without extension; the project name when empty')], (a, rctx) => ops.render(a, { signal: rctx.signal, onProgress: rctx.onProgress }),
    { palette: () => ctx.renderDialog(), description: 'Render the composition (WebM, MP4 where the browser can, or a PNG frame zip) and save it to Slop Drive. Video takes as long as the composition.' });

    const TO = E('to', ['drive', 'download', 'both'], 'drive', 'Slop Drive, a download, or both');
    const xp = ns.aiExport.create(S);
    add('export_frame', 'Export a frame as PNG', 'File', [N('time', 0, 600, undefined, 'seconds; the playhead when empty'), T('name', 'file name start; the project name when empty'), TO],
      (a) => xp.exportFrame(a), { description: 'Save one frame of the composition as a PNG at its full size (with transparency), to Slop Drive and/or a download.' });
    add('save_project', 'Save the project', 'File', [TO], (a) => xp.saveProject(a),
      { palette: () => io.saveDrive(), description: 'Save the project file (layers, keyframes, effects, composition; media by name) to Slop Drive and/or a download. A project opened from Slop Drive is saved back to its file.' });

    add('go_to_time', 'Go to a time', 'Playback', [N('time', 0, 600, 0, 'seconds')], (a) => { S.seek(a.time); return `The playhead is at ${S.playhead} s.`; },
      { description: 'Move the playhead to a time in seconds.' });

    C.register(list);
    C.provide({ state: ops.state, checkpoint: ops.checkpoint });
    return { ops, oneStep };
  }

  ns.aiCmd = { init };
})(typeof window !== 'undefined' ? window : globalThis);
