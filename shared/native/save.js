/* A download in the iPhone/iPad app: where it goes. Loaded on first use by native/files.js (saveDownload), which the
 * app's download hook calls (native/native.js); never on the website or the desktop app. Classic script; exposes
 * window.SlopNativeSave:
 *   save(blob, name)   - this page was opened with a file of that name in place (from Files, iCloud Drive, another
 *                        provider): the save goes back over it; one of the same type under another name (an app that
 *                        names its result "report-edited.pdf") is offered as Save over report.pdf in the note;
 *                      - otherwise into the app's folder (On My iPhone/iPad › the app, or its iCloud Drive folder), in the
 *                        folder of the app it came from (Slop Drive's app folder), under a free name; the next sync
 *                        brings it into Slop Drive (shared/native/files-sync.js).
 *                      A note says where it went, with Save as… (the system's Save to Files sheet: any place, any
 *                      provider) and Share… (AirDrop, Mail, …). Resolves { where: 'back' | 'folder', path | name }.
 *   appOf(pathname, apps)   the registry app a page belongs to (the longest path that fits), or null
 * Tests: tests/native/files.test.html. */
(function (g) {
  'use strict';
  if (g.SlopNativeSave) return;
  const F = () => g.SlopNativeFiles, W = () => g.SlopNativeWords;
  const lower = (s) => String(s).toLowerCase();
  const here = ((g.document.currentScript || {}).src || '/shared/native/save.js').replace(/[^/]*$/, '');
  const need = (src) => (g.SlopNativeGlue && g.SlopNativeGlue.load ? g.SlopNativeGlue.load(src) : Promise.resolve());

  function appOf(pathname, apps) {
    let best = null;
    for (const a of apps || []) {
      const p = '/' + String(a.path || '').replace(/^\/+/, '');
      if (a.kind === 'app' && p.length > 1 && pathname.startsWith(p) && (!best || p.length > best.p.length)) best = { a, p };
    }
    return best ? best.a : null;
  }

  /** The app's own folder in the app's folder: Slop Drive's folder for it (shared/native/files-sync.js), else its name. */
  async function folderOf(app) {
    if (!app) return '';
    if (g.SlopNativeSync) {
      // Slop Drive answers at once, but a page that keeps it busy (a long transaction) must not hold the save: its name then
      const late = new Promise((res) => setTimeout(() => res(null), 1500));
      try { const p = await Promise.race([g.SlopNativeSync.appFolder(app.id), late]); if (p != null) return p; } catch (e) { /* the name below */ }
    }
    return g.SlopNativePlan ? g.SlopNativePlan.safeName(app.name) : String(app.name).replace(/[\/:]/g, '-');
  }

  /* ---------- the note: what happened, and up to two actions ---------- */
  let note = null, noteT = 0;
  function show(text, actions) {
    if (!note) {
      note = g.document.createElement('div');
      note.className = 'native-note';
      note.setAttribute('role', 'status');
      note.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;'
        + 'max-width:min(92vw,560px);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 14px;border-radius:12px;'
        + 'background:var(--sui-panel,#1f2937);color:var(--sui-text,#f9fafb);box-shadow:0 6px 24px rgba(0,0,0,.3);font:14px/1.35 system-ui,sans-serif';
      g.document.body.appendChild(note);
    }
    note.replaceChildren();
    const span = g.document.createElement('span');
    span.textContent = text;
    span.style.flex = '1 1 200px';
    note.appendChild(span);
    for (const a of actions || []) {
      const b = g.document.createElement('button');
      b.type = 'button'; b.textContent = a.label;
      b.style.cssText = 'min-height:44px;padding:0 12px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;font:inherit;cursor:pointer';
      b.addEventListener('click', () => { hide(); a.run(); });
      note.appendChild(b);
    }
    note.hidden = false;
    clearTimeout(noteT);
    noteT = setTimeout(hide, actions && actions.length ? 10000 : 4000);
  }
  function hide() { if (note) note.hidden = true; }
  const quiet = (p) => p.catch((e) => { if (!/cancel/i.test(String(e && (e.message || e)))) console.warn('save as', e); });

  async function save(blob, name) {
    const files = F();
    await need(here + 'words.js').then(() => W().ready()).catch(() => null);
    const t = (k, v) => (W() ? W().t(k, v) : k);
    try {
      const mine = files.opened().filter((f) => f.inPlace), ext = (n) => (/\.[^.]+$/.exec(lower(n)) || [''])[0];
      const back = mine.filter((f) => lower(f.name) === lower(name)).pop(), like = mine.filter((f) => ext(f.name) === ext(name)).pop();
      if (back) {
        const where = await files.writeBack(back.token, blob);
        show(t('native.saved_back', { name: where }), [{ label: t('native.save_as'), run: () => quiet(saveAs(blob, name)) }]);
        return { where: 'back', name: where };
      }
      await need(here + 'files-plan.js');
      const P = g.SlopNativePlan, root = await files.root(), app = appOf(g.location.pathname, g.SLOP_APPS);
      const dir = await folderOf(app);
      const names = new Set((await files.tree(root).catch(() => [])).filter((e) => (e.path.lastIndexOf('/') < 0 ? '' : e.path.slice(0, e.path.lastIndexOf('/'))) === dir).map((e) => lower(e.path.slice(e.path.lastIndexOf('/') + 1))));
      const file = P.freeName(names, P.safeName(name)), path = dir ? dir + '/' + file : file;
      await files.write(root, path, blob);
      if (g.SlopNativeSync) g.SlopNativeSync.soon(300);
      const over = like ? [{ label: t('native.save_over', { name: like.name }), run: () => quiet(files.writeBack(like.token, blob).then((n) => show(t('native.saved_back', { name: n }), []))) }] : [];
      show(t(root === 'icloud' ? 'native.saved_icloud' : 'native.saved_files', { path: path.split('/').join(' › ') }), over.concat([
        { label: t('native.save_as'), run: () => quiet(files.exportFile(root, path)) },
        { label: t('native.share'), run: () => quiet(files.share(root, path)) },
      ]));
      return { where: 'folder', path };
    } catch (e) {
      show(t('native.not_saved', { name, error: String((e && e.message) || e) }), [{ label: t('native.share'), run: () => quiet(g.SlopNativeGlue.share(blob, name)) }]);
      throw e;
    }
  }
  /** Save as…: a copy in the cache, then the system's sheet. */
  async function saveAs(blob, name) {
    const p = 'export/' + Date.now().toString(36) + '/' + String(name).replace(/[\/:]/g, '-');
    await F().write('cache', p, blob);
    return F().exportFile('cache', p);
  }

  g.SlopNativeSave = { save, saveAs, appOf };
})(window);
