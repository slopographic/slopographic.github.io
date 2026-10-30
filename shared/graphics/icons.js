/* Shared animated graphics library (window.SlopGraphics). Plain SVG path data, no DOM needed to read it.
   Every shape is drawn in a 100 × 100 box as stroke-only sub-paths (each entry of `paths` is one sub-path),
   so an app can stroke them at any size, colour and stroke width, and can animate the draw-on by dashing each
   sub-path. `counter` is a frame only: the app writes the number into it. ANIMS are the motion names apps
   understand (see HANDOFF.md). Pure data: safe to load in Node, a worker or a page. Names people read come from the
   shared tables (shared/i18n/ui/<code>/graphics.js: ui.graphics.<id>, ui.graphics.group.<group>, ui.graphics.anim.<id>),
   read each time (list(), get(), ANIMS), so they follow a language change; the key itself without SlopI18n. */
(function (root) {
  'use strict';
  /** Star burst rays: eight sub-paths from radius 26 to 44, at 45° steps around (50, 50). */
  const burst = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const a = (deg * Math.PI) / 180, r = (v) => +(v).toFixed(2);
    return 'M' + r(50 + 26 * Math.cos(a)) + ' ' + r(50 + 26 * Math.sin(a)) + ' L' + r(50 + 44 * Math.cos(a)) + ' ' + r(50 + 44 * Math.sin(a));
  });
  const LIST = [
    { id: 'arrow', group: 'pointers', paths: ['M14 14 L74 74', 'M52 76 L76 76 L76 52'] },
    { id: 'circle', group: 'pointers', paths: ['M50 10 C74 10 90 26 90 50 C90 74 74 90 50 90 C26 90 10 74 10 50 C10 30 24 14 44 11 C56 9 66 12 72 16'] },
    { id: 'box', group: 'pointers', paths: ['M20 12 H80 Q88 12 88 20 V80 Q88 88 80 88 H20 Q12 88 12 80 V20 Q12 12 20 12 Z'] },
    { id: 'underline', group: 'pointers', paths: ['M8 74 Q30 62 50 74 T92 74'] },
    { id: 'counter', group: 'marks', paths: ['M18 26 H82 Q90 26 90 34 V66 Q90 74 82 74 H18 Q10 74 10 66 V34 Q10 26 18 26 Z'] },
    { id: 'check', group: 'marks', paths: ['M14 54 L40 80 L86 24'] },
    { id: 'speech', group: 'callouts', paths: ['M14 16 H86 Q90 16 90 20 V62 Q90 66 86 66 H46 L28 84 V66 H14 Q10 66 10 62 V20 Q10 16 14 16 Z'] },
    { id: 'burst', group: 'callouts', paths: burst }
  ];
  const byId = new Map(LIST.map((s) => [s.id, s]));
  const word = (k) => (root.SlopI18n ? root.SlopI18n.t('ui.graphics.' + k) : 'ui.graphics.' + k);
  /** A copy of a shape with its words: name, group (the label) and groupId. */
  const out = (s) => ({ id: s.id, name: word(s.id), group: word('group.' + s.group), groupId: s.group, paths: s.paths.slice() });
  const G = {
    /** Motions an app can apply to a graphic: draw-on (strokes draw in), pulse, bounce, pop, none. [[id, label]]. */
    get ANIMS() { return ['draw', 'pulse', 'bounce', 'pop', 'none'].map((id) => [id, word('anim.' + id)]); },
    /** Stroke width of every shape, in the 100 box. */
    STROKE: 7,
    /** The library: [{ id, name, group, groupId, paths }], a copy the caller may keep. */
    list() { return LIST.map(out); },
    /** One shape by id, or null. */
    get(id) { const s = byId.get(id); return s ? out(s) : null; },
    /** A standalone SVG string for a shape: { color = 'currentColor', stroke = STROKE, size = 24 }. */
    svg(id, o = {}) {
      const s = byId.get(id); if (!s) return '';
      const color = o.color || 'currentColor', sw = o.stroke || G.STROKE, size = o.size || 24;
      const body = s.paths.map((d) => '<path d="' + d + '"/>').join('');
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" fill="none" stroke="' + color +
        '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
    }
  };
  root.SlopGraphics = G;
})(typeof window !== 'undefined' ? window : globalThis);
