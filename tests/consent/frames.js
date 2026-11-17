/* Consent test helpers. Each open() loads fixture.html (or a page) in a fresh same-origin iframe, so the
 * consent globals start clean. stubLoader() replaces the script loader, so no test ever touches the network. */
(function () {
  'use strict';
  var ID = 'consent-frame';
  var GA = 'G-TEST1234';
  var ADS = 'ca-pub-0000000000000000';

  function frame(src) {
    var old = document.getElementById(ID);
    if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = ID;
    f.style.cssText = 'width:420px;height:640px;border:0';
    f.src = src;
    document.body.prepend(f);
    return new Promise(function (r) { f.addEventListener('load', function () { r(f.contentWindow); }, { once: true }); });
  }
  /** Opens fixture.html with config overrides; resolves with the frame's window once its scripts have run. */
  function open(opts) {
    opts = opts || {};
    var q = new URLSearchParams();
    q.set('cfg', JSON.stringify(opts.cfg || {}));
    if (opts.block) q.set('block', '1');
    return frame('fixture.html?' + q.toString());
  }
  /** Opens any page (path relative to tests/consent/). */
  function openPage(src) { return frame(src); }
  /** Replaces the loader for every frame opened after this call. Returns the array of loaded URLs. */
  function stubLoader() {
    var calls = [];
    window.__stubLoader = function (src) { calls.push(src); };
    return calls;
  }
  function reset() {
    try { localStorage.clear(); } catch (e) { /* ignore */ }
    delete window.__stubLoader;
    var f = document.getElementById(ID);
    if (f) f.remove();
  }
  /** The most recent consent 'update' payload pushed to dataLayer, or null. */
  function lastUpdate(w) {
    var out = null;
    Array.from(w.dataLayer).forEach(function (e) {
      var a = Array.from(e);
      if (a[0] === 'consent' && a[1] === 'update') out = a[2];
    });
    return out;
  }
  function thirdPartyScripts(doc) {
    return Array.from(doc.scripts).filter(function (s) { return /googletagmanager|googlesyndication/.test(s.src || ''); });
  }
  var ALL_DENIED = ['ad_storage', 'ad_user_data', 'ad_personalization', 'analytics_storage', 'functionality_storage', 'personalization_storage', 'security_storage'];
  window.ConsentTest = { open: open, openPage: openPage, stubLoader: stubLoader, reset: reset, lastUpdate: lastUpdate, thirdPartyScripts: thirdPartyScripts, GA: GA, ADS: ADS, ALL_DENIED: ALL_DENIED };
})();
