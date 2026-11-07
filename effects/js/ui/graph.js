// Slop Effects graph editor: the easing curve of the one selected key, drawn from the shared engine (SlopMotion.easing),
// with a choice of ease and, for a custom bezier, two handles you drag (x stays between 0 and 1, y may overshoot). A drag is
// one undo step. The ease can also be set on every selected key. Classic script: window.SlopEffects.graph.
(function (g) {
  'use strict';
  const ns = (g.SlopEffects = g.SlopEffects || {});
  const { h } = ns.dom, T = (k, v) => ns.defs.t(k, v);
  const W = 320, PAD = 22, YMIN = -0.5, YMAX = 1.5;
  const toX = (x) => PAD + x * (W - 2 * PAD);
  const toY = (y) => W - PAD - ((y - YMIN) / (YMAX - YMIN)) * (W - 2 * PAD);
  const fromY = (py) => YMIN + ((W - PAD - py) / (W - 2 * PAD)) * (YMAX - YMIN);
  const fromX = (px) => Math.min(1, Math.max(0, (px - PAD) / (W - 2 * PAD)));

  /** Mounts the editor. Returns { render }. ka: the key actions (setEaseAll). */
  function mount(host, S, act, ka) {
    let ctrl = null;   // [x1, y1, x2, y2] while a handle is dragged
    let drag = null;   // which handle: 1 or 2

    /** The one selected key and its ease, or null. */
    function target() {
      if (S.sel.keys.length !== 1) return null;
      const k = S.sel.keys[0];
      const keys = (S.doc.tl.tracks[k.layer] || {})[k.prop] || [];
      const key = keys.find((x) => Math.abs(x.t - k.t) < 1e-6);
      return key ? { ...k, key } : null;
    }

    /** The curve and handles on the canvas. */
    function draw(canvas, ease, showHandles, cp) {
      const c = canvas.getContext('2d');
      c.clearRect(0, 0, W, W);
      c.fillStyle = getComputedStyle(canvas).getPropertyValue('--fx-surface') || '#151518';
      c.strokeStyle = 'rgba(128,128,128,.25)';
      c.lineWidth = 1;
      for (const v of [0, 0.5, 1]) {
        c.beginPath(); c.moveTo(toX(v), toY(YMIN)); c.lineTo(toX(v), toY(YMAX)); c.stroke();
        c.beginPath(); c.moveTo(toX(0), toY(v)); c.lineTo(toX(1), toY(v)); c.stroke();
      }
      const fn = ease === 'hold' ? null : g.SlopMotion.easing.resolve(ease);
      c.strokeStyle = '#d4ff3a';
      c.lineWidth = 2.5;
      c.beginPath();
      for (let i = 0; i <= 100; i++) {
        const u = i / 100;
        const v = fn ? fn(u) : (u < 1 ? 0 : 1);
        if (i === 0) c.moveTo(toX(u), toY(v)); else if (ease === 'hold') c.lineTo(toX(u), toY(u < 1 ? 0 : 1)); else c.lineTo(toX(u), toY(v));
      }
      c.stroke();
      if (showHandles && cp) {
        c.strokeStyle = 'rgba(241,237,228,.55)';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(toX(0), toY(0)); c.lineTo(toX(cp[0]), toY(cp[1])); c.stroke();
        c.beginPath(); c.moveTo(toX(1), toY(1)); c.lineTo(toX(cp[2]), toY(cp[3])); c.stroke();
        c.fillStyle = '#f1ede4';
        c.beginPath(); c.arc(toX(cp[0]), toY(cp[1]), 6, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(toX(cp[2]), toY(cp[3]), 6, 0, Math.PI * 2); c.fill();
      }
    }

    function render() {
      const tg = target();
      host.replaceChildren();
      if (!tg) {
        host.append(h('p', { class: 'fx-empty' }, T('effects.graph.empty')));
        return;
      }
      const ease = tg.key.ease;
      const isBez = Array.isArray(ease);
      const bez = isBez ? ease : [0.42, 0, 0.58, 1];
      const pd = ns.defs.PROPS.find((p) => p.name === tg.prop);
      const label = pd ? ns.defs.word('prop', pd.name, pd.label) : tg.prop;
      const canvas = h('canvas', { class: 'fx-curve', width: W, height: W, 'aria-label': T('effects.graph.curve') });
      const select = h('select', { class: 'sui-input', 'aria-label': T('effects.graph.ease'), onchange: (e) => {
        const v = e.target.value;
        const next = v === 'bezier' ? (isBez ? ease : bez.slice()) : v;
        S.edit(T('effects.undo.set_ease'), (d) => ns.keys.setEase(d, tg.layer, tg.prop, tg.t, next));
      } }, ns.defs.EASES.map(([v, l]) => h('option', { value: v, selected: (isBez ? 'bezier' : ease) === v ? true : null }, ns.defs.word('ease', v, l))));
      const inputs = [0, 1, 2, 3].map((i) => h('input', { class: 'sui-input', type: 'number', step: '0.01', value: isBez ? ease[i] : bez[i], 'aria-label': T('effects.graph.handle', { n: i < 2 ? '1' : '2', axis: i % 2 ? 'y' : 'x' }), disabled: isBez ? null : true,
        onchange: (e) => {
          const cp = (isBez ? ease : bez).slice();
          cp[i] = Number(e.target.value);
          if (i === 0 || i === 2) cp[i] = Math.min(1, Math.max(0, cp[i]));
          S.edit(T('effects.undo.set_ease'), (d) => ns.keys.setEase(d, tg.layer, tg.prop, tg.t, cp));
        } }));
      host.append(h('div', { class: 'fx-graph-wrap' },
        h('div', null, canvas, h('p', { class: 'fx-empty', style: 'padding:6px 0' }, T('effects.graph.at', { what: label, t: tg.t.toFixed(2) }))),
        h('div', { class: 'fx-graph-side' },
          h('label', { class: 'fx-row' }, h('span', { class: 'fx-lbl' }, T('effects.graph.ease')), select, h('span')),
          h('div', { class: 'fx-pair', role: 'group', 'aria-label': T('effects.graph.handles') }, inputs),
          h('p', { class: 'fx-empty', style: 'padding:0;text-align:left' }, T(isBez ? 'effects.graph.bez_note' : 'effects.graph.pick_bez')),
          h('div', { class: 'fx-chips' }, h('button', { type: 'button', class: 'sui-btn', onclick: () => ka.setEaseAll(select.value === 'bezier' ? bez : select.value) }, T('effects.graph.apply_all'))),
        ),
      ));
      const cp = ctrl || (isBez ? ease : null);
      draw(canvas, isBez ? (ctrl ? ctrl : ease) : ease, isBez, cp);
      bindHandles(canvas, tg, isBez ? (ctrl || ease) : null);
    }

    /** Drag the two handles of a bezier. The handle nearest the pointer (within 14 px) moves. */
    function bindHandles(canvas, tg, start) {
      if (!start) return;
      canvas.addEventListener('pointerdown', (e) => {
        const r = canvas.getBoundingClientRect();
        const px = (e.clientX - r.left) * (W / r.width), py = (e.clientY - r.top) * (W / r.height);
        const d1 = Math.hypot(px - toX(start[0]), py - toY(start[1])), d2 = Math.hypot(px - toX(start[2]), py - toY(start[3]));
        // A finger gets a 22 CSS px handle, a pen 12 (shared/input); the canvas has touch-action: none (css/effects.css).
        const touchR = (window.SlopTouch && SlopTouch.hit ? SlopTouch.hit(e, 0) : e.pointerType === 'touch' ? 22 : e.pointerType === 'pen' ? 12 : 0) * (W / r.width);
        if (Math.min(d1, d2) > Math.max(14, touchR)) return;
        drag = d1 <= d2 ? 1 : 2;
        ctrl = start.slice();
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ } // touch-ok: .fx-curve has touch-action: none
        const move = (ev) => {
          const qx = (ev.clientX - r.left) * (W / r.width), qy = (ev.clientY - r.top) * (W / r.height);
          const i = drag === 1 ? 0 : 2;
          ctrl[i] = fromX(qx);
          ctrl[i + 1] = Math.min(2, Math.max(-1, fromY(qy)));
          S.live((d) => ns.keys.setEase(d, tg.layer, tg.prop, tg.t, ctrl.slice()));
          draw(canvas, ctrl, true, ctrl);
        };
        const up = () => {
          canvas.removeEventListener('pointermove', move);
          canvas.removeEventListener('pointerup', up);
          S.commitLive(ns.defs.t('effects.undo.set_ease'));
          ctrl = null; drag = null;
          render();
        };
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', up, { once: true });
      });
    }

    S.on((what) => { if (what === 'doc' || what === 'sel') { if (!S.isDragging()) render(); } });
    render();
    return { render };
  }

  ns.graph = { mount };
})(typeof window !== 'undefined' ? window : globalThis);
