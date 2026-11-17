/* Shared video core (window.SlopVideo.presets): frame size presets for sequences and exports. The chosen
   size is the sequence size used for layout and export. Aspect names ('16:9', '9:16', '1:1', '4:5') map to
   the preset of that shape. Pure data and helpers. */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const SV = (root.SlopVideo = root.SlopVideo || {});
  const P = (SV.presets = {});

  const DATA = [
    { id: 'phone', w: 1080, h: 1920, aspect: '9:16' },
    { id: 'square', w: 1080, h: 1080, aspect: '1:1' },
    { id: 'landscape', w: 1920, h: 1080, aspect: '16:9' },
    { id: '4k', w: 3840, h: 2160, aspect: '16:9' },
    { id: 'portrait', w: 1080, h: 1350, aspect: '4:5' }
  ];
  /** The presets [{ id, name, w, h, aspect }], name in the chosen language (a getter: ui.video.size.<id>, SV.word). */
  Object.defineProperty(P, 'LIST', { enumerable: true, get: () => Object.freeze(DATA.map((x) => Object.freeze(Object.assign({ name: SV.word('size', x.id) }, x)))) });
  P.CUSTOM = 'custom';
  /** Limits for a custom size. Both sides are even (the encoders need it). */
  P.MIN = 16; P.MAX_W = 7680; P.MAX_H = 4320;

  P.get = (id) => P.LIST.find((x) => x.id === id) || null;
  const find = (f) => DATA.find(f) || null;
  /** Even, clamped width and height. */
  P.clamp = function (w, h) {
    const even = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(+v / 2) * 2 || lo));
    return { w: even(w, P.MIN, P.MAX_W), h: even(h, P.MIN, P.MAX_H) };
  };
  /** The preset of an aspect name ('16:9' → landscape, …), or null. */
  P.byAspect = (name) => { const x = find((q) => q.aspect === name); return x ? P.get(x.id) : null; };
  /** Size for an aspect name, or null. */
  P.aspectSize = (name) => { const a = find((q) => q.aspect === name); return a ? { w: a.w, h: a.h } : null; };
  /** Dropdown choices: [[id, label]] with the custom entry last. */
  P.choices = () => SV.words('size', DATA.map((x) => x.id).concat([P.CUSTOM]));
  /** Size of a preset id, or the custom size (w, h) when id is custom. Null when unknown. */
  P.size = function (id, w, h) {
    if (id === P.CUSTOM) return P.clamp(w, h);
    const x = find((q) => q.id === id);
    return x ? { w: x.w, h: x.h } : null;
  };
  /** The preset id that matches a size, or 'custom'. */
  P.idFor = (w, h) => { const x = find((q) => q.w === w && q.h === h); return x ? x.id : P.CUSTOM; };
  /** Legacy aspect list [name, w, h] (kept for the older dialogs). */
  P.ASPECTS = Object.freeze(['16:9', '9:16', '1:1'].map((a) => { const s = P.aspectSize(a); return [a, s.w, s.h]; }));
})();
