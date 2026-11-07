/* SlopPresets storage in Slop Drive. The person's presets are files: each one is a .slop.json (the config envelope,
 * kind 'preset') with meta { type: 'preset', kind, apps } in a 'Presets' folder at the Drive root. Because they are Drive
 * files, every app on this origin sees the same presets. SlopPresets.useDrive() switches the registry to Drive and loads
 * it; it returns false when the hub is not on the page (then presets live in memory for this page only). Classic script,
 * needs shared/hub.js and io.js. A save in another tab reloads the list here (drive:change on the hub bus). */
(function (g) {
  'use strict';
  const SP = (g.SlopPresets = g.SlopPresets || {});
  const TYPE = 'preset', FOLDER = 'Presets';
  let folderP = null, timer = 0, watching = false;

  /** The 'Presets' folder at the Drive root, made on first use. */
  function folderOf(H) {
    if (!folderP) {
      folderP = (async () => {
        const found = (await H.listFolders({ parentId: null, trashed: false })).find((f) => f.name === FOLDER);
        return found ? found.id : H.createFolder(FOLDER, null);
      })().catch((e) => { folderP = null; throw e; });
    }
    return folderP;
  }
  /** The registry's store over Slop Drive. Ids are 'u-' plus the Drive file id. */
  function driveStore(H) {
    return {
      async list() {
        const out = [];
        for (const r of await H.list({ accept: 'application/json' })) {
          if (!r.meta || r.meta.type !== TYPE || !r.blob) continue;
          let env = null;
          try { env = JSON.parse(await r.blob.text()); } catch (e) { continue; }
          const v = SP.fromEnvelope(env);
          if (!v.ok) continue;
          out.push(Object.assign({}, v.value, { id: SP.ID_PREFIX + r.id, created: r.time || 0, modified: r.modified || 0 }));
        }
        return out;
      },
      async put(rec) {
        const blob = new Blob([JSON.stringify(SP.toEnvelope(rec), null, 2)], { type: 'application/json' });
        const id = await H.put(blob, {
          id: rec.id.slice(SP.ID_PREFIX.length), name: rec.label + '.slop.json', from: 'presets',
          folderId: await folderOf(H), meta: { type: TYPE, kind: rec.kind, apps: rec.apps.slice() },
        });
        return SP.ID_PREFIX + id;
      },
      async remove(id) { await H.remove(id.slice(SP.ID_PREFIX.length)); },
    };
  }
  /** Reloads the registry when another tab changes Drive (debounced). */
  function watch(H) {
    if (watching || !H.on) return;
    watching = true;
    H.on('drive:change', () => { clearTimeout(timer); timer = setTimeout(() => SP.load().catch(() => null), 150); });
  }

  /** Stores presets in Slop Drive and loads them. Resolves true when Drive is on the page. */
  SP.useDrive = async function () {
    const H = g.SlopHub;
    if (!H || !H.put) { SP.setStore(SP.memoryStore()); await SP.load(); return false; }
    SP.setStore(driveStore(H));
    watch(H);
    await SP.load();
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
