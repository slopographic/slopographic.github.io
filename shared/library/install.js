/* Slopographic packs: the one way a pack gets onto this device. Used by the Get more dialog (get-more.js) and by fonts
 * downloaded just in time (shared/fonts/jit.js). Every file comes from a host listed in packs.json, must match its
 * manifest byte length and SHA-256, and the pack is stored in one transaction (shared/library/store.js) or not at all.
 * The download goes through shared/cdn/assets.js (loaded here when the page has not): a cdn file is tried on jsDelivr, then
 * on GitHub, each place checked the same way. Needs manifest.js and store.js. Classic script; exposes window.SlopLibraryInstall:
 *   loadManifest() -> Promise<{ packs, errors, hosts }>     packs.json, read once, validated; never rejects
 *   installed() -> Promise<{ id: record }>                     installed packs ({} when storage is unavailable)
 *   install(pack, onStatus?) -> Promise                        rejects with the reason; nothing is stored then
 *   onChange(fn) -> unsubscribe                                fn(pack) after an install or a removal (pack null)
 *   changed(pack)                                              tells the listeners (get-more.js calls it after removing) */
(function (root) {
  'use strict';
  const doc = root.document;
  const SELF = (doc && doc.currentScript && doc.currentScript.src) || (root.location && root.location.href) || '';
  const PACKS_URL = new URL('packs.json', SELF).href;
  const M = () => root.SlopLibraryManifest, S = () => root.SlopLibraryStore;
  const listeners = new Set();
  /** A word from the shared tables (shared/i18n/ui/<code>/shell.js), the key without SlopI18n. */
  const tx = (key, vars) => (root.SlopI18n ? root.SlopI18n.t(key, vars) : key);
  let manifestP = null, cdnP = null;

  /** shared/cdn/assets.js, which knows where the cdn files are served from: on the page already, or loaded once. */
  function cdn() {
    if (root.SlopCdn || !doc) return Promise.resolve(root.SlopCdn);
    if (!cdnP) {
      cdnP = new Promise((res, rej) => {
        const s = doc.createElement('script');
        s.src = new URL('../cdn/assets.js', SELF).href;
        s.onload = () => res(root.SlopCdn);
        s.onerror = () => { cdnP = null; rej(new Error('shared/cdn/assets.js could not load')); };
        doc.head.append(s);
      });
    }
    return cdnP;
  }

  function loadManifest() {
    if (!manifestP) {
      manifestP = cdn().then(() => fetch(PACKS_URL, { cache: 'no-cache' }))
        .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then((j) => M().validate(j))
        .catch((e) => ({ packs: [], errors: [tx('ui.library.list_failed', { why: e.message })], hosts: [] }));
    }
    return manifestP;
  }
  async function installed() {
    try { const rows = await S().listPacks(); return Object.fromEntries(rows.map((r) => [r.id, r])); } catch (e) { return {}; }
  }
  function changed(pack) { for (const fn of listeners) { try { fn(pack); } catch (e) { /* a listener must not break an install */ } } }

  async function install(p, onStatus) {
    const say = (text) => { if (onStatus) onStatus(text); };
    const blobs = {}, m = await loadManifest();
    let n = 0;
    for (const f of p.files) {
      say(tx('ui.library.downloading', { name: f.name, i: ++n, n: p.files.length }));
      const C = await cdn();
      const bytes = await C.fetchVerified(f.cdn ? C.urls(f.cdn) : C.candidates(f.url), { label: f.name }, {
        allowedUrl: (u) => M().allowedUrl(u, m.hosts) || C.isCdnUrl(u),
        verify: (b) => M().verifyBytes(b.buffer, f),   // the bytes fill their buffer exactly
      });
      const buf = bytes.buffer;
      const type = p.kind === 'model' ? 'application/octet-stream' : f.name.endsWith('.woff2') ? 'font/woff2' : 'font/' + f.name.split('.').pop().toLowerCase();
      blobs[f.name] = new Blob([buf], { type });
    }
    say(tx('ui.library.storing'));
    await S().savePack(p, blobs);
    changed(p);
  }

  root.SlopLibraryInstall = { loadManifest, installed, install, changed, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
})(typeof window !== 'undefined' ? window : globalThis);
