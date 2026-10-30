// Slop Effects panels for the Effects tab (the ordered stack of each layer: add, enable, reorder, remove, and the numeric
// parameters with their stopwatches; the order is the order they are applied) and the Motion tab (animate in and out
// presets, and seeded Random motion with its bounds). Classic script: window.SlopEffects.propsFx.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h, numberOf } = ns.dom;
  const D = () => ns.defs, t = (k, v) => ns.defs.t(k, v);
  /** The Animate in/out presets as [id, name]: the ids of model/motion.js, named by the shared built-in presets' words
   *  (ui.presets.b.<id>, shared/i18n/ui/<code>/presets.js), read each time. */
  const presetList = () => ns.motion.PRESET_IDS.map((id) => [id, t('ui.presets.b.' + id.replace(/-/g, '_'))]);
  const MOTION_PROPS = ['position', 'scale', 'rotation', 'opacity'];
  const fmt = (v) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '');

  /** A labelled row. */
  const row = (label, control, extra) => h('div', { class: 'fx-row' }, h('label', null, label), control, extra || h('span'));

  /** The Effects tab. Returns { render, update }. */
  function mountFx(host, S, act) {
    let bindings = [];

    /** One numeric parameter: its value at the playhead, and a stopwatch. */
    function param(layer, fx, name, def) {
      const prop = `fx.${fx.id}.${name}`;
      const keyed = act.isKeyed(S.doc, layer.id, prop);
      const input = h('input', { class: 'sui-input', type: 'number', step: 'any', min: def.min, max: def.max, value: fmt(ns.values.valuesAt(S.doc, layer, S.playhead).fx[fx.id][name]), 'aria-label': D().word('param', name, def.label) });
      input.addEventListener('change', () => { const v = numberOf(input); if (v !== null) act.setValue(prop, v, layer.id); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      bindings.push({ input, get: () => ns.values.valuesAt(S.doc, act.sel(), S.playhead).fx[fx.id][name] });
      const lbl = D().word('param', name, def.label);
      const sw = h('button', { type: 'button', class: 'fx-key', 'aria-pressed': String(keyed), 'aria-label': t(keyed ? 'effects.props.unkey_aria' : 'effects.props.key_aria', { prop: lbl }), title: t('effects.fx.animate_tip'), onclick: () => act.toggleKeyed(prop, layer.id) }, '◆');
      return row(lbl, input, sw);
    }

    /** One effect in the stack, expanded when it is selected. */
    function card(layer, fx) {
      const def = D().EFFECTS[fx.kind], name = D().word('fx', fx.kind, def.label);
      const idx = layer.effects.findIndex((f) => f.id === fx.id);
      const on = h('input', { type: 'checkbox', checked: fx.on ? true : null, 'aria-label': t('effects.fx.on_aria', { name }), onchange: (e) => act.setEffectOn(fx.id, e.target.checked) });
      const head = h('header', null, on,
        h('b', { title: name }, name),
        h('button', { type: 'button', class: 'sui-btn', 'aria-label': t('effects.fx.move_up'), disabled: idx <= 0 ? true : null, onclick: () => act.moveEffect(fx.id, -1) }, '↑'),
        h('button', { type: 'button', class: 'sui-btn', 'aria-label': t('effects.fx.move_down'), disabled: idx >= layer.effects.length - 1 ? true : null, onclick: () => act.moveEffect(fx.id, 1) }, '↓'),
        h('button', { type: 'button', class: 'sui-btn sui-danger', 'aria-label': t('effects.fx.remove', { name }), onclick: () => act.removeEffect(fx.id) }, '×'));
      const open = S.sel.fx === fx.id;
      const rows = [];
      if (open) {
        for (const [name, p] of Object.entries(def.params)) {
          if (p.type === 'colour') {
            rows.push(row(D().word('param', name, p.label), h('input', { class: 'sui-input', type: 'color', value: fx.params[name], 'aria-label': D().word('param', name, p.label), style: 'height:30px;padding:2px', onchange: (e) => act.setValue(`fx.${fx.id}.${name}`, e.target.value, layer.id) })));
          } else rows.push(param(layer, fx, name, p));
        }
      }
      return h('div', {
        class: 'fx-card' + (open ? ' is-sel' : ''), 'data-fx': fx.id,
        onclick: (e) => { if (e.target.closest && e.target.closest('button, input, select')) return; S.select({ fx: open ? null : fx.id }); },
      }, head, rows.length ? rows : (fx.on ? null : h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.fx.off'))));
    }

    function render() {
      bindings = [];
      host.replaceChildren();
      const layer = act.sel();
      if (!layer) { host.append(h('div', { class: 'fx-empty' }, t('effects.fx.empty'))); return; }
      const kind = h('select', { class: 'sui-input', 'aria-label': t('effects.fx.to_add') }, D().EFFECT_KINDS.map((k) => h('option', { value: k }, D().word('fx', k, D().EFFECTS[k].label))));
      host.append(h('section', { class: 'fx-group', 'aria-label': t('effects.undo.add_effect') }, h('h3', null, t('effects.fx.stack')),
        row(t('effects.fx.effect'), kind, h('button', { type: 'button', class: 'sui-btn sui-primary', onclick: () => act.addEffect(kind.value) }, t('effects.fx.add'))),
        h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.fx.order_note'))));
      if (!layer.effects.length) host.append(h('div', { class: 'fx-empty' }, t('effects.fx.none')));
      for (const fx of layer.effects) host.append(card(layer, fx));
    }

    function update() {
      for (const b of bindings) {
        if (document.activeElement === b.input) continue;
        const layer = act.sel();
        if (layer) b.input.value = fmt(b.get());
      }
    }

    S.on((what) => { if (what === 'time') update(); else if (what === 'doc' || what === 'sel') { if (!S.isDragging()) render(); } });
    render();
    return { render, update };
  }

  /** The Motion tab: animate in and out, and Random motion. Returns { render }. */
  function mountMotion(host, S, act, ka) {
    let seedText = '', seedHex = g.SlopVideo.seed.hex(g.SlopVideo.seed.make());

    /** A preset picker and its button. */
    function presetRow(label, dir) {
      const sel = h('select', { class: 'sui-input', 'aria-label': t('effects.motion.preset_aria', { name: label }) }, presetList().map(([v, l]) => h('option', { value: v }, l)));
      return row(label, sel, h('button', { type: 'button', class: 'sui-btn', onclick: () => ka.animate(dir, sel.value) }, t(dir === 'in' ? 'effects.tr.in' : 'effects.tr.out')));
    }

    function render() {
      host.replaceChildren();
      const layer = act.sel();
      if (!layer) { host.append(h('div', { class: 'fx-empty' }, t('effects.motion.empty'))); return; }
      const ft = (what, end) => t(end ? 'effects.motion.to' : 'effects.motion.from', { what: t('effects.props.' + what) });
      const comp = S.doc.comp;
      const b = ns.motion.defaultBounds(comp);
      const bx0 = h('input', { class: 'sui-input', type: 'number', value: b.x[0], 'aria-label': t('effects.motion.from', { what: 'X' }) }), bx1 = h('input', { class: 'sui-input', type: 'number', value: b.x[1], 'aria-label': t('effects.motion.to', { what: 'X' }) });
      const by0 = h('input', { class: 'sui-input', type: 'number', value: b.y[0], 'aria-label': t('effects.motion.from', { what: 'Y' }) }), by1 = h('input', { class: 'sui-input', type: 'number', value: b.y[1], 'aria-label': t('effects.motion.to', { what: 'Y' }) });
      const s0 = h('input', { class: 'sui-input', type: 'number', value: b.scale[0], 'aria-label': ft('scale') }), s1 = h('input', { class: 'sui-input', type: 'number', value: b.scale[1], 'aria-label': ft('scale', 1) });
      const r0 = h('input', { class: 'sui-input', type: 'number', value: b.rotation[0], 'aria-label': ft('rotation') }), r1 = h('input', { class: 'sui-input', type: 'number', value: b.rotation[1], 'aria-label': ft('rotation', 1) });
      const o0 = h('input', { class: 'sui-input', type: 'number', value: b.opacity[0], 'aria-label': ft('opacity') }), o1 = h('input', { class: 'sui-input', type: 'number', value: b.opacity[1], 'aria-label': ft('opacity', 1) });
      const every = h('input', { class: 'sui-input', type: 'number', step: '0.05', min: 0.04, value: 0.5, 'aria-label': t('effects.motion.every_aria') });
      const seed = h('input', { class: 'sui-input', type: 'text', value: seedText, placeholder: seedHex, 'aria-label': t('effects.motion.seed'), oninput: (e) => { seedText = e.target.value; } });
      const newSeed = h('button', { type: 'button', class: 'sui-btn', onclick: () => { seedHex = g.SlopVideo.seed.hex(g.SlopVideo.seed.make()); seedText = ''; seed.value = ''; seed.placeholder = seedHex; } }, t('effects.motion.new_seed'));
      const props = MOTION_PROPS.map((v) => h('label', { class: 'sui-check' }, h('input', { type: 'checkbox', value: v, checked: true }), h('span', null, t('effects.props.' + v))));
      const pair = (a, b2) => h('div', { class: 'fx-pair' }, a, b2);
      const go = () => {
        const chosen = [...host.querySelectorAll('input[type=checkbox][value]')].filter((c) => c.checked).map((c) => c.value);
        const n = (x) => Number(x.value);
        ka.randomMotion({
          seed: g.SlopVideo.seed.parse(seedText || seedHex), props: chosen, every: n(every),
          bounds: { x: [n(bx0), n(bx1)], y: [n(by0), n(by1)], scale: [n(s0), n(s1)], rotation: [n(r0), n(r1)], opacity: [n(o0), n(o1)] },
        });
      };
      host.append(
        h('section', { class: 'fx-group', 'aria-label': t('effects.motion.inout') }, h('h3', null, t('effects.motion.inout')),
          presetRow(t('effects.motion.in'), 'in'), presetRow(t('effects.motion.out'), 'out'),
          h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.motion.inout_note'))),
        h('section', { class: 'fx-group', 'aria-label': t('effects.motion.random') }, h('h3', null, t('effects.motion.random')),
          row(t('effects.motion.seed'), seed, newSeed),
          row(t('effects.app.props'), h('div', { class: 'fx-chips' }, props)),
          row(t('effects.motion.every'), every),
          row('X', pair(bx0, bx1)), row('Y', pair(by0, by1)),
          row(t('effects.props.scale') + ' %', pair(s0, s1)), row(t('effects.props.rotation') + ' °', pair(r0, r1)), row(t('effects.props.opacity') + ' %', pair(o0, o1)),
          h('div', { class: 'fx-chips' }, h('button', { type: 'button', class: 'sui-btn sui-primary', onclick: go }, t('effects.motion.add'))),
          h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, t('effects.motion.note'))));
    }

    S.on((what) => { if (what === 'doc' || what === 'sel') { if (!S.isDragging()) render(); } });
    render();
    return { render };
  }

  ns.propsFx = { mountFx, mountMotion, presetList };
})(typeof window !== 'undefined' ? window : globalThis);
