/* Offline single-file builder, shared by every app with "Download app (offline .html)".
 * Pure: a manifest (shared/offline/manifest.js) and a source map go in, one HTML string comes out. No DOM,
 * no fetch and no file system at load time, so the same file runs in the browser, inside the offline copy
 * itself (it is embedded in the copy's sources) and in Node (tools/offline/lib.mjs).
 *
 * Rules, applied to the manifest's entry page (paths are site-root paths; references resolve from the
 * entry's folder, or from its data-src attribute when it has one):
 *  - elements with data-offline="strip" are removed (hosted-only: consent, storage, guards, sign-in)
 *  - a local stylesheet becomes <style>, and a local script becomes <script> in mode "inline", or is removed
 *    in mode "embed" (the sources go in <script id="app-src"> and run in the boot, in manifest.scripts order)
 *  - the inlined element keeps data-app (theme.js reads it); data-src and other attributes are dropped
 *  - a local icon becomes a base64 data: URL; binary files (manifest.binary) are base64 in the sources
 *  - manifest.drop names files the offline copy leaves out; any other local asset the page names must be in
 *    manifest.files, or the build throws (so a new script cannot be silently missing offline)
 *  - href="../" points at https://slopographic.com/, because a file has no site root
 *  - the entry gets <meta name=manifest.marker content="offline">, so the copy knows it is one
 * Node and browsers see the same output: only the loader differs (see collect). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SlopOffline = api;
})(this, function () {
  'use strict';

  var REMOTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i; // https:, data:, //host, /absolute, #hash: not a file of the bundle
  var MIME = { '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

  /** A site-root path of a reference written in the page at `entry`. */
  function resolveRef(entry, ref) {
    var dir = entry.indexOf('/') < 0 ? '' : entry.slice(0, entry.lastIndexOf('/') + 1), out = [];
    (dir + ref).split('/').forEach(function (s) { if (s === '..') out.pop(); else if (s && s !== '.') out.push(s); });
    return out.join('/');
  }
  /** JSON that is safe inside a <script> element. */
  function escapeJSON(obj) {
    return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  function attr(tag, name) { var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag); return m ? m[1] : null; }
  function uniq(list) { return list.filter(function (p, i) { return list.indexOf(p) === i; }); }
  /** Neutralises a closing tag inside code, so the element cannot end early. */
  function closeTag(code, tag) { return String(code).replace(new RegExp('<\\/(' + tag + ')', 'gi'), '<\\/$1'); }
  function bytesToBase64(u8) {
    var s = '';
    for (var k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(s);
  }
  /** Base64 of a source: binary sources already carry it ('base64:' prefix), text is encoded as UTF-8. */
  function b64Of(v) { return v.indexOf('base64:') === 0 ? v.slice(7) : bytesToBase64(new TextEncoder().encode(v)); }
  function mimeOf(p) { var m = /\.[a-z0-9]+$/i.exec(p); return MIME[m ? m[0].toLowerCase() : ''] || 'application/octet-stream'; }

  /** Builds the offline HTML from a manifest and sources: { 'site/path': text | 'base64:…' }. */
  function bundle(M, S, opts) {
    var entry = M.entry, drop = M.drop || [], html = S[entry];
    if (html == null) throw new Error(M.id + ': ' + entry + ' is missing from the sources');
    function need(key) {
      if (S[key] == null && drop.indexOf(key) < 0) throw new Error(M.id + ': ' + key + ' (named by ' + entry + ') is not in the manifest files');
    }
    // The entry page: hosted-only elements go, the copy gets its marker, and home links point at the site.
    html = html.replace(/[ \t]*<link\b[^>]*\sdata-offline="strip"[^>]*>\n?/g, '')
      .replace(/[ \t]*<script\b[^>]*\sdata-offline="strip"[^>]*>[\s\S]*?<\/script>\n?/g, '')
      .replace(/href="\.\.\/"/g, function () { return 'href="https://slopographic.com/"'; });
    if (!/<head>/.test(html)) throw new Error(M.id + ': ' + entry + ' has no <head>');
    html = html.replace(/<head>/, function () { return '<head>\n  <meta name="' + M.marker + '" content="offline">'; });

    html = html.replace(/<link\b[^>]*>/g, function (tag) {
      var href = attr(tag, 'href');
      if (href == null || REMOTE.test(href)) return tag;
      var src = attr(tag, 'data-src'), key = src || resolveRef(entry, href);
      if (/\srel="icon"/.test(tag)) {
        if (S[key] == null) return tag;
        return tag.replace(' href="' + href + '"', function () { return ' href="data:' + mimeOf(key) + ';base64,' + b64Of(S[key]) + '"'; });
      }
      if (!/\srel="stylesheet"/.test(tag)) return tag;
      if (drop.indexOf(key) >= 0) return '';
      need(key);
      return '<style>\n' + closeTag(S[key], 'style') + '\n</style>';
    });

    html = html.replace(/([ \t]*)<script\b([^>]*)><\/script>(\n?)/g, function (tag, ws, attrs, nl) {
      var href = attr(attrs, 'src');
      if (href == null || REMOTE.test(href)) return tag;
      var src = attr(attrs, 'data-src'), key = src || resolveRef(entry, href);
      if (drop.indexOf(key) >= 0 || M.mode === 'embed') { need(key); return ''; }
      need(key);
      var app = attr(attrs, 'data-app');
      return ws + '<script' + (app != null ? ' data-app="' + app + '"' : '') + '>\n' + closeTag(S[key], 'script') + '\n</script>' + nl;
    });

    if (M.mode === 'embed') {
      if (!opts || typeof opts.boot !== 'function') throw new Error(M.id + ': embed mode needs opts.boot');
      var boot = '(' + opts.boot.toString() + ')(' + JSON.stringify(M.scripts || []) + ');';
      html = html.replace(/<\/body>/, function () {
        return '<script type="application/json" id="app-src">' + escapeJSON(S) + '</script>\n<script>' + boot + '</script>\n</body>';
      });
    }
    return html;
  }

  /** Reads the manifest's sources: entry and files as text, binary as base64. `load(path, binary)` returns a
   *  promise: text (or bytes for binary), or null for a missing binary. A missing text file is an error. */
  function collect(M, load) {
    var text = uniq([M.entry].concat(M.files || [])), bin = uniq(M.binary || []);
    return Promise.all(text.map(function (p) { return load(p, false); })).then(function (texts) {
      return Promise.all(bin.map(function (p) { return load(p, true); })).then(function (bytes) {
        var S = {};
        text.forEach(function (p, i) { S[p] = texts[i]; });
        bin.forEach(function (p, i) { if (bytes[i]) S[p] = 'base64:' + bytesToBase64(bytes[i]); });
        return S;
      });
    });
  }
  function make(M, load, opts) { return collect(M, load).then(function (S) { return bundle(M, S, opts); }); }

  /** A loader for the browser: reads paths under a site root with fetch. */
  function fromSite(rootHref) {
    return function (p, binary) {
      return fetch(new URL(p, rootHref), { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) { if (binary) return null; throw new Error('Could not read ' + p + ' (' + r.status + ')'); }
        return binary ? r.arrayBuffer().then(function (b) { return new Uint8Array(b); }) : r.text();
      });
    };
  }

  return { bundle: bundle, collect: collect, make: make, fromSite: fromSite, escapeJSON: escapeJSON, resolveRef: resolveRef };
});
