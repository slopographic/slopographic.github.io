/* English as the visitor's choice, for a test page whose checks read the English copy in a build that starts in another
 * language (tests/brand-facts.js defaultLang): the language is stored in the profile in localStorage, as the language menu
 * stores it. Classic script, sets window.SlopTestEnglish(); one implementation with two callers:
 *   tests/run.mjs runs this file in the top page before anything on it loads (an init script, tests/needs.mjs englishFirst),
 *     so an app frame that a page places above tests/harness.js opens in English. Stored only once harness.js had loaded,
 *     it reached a frame that was already booting in the start language, which then switched halfway through its boot.
 *   tests/harness.js (SlopTest.english) stores it again for a page opened by hand; nothing changes when it is stored. */
(function (w) {
  'use strict';
  w.SlopTestEnglish = function () {
    try {
      const p = JSON.parse(w.localStorage.getItem('slop-profile') || 'null') || { v: 1, data: {} };
      if (p.data && p.data.lang && p.data.lang.mode === 'en') return;
      p.data = Object.assign({}, p.data, { lang: { mode: 'en' } });
      w.localStorage.setItem('slop-profile', JSON.stringify(p));
    } catch (e) { /* storage blocked */ }
  };
  // As an init script (tests/run.mjs) it runs in every frame; only the test page itself stores the choice.
  if (w.__SLOPTEST_ENGLISH__ && w === w.top) w.SlopTestEnglish();
})(window);
