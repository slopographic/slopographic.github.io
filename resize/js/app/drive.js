/* Slop Resize: Slop Drive. Results are saved into a "Slop Resize" folder at the Drive root (tagged app: resize, so Drive
 * lists it as this app's folder). Saved settings (presets) live in one JSON file in that folder. Originals are never
 * changed. Classic script; exposes window.SlopResize.drive. Needs shared/hub.js (SlopHub); without it, available() is false.
 *   available()                  whether the hub is on this page
 *   folder()                     Promise<id>  the Slop Resize folder, made on first use
 *   save(blob, name, meta)       Promise<id>  saves a result into the folder
 *   (opening a Drive file is the intake's: SlopIntake.fromDrive and SlopIntake.launch, in app/main.js)
 *   loadPresets() / savePresets(list)   the saved settings list (null when there is no hub) */
(function (g) {
  'use strict';
  const NS = g.SlopResize, D = (NS.drive = {});
  const FOLDER = 'Slop Resize', APP = 'resize', PRESET_FILE = 'Resize presets.json';
  const hub = () => g.SlopHub || null;

  D.available = () => !!hub();

  let folderP = null;
  D.folder = function () {
    if (!folderP) folderP = (async () => {
      const H = hub();
      const roots = await H.listFolders({ parentId: null, trashed: false });
      const found = roots.find((f) => f.app === APP) || roots.find((f) => f.name === FOLDER);
      return found ? found.id : H.createFolder(FOLDER, null, { app: APP });
    })().catch((e) => { folderP = null; throw e; });
    return folderP;
  };

  D.save = async function (blob, name, meta = {}) {
    const folderId = await D.folder();
    return hub().put(blob, { name, from: APP, folderId, meta });
  };

  /** The saved settings list: [{ id, name, settings }]. [] when the file is missing; null when there is no hub. */
  D.loadPresets = async function () {
    if (!hub()) return null;
    const fid = await D.folder();
    const rec = (await hub().list({ folderId: fid })).find((r) => r.name === PRESET_FILE); // intake-ok: the presets file by name, not a picker
    if (!rec || !rec.blob) return [];
    try {
      const data = JSON.parse(await rec.blob.text());
      return Array.isArray(data.presets) ? data.presets : [];
    } catch (e) { return []; }
  };

  D.savePresets = async function (list) {
    if (!hub()) return false;
    const H = hub(), fid = await D.folder();
    const blob = new Blob([JSON.stringify({ version: 1, presets: list }, null, 2)], { type: 'application/json' });
    const rec = (await H.list({ folderId: fid })).find((r) => r.name === PRESET_FILE); // intake-ok: the presets file by name, not a picker
    if (rec) await H.update(rec.id, { blob });
    else await H.put(blob, { name: PRESET_FILE, from: APP, folderId: fid, meta: { type: 'resize-presets' } });
    return true;
  };
})(typeof window !== 'undefined' ? window : globalThis);
