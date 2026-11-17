/* Slop Drive in the iPhone/iPad app's folder: the sync. In the app, Slop Drive (shared/hub.js) keeps a real file for each
 * of its files in the app's folder (Files › On My iPhone/iPad › the app, or the app's iCloud Drive folder with the
 * setting on), at the path of its Drive folders; files added, changed or deleted in the Files app come back into Slop
 * Drive (a deleted one goes to its Trash). The first sync writes every file Slop Drive already has, so nothing stored
 * before the app had a folder is lost, and Slop Drive keeps its own copies. The steps come from shared/native/files-plan.js.
 * Classic script, loaded by shared/hub.js in the app only (SlopNative.files(), shared/native-app.js); on the website and
 * the desktop app it is never loaded. Exposes window.SlopNativeSync:
 *   run()             one sync now (a running one is waited for, then run again); resolves the steps taken
 *   soon(ms)          a sync shortly (changes in Slop Drive, the app coming back to the front)
 *   appFolder(appId)  the path of an app's Slop Drive folder in the app's folder ('' for none)
 *   setICloud(on)     moves every file to iCloud Drive or back to the device; resolves SlopNativeFiles.info()
 * State (localStorage, SlopNativeFiles.STATE_KEY): { root, files: { id: { p, m, s, d } }, dirs: { folderId: path } }.
 * Tests: tests/native/files.test.html (a stand-in for the app's plugin), tests/node/native-files-plan.test.mjs. */
(function (g) {
  'use strict';
  if (g.SlopNativeSync) return;
  const N = g.SlopNative, F = N && N.files ? N.files() : null, H = g.SlopHub, Plan = g.SlopNativePlan;
  if (!F || !H || !Plan) return;
  const KEY = F.STATE_KEY;
  const lower = (s) => String(s).toLowerCase();
  const dirOf = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  const load = () => { try { return JSON.parse(g.localStorage.getItem(KEY)) || null; } catch (e) { return null; } };
  const keep = (st) => { try { g.localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage blocked: the next sync starts over */ } };

  let running = null, again = false, applying = false, timer = 0;

  /** The Drive folder at a path in the folder, made (with its parents) when missing. A top-level folder named like an
   * app whose own folder is not there yet becomes that app's folder. */
  async function folderAt(path, live) {
    if (!path) return null;
    let parent = null, at = '';
    for (const name of path.split('/')) {
      at = at ? at + '/' + name : name;
      let id = live.get(lower(at));
      if (id === undefined) {
        const app = !parent ? (H.apps() || []).find((a) => a.kind === 'app' && Plan.safeName(a.name) === name) : null;
        const mine = app ? (await H.listFolders()).some((f) => f.app === app.id && !f.trashedAt) : true;
        id = await H.createFolder(name, parent, app && !mine ? { app: app.id } : {});
        live.set(lower(at), id);
      }
      parent = id;
    }
    return parent;
  }

  async function apply(step, ctx) {
    const { root, st, disk, live, recs } = ctx;
    const mark = (id, p, e, d) => { st.files[id] = { p, m: e ? e.mtime : 0, s: e ? e.size : 0, d }; };
    switch (step.op) {
      case 'mkdir': await F.mkdir(root, step.path); break;
      case 'newFolder': await folderAt(step.path, live); break;
      case 'trashFolder': await H.updateFolder(step.id, { trashedAt: Date.now() }); break;
      case 'dirs': st.dirs = step.map; break;
      case 'adopt': mark(step.id, step.path, disk.get(step.path), recs.get(step.id).modified || 0); break;
      case 'forget': delete st.files[step.id]; break;
      case 'write': {
        const r = await H.get(step.id);
        if (!r) break;
        mark(step.id, step.path, await F.write(root, step.path, r.blob || new Blob([])), r.modified || 0);
        if (step.old) await F.remove(root, step.old);
        break;
      }
      case 'move': mark(step.id, step.to, await F.move(root, step.from, step.to), st.files[step.id].d); break;
      case 'remove': await F.remove(root, step.path); delete st.files[step.id]; break;
      case 'trash': await H.update(step.id, { trashedAt: Date.now() }, { touch: false }); delete st.files[step.id]; break;
      case 'update': {
        const r = await H.update(step.id, { blob: await F.read(root, step.path) });
        mark(step.id, step.path, disk.get(step.path), r ? r.modified : 0);
        break;
      }
      case 'conflict': {                  // the folder's version comes in beside the Drive file, under the same name
        const r = recs.get(step.id);
        await H.put(await F.read(root, step.path), { name: r.name, from: 'files', folderId: r.folderId == null ? null : r.folderId });
        ctx.more = true;
        break;
      }
      case 'import': {
        const blob = await F.read(root, step.path), folderId = await folderAt(dirOf(step.path), live);
        const id = await H.put(blob, { name: nameOf(step.path), from: 'files', folderId });
        const r = await H.get(id);
        mark(id, step.path, disk.get(step.path), r ? r.modified : 0);
        break;
      }
      default: break;
    }
  }

  async function once() {
    const root = await F.root();
    let st = load();
    if (!st || st.root !== root) st = { root, files: {}, dirs: {} };   // a new place: everything is written there
    const [files, folders, tree] = await Promise.all([H.list({ trashed: 'any' }), H.listFolders(), F.tree(root)]);
    const steps = Plan.plan({ files, folders, tree, state: st });
    const live = new Map([...Plan.layout(files, folders).folders].map(([id, p]) => [lower(p), id]));
    const ctx = { root, st, disk: new Map(tree.map((e) => [e.path, e])), live, recs: new Map(files.map((r) => [r.id, r])), more: false };
    applying = true;
    try {
      for (const step of steps) {
        try { await apply(step, ctx); } catch (e) { console.warn('Files sync:', step.op, step.path || step.id, e); }
        if (step.op === 'write' || step.op === 'import' || step.op === 'update') keep(st);
      }
    } finally { applying = false; keep(st); }
    if (ctx.more) soon(500);
    return steps.filter((s) => s.op !== 'dirs');
  }

  function run() {
    if (running) { again = true; return running; }
    running = once().finally(() => { running = null; if (again) { again = false; soon(300); } });
    return running;
  }
  function soon(ms = 1500) {
    clearTimeout(timer);
    timer = setTimeout(() => { run().catch((e) => console.warn('Files sync', e)); }, ms);
  }

  async function appFolder(appId) {
    const id = appId ? await H.appFolderId(appId) : null;
    return id ? (await H.folderPath(id)).map((f) => Plan.safeName(f.name)).join('/') : '';
  }

  /** On: every file goes to iCloud Drive; off: back to the device. The old place is synced first (a change made there in
   * Files comes in), then each file is written to the new one and the old copies removed. */
  async function setICloud(on) {
    await run();
    const old = load();
    const info = await F.setICloud(on), root = info.icloudOn ? 'icloud' : 'documents';
    if (!old || old.root === root) return info;
    keep({ root, files: {}, dirs: {} });
    await run();
    for (const s of Object.values(old.files || {})) await F.remove(old.root, s.p).catch(() => null);
    const dirs = Object.values(old.dirs || {}).sort((a, b) => b.length - a.length);
    for (const p of dirs) await F.remove(old.root, p, { emptyOnly: true }).catch(() => null);
    return info;
  }

  g.addEventListener('slop-drive-change', () => { if (!applying) soon(); });
  // Back in front: the Files app may have changed the folder. Nothing starts as the page goes away: WebKit keeps a
  // leaving page's Slop Drive transactions open (back/forward cache) and the next page's would wait behind them.
  g.document.addEventListener('visibilitychange', () => { if (g.document.visibilityState === 'visible') soon(400); else clearTimeout(timer); });
  g.addEventListener('pagehide', () => clearTimeout(timer));
  g.SlopNativeSync = { run, soon, appFolder, setICloud };
  soon(1200);
})(window);
