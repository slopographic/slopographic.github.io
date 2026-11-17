/* SlopCut: clip keyframes. clip.anim = { x, y, scale, rot, opacity } where each is a shared/motion track:
   [{ t, value, ease }], t in seconds from the clip start (0 … dur), ease = the segment that starts at the key.
   Keys are offsets from the clip's own transform: x, y and rot add to it; scale and opacity multiply it.
   The neutral value (0, 0, 0, 1) therefore means "no change", and a key past the last one holds its value.
   Pure: no DOM. Evaluated by the compositor for both the preview and the export. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SE = (root.SE = root.SE || {});
  const TR = root.SlopMotion.track;
  const A = (SE.anim = {});

  A.PROPS = {
    x: { label: 'X', neutral: 0, mode: 'add', unit: 'px' },
    y: { label: 'Y', neutral: 0, mode: 'add', unit: 'px' },
    scale: { label: 'Scale', neutral: 1, mode: 'mul', unit: '%' },
    rot: { label: 'Rotation', neutral: 0, mode: 'add', unit: '°' },
    opacity: { label: 'Opacity', neutral: 1, mode: 'mul', unit: '%' }
  };
  A.KEYS = Object.keys(A.PROPS);
  A.EASES = [['linear', 'Linear'], ['easeInCubic', 'Ease in'], ['easeOutCubic', 'Ease out'], ['easeInOutCubic', 'Ease in-out']];
  const EPS = 1e-3;

  /** Offset (or multiplier) of one property at clip-relative time u. Neutral when the property has no keys. */
  A.valueAt = function (c, prop, u) {
    const keys = c.anim && c.anim[prop];
    if (!keys || !keys.length) return A.PROPS[prop].neutral;
    return TR.sample(keys, u);
  };
  /** All five offsets at clip-relative time u. */
  A.sampleAll = function (c, u) {
    const out = {};
    for (const k of A.KEYS) out[k] = A.valueAt(c, k, u);
    return out;
  };
  /** The transform the compositor draws: the clip's own values combined with the keyed offsets at u. */
  A.combine = function (c, u) {
    const a = A.sampleAll(c, u);
    return {
      x: (c.x || 0) + a.x,
      y: (c.y || 0) + a.y,
      scale: (c.scale == null ? 1 : c.scale) * a.scale,
      rot: (c.rot || 0) + a.rot,
      opacity: (c.opacity == null ? 1 : c.opacity) * a.opacity
    };
  };
  /** True when the clip has at least one key. */
  A.has = (c) => !!(c.anim && A.KEYS.some((k) => c.anim[k] && c.anim[k].length));

  const list = (c, prop) => {
    c.anim = c.anim || {};
    return (c.anim[prop] = c.anim[prop] || []);
  };
  /** Drops empty tracks, and anim itself when nothing is left. */
  function tidy(c) {
    if (!c.anim) return;
    for (const k of A.KEYS) if (c.anim[k] && !c.anim[k].length) delete c.anim[k];
    if (!A.has(c)) c.anim = null;
  }
  A.tidy = tidy;
  const clampT = (c, t) => Math.round(Math.min(Math.max(0, t), c.dur) * 1000) / 1000;

  /** Adds (or replaces the value of) a key at clip time t. Returns its index. Keys stay sorted. */
  A.addKey = function (c, prop, t, value, ease) {
    const keys = list(c, prop), tt = clampT(c, t);
    const i = keys.findIndex((k) => Math.abs(k.t - tt) < EPS);
    if (i >= 0) { keys[i].value = value; if (ease) keys[i].ease = ease; return i; }
    keys.push({ t: tt, value, ease: ease || 'linear' });
    keys.sort((a, b) => a.t - b.t);
    return keys.indexOf(keys.find((k) => k.t === tt));
  };
  A.removeKey = function (c, prop, idx) {
    const keys = c.anim && c.anim[prop];
    if (keys && keys[idx]) keys.splice(idx, 1);
    tidy(c);
  };
  A.setValue = function (c, prop, idx, value) {
    const k = c.anim && c.anim[prop] && c.anim[prop][idx];
    if (k && Number.isFinite(value)) k.value = value;
  };
  A.setEase = function (c, prop, idx, ease) {
    const k = c.anim && c.anim[prop] && c.anim[prop][idx];
    if (k) k.ease = ease || 'linear';
  };
  /** Moves a key in time without passing its neighbours. Returns the (unchanged) index. */
  A.moveKey = function (c, prop, idx, t) {
    const keys = c.anim && c.anim[prop];
    if (!keys || !keys[idx]) return idx;
    const lo = idx > 0 ? keys[idx - 1].t + EPS : 0, hi = idx < keys.length - 1 ? keys[idx + 1].t - EPS : c.dur;
    keys[idx].t = Math.round(Math.min(Math.max(lo, Math.min(Math.max(0, t), c.dur)), hi) * 1000) / 1000;
    return idx;
  };
  A.clear = function (c) { c.anim = null; };
  /** Animate-in presets. They write keys over the first 0.5 s (or the clip length when shorter), then the
      neutral value, so the clip settles at its own transform. Existing keys in that window are replaced. */
  A.PRESETS = [
    ['fade', 'Fade in', 'opacity', () => 0, 'linear'],
    ['slideL', 'Slide from left', 'x', (W) => -W, 'easeOutCubic'],
    ['slideR', 'Slide from right', 'x', (W) => W, 'easeOutCubic'],
    ['slideT', 'Slide from top', 'y', (W, H) => -H, 'easeOutCubic'],
    ['slideB', 'Slide from bottom', 'y', (W, H) => H, 'easeOutCubic'],
    ['zoom', 'Zoom in', 'scale', () => 0.4, 'easeOutCubic']
  ];
  A.PRESET_LEN = 0.5;
  A.applyPreset = function (c, id, W, H) {
    const pr = A.PRESETS.find((x) => x[0] === id);
    if (!pr) return false;
    const [, , prop, from, ease] = pr, D = Math.min(A.PRESET_LEN, c.dur);
    const keys = list(c, prop).filter((k) => k.t > D + EPS);
    const neutral = A.PROPS[prop].neutral;
    c.anim[prop] = [{ t: 0, value: from(W, H), ease }, { t: clampT(c, D), value: neutral, ease: 'linear' }].concat(keys);
    return true;
  };
})();
