/* SlopLayout: the app drawer's layout as data, plus its storage. Pure functions, no DOM.
 * Layout items (top level): { k: 'app', id } or { k: 'folder', id, name, apps: [appId, ...] }.
 * Keys for drag and drop: 'app:<id>' and 'folder:<id>'. Folders keep at least two apps: a folder
 * that drops to one app is dissolved into the top level.
 * Storage: localStorage 'slop.drawer.v1' as { v: 1, data: { items } }, per browser profile. */
(function () {
  'use strict';
  if (window.SlopLayout) return;
  const KEY = 'slop.drawer.v1';
  const keyOf = (it) => (it.k === 'folder' ? 'folder:' : 'app:') + it.id;
  const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (items) => items.map((it) => (it.k === 'folder' ? { k: 'folder', id: it.id, name: it.name, apps: it.apps.slice() } : { k: 'app', id: it.id }));

  /** The default layout: apps in brand order (then registry order), no folders. */
  function defaults(appIds, order = []) {
    const rank = (id) => { const i = order.indexOf(id); return i < 0 ? 1e6 + appIds.indexOf(id) : i; };
    return appIds.slice().sort((a, b) => rank(a) - rank(b)).map((id) => ({ k: 'app', id }));
  }

  /** Make any saved layout valid for the current registry: unknown apps dropped, new apps appended. */
  function normalize(items, appIds, order = []) {
    const known = new Set(appIds), seen = new Set(), out = [];
    const take = (id) => (known.has(id) && !seen.has(id) ? (seen.add(id), true) : false);
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it !== 'object') continue;
      if (it.k === 'app' && take(it.id)) out.push({ k: 'app', id: it.id });
      else if (it.k === 'folder' && typeof it.id === 'string') {
        const apps = (Array.isArray(it.apps) ? it.apps : []).filter(take);
        if (apps.length >= 2) out.push({ k: 'folder', id: it.id, name: String(it.name || 'Folder').slice(0, 60), apps });
        else if (apps.length === 1) out.push({ k: 'app', id: apps[0] });
      }
    }
    for (const id of defaults(appIds, order)) if (!seen.has(id.id)) out.push(id);
    return out;
  }

  function find(items, key) {
    const [k, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (k === 'app') {
      const top = items.findIndex((it) => it.k === 'app' && it.id === id);
      if (top >= 0) return { top, folder: -1, app: -1 };
      for (let i = 0; i < items.length; i++) if (items[i].k === 'folder') { const a = items[i].apps.indexOf(id); if (a >= 0) return { top: -1, folder: i, app: a }; }
      return null;
    }
    const top = items.findIndex((it) => it.k === 'folder' && it.id === id);
    return top >= 0 ? { top, folder: -1, app: -1 } : null;
  }
  /** Take an app out of wherever it is. Dissolves a folder left with one app. Returns the new list. */
  function lift(items, appId) {
    const out = clone(items);
    const at = find(out, 'app:' + appId);
    if (!at) return out;
    if (at.top >= 0) { out.splice(at.top, 1); return out; }
    const f = out[at.folder];
    f.apps.splice(at.app, 1);
    if (f.apps.length === 1) out.splice(at.folder, 1, { k: 'app', id: f.apps[0] });
    else if (!f.apps.length) out.splice(at.folder, 1);
    return out;
  }

  /** Drop src onto dst: app on app makes a folder, app on folder joins it. Returns the new list. */
  function combine(items, srcKey, dstKey, name = 'New folder') {
    if (!srcKey.startsWith('app:') || srcKey === dstKey) return clone(items);
    const srcId = srcKey.slice(4);
    const dst = find(items, dstKey);
    if (!dst || (dstKey.startsWith('app:') && dstKey.slice(4) === srcId)) return clone(items);
    if (dstKey.startsWith('folder:') && items[dst.top].apps && items[dst.top].apps.includes(srcId)) return clone(items);
    const out = lift(items, srcId);
    const at = find(out, dstKey);
    if (!at || at.top < 0) return out; // drop targets are top-level tiles
    if (dstKey.startsWith('folder:')) { out[at.top].apps.push(srcId); return out; }
    const dstId = dstKey.slice(4);
    out.splice(at.top, 1, { k: 'folder', id: newId(), name, apps: [dstId, srcId] });
    return out;
  }

  /** Move src to just before or after dst at the top level. Apps inside a folder are taken out first. */
  function reorder(items, srcKey, dstKey, after = false) {
    if (srcKey === dstKey) return clone(items);
    const srcId = srcKey.slice(srcKey.indexOf(':') + 1);
    let out, item;
    if (srcKey.startsWith('app:')) { out = lift(items, srcId); item = { k: 'app', id: srcId }; }
    else {
      out = clone(items);
      const from = find(out, srcKey);
      if (!from || from.top < 0) return out;
      item = out.splice(from.top, 1)[0];
    }
    const to = find(out, dstKey);
    if (!to) { out.push(item); return out; }
    const base = to.top >= 0 ? to.top : to.folder; // an app inside a folder: place beside that folder
    out.splice(base + (after ? 1 : 0), 0, item);
    return out;
  }

  /** Move an app out of a folder to the top level, right after the folder. */
  function moveOut(items, folderId, appId) {
    const out = clone(items);
    const f = out.findIndex((it) => it.k === 'folder' && it.id === folderId);
    if (f < 0 || !out[f].apps.includes(appId)) return out;
    out[f].apps = out[f].apps.filter((x) => x !== appId);
    out.splice(f + 1, 0, { k: 'app', id: appId });
    if (out[f].apps.length === 1) out.splice(f, 1, { k: 'app', id: out[f].apps[0] });
    else if (!out[f].apps.length) out.splice(f, 1);
    return out;
  }

  /** Dissolve a folder: its apps take its place at the top level. */
  function ungroup(items, folderId) {
    const out = clone(items);
    const f = out.findIndex((it) => it.k === 'folder' && it.id === folderId);
    if (f >= 0) out.splice(f, 1, ...out[f].apps.map((id) => ({ k: 'app', id })));
    return out;
  }

  function rename(items, folderId, name) {
    const out = clone(items);
    const f = out.find((it) => it.k === 'folder' && it.id === folderId);
    const clean = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (f && clean) f.name = clean;
    return out;
  }

  /** Storage. Returns the saved items, or null when there is nothing valid saved. */
  function read() {
    try {
      const env = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (env && env.v === 1 && env.data && Array.isArray(env.data.items)) return env.data.items;
    } catch (e) { /* unreadable or blocked: use the defaults */ }
    return null;
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, data: { items: clone(items) } })); return true; } catch (e) { return false; }
  }

  window.SlopLayout = { KEY, keyOf, defaults, normalize, combine, reorder, moveOut, rename, ungroup, lift, read, write, newId, clone };
})();
