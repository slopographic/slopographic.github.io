// Per-page settings for the buddy. The homepage turns everything on; apps get a polite version.
export const HOME = {
  app: 'home', kind: 'site', home: true,
  autoChaos: true,                                  // RAGE may start chaos by itself
  perches: '[data-perch]',
  cards: '[data-perch="card"]',                     // chaos can bite, knock and blast these
  headings: 'h1[data-perch], h2[data-perch]',       // chaos can eat letters from these
  floor: 'body > footer',                           // knocked cards pile up on top of this
  z: 15, tips: false,
};
export const APP = {
  app: 'app', kind: 'app', home: false,
  autoChaos: false,                                 // only an explicit Unleash starts chaos
  // Toolbars, panel edges, headers and dialog title bars (plus anything marked [data-perch]).
  perches: '[data-perch], body > header, header, nav, .toolbar, [role="toolbar"], .panel, .sui-head, .tb, .topbar, .menubar',
  cards: '[data-perch="card"], .panel, .card, .sui-dlg',
  headings: 'h1, h2, .sui-title',
  floor: null,
  z: 900, tips: true,
};
export const CFG = { ...HOME };
export function configure(o) { Object.assign(CFG, o); }
