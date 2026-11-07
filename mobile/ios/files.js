/* The iPhone and iPad app's files (mobile/ios), the page side of SiteFiles.swift: loaded on every page of the app after
 * native/native.js, never on the website. Classic script. Exposes window.SlopNativeFiles (shared/native-app.js hands it
 * to the site as SlopNative.files()):
 *   available()                  true when the app has the SiteFiles plugin
 *   info()                       { documents, cache, icloud, container, icloudOn } (folder URLs; "" when none)
 *   root()                       'icloud' when the files are kept in iCloud Drive, else 'documents'
 *   tree(root)                   [{ path, dir, size, mtime, placeholder }]: everything in the folder
 *   read(root, path)             the file as a Blob
 *   write(root, path, blob)      { size, mtime }: written beside it under a hidden name, then moved over it
 *   move(root, from, to) · remove(root, path, { emptyOnly }) · mkdir(root, path)
 *   exportFile(root, path)       the system's Save to Files sheet: { saved }
 *   share(root, path)            the share sheet (AirDrop, Mail, …)
 *   setICloud(on)                the setting Keep files in iCloud Drive; resolves info()
 *   opened()                     the files this page was opened with: [{ token, name, inPlace }]
 *   writeBack(token, blob)       saves over the file token was opened from (in place); resolves its name
 *   saveDownload(blob, name)     a download in the app: shared/native/save.js (loaded on first use)
 * Files other apps hand over (Open in…, share, Files) open in the app the site uses for their type (NATIVE_CONFIG.open,
 * from desktop/lib/open-map.js): this page, or that app's page, gets them through window.launchQueue as an installed
 * web app does (SlopIntake.launch). A file from the app's own folder opens as its Slop Drive file (?drive=<id>).
 * Pure helpers are exported for Node (tests/node/mobile-ios-files.test.mjs). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (root.document && !root.SlopNativeFiles) api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CHUNK = 3 << 20;                          // bytes per bridge call (4 MB of base64)
  const STATE_KEY = 'slop-native-files';          // the sync's record of what is where (shared/native/files-sync.js)
  const WAIT_KEY = 'slop-native-opened';          // sessionStorage: { route: [file] } still to open
  const OPENED_KEY = 'slop-native-page';          // sessionStorage: { path: [file] } the files each page was opened with

  const extOf = (name) => { const m = /\.([a-z0-9]+)$/i.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  /** The page that opens a file: map is { ext: route } (NATIVE_CONFIG.open); Slop Drive takes every other file. */
  const routeFor = (name, map) => (map && map[extOf(name)]) || '/drive/';
  /** A folder URL plus a path inside it, each name escaped. */
  const join = (base, p) => base + String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  /** "a/b/c.pdf" -> "a/b/.c.pdf.part": where a write goes before it is moved over the file. */
  const partOf = (p) => { const i = p.lastIndexOf('/'); return p.slice(0, i + 1) + '.' + p.slice(i + 1) + '.part'; };
  /** The Slop Drive id the sync keeps at path in root (state: the sync's record), or null. */
  function driveIdAt(state, rootName, path) {
    if (!state || state.root !== rootName || !state.files) return null;
    for (const id of Object.keys(state.files)) if (state.files[id].p === path) return id;
    return null;
  }
  /** Files handed over, grouped by the page that opens them: { route: [file] }; a file of the app's own folder that
   * Slop Drive knows gets drive: <id>. */
  function group(files, map, state) {
    const out = {};
    for (const f of files) {
      const route = routeFor(f.name, map), id = f.inside ? driveIdAt(state, f.inside, f.rel) : null;
      (out[route] = out[route] || []).push(id ? Object.assign({}, f, { drive: id }) : f);
    }
    return out;
  }

  function install(win) {
    const C = win.Capacitor;
    const has = () => !!(C && C.isPluginAvailable && C.isPluginAvailable('SiteFiles'));
    const P = () => (C.Plugins && C.Plugins.SiteFiles) || C.registerPlugin('SiteFiles');
    const glue = () => win.SlopNativeGlue || {};
    const json = (s, key, fallback) => { try { return JSON.parse(s.getItem(key)) || fallback; } catch (e) { return fallback; } };
    const keep = (s, key, v) => { try { s.setItem(key, JSON.stringify(v)); } catch (e) { /* private storage off: nothing kept */ } };
    let infoP = null;
    const info = (fresh) => (!fresh && infoP) || (infoP = P().info().catch((e) => { infoP = null; throw e; }));
    const base = async (r) => { const i = await info(); const b = i[r === 'icloud' ? 'icloud' : r === 'cache' ? 'cache' : 'documents']; if (!b) throw new Error('iCloud Drive is not available'); return b; };

    async function read(r, p) {
      const res = await win.fetch(C.convertFileSrc(join(await base(r), p)));
      if (!res.ok) throw new Error(`${p}: HTTP ${res.status}`);
      return res.blob();
    }
    async function write(r, p, blob) {
      const tmp = partOf(p), b64 = glue().base64Of;
      for (let at = 0, first = true; first || at < blob.size; at += CHUNK, first = false) {
        await P().write({ root: r, path: tmp, data: await b64(blob.slice(at, at + CHUNK)), append: !first });
      }
      return P().move({ root: r, from: tmp, to: p });
    }
    const page = () => win.location.pathname;
    const opened = () => (json(win.sessionStorage, OPENED_KEY, {})[page()] || []).map((f) => ({ token: f.token, name: f.name, inPlace: !!f.inPlace }));

    /* ---------- files handed over by other apps ---------- */
    let consumer = null;
    const queue = [];
    // an own property: WebKit has no launchQueue, and where an engine has one it is a getter on Window.prototype
    Object.defineProperty(win, 'launchQueue', { configurable: true, value: { setConsumer(fn) { consumer = fn; if (queue.length) fn({ files: queue.splice(0) }); } } });
    const handle = (f) => ({ kind: 'file', name: f.name, getFile: () => read('cache', f.path).then((b) => new win.File([b], f.name, { type: b.type, lastModified: Date.now() })) });
    function deliver() {
      const wait = json(win.sessionStorage, WAIT_KEY, {}), here = wait[page()];
      if (!here || !here.length) return;
      delete wait[page()];
      keep(win.sessionStorage, WAIT_KEY, wait);
      const mine = json(win.sessionStorage, OPENED_KEY, {});
      mine[page()] = (mine[page()] || []).concat(here).slice(-20);
      keep(win.sessionStorage, OPENED_KEY, mine);
      const files = here.map(handle);
      if (consumer) consumer({ files }); else queue.push(...files);
    }
    async function arrive() {
      const got = ((await P().takeOpened()) || {}).files || [];
      if (!got.length) return;
      const groups = group(got, (win.NATIVE_CONFIG || {}).open, json(win.localStorage, STATE_KEY, null));
      for (const route of Object.keys(groups)) {
        const known = groups[route].find((f) => f.drive);
        if (known) { win.location.assign(route + '?drive=' + encodeURIComponent(known.drive)); return; }
      }
      const wait = json(win.sessionStorage, WAIT_KEY, {});
      for (const route of Object.keys(groups)) wait[route] = (wait[route] || []).concat(groups[route]);
      keep(win.sessionStorage, WAIT_KEY, wait);
      if (wait[page()]) deliver(); else win.location.assign(Object.keys(groups)[0]);
    }

    const api = {
      STATE_KEY, available: has, info: () => info(true), root: () => info().then((i) => (i.icloudOn ? 'icloud' : 'documents')),
      tree: (r) => P().tree({ root: r, path: '' }).then((x) => (x && x.entries) || []),
      read, write,
      move: (r, from, to) => P().move({ root: r, from, to }),
      remove: (r, p, o) => P().remove({ root: r, path: p, emptyOnly: !!(o && o.emptyOnly) }),
      mkdir: (r, p) => P().mkdir({ root: r, path: p }),
      exportFile: (r, p) => P().exportFile({ root: r, path: p }),
      share: async (r, p) => { const S = C.Plugins.Share; await S.share({ title: p.split('/').pop(), files: [join(await base(r), p)] }); },
      setICloud: async (on) => { await P().setICloud({ on: !!on }); return info(true); },
      opened,
      writeBack: async (token, blob) => {
        const f = opened().find((x) => x.token === token), p = 'saves/' + token + '/' + ((f && f.name) || 'file');
        await write('cache', p, blob);
        return (await P().writeBack({ token, root: 'cache', path: p })).name;
      },
      saveDownload: (blob, name) => (glue().load ? glue().load('/shared/native/save.js') : Promise.reject(new Error('no loader')))
        .then(() => win.SlopNativeSave.save(blob, name)),
    };
    win.SlopNativeFiles = api;
    if (!has()) return api;
    deliver();
    P().addListener('opened', () => { arrive().catch((e) => console.warn('opened files', e)); });
    arrive().catch((e) => console.warn('opened files', e));
    return api;
  }

  return { install, routeFor, extOf, join, partOf, driveIdAt, group, STATE_KEY };
});
