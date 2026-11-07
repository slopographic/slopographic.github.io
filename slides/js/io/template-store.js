/* Slop Slides: the person's template list ("My templates"). A template is kept in IndexedDB ('slop-slides-templates',
   store 'templates', records { id, name, created, slides, preview, deck, driveId }) and as a .sslide-template file in
   the "Templates" folder of Slop Drive (driveId). The IndexedDB copy is what the list shows; the Drive copy is what
   other devices and apps can open. Drive is best effort: a failed copy is reported by the caller, the template is kept.
   Exposes window.SS.templateStore. */
(function () {
  'use strict';
  var SS = window.SS, TF = SS.templateFile, U = SS.util;
  var S = SS.templateStore = {};
  var DB = 'slop-slides-templates', STORE = 'templates', FOLDER = 'Templates', dbp = null; // i18n-ignore
  var hub = function () { return window.SlopHub || null; };

  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('IndexedDB is unavailable')); return; }
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { dbp = null; rej(r.error); };
      r.onblocked = function () { dbp = null; rej(new Error('storage is blocked')); };
    });
    return dbp;
  }
  function run(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode), q = fn(t.objectStore(STORE));
        t.oncomplete = function () { res(q ? q.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('the save was aborted')); };
      });
    });
  }

  /** All templates, newest first. [] when storage is blocked (the list still shows the built-in ones). */
  S.list = function () {
    return run('readonly', function (s) { return s.getAll(); }).then(function (rows) {
      return (rows || []).sort(function (a, b) { return b.created - a.created; });
    }, function () { return []; });
  };
  S.get = function (id) { return run('readonly', function (s) { return s.get(id); }).catch(function () { return null; }); };

  /** Adds a template from a validated file object (TF.fromDeck or TF.parse) and its preview. Resolves with the record.
      Rejects only if this device cannot store it; a Drive failure leaves driveId null and is reported in the record. */
  S.add = async function (file, preview) {
    var rec = { id: U.uid('t'), name: file.name, created: file.created || Date.now(), slides: file.deck.slides.length,
      preview: preview || null, deck: file.deck, driveId: null };
    await run('readwrite', function (s) { return s.put(rec); });
    try { rec.driveId = await S.drivePut(rec); }
    catch (e) { rec.driveError = e.message; }
    if (rec.driveId) await run('readwrite', function (s) { return s.put(rec); });
    return rec;
  };
  /** Removes a template from this device and its copy from Slop Drive. */
  S.remove = async function (id) {
    var rec = await S.get(id);
    if (rec && rec.driveId && hub()) { try { await hub().remove(rec.driveId); } catch (e) { /* the copy is already gone */ } }
    await run('readwrite', function (s) { return s.delete(id); });
    return !!rec;
  };

  /** The Drive folder "Templates" (created on first use). Resolves with its id. */
  S.folderId = async function () {
    var folders = await hub().listFolders({ parentId: null });
    var f = folders.filter(function (x) { return x.name === FOLDER && !x.trashedAt; })[0];
    return f ? f.id : hub().createFolder(FOLDER, null);
  };
  /** Writes (or rewrites) the record's file in the Templates folder. Resolves with the Drive id, or null without Drive. */
  S.drivePut = async function (rec) {
    if (!hub()) return null;
    var folderId = await S.folderId();
    var blob = TF.toBlob(TF.wrap(rec.name, rec.deck));
    return hub().put(blob, { name: TF.fileName(rec.name), from: 'slides', folderId: folderId, id: rec.driveId || undefined });
  };
})();
