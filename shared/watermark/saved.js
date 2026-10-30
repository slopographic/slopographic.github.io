/* My watermarks: watermarks a person saves once and finds in every app (Slop Watermark, PhotoSlop, SlopCut, Slop PDF and
 * the Workflows Watermark step). One IndexedDB database for the whole site, 'slop-watermarks' (store 'marks', through
 * SlopDb, shared/db/db.js, loaded here when the page has not), so a watermark made in one app is in all of them; open pages
 * hear of each change at once (BroadcastChannel 'slop-watermarks'). Classic script: window.SlopWatermarkSaved.
 *   list() → Promise<[{ id, name, spec, time }]> newest first ; get(id) ; save(name, spec, id?) → Promise<record>
 *   remove(id) → Promise ; onChange(fn) → off()   fn() after any change here or in another tab
 * Without storage (a private window that blocks it) list() is empty and save() rejects with a reason a person can read. */
(function () {
  'use strict';
  if (window.SlopWatermarkSaved) return;
  const S = window.SlopWatermarkSpec;
  const tr = (k, v) => (window.SlopI18n ? window.SlopI18n.t(k, v) : k);   // words: shared/i18n/ui/<code>/watermark.js
  const NAME = 'slop-watermarks', STORE = 'marks', CHANNEL = 'slop-watermarks';
  const SCRIPT = document.currentScript;
  // the site root from this script's own address; a script run inline (an offline copy, a test frame) uses the page's base
  const ROOT = (() => { for (const [rel, base] of [['../../', SCRIPT && SCRIPT.src], ['/', document.baseURI]]) { try { return new URL(rel, base).href; } catch (e) { /* next */ } } return ''; })();
  const listeners = new Set();
  let dbP = null, chan = null;

  function script(rel) {
    return new Promise((resolve, reject) => {
      const src = new URL(rel, ROOT).href;
      if ([...document.scripts].some((s) => s.src === src) && window.SlopDb) { resolve(); return; }
      const s = Object.assign(document.createElement('script'), { src, async: false });
      s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + rel));
      document.head.append(s);
    });
  }
  function db() {
    if (!dbP) {
      dbP = (async () => {
        if (!window.SlopDbQuery) await script('shared/db/query.js');
        if (!window.SlopDb) await script('shared/db/db.js');
        return window.SlopDb.open(NAME, { version: 1, stores: { [STORE]: { keyPath: 'id', indexes: [{ name: 'time', keyPath: 'time' }] } } });
      })().catch(() => null);
      dbP.then((d) => { if (!d) dbP = null; });
    }
    return dbP;
  }
  function channel() {
    if (chan || typeof BroadcastChannel !== 'function') return chan;
    chan = new BroadcastChannel(CHANNEL);
    chan.onmessage = () => fire(false);
    return chan;
  }
  function fire(tell) {
    if (tell && channel()) try { chan.postMessage({ t: Date.now() }); } catch (e) { /* closed */ }
    listeners.forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
  }
  const clean = (r) => ({ id: String(r.id), name: String(r.name || 'Watermark').slice(0, 80), spec: S.normalize(r.spec), time: Number(r.time) || 0 });

  async function list() {
    const d = await db();
    if (!d) return [];
    const rows = await d.getAll(STORE).catch(() => []);
    return rows.filter((r) => r && r.id && r.spec).map(clean).sort((a, b) => b.time - a.time);
  }
  async function get(id) {
    const d = await db(), r = d && (await d.get(STORE, id).catch(() => null));
    return r ? clean(r) : null;
  }
  async function save(name, spec, id) {
    const d = await db();
    if (!d) throw new Error(tr('ui.wm.saved_blocked'));
    const sp = S.normalize(spec), title = String(name || sp.name || '').trim().slice(0, 80) || 'Watermark';
    const rec = { id: id || 'wm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: title, spec: Object.assign(sp, { name: title }), time: Date.now() };
    await d.put(STORE, rec);
    fire(true);
    return clean(rec);
  }
  async function remove(id) {
    const d = await db();
    if (d) await d.remove(STORE, id);
    fire(true);
  }
  function onChange(fn) { channel(); listeners.add(fn); return () => listeners.delete(fn); }

  window.SlopWatermarkSaved = { list, get, save, remove, onChange, DB: NAME };
})();
