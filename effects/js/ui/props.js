// Slop Effects property panel, Layer tab: the selected layer's name, visibility, parent, stacking, transform (position,
// anchor, scale, rotation, opacity, each with a stopwatch that keys it at the playhead) and its source (colour, shape, text,
// media). Editing a keyed property keys it at the playhead; an unkeyed one changes the base value. Inputs commit on change
// (Enter or blur). Values at the playhead refresh as the playhead moves. Classic script: window.SlopEffects.props.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h, numberOf } = ns.dom;
  const D = () => ns.defs, t = (k, v) => ns.defs.t(k, v);
  const TEXT_WEIGHTS = [[400, 'effects.props.w_regular'], [700, 'effects.props.w_bold'], [900, 'effects.props.w_black']];
  const SHAPE_LIST = D().SHAPES;

  /** Mounts the panel into host (the Layer tab). Returns { render, update }. */
  function mount(host, S, act, io) {
    let bindings = []; // { input, get } refreshed on playhead moves

    /** A labelled row: label, control and an optional trailing element. */
    const row = (label, control, extra) => h('div', { class: 'fx-row' }, h('label', null, label), control, extra || h('span'));

    /** A number input that commits on change. */
    function num(value, onset, opts = {}) {
      const input = h('input', { class: 'sui-input', type: 'number', step: opts.step || 'any', value: fmt(value), 'aria-label': opts.label || '', min: opts.min, max: opts.max });
      input.addEventListener('change', () => { const v = numberOf(input); if (v !== null) onset(v); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      return input;
    }
    const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '');

    /** The stopwatch button for a property: keyed or not, and whether a key sits exactly at the playhead. */
    function stopwatch(layer, prop) {
      const keyed = act.isKeyed(S.doc, layer.id, prop);
      const here = keyed && (S.doc.tl.tracks[layer.id][prop] || []).some((k) => Math.abs(k.t - S.playhead) < 1e-4);
      return h('button', {
        type: 'button', class: 'fx-key', 'aria-pressed': String(keyed), 'data-keyed-now': String(here), 'aria-label': t(keyed ? 'effects.props.unkey_aria' : 'effects.props.key_aria', { prop: D().word('prop', prop, prop) }),
        title: t(keyed ? 'effects.props.keyed_tip' : 'effects.props.key_tip'),
        onclick: () => act.toggleKeyed(prop, layer.id),
      }, '◆');
    }

    /** Transform rows: position, anchor, scale (x, y), rotation and opacity. */
    function transform(layer) {
      const vals = ns.values.valuesAt(S.doc, layer, S.playhead);
      const rows = [];
      const pair = (prop, label, unit) => {
        const v = vals[prop];
        /** Changes one component, keeping the other at its current value at the playhead. */
        const commit = (i, x) => { const cur = act.valueNow(layer.id, prop).slice(); cur[i] = x; act.setValue(prop, cur, layer.id); };
        const xi = num(v[0], (x) => commit(0, x), { label: `${label} x` }); // i18n-ignore: the label is translated
        const yi = num(v[1], (y) => commit(1, y), { label: `${label} y` }); // i18n-ignore
        bindings.push({ input: xi, get: () => act.valueNow(layer.id, prop)[0] }, { input: yi, get: () => act.valueNow(layer.id, prop)[1] });
        rows.push(h('div', { class: 'fx-row' }, h('label', null, label + (unit ? ` (${unit})` : '')), h('div', { class: 'fx-pair' }, xi, yi), stopwatch(layer, prop)));
      };
      const single = (prop, label, unit, opts) => {
        const input = num(vals[prop], (x) => act.setValue(prop, Math.min(opts.max, Math.max(opts.min, x))), { label, min: opts.min, max: opts.max, step: opts.step });
        bindings.push({ input, get: () => act.valueNow(layer.id, prop) });
        rows.push(h('div', { class: 'fx-row' }, h('label', null, label + (unit ? ` (${unit})` : '')), input, stopwatch(layer, prop)));
      };
      pair('position', t('effects.props.position'), 'px');
      pair('anchor', t('effects.props.anchor'), 'px');
      pair('scale', t('effects.props.scale'), '%');
      single('rotation', t('effects.props.rotation'), '°', { min: -100000, max: 100000, step: 'any' });
      single('opacity', t('effects.props.opacity'), '%', { min: 0, max: 100, step: 'any' });
      return h('section', { class: 'fx-group', 'aria-label': t('effects.props.transform') }, h('h3', null, t('effects.props.transform_head')), rows);
    }

    /** Source fields by layer type. */
    function source(layer) {
      const s = layer.source;
      const set = (patch) => { if (Object.keys(patch).length) S.edit(t('effects.undo.edit_layer'), (d) => ns.layers.setSource(d, layer.id, patch)); };
      const SRC = t('effects.props.source'), W = t('effects.props.width'), H = t('effects.props.height');
      const colour = (val, key, label) => h('input', { class: 'sui-input', type: 'color', value: val, 'aria-label': label, style: 'height:30px;padding:2px', onchange: (e) => set({ [key]: e.target.value }) });
      if (layer.type === 'solid') {
        return h('section', { class: 'fx-group', 'aria-label': SRC }, h('h3', null, D().word('type', 'solid', 'Solid')), // i18n-ignore: English fallback of the effects.def.* words
          row(t('effects.props.colour'), colour(s.color, 'color', t('effects.props.solid_colour'))),
          row(W, num(s.w, (v) => set({ w: Math.max(1, v) }), { label: W }), h('span', null, 'px')),
          row(H, num(s.h, (v) => set({ h: Math.max(1, v) }), { label: H }), h('span', null, 'px')));
      }
      if (layer.type === 'shape') {
        const SH = D().word('type', 'shape', 'Shape'); // i18n-ignore: English fallback of the effects.def.* words
        const shape = h('select', { class: 'sui-input', 'aria-label': SH, onchange: (e) => set({ shape: e.target.value }) }, SHAPE_LIST.map(([v, l]) => h('option', { value: v, selected: s.shape === v ? true : null }, D().word('shape', v, l))));
        return h('section', { class: 'fx-group', 'aria-label': SRC }, h('h3', null, SH),
          row(SH, shape),
          row(W, num(s.w, (v) => set({ w: Math.max(1, v) }), { label: W }), h('span', null, 'px')),
          row(H, num(s.h, (v) => set({ h: Math.max(1, v) }), { label: H }), h('span', null, 'px')),
          s.shape === 'rrect' ? row(t('effects.props.corner'), num(s.radius, (v) => set({ radius: Math.max(0, v) }), { label: t('effects.props.corner_radius') }), h('span', null, 'px')) : null,
          s.shape === 'line' ? null : row(t('effects.props.fill'), colour(s.fill, 'fill', t('effects.props.fill_colour'))),
          row(t('effects.props.stroke'), colour(s.stroke, 'stroke', t('effects.props.stroke_colour'))),
          row(t('effects.props.stroke_width'), num(s.strokeWidth, (v) => set({ strokeWidth: Math.max(0, v) }), { label: t('effects.props.stroke_width') }), h('span', null, 'px')));
      }
      if (layer.type === 'text') {
        const TX = D().word('type', 'text', 'Text'); // i18n-ignore: English fallback of the effects.def.* words
        const text = h('textarea', { class: 'sui-input', rows: 2, 'aria-label': TX, onchange: (e) => set({ text: e.target.value }) }, s.text);
        const FN = t('effects.props.font'), WT = t('effects.props.weight'), AL = t('effects.props.align'), SZ = t('effects.props.size');
        const fontSel = h('select', { class: 'sui-input', 'aria-label': FN }, h('option', { value: s.font }, s.font));
        const weight = h('select', { class: 'sui-input', 'aria-label': WT, onchange: (e) => set({ weight: Number(e.target.value) }) }, TEXT_WEIGHTS.map(([v, k]) => h('option', { value: v, selected: s.weight === v ? true : null }, t(k))));
        const align = h('select', { class: 'sui-input', 'aria-label': AL, onchange: (e) => set({ align: e.target.value }) }, D().ALIGN.map((a) => h('option', { value: a, selected: s.align === a ? true : null }, D().word('align', a, a))));
        const fit = h('button', { type: 'button', class: 'sui-btn', onclick: () => fitText(layer) }, t('effects.props.fit'));
        const node = h('section', { class: 'fx-group', 'aria-label': SRC }, h('h3', null, TX),
          row(TX, text), row(FN, fontSel), row(WT, weight), row(SZ, num(s.size, (v) => set({ size: Math.max(1, v) }), { label: SZ }), h('span', null, 'px')),
          row(AL, align), row(t('effects.props.colour'), colour(s.color, 'color', t('effects.props.text_colour'))), h('div', { class: 'fx-chips' }, fit));
        queueMicrotask(() => { if (g.SlopFonts && g.SlopFonts.attach) { const api = g.SlopFonts.attach(fontSel, { value: s.font, getMore: true, onPick: (f) => set({ font: f }) }); void api; } });
        return node;
      }
      if (layer.type === 'image' || layer.type === 'video') {
        const bin = ns.media.get(s.mediaId);
        const name = bin ? bin.name : (S.doc.media.find((m) => m.id === s.mediaId) || {}).name || t('effects.io.missing_title');
        const relink = !bin ? h('button', { type: 'button', class: 'sui-btn fx-warn', onclick: () => io.relink(s.mediaId) }, t('effects.props.relink')) : null;
        return h('section', { class: 'fx-group', 'aria-label': SRC }, h('h3', null, D().word('type', layer.type, D().label(D().LAYER_TYPES, layer.type))),
          h('p', { class: bin ? '' : 'fx-warn', style: 'margin:0' }, name, bin ? ` · ${s.w}×${s.h}${layer.type === 'video' ? ` · ${(bin.dur || 0).toFixed(2)} s` : ''}` : ' · ' + t('effects.props.not_loaded')),
          relink);
      }
      return h('section', { class: 'fx-group', 'aria-label': SRC }, h('h3', null, D().word('type', 'null', 'Null')), h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.props.null_note'))); // i18n-ignore: English fallback of the effects.def.* words
    }

    /** Sets a text layer's box to the measured width and height of its text. */
    function fitText(layer) {
      const s = layer.source;
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${s.weight} ${s.size}px ${ns.draw.fontStack(s.font)}`;
      const lines = String(s.text || '').split('\n');
      const w = Math.ceil(Math.max(1, ...lines.map((l) => c.measureText(l).width)));
      const hh = Math.ceil(lines.length * s.size * 1.2);
      S.edit(t('effects.undo.fit_text'), (d) => ns.layers.setSource(d, layer.id, { w, h: hh }));
    }

    /** Parent choices: none, and every layer that would not make a loop. */
    function parentRow(layer) {
      const options = [h('option', { value: '' }, t('ui.none'))];
      for (const l of S.doc.layers) if (l.id !== layer.id && !ns.values.wouldLoop(S.doc, layer.id, l.id)) options.push(h('option', { value: l.id, selected: layer.parent === l.id ? true : null }, l.name));
      return row(t('effects.props.parent'), h('select', { class: 'sui-input', 'aria-label': t('effects.props.parent_layer'), onchange: (e) => act.setParent(e.target.value || null, layer.id) }, options));
    }

    /** The header: name, visibility and the stack buttons. */
    function header(layer) {
      const idx = S.doc.layers.findIndex((l) => l.id === layer.id);
      const name = h('input', { class: 'sui-input', type: 'text', value: layer.name, maxlength: 80, 'aria-label': t('effects.props.layer_name'), onchange: (e) => S.edit(t('effects.undo.rename_layer'), (d) => ns.layers.rename(d, layer.id, e.target.value)) });
      const hid = h('input', { type: 'checkbox', checked: layer.hidden ? null : true, 'aria-label': t('effects.props.visible'), onchange: (e) => S.edit(t('effects.undo.visibility'), (d) => ns.layers.setHidden(d, layer.id, !e.target.checked)) });
      return h('section', { class: 'fx-group', 'aria-label': t('effects.app.layer') },
        h('h3', null, D().word('type', layer.type, D().label(D().LAYER_TYPES, layer.type))),
        row(t('effects.props.name'), name),
        row(t('effects.props.visible'), h('label', { class: 'sui-check' }, hid, h('span', null, t('effects.props.visible_note')))),
        parentRow(layer),
        h('div', { class: 'fx-chips' },
          h('button', { type: 'button', class: 'sui-btn', disabled: idx <= 0 ? true : null, title: t('effects.props.up_tip'), onclick: () => act.moveLayer(-1) }, t('effects.props.up')),
          h('button', { type: 'button', class: 'sui-btn', disabled: idx >= S.doc.layers.length - 1 ? true : null, title: t('effects.props.down_tip'), onclick: () => act.moveLayer(1) }, t('effects.props.down')),
          h('button', { type: 'button', class: 'sui-btn', title: t('effects.props.dup_tip'), onclick: () => act.duplicateLayer() }, t('ui.duplicate')),
          h('button', { type: 'button', class: 'sui-btn sui-danger', title: t('effects.props.del_tip'), onclick: () => act.removeLayer() }, t('ui.delete'))));
    }

    /** Re-renders for the selected layer, or the empty state with the add buttons. */
    function render() {
      bindings = [];
      host.replaceChildren();
      const layer = act.sel();
      if (!layer) {
        host.append(h('div', { class: 'fx-empty' }, t('effects.props.empty')),
          h('div', { class: 'fx-chips', style: 'justify-content:center' },
            ...['solid', 'shape', 'text', 'null'].map((k) => h('button', { type: 'button', class: 'sui-btn', onclick: () => act.addLayer(k, k === 'text' ? { size: 120 } : {}) }, D().word('type', k, D().label(D().LAYER_TYPES, k)))),
            h('button', { type: 'button', class: 'sui-btn', onclick: () => io.importFromComputer() }, t('effects.props.media'))));
        return;
      }
      host.append(header(layer), transform(layer), source(layer));
      if (layer.type !== 'null' && layer.type !== 'solid' && layer.type !== 'shape' && layer.type !== 'text') {
        host.append(h('p', { class: 'fx-empty' }, t('effects.props.media_size')));
      }
    }

    /** Updates the values at the playhead without rebuilding the panel (keeps focus). */
    function update() {
      for (const b of bindings) {
        if (document.activeElement === b.input) continue;
        const v = b.get();
        b.input.value = fmt(v);
      }
    }

    S.on((what) => {
      if (what === 'time') update();
      else if (what === 'doc' || what === 'sel') { if (!S.isDragging()) render(); else update(); }
    });
    render();
    return { render, update };
  }

  ns.props = { mount, SHAPE_LIST };
})(typeof window !== 'undefined' ? window : globalThis);
