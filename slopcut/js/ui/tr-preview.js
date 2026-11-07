/* SlopCut: the transition library panel (Effects tab). A duration slider (the length of a transition added by click
   or drop), a preview that plays the chosen transition between two sample frames with the same terms the compositor
   uses (render/transitions.js), and the transition tiles. Click adds the transition at the cut; drag it onto a cut. */
(function () {
  'use strict';
  const SE = window.SE, U = SE.util, h = U.h, TR = SE.transitions;
  const W = 240, H = 135;
  const TRP = SE.trPanel = {};
  let cv = null, g = null, raf = 0, shown = 'cross', name = null;

  /** A sample frame: a gradient with its letter, so the motion reads clearly. */
  function frame(a, b, label) {
    const c = U.canvas(W, H), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '800 96px "Archivo", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(label, W / 2, H / 2);
    return c;
  }
  const SRC_OUT = frame('#1f6feb', '#0b2a5b', 'A'), SRC_IN = frame('#ff6b4a', '#7a1f0e', 'B');

  /** One side of a transition: the same terms as the compositor, drawn at the preview's size. */
  function layer(src, P) {
    if (P.hide) return;
    if (P.slices) { for (const s of P.slices) layer(src, Object.assign({}, P, { slices: null, clip: s.rect, dx: P.dx + s.dx })); return; }
    g.save();
    if (P.clip) { g.beginPath(); g.rect(P.clip[0], P.clip[1], P.clip[2], P.clip[3]); g.clip(); }
    g.globalAlpha = U.clamp(P.alpha, 0, 1);
    if (P.blur > 0) g.filter = 'blur(' + P.blur.toFixed(1) + 'px)';
    g.translate(W / 2 + P.dx, H / 2 + P.dy);
    if (P.rot) g.rotate((P.rot * Math.PI) / 180);
    g.scale(P.sc, P.sc);
    g.drawImage(src, -W / 2, -H / 2, W, H);
    g.restore();
  }
  function overlay(P) {
    if (!P.overlay || P.overlay.a <= 0) return;
    g.save(); g.globalAlpha = U.clamp(P.overlay.a, 0, 1); g.fillStyle = P.overlay.col; g.fillRect(0, 0, W, H); g.restore();
  }
  /** Draw the transition at progress q (0 to 1). */
  function paint(type, q) {
    if (!g) return;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const po = TR.params(type, 'out', q, W, H, false), pi = TR.params(type, 'in', q, W, H, false);
    layer(SRC_OUT, po); overlay(po);
    layer(SRC_IN, pi); overlay(pi);
  }
  /** Play the transition once over the chosen duration (ends on the arriving clip). */
  TRP.play = function (type) {
    if (!g) return;
    cancelAnimationFrame(raf);
    shown = type; if (name) name.textContent = TR.label(type);
    const t0 = performance.now(), len = TR.dur * 1000;
    const step = (now) => {
      const q = Math.min(1, (now - t0) / len);
      paint(type, q);
      raf = q < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  };

  function tile([id, en]) {
    const label = U.w('tr', id, en);
    const b = h('button', { type: 'button', class: 'fx tr', draggable: 'true', title: U.t('slopedit.trp.tile_tip', { name: label }), onclick: () => { TRP.play(id); SE.act.addTransition(id); }, onmouseenter: () => TRP.play(id) }, // i18n-ignore: class names
      h('span', { class: 'fx-sw tr-sw', 'aria-hidden': 'true' }), h('span', null, label));
    b.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-slopedit-fx', JSON.stringify({ kind: 'transition', type: id, dur: TR.dur })); e.dataTransfer.effectAllowed = 'copy'; TRP.play(id); });
    b.addEventListener('dragend', () => { SE.timeline.ghost = null; SE.timeline.dirty(); });
    return b;
  }
  /** The panel's nodes: preview, duration, then the tiles. Call once per render of the Effects tab. */
  TRP.nodes = function () {
    cv = h('canvas', { width: W, height: H, class: 'tr-prev', role: 'img', 'aria-label': U.t('slopedit.trp.transition_preview') });
    g = cv.getContext('2d');
    name = h('b', { class: 'tr-name' }, TR.label(shown));
    const slider = SE.fields.slider(U.t('slopedit.fx.duration'), () => TR.dur, (v) => TR.setDur(v), { min: TR.DUR.min, max: TR.DUR.max, step: TR.DUR.step, unit: 's', reset: 1, dec: 1, hardMin: TR.DUR.min, hardMax: TR.DUR.max });
    queueMicrotask(() => paint(shown, 1));
    return [
      h('h4', { class: 'fx-h' }, U.t('slopedit.cmd.transitions')),
      h('div', { class: 'tr-box' }, cv, h('div', { class: 'tr-bar' }, name, h('button', { type: 'button', class: 'btn sm', onclick: () => TRP.play(shown) }, U.t('slopedit.trp.preview')))), // i18n-ignore: class names
      slider.el,
      h('div', { class: 'fx-grid' }, TR.list().map(tile)),
      h('p', { class: 'fx-note' }, U.t('slopedit.trp.drop_a_transition_on_the'))
    ].filter(Boolean);
  };
})();
