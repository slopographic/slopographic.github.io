/* Slop Slides: built-in themes. A theme is a colour palette (bg, bg2, text, text2, accent1..6), heading and body
   fonts, and a background (solid, linear or radial gradient). Colours in the model may reference theme slots by
   name ('accent1', 'text', …) so changing the theme recolours the whole deck. */
(function () {
  'use strict';
  var SS = window.SS, U = SS.util;
  var T = SS.themes = {};

  function th(id, name, colors, fonts, bg, extra) {
    return Object.assign({ id: id, name: name, colors: colors, fonts: fonts, background: bg, dark: U.luma(colors.bg) < 0.45 }, extra || {});
  }
  T.list = [
    th('slop', 'Slopographic', { bg: '#0e0e10', bg2: '#1a1a1f', text: '#f1ede4', text2: '#a29e95', accent1: '#d4ff3a', accent2: '#ff4f6e', accent3: '#5ad1ff', accent4: '#b48cff', accent5: '#ffb547', accent6: '#3affb0' }, // i18n-ignore
      { heading: 'Archivo', body: 'Inter Tight', headingBold: true }, // i18n-ignore
      { type: 'radial', colors: ['#1b1d16', '#0e0e10'], cx: 0.8, cy: 0.15 }, { titleAccent: true }),
    th('paper', 'Paper', { bg: '#ffffff', bg2: '#f2f2f4', text: '#1d1d1f', text2: '#6e6e73', accent1: '#0a84ff', accent2: '#ff9f0a', accent3: '#30d158', accent4: '#bf5af2', accent5: '#ff375f', accent6: '#64d2ff' }, // i18n-ignore
      { heading: 'Inter Tight', body: 'Inter Tight', headingBold: true }, // i18n-ignore
      { type: 'solid', colors: ['#ffffff'] }),
    th('midnight', 'Midnight', { bg: '#0b1026', bg2: '#16204a', text: '#ffffff', text2: '#aab4d8', accent1: '#7aa2ff', accent2: '#ff8fb1', accent3: '#7ef0c8', accent4: '#ffd36e', accent5: '#c49bff', accent6: '#5ee1ff' }, // i18n-ignore
      { heading: 'Inter Tight', body: 'Inter Tight', headingBold: true }, // i18n-ignore
      { type: 'linear', colors: ['#0b1026', '#1d2d6e'], angle: 135 }),
    th('editorial', 'Editorial', { bg: '#f6f1e7', bg2: '#ebe3d3', text: '#1f1a14', text2: '#6b6152', accent1: '#b5523b', accent2: '#2f5d50', accent3: '#d9a441', accent4: '#41607a', accent5: '#8c4a6b', accent6: '#7d8b3a' }, // i18n-ignore
      { heading: 'Instrument Serif', body: 'Inter Tight', headingBold: false }, // i18n-ignore
      { type: 'solid', colors: ['#f6f1e7'] }),
    th('aurora', 'Aurora', { bg: '#0f3b4a', bg2: '#1d5566', text: '#ffffff', text2: '#cfe7ee', accent1: '#ffe66d', accent2: '#ff6b9d', accent3: '#a6f4c5', accent4: '#c3a6ff', accent5: '#ffb86b', accent6: '#7ce0ff' }, // i18n-ignore
      { heading: 'Archivo', body: 'Inter Tight', headingBold: true }, // i18n-ignore
      { type: 'linear', colors: ['#0f6b74', '#4b2a8a'], angle: 120 }),
    th('terminal', 'Terminal', { bg: '#0a0f0b', bg2: '#132017', text: '#d8ffe3', text2: '#7fae8c', accent1: '#39ff88', accent2: '#ffcc33', accent3: '#33ccff', accent4: '#ff5f87', accent5: '#b48cff', accent6: '#ff9933' }, // i18n-ignore
      { heading: 'JetBrains Mono', body: 'JetBrains Mono', headingBold: true }, // i18n-ignore
      { type: 'solid', colors: ['#0a0f0b'] }),
    th('sunset', 'Sunset', { bg: '#ff7e5f', bg2: '#ffb38a', text: '#ffffff', text2: '#fff1e6', accent1: '#2b1b3d', accent2: '#ffe29a', accent3: '#5b2a86', accent4: '#00a6a6', accent5: '#ff4e50', accent6: '#fce38a' }, // i18n-ignore
      { heading: 'Archivo', body: 'Inter Tight', headingBold: true }, // i18n-ignore
      { type: 'linear', colors: ['#ff6a5f', '#feb47b'], angle: 160 }),
    th('chalk', 'Chalkboard', { bg: '#23362b', bg2: '#2e463a', text: '#f4f1e8', text2: '#c8d3c4', accent1: '#ffd966', accent2: '#ff9aa2', accent3: '#9ad0ff', accent4: '#b8f2a0', accent5: '#ffb36b', accent6: '#e0b3ff' }, // i18n-ignore
      { heading: 'Caveat', body: 'Inter Tight', headingBold: false, headingScale: 1.25 }, // i18n-ignore
      { type: 'radial', colors: ['#2f4a3a', '#1c2c23'], cx: 0.5, cy: 0.4 })
  ];
  T.byId = function (id) { return T.list.filter(function (t) { return t.id === id; })[0] || T.list[0]; };
  T.SLOTS = ['bg', 'bg2', 'text', 'text2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];

  /** The deck's theme object (decks store a full copy, so imported themes survive). */
  T.of = function (deck) { return (deck && deck.theme && deck.theme.colors) ? deck.theme : T.byId(deck && deck.theme); };
  /** Resolves a colour reference ('accent1', 'text', '#hex', 'accent1/60' = 60% tint toward bg) to '#rrggbb'. */
  T.color = function (theme, ref, fallback) {
    if (ref == null || ref === '') return fallback == null ? null : T.color(theme, fallback);
    if (ref === 'none') return null;
    var s = String(ref), m = /^([a-z0-9]+)\/(\d+)$/.exec(s);
    if (m) { var base = T.color(theme, m[1]); return base && U.mix(theme.colors.bg, base, (+m[2]) / 100); }
    if (theme.colors[s]) return theme.colors[s];
    return U.normHex(s) || (fallback ? T.color(theme, fallback) : '#000000');
  };
  T.font = function (theme, ref) {
    if (!ref || ref === 'body') return theme.fonts.body;
    if (ref === 'heading') return theme.fonts.heading;
    return ref;
  };
  /** Background spec of a slide (its own override, or the theme's). */
  T.background = function (theme, slide) { return (slide && slide.background) || theme.background; };
})();
