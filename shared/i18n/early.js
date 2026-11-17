/* The first frame in the chosen language. shared/i18n/i18n.js writes this file into the <head> while a page is parsed in a
 * language other than English (its tables are written there too, so they are in before the body). Each marked element
 * (data-i18n, data-i18n-attr) is filled as the parser adds it: a MutationObserver's callback runs before the next frame,
 * so the first paint already reads in that language; SlopI18n.apply() at DOMContentLoaded then fills what later tables
 * (an app's) hold. Tests: tests/node/first-paint-lang.test.mjs, tests/node/i18n-load.test.mjs. */
(function (g) {
  'use strict';
  var I = g.SlopI18n, doc = g.document, SEL = '[data-i18n],[data-i18n-attr]', last = [], code = I && I.get();
  if (!I || !I.fill || !g.MutationObserver || !doc || doc.readyState !== 'loading') return;
  var mo = new g.MutationObserver(function (recs) {
    var els = last;   // the parser may still be adding text to the ones filled last time
    recs.forEach(function (r) {
      var t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (t && (t = t.closest('[data-i18n]'))) els.push(t);
      for (var i = 0, n; i < r.addedNodes.length; i++) {
        if ((n = r.addedNodes[i]).nodeType !== 1) continue;
        if (n.matches(SEL)) els.push(n);
        if (n.firstElementChild) els.push.apply(els, n.querySelectorAll(SEL));
      }
    });
    els.forEach(function (el) { I.fill(el, code); });
    last = els.filter(function (el) { return el.hasAttribute('data-i18n'); });
    mo.takeRecords();   // its own changes
  });
  mo.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  doc.addEventListener('DOMContentLoaded', function () { mo.disconnect(); last = []; });
})(window);
