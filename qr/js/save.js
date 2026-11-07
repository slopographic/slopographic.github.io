/* QR SLOP: Slop Drive and the buffer. A code is saved as two files in one Drive folder: the PNG, and a small JSON record of
 * the settings (qr-….qr.json). The PNG's meta names the record (qrSettings) and the record names the PNG (qrFor), so
 * Open from Drive can restore the settings from either file. The buffer gets the PNG as an image item (SlopBuffer).
 * Classic script; exposes window.QRSave. */
(function (g) {
  'use strict';
  if (g.QRSave) return;
  /** The words for a key (qr/i18n), or the English given when SlopI18n or the key is absent (node tests, other pages). */
  const tr = (k, en, v) => { const I = g.SlopI18n; return I && I.has && I.has(k) ? I.t(k, v) : (v ? String(en).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m)) : en); };
  const H = () => g.SlopHub, B = () => g.SlopBuffer;
  const JSON_TYPE = 'application/json';

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  /** The base name of the two files: qr-<label or kind>-<time>. */
  function baseName(S) { return 'qr-' + (slug(S.label) || S.kind) + '-' + stamp(); }

  /** Writes the PNG and the settings record into folderId (null is the Drive root). Resolves { pngId, jsonId }. */
  async function saveTo(folderId, png, snapshot, base) {
    const pngId = await H().put(png, { name: base + '.png', from: 'qr', folderId });
    const json = new Blob([JSON.stringify(snapshot)], { type: JSON_TYPE });
    const jsonId = await H().put(json, { name: base + '.qr.json', from: 'qr', folderId, meta: { qrFor: pngId } });
    await H().update(pngId, { meta: { qrSettings: jsonId } }, { touch: false });
    return { pngId, jsonId };
  }

  /** Asks for a folder (the QR app's folder opens first). Resolves the folder id, null for the root, or undefined when cancelled. */
  async function chooseFolder() {
    const start = await H().appFolderId('qr');
    return H().pickFolder({ title: tr('qr.app.save_title', 'Save the QR code to Slop Drive'), start });
  }

  /** The settings a picked Drive record holds: the record itself (JSON), or the one a PNG points to. Null when there are none. */
  async function settingsFor(rec) {
    const readJson = async (blob) => JSON.parse(await blob.text());
    if (rec.type === JSON_TYPE) return readJson(rec.blob);
    const f = await H().get(rec.id);
    const sid = f && f.meta && f.meta.qrSettings;
    const j = sid ? await H().get(sid) : null;
    return j && j.blob ? readJson(j.blob) : null;
  }

  /** Opens the Drive picker for a code. Resolves { snapshot, id, name } (snapshot is null when the file has no settings), or null. */
  async function openPicked() {
    const SI = g.SlopIntake;
    if (!SI.spec('qr.open')) {
      SI.register({ id: 'qr.open', main: false, paste: false, toast: false, limit: 1, accept: { types: ['image/png', JSON_TYPE], exts: ['.json'], noun: 'qr.app.noun_qr' },
        process: async (file, ctx) => {
          const rec = ctx.drive ? ctx.drive.record : null;
          let snapshot = null;
          try { snapshot = rec ? await settingsFor(rec) : null; } catch (e) { snapshot = null; }
          return { snapshot, id: rec && rec.id, name: file.name };
        } });
    }
    const r = await SI.fromDrive({ to: 'qr.open', title: tr('qr.app.open_title', 'Open a QR code from Slop Drive'), accept: ['image/png', JSON_TYPE] });
    return r && r.added[0] ? r.added[0].value : null;
  }

  /** The buffer item for a PNG code. */
  const item = (png) => ({ kind: 'image', formats: { 'image/png': png }, source: 'qr' });
  /** Puts the PNG on the buffer and the system clipboard. */
  const toBuffer = (png) => B().put(item(png));
  /** Puts the PNG on the buffer only, at the start of a drag (no clipboard write, and synchronous for the drag). */
  const forDrag = (png) => B().put(item(png), { system: false });

  g.QRSave = Object.freeze({ baseName, saveTo, chooseFolder, settingsFor, openPicked, toBuffer, forDrag, item });
})(typeof window !== 'undefined' ? window : globalThis);
