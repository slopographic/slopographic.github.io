/* The iPhone and iPad app's page glue (mobile/ios): loaded first on every page of the app's bundled copy of the site
 * (mobile/ios/bundle.mjs adds the tag), never on the website. Classic script; window.NATIVE_CONFIG comes from
 * native/config.js, written by the bundle step.
 *   1. Engines from the app: a fetch of a cdn engine file (the video, HEIC, RAW and 3D engines) is answered from the
 *      app's own copy (/cdn/<path>), so the app never downloads code. The answer has no URL of its own, so the download
 *      helper's host check (shared/cdn/assets.js fetchVerified) sees the cdn address it asked for.
 *   2. No downloaded code: any other fetch of a script or WebAssembly file from another host is refused (App Review 2.5.2);
 *      models, font packs and other data still download at first use.
 *   3. Saving: a download link (a[download] on a blob: or data: address, clicked or .click()ed) saves the file in the
 *      app's folder (native/files.js, shared/native/save.js: Files › On My iPhone/iPad, or back over a file opened in
 *      place); an app without that plugin opens the share sheet (Save to Files, AirDrop, Mail...) through Capacitor's
 *      Filesystem and Share plugins, or the Web Share API.
 *   4. The bands around the page: the app keeps the web view inside the safe area (SiteRouter.swift) and paints the
 *      status bar band and the rest (home indicator, landscape notch) in the colours at the page's top and bottom edges,
 *      which this reports (the "siteChrome" message) on load and whenever they may change (theme, scroll, resize).
 * window.SlopNativeGlue: { base64Of(blob), load(src) (a same-origin script, once), share(blob, name) } for native/files.js.
 * Pure helpers are exported for Node (tests/node/mobile-ios.test.mjs); the browser installs the hooks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root.document) api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CODE = /\.(m?js|wasm)$/i;

  /** The address without its query and hash. */
  const bare = (u) => String(u).split('#')[0].split('?')[0];
  /** The app's own copy of a cdn file (a path like /cdn/engines/...), or null. map: { url: local path }. */
  const localFor = (u, map) => (map && Object.prototype.hasOwnProperty.call(map, bare(u)) ? map[bare(u)] : null);
  /** True for a script or WebAssembly file on another host (what the app must not download). */
  function isRemoteCode(u, origin) {
    let x;
    try { x = new URL(String(u), origin); } catch (e) { return false; }
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return false;
    return x.origin !== origin && CODE.test(x.pathname);
  }
  /** The file an anchor saves: { href, name } for a download link to a blob: or data: address, else null. */
  function saveTarget(a) {
    if (!a || typeof a.getAttribute !== 'function' || !a.hasAttribute('download')) return null;
    const href = a.href || a.getAttribute('href') || '';
    if (!/^(blob|data):/.test(href)) return null;
    return { href, name: (a.getAttribute('download') || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download' };
  }
  /** The URL a fetch input names (a string, a URL or a Request). */
  const urlOf = (input) => (input && typeof input === 'object' && 'url' in input ? input.url : String(input));

  /** A blob as base64 (what the Filesystem plugin writes), in chunks so a large file does not overflow the call stack. */
  async function base64Of(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  /** Hands one file to the share sheet. plugins: Capacitor's { Filesystem, Share } when the app has them. */
  async function share(win, blob, name, plugins) {
    if (plugins && plugins.Filesystem && plugins.Share) {
      const saved = await plugins.Filesystem.writeFile({ path: name, data: await base64Of(blob), directory: 'CACHE' });
      await plugins.Share.share({ title: name, files: [saved.uri] });
      return 'plugin';
    }
    const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
    if (win.navigator.canShare && win.navigator.canShare({ files: [file] })) { await win.navigator.share({ files: [file], title: name }); return 'web'; }
    win.open(URL.createObjectURL(blob), '_blank');
    return 'open';
  }

  /** [r, g, b] for a CSS colour that shows (rgb()/rgba() with alpha > 0.1), else null. */
  function parseColor(c) {
    const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(String(c || '').trim());
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return a > 0.1 ? [m[1], m[2], m[3]].map((n) => Math.round(+n)) : null;
  }
  /** The colour an element shows: its own background, else its nearest painted ancestor's. */
  function paintOf(win, el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const c = parseColor(win.getComputedStyle(e).backgroundColor);
      if (c) return c;
    }
    return null;
  }
  /** { top, bottom }: the colours at the middle of the page's top and bottom edges (the page's own as a fallback). */
  function edgeColors(win) {
    const d = win.document, x = win.innerWidth / 2, page = paintOf(win, d.body) || paintOf(win, d.documentElement)
      || (win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches ? [0, 0, 0] : [255, 255, 255]);
    return { top: paintOf(win, d.elementFromPoint(x, 1)) || page, bottom: paintOf(win, d.elementFromPoint(x, win.innerHeight - 1)) || page };
  }
  /** Reports the edge colours to the app when they change; checks once per frame at most. */
  function watchEdges(win) {
    const h = win.webkit && win.webkit.messageHandlers && win.webkit.messageHandlers.siteChrome;
    if (!h) return;
    let last = '', queued = false;
    const check = () => {
      queued = false;
      const c = edgeColors(win), k = JSON.stringify(c);
      if (k !== last) { last = k; h.postMessage(c); }
    };
    const soon = () => { if (!queued) { queued = true; win.requestAnimationFrame(check); } };
    for (const ev of ['DOMContentLoaded', 'load', 'resize', 'scroll', 'pageshow']) win.addEventListener(ev, soon, { passive: true });
    if (win.matchMedia) win.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', soon);
    new win.MutationObserver(soon).observe(win.document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'data-theme', 'open', 'hidden'] });
    soon();
  }

  function install(win) {
    if (!win || win.__nativeInstalled) return;
    win.__nativeInstalled = true;
    const cfg = win.NATIVE_CONFIG || {}, origin = win.location.origin, fetch0 = win.fetch.bind(win);
    win.fetch = function (input, init) {
      const u = urlOf(input), local = localFor(u, cfg.local);
      if (local) {
        return fetch0(local).then((r) => {
          if (!r.ok) throw new TypeError(`${local}: HTTP ${r.status}`);
          return r.blob().then((b) => new Response(b, { status: 200, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream' } }));
        });
      }
      if (isRemoteCode(u, origin)) return Promise.reject(new TypeError(`${bare(u)}: the app does not download code (everything it runs is built in)`));
      return fetch0(input, init);
    };
    const plugins = () => (win.Capacitor && win.Capacitor.Plugins) || null;
    const loaded = new Map();
    const load = (src) => {
      if (!loaded.has(src)) loaded.set(src, new Promise((res, rej) => { const s = win.document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { loaded.delete(src); rej(new Error('could not load ' + src)); }; win.document.head.appendChild(s); }));
      return loaded.get(src);
    };
    win.SlopNativeGlue = { base64Of, load, share: (b, name) => share(win, b, name, plugins()) };
    const save = (t) => {
      fetch0(t.href).then((r) => r.blob()).then((b) => {
        const F = win.SlopNativeFiles;
        return F && F.available() ? F.saveDownload(b, t.name) : share(win, b, t.name, plugins());
      }).catch((e) => { if (!/cancel|abort/i.test(String(e && (e.message || e)))) console.warn('save', e); });
    };
    const click0 = win.HTMLAnchorElement.prototype.click;
    win.HTMLAnchorElement.prototype.click = function () {
      const t = saveTarget(this);
      if (t) { save(t); return; }
      return click0.call(this);
    };
    win.document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[download]') : null, t = saveTarget(a);
      if (!t || e.defaultPrevented) return;
      e.preventDefault();
      save(t);
    }, true);
    win.document.documentElement.classList.add('native-app');
    watchEdges(win);
  }

  return { localFor, isRemoteCode, saveTarget, share, install, bare, parseColor, edgeColors };
});
