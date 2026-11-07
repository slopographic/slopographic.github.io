/* Slopographic PWA glue (classic script, sets window.SlopPWA). See shared/pwa/HANDOFF.md.
 *   SlopPWA.mount({ install: '#pwa-install' })  once per page. Registers the service worker
 *     after the page load, shows the install button only when the browser offers an install,
 *     and asks for persistent storage after install or when running standalone.
 *     A no-op (returns false) when the browser has no service worker support, and in the suite's own apps
 *     (shared/native-app.js SlopNative.isApp(): the app has its files and installs from its store), where the
 *     install button stays hidden.
 *   SlopPWA.requestPersist()   asks the browser to keep storage; returns and records the answer.
 *   SlopPWA.persistAnswer()    the recorded answer: 'granted' | 'denied' | 'unsupported' | null.
 *   SlopPWA.persistMessage(a)  plain-words text for an answer (shown in Slop Drive).
 *   SlopPWA.onPersist(fn)      fn(answer) runs whenever an answer is recorded.
 *   SlopPWA.version()          the release the service worker serves ('v-…'), or null when no worker controls the page.
 *   SlopPWA.refresh()          loads the newest release: deletes the offline caches, fetches the newest worker and
 *     reloads from the network. Drive files, documents, settings and downloaded packs are kept (they are not in those
 *     caches). Any page that loads this script does the same when its address has ?fresh (slopographic.com/pdf/?fresh). */
(function (win) {
  'use strict';
  if (win.SlopPWA) return; // loaded twice (theme.js adds it for ?fresh): the first copy serves
  const NAV = win.navigator;
  const KEY = 'slop-pwa.persist';
  const STYLE = '.pwa-install:not(.slop-hbtn){font-size:12px;padding:6px 10px;white-space:nowrap}.pwa-install[hidden]{display:none!important}';
  const MESSAGES = {
    granted: 'Kept by the browser. It has agreed to keep Slop Drive, so it will not be cleared to free up space. Clearing this site’s data would still delete your files.',
    denied: 'The browser has not promised to keep Slop Drive. It may still clear it when space runs low. Export a copy with Backup & restore to be safe.',
    unsupported: 'This browser cannot promise to keep storage. Export a copy with Backup & restore now and then.',
  };
  const listeners = [];
  let deferred = null;     // the captured beforeinstallprompt event
  let buttons = [];
  let mounted = false;

  function read() { try { return win.localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(answer) { try { win.localStorage.setItem(KEY, answer); } catch (e) { /* storage blocked */ } }
  function isStandalone() {
    try { if (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) { /* no media queries */ }
    return NAV.standalone === true;
  }
  function showInstall(on) { buttons.forEach((b) => { b.hidden = !on; }); }
  function resolve(sel) {
    if (!sel) return [];
    if (typeof sel === 'string') return [...document.querySelectorAll(sel)];
    return [].concat(sel).filter(Boolean);
  }
  function injectStyle() {
    if (document.getElementById('pwa-style')) return;
    const s = document.createElement('style');
    s.id = 'pwa-style';
    s.textContent = STYLE;
    document.head.append(s);
  }
  function whenLoaded(fn) {
    if (document.readyState === 'complete') fn();
    else win.addEventListener('load', fn, { once: true });
  }
  function register(url) {
    return NAV.serviceWorker.register(url, { scope: '/' }).catch((err) => {
      console.warn('Service worker not registered:', err && err.message);
      return null;
    });
  }

  /** SlopQuota (shared/storage/quota.js) makes the browser call. Pages that do not load it get it on first use. */
  const QUOTA_SRC = (() => { try { return new URL('storage/quota.js', document.currentScript.src).href; } catch (e) { return '/shared/storage/quota.js'; } })();
  let quotaLoad = null;
  function quota() {
    if (win.SlopQuota) return Promise.resolve(win.SlopQuota);
    quotaLoad = quotaLoad || new Promise((done) => {
      const s = document.createElement('script');
      s.src = QUOTA_SRC;
      s.onload = s.onerror = () => done(win.SlopQuota || null);
      document.head.append(s);
    });
    return quotaLoad;
  }
  /** Asks the browser to keep this origin's storage, records the answer and tells listeners. */
  async function requestPersist() {
    const Q = await quota();
    const answer = Q ? await Q.persistAnswer() : 'unsupported';
    write(answer);
    listeners.forEach((fn) => { try { fn(answer); } catch (e) { /* a listener failed; keep going */ } });
    return answer;
  }

  async function onInstallClick() {
    const e = deferred;
    if (!e) return;
    deferred = null;          // a prompt event can only be used once
    showInstall(false);
    try { await e.prompt(); await e.userChoice; } catch (err) { /* prompt blocked */ }
  }

  function mount(opts = {}) {
    if (win.SlopNative && win.SlopNative.isApp()) { resolve(opts.install).forEach((b) => { b.hidden = true; }); return false; }
    if (mounted || !NAV || !('serviceWorker' in NAV) || !NAV.serviceWorker) return false;
    mounted = true;
    injectStyle();
    buttons = resolve(opts.install);
    buttons.forEach((b) => { b.hidden = true; b.addEventListener('click', onInstallClick); });
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      showInstall(!isStandalone());
    });
    win.addEventListener('appinstalled', () => {
      deferred = null;
      showInstall(false);
      requestPersist();
    });
    if (isStandalone() && !read()) requestPersist();
    if (opts.register !== false) whenLoaded(() => register(opts.worker || '/service-worker.js'));
    return true;
  }

  /** The release the controlling service worker serves, or null (no worker, or no answer within two seconds). */
  function version() {
    return new Promise((done) => {
      const c = NAV && NAV.serviceWorker && NAV.serviceWorker.controller;
      if (!c || !win.MessageChannel) { done(null); return; }
      const ch = new win.MessageChannel(), t = win.setTimeout(() => done(null), 2000);
      ch.port1.onmessage = (e) => { win.clearTimeout(t); done((e.data && e.data.version) || null); };
      c.postMessage({ type: 'version' }, [ch.port2]);
    });
  }

  /** Deletes this site's offline caches, asks the browser for the newest service worker, then reloads the page (without
   * ?fresh). The worker fetches every file again (network first, no HTTP cache), so the reload shows the newest release. */
  const UPDATE_WAIT_MS = 3000;
  async function refresh() {
    try {
      if (win.caches) for (const k of await win.caches.keys()) if (k.startsWith('slopographic-')) await win.caches.delete(k);
    } catch (e) { /* caches blocked: the reload still revalidates with the server */ }
    try {
      const reg = NAV && NAV.serviceWorker && (await NAV.serviceWorker.getRegistration('/'));
      // update() waits for a new worker to install, which precaches the whole site and can take far longer than anyone waits.
      // Give it a moment, then reload anyway: the caches are gone, so the reload reads the newest files from the network and
      // the new worker finishes installing in the background.
      if (reg) await Promise.race([reg.update(), new Promise((r) => setTimeout(r, UPDATE_WAIT_MS))]);
    } catch (e) { /* offline or no worker: reload anyway */ }
    const u = new URL(win.location.href);
    u.searchParams.delete('fresh');
    win.location.replace(u.href);
  }

  win.SlopPWA = {
    mount,
    mounted: () => mounted,   // the shell mounts the worker on pages that did not (shell/shell.js)
    version,
    refresh,
    requestPersist,
    persistAnswer: read,
    persistMessage: (answer) => MESSAGES[answer] || '',
    isStandalone,
    canInstall: () => !!deferred,
    onPersist: (fn) => { listeners.push(fn); },
  };
  if (new URLSearchParams(win.location.search).has('fresh')) refresh();
})(window);
