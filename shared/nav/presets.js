/* SlopNav presets: the built-in navigation presets, as plain data. Classic script, no dependencies.
 * Sets window.SlopNav.presets. A preset is { id, name, blurb, custom?, bindings } (name and blurb in the chosen language) and bindings has
 * every key listed in SlopNav.validate.KEYS (see validate.js for the allowed values). */
(function () {
  'use strict';
  const N = (window.SlopNav = window.SlopNav || {});
  const say = (k, v) => { const I = window.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/print.js (ui.nav.*)

  // Slop: the default. Plain wheel zooms around the pointer; Shift+wheel pans sideways.
  const SLOP = {
    zoomWheel: 'plain', panWheel: 'shift', spacePan: true, middlePan: true, pinch: 'zoom', touchPan: true,
    fitKey: '', actualKey: '', zoomInKeys: [], zoomOutKeys: [], handKey: '', clickZoomKey: '',
  };
  const over = (o) => Object.assign({}, SLOP, o, { zoomInKeys: (o.zoomInKeys || SLOP.zoomInKeys).slice(), zoomOutKeys: (o.zoomOutKeys || SLOP.zoomOutKeys).slice() });

  const LIST = [
    { id: 'slop', get name() { return say('ui.nav.preset.slop'); }, get blurb() { return say('ui.nav.preset.slop_blurb'); }, bindings: over({}) },
    {
      id: 'photoshop', get name() { return say('ui.nav.preset.photoshop'); },
      get blurb() { return say('ui.nav.preset.photoshop_blurb'); },
      bindings: over({ zoomWheel: 'alt', panWheel: 'plain', fitKey: 'Mod+0', actualKey: 'Mod+1', zoomInKeys: ['Mod+='], zoomOutKeys: ['Mod+-'], clickZoomKey: 'Mod+Space' }),
    },
    {
      id: 'illustrator', get name() { return say('ui.nav.preset.illustrator'); },
      get blurb() { return say('ui.nav.preset.illustrator_blurb'); },
      bindings: over({ zoomWheel: 'ctrl', panWheel: 'plain', handKey: 'H', fitKey: 'Mod+0', actualKey: 'Mod+1', zoomInKeys: ['Mod+='], zoomOutKeys: ['Mod+-'] }),
    },
    {
      id: 'figma', get name() { return say('ui.nav.preset.figma'); },
      get blurb() { return say('ui.nav.preset.figma_blurb'); },
      bindings: over({ zoomWheel: 'ctrl', panWheel: 'plain', fitKey: 'Shift+1', actualKey: 'Shift+0', zoomInKeys: ['Mod+='], zoomOutKeys: ['Mod+-'] }),
    },
    { id: 'custom', get name() { return say('ui.nav.preset.custom'); }, custom: true, get blurb() { return say('ui.nav.preset.custom_blurb'); }, bindings: over({}) },
  ];

  const byId = {};
  for (const p of LIST) byId[p.id] = p;
  /** A fresh deep copy of a built-in preset's bindings (callers may mutate it). */
  const clone = (b) => JSON.parse(JSON.stringify(b));
  N.presets = {
    list: () => LIST.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, custom: !!p.custom, bindings: clone(p.bindings) })),
    get: (id) => (byId[id] ? { id, name: byId[id].name, blurb: byId[id].blurb, custom: !!byId[id].custom, bindings: clone(byId[id].bindings) } : null),
    has: (id) => Object.prototype.hasOwnProperty.call(byId, id),
    DEFAULT: 'slop',
    clone,
  };
})();
