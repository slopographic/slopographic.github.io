/* PhotoSlop Auto retouch dialog: the before/after split view and the small controls (js/retouch/dialog.js uses them).
 *   rtSplitView(before) → { el, setAfter(canvas), split(v), value() }: the picture with the original on the left of a
 *     divider and the result on the right. Drag anywhere on it (mouse, finger or pen: it is a touch surface) or use the
 *     arrow keys on the divider (a slider) to move it; Home and End show only one side.
 *   rtRange(label, obj, key, min, max, unit, changed), rtCheck(label, obj, key, changed), rtSelect(label, obj, key, options, changed) */
'use strict';

function rtSplitView(before) {
  const W = before.width, H = before.height;
  const cv = h('canvas', { class: 'rt-canvas', width: W, height: H, 'aria-hidden': 'true' });
  const knob = h('div', { class: 'rt-knob', role: 'slider', tabindex: '0', 'aria-label': tr('photoslop.retouch.divider'), 'aria-valuemin': '0', 'aria-valuemax': '100' });
  const stage = h('div', { class: 'rt-stage' }, cv, h('span', { class: 'rt-tag rt-before' }, tr('photoslop.retouch.before')), h('span', { class: 'rt-tag rt-after' }, tr('photoslop.retouch.after')), knob);
  const el = h('div', { class: 'rt-view', 'data-touch-surface': '' }, stage);
  let after = before, s = 0.5;
  function draw() {
    const g = cv.getContext('2d'), x = Math.round(W * s);
    g.clearRect(0, 0, W, H); g.drawImage(before, 0, 0);
    g.save(); g.beginPath(); g.rect(x, 0, W - x, H); g.clip(); g.drawImage(after, 0, 0, W, H); g.restore();
    knob.style.left = s * 100 + '%';
    knob.setAttribute('aria-valuenow', String(Math.round(s * 100)));
    knob.setAttribute('aria-valuetext', tr('photoslop.retouch.pct_before', { pct: Math.round(s * 100) }));
  }
  const at = (e) => { const r = cv.getBoundingClientRect(); return clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1); };
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault(); s = at(e); draw();
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events in tests */ }
    const mv = (ev) => { s = at(ev); draw(); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  });
  knob.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02, k = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[e.key];
    if (k) s = clamp(s + k, 0, 1); else if (e.key === 'Home') s = 0; else if (e.key === 'End') s = 1; else return;
    e.preventDefault(); e.stopPropagation(); draw();
  });
  draw();
  return { el, setAfter(c) { after = c || before; draw(); }, split(v) { s = clamp(v, 0, 1); draw(); }, value: () => s, canvas: cv };
}

function rtRange(label, obj, key, min, max, unit, changed) {
  const r = h('input', { type: 'range', min, max, step: 1, value: obj[key], 'aria-label': label });
  const out = h('output', { class: 'rt-num' }, obj[key] + (unit || ''));
  r.addEventListener('input', () => { obj[key] = +r.value; out.textContent = r.value + (unit || ''); changed(); });
  return h('label', { class: 'rt-row rt-range' }, h('span', { class: 'rt-l' }, label), r, out);
}
function rtCheck(label, obj, key, changed) {
  const c = h('input', { type: 'checkbox', checked: obj[key] !== false, 'aria-label': label });
  c.addEventListener('change', () => { obj[key] = c.checked; changed(); });
  return h('label', { class: 'rt-row rt-check' }, c, h('span', null, label));
}
function rtSelect(label, obj, key, options, changed) {
  const s = h('select', { 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: obj[key] === v }, l)));
  s.addEventListener('change', () => { obj[key] = s.value; changed(); });
  return h('label', { class: 'rt-row rt-sel' }, h('span', { class: 'rt-l' }, label), s);
}
