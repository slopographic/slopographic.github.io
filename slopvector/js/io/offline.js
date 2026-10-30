/* SlopVector — io: offline single-file self-download. The bundle comes from the shared builder
   (shared/offline/build.js) and this app's entry in shared/offline/manifest.js. */
(function () {
  'use strict';
  var G = window.SVGeom, SV = window.SV, S = SV.state;
  var fmt = G.fmt, esc = SV.esc, clone = SV.clone;
  var abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  var IO = SV.io = SV.io || {};
  var $ = SV._io = SV._io || {};

  /* ================= offline self-download ================= */
  // The bundle is built by the shared builder (shared/offline/build.js) from this app's manifest entry.
  IO.buildOfflineHTML = function () {
    var offline = location.protocol === 'file:' || !!document.querySelector('meta[name="slop-vector-build"]');
    if (offline) {
      if (window.__SV_PRISTINE) return Promise.resolve(window.__SV_PRISTINE);
      return Promise.reject(new Error('No pristine copy available'));
    }
    return SlopHub.loadScript('shared/offline/manifest.js')
      .then(function () { return SlopHub.loadScript('shared/offline/build.js'); })
      .then(function () { return window.SlopOffline.make(window.SLOP_OFFLINE.vector, window.SlopOffline.fromSite(SlopHub.ROOT)); })
      .then(IO.normalizeHTML);
  };
  // Serialise through the HTML parser so the first offline build is byte-identical to the copy the
  // offline app later re-serialises from its own DOM (see the capture script in index.html).
  IO.normalizeHTML = function (html) {
    var d = new DOMParser().parseFromString(html, 'text/html');
    return '<!doctype html>\n' + d.documentElement.outerHTML;
  };
  IO.downloadApp = function () {
    return IO.buildOfflineHTML().then(function (html) {
      IO.download(new Blob([html], { type: 'text/html' }), 'slop-vector.html');
      SV.toast(SV.t('vector.msg.app_downloaded', { file: 'slop-vector.html' }));
      return html;
    }).catch(function (e) { SV.toast(SV.t('vector.msg.app_failed', { error: e.message }), 'warn'); });
  };
})();
