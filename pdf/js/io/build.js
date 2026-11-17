/* Slop PDF — "Download app (offline .html)". The bundle is built by the shared builder (shared/offline/build.js)
   from this app's entry in shared/offline/manifest.js. What stays here is PDF-only: the boot that starts the offline
   copy (pdf.js and its worker from a Blob URL, the standard fonts) and the ES-module-to-script conversion for pdf.js.
   The offline copy embeds the builder and the manifest as well, so it rebuilds itself byte for byte. */
(function () {
  'use strict';
  var SP = window.SP = window.SP || {};
  var B = SP.build = {};
  var manifest = function () { return window.SLOP_OFFLINE.pdf; };

  /** Resolves with the shared builder; online, the builder and the manifest are loaded from the site on first use. */
  B.ready = function () {
    if (window.SlopOffline && window.SLOP_OFFLINE) return Promise.resolve(window.SlopOffline);
    return SlopHub.loadScript('shared/offline/manifest.js')
      .then(function () { return SlopHub.loadScript('shared/offline/build.js'); })
      .then(function () { return window.SlopOffline; });
  };
  if (window.SlopOffline || window.SlopHub) B.ready().catch(function () { /* the download reports the error */ });

  B.escapeJSON = function (obj) { return window.SlopOffline.escapeJSON(obj); };
  /** Turns an ES module bundle (pdf.js) into a classic script that sets globalThis[name] to its exports. */
  B.toClassic = function (src, name) {
    var m = /export\s*\{([^}]*)\}\s*;?\s*$/.exec(src);
    if (!m) throw new Error('No export list found in module for ' + name);
    var body = src.slice(0, m.index);
    var props = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
      var p = s.split(/\s+as\s+/); return JSON.stringify(p[1] || p[0]) + ':' + p[0];
    });
    body = body.split('import.meta.url').join('"about:blank"');
    return '(function(){"use strict";\n' + body + '\nglobalThis[' + JSON.stringify(name) + ']={' + props.join(',') + '};\n})();';
  };
  /** Builds the offline HTML from a {path: text | 'base64:…'} source map (pure, deterministic). */
  B.buildHTML = function (S) { return window.SlopOffline.bundle(manifest(), S, { boot: BOOT }); };

  /* Runs inside the offline file. Must stay self-contained (it is serialised with toString). */
  function BOOT(scripts) {
    var S = JSON.parse(document.getElementById('app-src').textContent);
    var SP = window.SP = window.SP || {};
    function run(code, name) { var s = document.createElement('script'); s.textContent = code + '\n//# sourceURL=' + name; document.body.appendChild(s); }
    function bytes(b64s) { var bin = atob(b64s), o = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
    run(S['shared/offline/manifest.js'], 'manifest.js');
    run(S['shared/offline/build.js'], 'build.js');
    run(S['pdf/js/io/build.js'], 'build.js');
    var B = SP.build;
    SP.offline = { sources: S };
    function FontFactory() {}
    FontFactory.prototype.fetch = function (o) {
      var v = S['vendor/pdfjs/standard_fonts/' + o.filename];
      return v ? Promise.resolve(bytes(v.slice(7))) : Promise.reject(new Error('Font not bundled: ' + o.filename));
    };
    SP.offline.FontFactory = FontFactory;
    run(S['shared/slopui.js'], 'slopui.js');
    run(S['shared/apps.js'], 'apps.js');
    ['commands', 'search', 'palette', 'recorder', 'keymap'].forEach(function (n) { run(S['shared/commands/' + n + '.js'], n + '.js'); });
    // No Slop Hub offline: Slop Drive lives with the website's origin, not with a local file.
    run(S['vendor/pdf-lib/pdf-lib.min.js'], 'pdf-lib.min.js');
    run(S['shared/compat/stream.js'], 'stream.js'); // before pdf.js: Safari has no for-await over streams
    run(B.toClassic(S['vendor/pdfjs/pdf.min.js'], 'pdfjsLib'), 'pdf.min.js');
    var wsrc = B.toClassic(S['vendor/pdfjs/pdf.worker.min.js'], 'pdfjsWorker');
    try {
      var url = URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' }));
      window.pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(url);
    } catch (e) {
      run(wsrc, 'pdf.worker.min.js'); // fall back to pdf.js's main-thread "fake worker"
    }
    scripts.forEach(function (p) { run(S[p], p.split('/').pop()); });
  }
  B.BOOT = BOOT;

  /** The source map: from the embedded JSON when offline, otherwise read from the site. */
  B.collect = function () {
    if (SP.offline && SP.offline.sources) return Promise.resolve(SP.offline.sources);
    return B.ready().then(function (SO) { return SO.collect(manifest(), SO.fromSite(SlopHub.ROOT)); });
  };
  B.make = function () { return B.collect().then(B.buildHTML); };
})();
