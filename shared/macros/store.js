/* SlopMacroStore: the apps' saved macros, in this browser's IndexedDB through the shared SlopDb (shared/db/db.js):
 * database 'slop-macros', store 'macros', one record per macro ({ id, app, name, steps, created, modified }, the shape of
 * shared/macros/core.js). One store for every app, read per app. Nothing is uploaded. Every call resolves (an empty list,
 * false) when storage is blocked. Saving or deleting tells this page and the site's other open pages (BroadcastChannel
 * 'slop-macros'), so Slop Workflows lists a macro the moment PhotoSlop saves it.
 * Classic script (window.SlopMacroStore), also a side-effect ES-module import, and CommonJS for the Node tests.
 *   list(app) → macros, newest first ; get(id) ; save(macro) → the saved macro ; remove(id) → bool
 *   onChange(fn(app)) → off ; setBase(url) the folder of shared/macros/ (to load SlopDb when the page has not) ;
 *   use(db) a SlopDb-like wrapper instead of IndexedDB (tests) */
(function (root, factory) {
  const api = root.SlopMacroStore || factory(root);   // one store per page, also when a module imports it after the page's script
  root.SlopMacroStore = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const NAME = 'slop-macros', STORE = 'macros', CHANNEL = 'slop-macros';
  const doc = root.document;
  const own = doc && doc.currentScript && doc.currentScript.src;
  let base = own ? new URL('./', own).href : null;
  let dbp = null;
  const listeners = new Set();
  let bc = null;
  try { if (doc && typeof root.BroadcastChannel === 'function') { bc = new root.BroadcastChannel(CHANNEL); bc.onmessage = (e) => fire(e.data && e.data.app, false); } } catch (e) { bc = null; }
  function fire(app, tell) {
    for (const fn of [...listeners]) try { fn(app || ''); } catch (e) { console.error(e); }
    if (tell && bc) try { bc.postMessage({ app }); } catch (e) { /* closed */ }
  }

  const script = (src) => new Promise((res, rej) => {
    const s = doc.createElement('script'); s.src = src; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
    doc.head.append(s);
  });
  async function needDb() {
    if (root.SlopDb || !doc || !base) return root.SlopDb || null;
    try { if (!root.SlopDbQuery) await script(new URL('../db/query.js', base).href); await script(new URL('../db/db.js', base).href); } catch (e) { return null; }
    return root.SlopDb || null;
  }
  function db() {
    if (!dbp) dbp = needDb().then((D) => (D ? D.open(NAME, { version: 1, stores: { [STORE]: { keyPath: 'id', indexes: [{ name: 'app', keyPath: 'app' }] } } }) : null));
    return dbp;
  }

  async function list(app) {
    const d = await db();
    if (!d) return [];
    try { return (await d.getAll(STORE)).filter((m) => !app || m.app === app).sort((a, b) => b.modified - a.modified); } catch (e) { return []; }
  }
  async function get(id) {
    const d = await db();
    try { return d ? (await d.get(STORE, id)) || null : null; } catch (e) { return null; }
  }
  async function save(macro) {
    const d = await db();
    if (!d) throw new Error(globalThis.SlopI18n ? globalThis.SlopI18n.t('ui.macro.store_blocked') : 'ui.macro.store_blocked');   // shared/i18n/ui/<code>/macros.js
    const rec = JSON.parse(JSON.stringify(Object.assign({}, macro, { modified: Date.now() })));
    await d.put(STORE, rec);
    fire(rec.app, true);
    return rec;
  }
  async function remove(id) {
    const d = await db();
    if (!d) return false;
    const old = await get(id);
    try { await d.remove(STORE, id); fire(old && old.app, true); return true; } catch (e) { return false; }
  }

  return {
    NAME, STORE, list, get, save, remove,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setBase(url) { base = String(url); },
    use(wrapper) { dbp = Promise.resolve(wrapper); },
  };
});
