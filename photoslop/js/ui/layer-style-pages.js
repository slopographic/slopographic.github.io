/* PhotoSlop: the pages of the Layer Style dialog (layer-style.js). Each page is built from the working style `w`
 * ({ fx, blend, opacity, fillOp }) and calls changed() after every edit. Effect pages reuse the effect definitions
 * (FX_BY_ID) and the controls of the FX rows (paramControl), so there is one set of effect maths. */
'use strict';

/** A page's heading and its short note. */
function lsPageHead(title, note) {
  return [h('h3', { class: 'ls-title' }, title), note ? h('p', { class: 'ls-help' }, note) : null];
}

/** Blending Options: the blend mode of the layer (its effects are drawn with it). */
function lsBlendPage(w, changed) {
  const W = { blend: w.blend };
  const mode = paramControl({ k: 'blend', label: tr('photoslop.filter.p_blend_mode'), type: 'select', options: blendOptions() }, W, null, () => { w.blend = W.blend; changed(); });
  return h('div', { class: 'ls-page' }, lsPageHead(tr('photoslop.lstyle.blending'), tr('photoslop.lstyle.blending_note')), h('div', { class: 'fparams' }, mode));
}

/** Opacity and Fill: the layer's opacity (everything) and fill (its own pixels only). */
function lsOpacityPage(w, changed) {
  const W = { opacity: Math.round(w.opacity * 100), fill: Math.round(w.fillOp * 100) };
  const sync = () => { w.opacity = W.opacity / 100; w.fillOp = W.fill / 100; changed(); };
  const range = (k, label) => ({ k, label, type: 'range', min: 0, max: 100, step: 1, unit: '%' });
  return h('div', { class: 'ls-page' }, lsPageHead(tr('photoslop.lstyle.opacity_fill'), tr('photoslop.lstyle.opacity_fill_note')),
    h('div', { class: 'fparams' }, paramControl(range('opacity', tr('photoslop.filter.p_opacity')), W, null, sync), paramControl(range('fill', tr('photoslop.lstyle.fill')), W, null, sync)));
}

/** One effect (Drop Shadow, Outer Glow, …): an enable switch and the effect's own controls. Changing a control switches it on. */
function lsEffectPage(type, w, L, changed) {
  const def = FX_BY_ID[type];
  const e0 = w.fx.find((e) => e.type === type);
  const P = e0 ? e0.p : fxDefaults(type); // the parameters object is the entry's own, so edits reach the stack
  const cb = h('input', { type: 'checkbox', checked: !!e0 && e0.on !== false, 'aria-label': tr('photoslop.lstyle.enable_named', { name: def.name.replace('…', '') }) });
  const entry = () => { let e = w.fx.find((x) => x.type === type); if (!e) { e = { id: uid(), type, on: true, p: P }; w.fx.push(e); } return e; };
  cb.addEventListener('change', () => {
    if (cb.checked) entry().on = true;
    else { const e = w.fx.find((x) => x.type === type); if (e) e.on = false; }
    changed();
  });
  const touched = () => { entry().on = true; cb.checked = true; changed(); };
  const controls = def.params.filter((p) => p.k).map((p) => paramControl(p, P, L.canvas, touched));
  return h('div', { class: 'ls-page' }, lsPageHead(def.name.replace('…', ''), null),
    h('label', { class: 'ls-enable' }, cb, h('span', null, tr('photoslop.lstyle.enabled'))),
    h('div', { class: 'fparams' }, controls));
}
