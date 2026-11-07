/* The name shown for an app on the homepage. Each registry entry (shared/apps.js) has a descriptive `title`, such as
 * "EML previewer and converter" or "SlopCut: video editor", and the brand `name`. The homepage shows the title, or the brand
 * name when the visitor turns on the switch (remembered in this browser). The registry keeps both; lookups and the sort use `name`. */
(() => {
  'use strict';
  const BRAND_KEY = 'slop.home.names';
  window.slopBrandNamesOn = () => { try { return localStorage.getItem(BRAND_KEY) === '1'; } catch (e) { return false; } };
  window.slopSetBrandNames = (on) => { try { localStorage.setItem(BRAND_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: the switch still works for this visit */ } };
  // A profile with plain names (shared/apps.js) has one name per app, in the chosen language: slopAppName. The title is
  // in the chosen language too (slopAppTitle: the SEO tables' words); the brand name stays as it is.
  window.slopAppLabel = (a, withBrand) => (window.SLOP_NAMING === 'plain' && window.slopAppName ? window.slopAppName(a)
    : withBrand ? a.name : window.slopAppTitle ? window.slopAppTitle(a) : a.title || a.name);
})();
