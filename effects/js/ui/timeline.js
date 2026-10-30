// Slop Effects timeline: a ruler with the playhead, one row per layer (a summary lane of its keys), and expanded property
// rows (position, anchor, scale, rotation, opacity, and each effect's numeric parameters). Keys are diamonds on frames;
// timeline-keys.js handles selecting and dragging them. A row click selects the layer. The view re-renders on document
// changes, but not while a key is being dragged (the dragged diamonds move in place instead). Classic script:
// window.SlopEffects.timeline.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h } = ns.dom;
  const D = () => ns.defs, t = (k, v) => ns.defs.t(k, v);
  const ICON = { solid: 'Sd', shape: 'Sh', text: 'T', image: 'Im', video: 'Vd', null: 'Nl' }; // i18n-ignore: the icons are letters
  const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60];
  /** Gap between the label column and time 0, so a key at 0 is not hidden under the labels. */
  const PAD = 8;

  /** Mounts the timeline into host. Returns { render, placePlayhead }. */
  function mount(host, S, act) {
    const view = { zoom: null, open: new Set(), labelW: 230 };
    const keyEls = new Map(); // "layer|prop|t" -> diamond element, for moving them during a drag
    // The playhead moves through the transport when there is one (main.js): the player owns the time, and a plain
    // S.seek is put back to the player's time on its next frame.
    const seek = (time) => { const tr = ns.app && ns.app.tr; if (tr && tr.seekTo) tr.seekTo(time); else S.seek(time); };
    const pps = () => {
      if (view.zoom) return view.zoom;
      const w = host.clientWidth || 640;
      return Math.max(20, (w - view.labelW - 40) / Math.max(0.1, S.doc.comp.duration));
    };

    /** Ruler step (seconds) so that labels sit at least 60 px apart. */
    const stepFor = (p) => STEPS.find((s) => s * p >= 60) || 60;

    /** The keys of a layer as { prop, label, times } rows, in display order (props, then each effect's numeric parameters). */
    function propRows(layer) {
      const rows = [];
      for (const pd of D().PROPS) rows.push({ prop: pd.name, label: D().word('prop', pd.name, pd.label) });
      for (const fx of layer.effects) {
        rows.push({ head: true, label: D().word('fx', fx.kind, D().EFFECTS[fx.kind].label) + (fx.on ? '' : ' ' + t('effects.tl.off')) });
        for (const [name, def] of Object.entries(D().EFFECTS[fx.kind].params)) {
          if (def.type !== 'colour') rows.push({ prop: `fx.${fx.id}.${name}`, label: D().word('param', name, def.label), indent: true });
        }
      }
      return rows;
    }

    /** Every key time of a layer, with the refs that sit on it: [{ t, refs: [{layer, prop, t}] }]. */
    function summaryOf(layer) {
      const tracks = S.doc.tl.tracks[layer.id] || {};
      const byT = new Map();
      for (const prop of Object.keys(tracks)) {
        for (const k of tracks[prop]) {
          const key = k.t.toFixed(6);
          if (!byT.has(key)) byT.set(key, { t: k.t, refs: [] });
          byT.get(key).refs.push({ layer: layer.id, prop, t: k.t });
        }
      }
      return [...byT.values()].sort((a, b) => a.t - b.t);
    }

    const isSel = (r) => S.sel.keys.some((k) => k.layer === r.layer && k.prop === r.prop && Math.abs(k.t - r.t) < 1e-6);

    /** A diamond at time t for the given refs (bound to drag and select). */
    function diamond(refs, p, title, easeHold) {
      const at = refs[0].t;
      const el = h('div', {
        class: 'fx-diamond' + (refs.some(isSel) ? ' is-sel' : '') + (easeHold ? ' is-hold' : ''),
        style: `left:${(PAD + at * p).toFixed(3)}px`,
        role: 'button', tabindex: 0, title,
        'aria-label': `${title}`,
        'data-t': at,
      });
      refs.forEach((r) => keyEls.set(`${r.layer}|${r.prop}|${r.t.toFixed(6)}`, el));
      ns.timelineKeys.bind(el, refs, { S, act, pps: () => pps(), moveDiamonds });
      return el;
    }

    /** A lane (the track area of one row) with the diamonds for the given key list. */
    function lane(p, width, items) {
      const l = h('div', { class: 'fx-lane', style: `width:${width + PAD}px` });
      l.addEventListener('click', (e) => {
        if (e.target.classList && e.target.classList.contains('fx-diamond')) return;
        const x = e.clientX - l.getBoundingClientRect().left - PAD;
        S.select({ keys: [], fx: S.sel.fx });
        seek(x / p);
      });
      for (const it of items) l.append(diamond(it.refs, p, it.title, it.hold));
      return l;
    }

    /** One row for a layer: its label cell and its summary lane (and the property rows when it is open). */
    function layerRows(layer, p, width) {
      const isOpen = view.open.has(layer.id);
      const sel = S.sel.layer === layer.id;
      const bin = layer.source.mediaId ? ns.media.get(layer.source.mediaId) : null;
      const missing = (layer.type === 'image' || layer.type === 'video') && !bin;
      const parent = layer.parent ? S.doc.layers.find((l) => l.id === layer.parent) : null;
      const cell = h('div', {
        class: 'fx-lcell', role: 'button', tabindex: 0, 'aria-current': sel ? 'true' : null,
        onclick: (e) => {
          if (e.target.closest && e.target.closest('button')) return;
          S.select({ layer: layer.id, keys: [], fx: null });
        },
        onkeydown: (e) => { if (e.key === 'Enter') S.select({ layer: layer.id, keys: [], fx: null }); },
      },
      h('button', { type: 'button', 'aria-label': t(isOpen ? 'effects.tl.collapse' : 'effects.tl.expand'), 'aria-expanded': String(isOpen), onclick: () => { if (isOpen) view.open.delete(layer.id); else view.open.add(layer.id); render(); } }, isOpen ? '▾' : '▸'),
      h('button', { type: 'button', 'aria-label': t(layer.hidden ? 'effects.tl.show' : 'effects.tl.hide'), 'aria-pressed': String(!layer.hidden), title: t(layer.hidden ? 'effects.tl.hidden' : 'effects.props.visible'),
        onclick: () => S.edit(t(layer.hidden ? 'effects.tl.show' : 'effects.tl.hide'), (d) => ns.layers.setHidden(d, layer.id, !layer.hidden)) }, layer.hidden ? '◌' : '●'),
      h('span', { class: 'fx-ic', title: D().word('type', layer.type, D().label(D().LAYER_TYPES, layer.type)) }, ICON[layer.type] || '?'), // i18n-ignore: the icons are letters
      h('b', { title: layer.name }, layer.name),
      parent ? h('span', { class: 'fx-ic', title: t('effects.tl.parent', { name: parent.name }) }, '↳') : null,
      missing ? h('span', { class: 'fx-warn', title: t('effects.tl.missing') }, '!') : null);
      const sum = summaryOf(layer);
      const summaryItems = sum.map((s) => ({ t: s.t, refs: s.refs, title: t('effects.tl.keys_at', { name: layer.name, keys: t('effects.tl.keys_n', { n: s.refs.length }), t: s.t.toFixed(2) }), hold: s.refs.every((r) => keyOf(layer, r.prop, r.t) === 'hold') }));
      const out = [h('div', { class: 'fx-lrow' + (sel ? ' is-sel' : ''), 'data-layer': layer.id }, cell, lane(p, width, summaryItems))];
      if (isOpen) {
        for (const row of propRows(layer)) {
          if (row.head) { out.push(h('div', { class: 'fx-prow' }, h('div', { class: 'fx-lcell', style: 'padding-left:26px' }, h('i', null, row.label)), h('div', { class: 'fx-lane', style: `width:${width}px` }))); continue; }
          const tracks = S.doc.tl.tracks[layer.id] || {};
          const keys = tracks[row.prop] || [];
          const items = keys.map((k) => ({ t: k.t, refs: [{ layer: layer.id, prop: row.prop, t: k.t }], title: t('effects.graph.at', { what: row.label, t: k.t.toFixed(2) }), hold: k.ease === 'hold' }));
          out.push(h('div', { class: 'fx-prow' }, h('div', { class: 'fx-lcell', style: `padding-left:${row.indent ? 40 : 26}px` }, h('span', null, row.label)), lane(p, width, items)));
        }
      }
      return out;
    }

    /** The ease of one key, for the hold marker. */
    function keyOf(layer, prop, at) {
      const keys = (S.doc.tl.tracks[layer.id] || {})[prop] || [];
      const k = keys.find((x) => Math.abs(x.t - at) < 1e-6);
      return k ? k.ease : null;
    }

    /** The ruler: step labels, the zoom control in the label column, and a drag to scrub. */
    function ruler(p, width) {
      const dur = S.doc.comp.duration, step = stepFor(p);
      const zoom = h('input', { type: 'range', min: 20, max: 400, step: 1, value: Math.round(p), 'aria-label': t('effects.tl.zoom'), oninput: (e) => { view.zoom = Number(e.target.value); render(); } });
      const label = h('div', { class: 'fx-head-cell fx-zoom', style: `width:${view.labelW}px` }, zoom, h('button', { type: 'button', class: 'sui-btn', onclick: () => { view.zoom = null; render(); } }, t('effects.tl.fit')));
      const track = h('div', { class: 'fx-ruler-track', style: `left:${view.labelW}px;width:${width + PAD}px` });
      for (let s = 0; s <= dur + 1e-9; s += step) track.append(h('div', { class: 'fx-tick', style: `left:${(PAD + s * p).toFixed(3)}px` }, `${s.toFixed(s % 1 ? 2 : 0)}s`));
      const r = h('div', { class: 'fx-ruler', style: `width:${view.labelW + width + PAD}px` }, label, track);
      track.addEventListener('pointerdown', (e) => {
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ } // touch-ok: .fx-ruler-track has touch-action: none (css/effects.css)
        const at = (ev) => seek((ev.clientX - track.getBoundingClientRect().left - PAD) / p);
        at(e);
        const move = (ev) => at(ev);
        const up = () => { track.removeEventListener('pointermove', move); track.removeEventListener('pointerup', up); };
        track.addEventListener('pointermove', move);
        track.addEventListener('pointerup', up, { once: true });
      });
      return r;
    }

    /** Re-renders the whole timeline. Skipped while a drag is running (it moves the diamonds itself). */
    function render() {
      if (S.isDragging()) return;
      const p = pps(), dur = S.doc.comp.duration, width = Math.ceil(dur * p) + 40;
      keyEls.clear();
      const grid = h('div', { class: 'fx-tl-grid', style: `width:${view.labelW + width + PAD}px` });
      grid.append(ruler(p, width));
      for (const layer of S.doc.layers) for (const row of layerRows(layer, p, width)) grid.append(row);
      if (!S.doc.layers.length) grid.append(h('div', { class: 'fx-empty' }, t('effects.tl.empty')));
      grid.append(h('div', { class: 'fx-playhead', 'aria-hidden': 'true' }));
      host.replaceChildren(grid);
      placePlayhead();
    }

    /** Moves the playhead line to the current time. Cheap, so it runs on every playback frame. */
    function placePlayhead() {
      const grid = host.querySelector('.fx-tl-grid');
      if (!grid) return;
      const ph = grid.querySelector('.fx-playhead');
      const cell = grid.querySelector('.fx-lcell, .fx-head-cell');
      if (cell) view.labelW = cell.offsetWidth || view.labelW;
      ph.style.left = `${(view.labelW + PAD + S.playhead * pps()).toFixed(2)}px`;
    }

    /** Moves the diamonds of a set of refs to new times (during a drag). */
    function moveDiamonds(refs, dt) {
      const p = pps();
      for (const r of refs) {
        const el = keyEls.get(`${r.layer}|${r.prop}|${r.t.toFixed(6)}`);
        if (el) el.style.left = `${(PAD + (r.t + dt) * p).toFixed(3)}px`;
      }
    }

    S.on((what) => {
      if (what === 'time') placePlayhead();
      else if (what === 'doc' || what === 'sel' || what === 'view') {
        if (S.isDragging()) { placePlayhead(); return; }
        render();
      }
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!view.zoom) render(); }).observe(host);
    render();
    return { render, placePlayhead, moveDiamonds, view };
  }

  ns.timeline = { mount, STEPS };
})(typeof window !== 'undefined' ? window : globalThis);
