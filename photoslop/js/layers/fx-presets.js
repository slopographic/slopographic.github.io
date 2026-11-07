/* PhotoSlop: effect presets for layers (SlopPresets, shared/presets). A preset's effects map to the layer effect stack (L.fx):
 * apply adds them to the layer's stack in one history step, and save reads a layer's stack back into the shared names.
 * Effects PhotoSlop has no layer effect for are skipped on apply and left out on save. Loaded after fx.js and the config. */
'use strict';

const sameKeys = (canon) => (p) => Object.fromEntries(Object.keys(SlopPresets.EFFECT_TYPES[canon].params).map((k) => [k, p[k]]));
/** shared effect name → [PhotoSlop layer effect, shared settings → its settings, its settings → shared settings]. */
const PRESET_FX = {
  'drop-shadow': ['shadow', sameKeys('drop-shadow'), sameKeys('drop-shadow')],
  'inner-shadow': ['inner-shadow', sameKeys('inner-shadow'), sameKeys('inner-shadow')],
  glow: ['glow', sameKeys('glow'), sameKeys('glow')],
  'inner-glow': ['inner-glow', sameKeys('inner-glow'), sameKeys('inner-glow')],
  stroke: ['stroke', sameKeys('stroke'), sameKeys('stroke')],
  bevel: ['bevel', sameKeys('bevel'), sameKeys('bevel')],
  overlay: ['overlay', sameKeys('overlay'), sameKeys('overlay')],
  gradient: ['gradient', sameKeys('gradient'), sameKeys('gradient')],
  blur: ['gauss', (p) => ({ r: p.radius, size: Math.ceil(p.radius * 3) + 2 }), (p) => ({ radius: p.r })],
  sharpen: ['sharpen', () => ({}), () => ({})],
  grain: ['noise', (p) => ({ amt: p.amount, mono: p.mono, seed: p.seed }), (p) => ({ amount: p.amt, mono: p.mono, seed: p.seed })],
  vignette: ['vignette', (p) => ({ amt: p.amount, size: p.size, color: p.color }), (p) => ({ amount: p.amt, size: p.size, color: p.color })],
  'colour-shift': ['huesat', (p) => ({ h: p.hue, s: p.sat, l: p.light, colorize: false }), (p) => ({ hue: p.h, sat: p.s, light: p.l })],
  glitch: ['glitch', (p) => ({ amt: p.amount, shift: p.shift, seed: p.seed }), (p) => ({ amount: p.amt, shift: p.shift, seed: p.seed })],
};
const SHARED_FOR = Object.fromEntries(Object.entries(PRESET_FX).map(([name, m]) => [m[0], name]));

/** The layer's stack as a preset's effects (disabled effects keep on: false). skipped counts what has no shared name. */
function fxPresetEffects(L) {
  const effects = [];
  let skipped = 0;
  for (const e of L.fx || []) {
    const name = SHARED_FOR[e.type];
    if (!name) { skipped++; continue; }
    effects.push(Object.assign({ type: name }, e.on === false ? { on: false } : {}, { p: PRESET_FX[name][2](e.p) }));
  }
  return { effects, skipped };
}
/** What a preset adds to a layer's stack: the new entries and how many of its effects PhotoSlop skips. Changes nothing. */
function fxPresetPlan(preset) {
  const add = [];
  let skipped = 0;
  for (const e of preset.params.effects) {
    const m = PRESET_FX[e.type];
    if (!m || !FX_BY_ID[m[0]]) { skipped++; continue; }
    add.push({ id: uid(), type: m[0], on: e.on !== false, p: Object.assign(fxDefaults(m[0]), m[1](e.p)) });
  }
  return { add, skipped };
}
/** Adds a preset's effects to a layer's stack, as one history step. Returns { added, skipped }. */
function fxPresetApply(layerId, preset) {
  const L = D.layers.find((l) => l.id === layerId);
  const out = { added: 0, skipped: 0 };
  if (!L || !preset || preset.kind !== 'effect') return out;
  const { add, skipped } = fxPresetPlan(preset);
  out.skipped = skipped;
  if (!add.length) return out;
  setFxStack(layerId, (L.fx || []).concat(add), tr('photoslop.fx.step_apply_preset', { name: preset.label }));
  out.added = add.length;
  return out;
}
/** Saves a layer's effects as a preset (no dialog). Resolves the registry's result: { ok, id, record } or { ok: false, errors }. */
async function fxPresetSave(layerId, label, description) {
  const L = D.layers.find((l) => l.id === layerId);
  const { effects } = L ? fxPresetEffects(L) : { effects: [] };
  if (!effects.length) return { ok: false, errors: [{ path: 'params.effects', message: tr('photoslop.fx.nothing_to_save') }] };
  return SlopPresets.save({ kind: 'effect', label, description, apps: ['photoslop'], params: { effects } });
}

/* ---------- dialogs (menu items on a layer) ---------- */
/** Layer ▸ Apply Effect Preset… : the picker previews and applies (fx-preset-picker.js). */
function fxPresetPick(layerId) { openFxPresetPicker(layerId); }
function fxPresetSaveDialog(layerId) {
  const L = D.layers.find((l) => l.id === layerId);
  if (!L || !(L.fx && L.fx.length)) { SlopUI.toast(tr('photoslop.fx.add_effect_first')); return; }
  SlopPresets.openSave({
    app: 'photoslop', kinds: ['effect'], title: tr('photoslop.fx.save_as_preset'), defaultName: tr('photoslop.fx.default_preset_name', { name: L.name }),
    build: () => { const { effects } = fxPresetEffects(L); return effects.length ? { effects } : null; },
  });
}
SlopPresets.useDrive().catch(() => null);
