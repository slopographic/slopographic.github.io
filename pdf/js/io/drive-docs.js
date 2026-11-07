/* Slop PDF — documents in Slop Drive. Opening a PDF stores its untouched bytes as a Drive file at once (the original),
   unless the same bytes are in Drive already: they are found by SHA-256 (sizes first; each PDF's hash is kept in its
   record as meta.sha256), and the copy there is linked, not copied. Save writes the edited copy and its change list
   (io/doc-changes.js) as two more Drive files beside the original, and never overwrites the original. A record's
   meta.pdf says what it is: { role: 'edited' | 'changes', original: id } or, for the original, { edited, changes } ids.
   Without Slop Drive (or with autosave off) nothing is written here. Classic script. */
(function () {
  'use strict';
  var SP = window.SP, U = SP.util;
  var D = SP.driveDocs = {};
  function hub() { return window.SlopHub || null; }
  /** Autosave is on unless the person turned it off (File menu), and needs Slop Drive, which is not in the offline file. */
  D.enabled = function () { return !!hub() && !SP.offline && !!U.store.get('driveAutosave', true); };
  D.linked = function () { return !!hub() && !SP.offline; };
  function roleOf(rec) { return rec && rec.meta && rec.meta.pdf ? rec.meta.pdf.role : null; }
  function bytesOf(blob) { return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }

  /** The SHA-256 of a Drive file's bytes, cached in its record. */
  async function hashOf(rec) {
    if (rec.meta && rec.meta.sha256) return rec.meta.sha256;
    var h = await SP.editLog.fingerprint(await bytesOf(rec.blob));
    if (h) await hub().update(rec.id, { meta: Object.assign({}, rec.meta, { sha256: h }) }, { touch: false });
    return h;
  }
  /** The Drive PDF whose bytes equal these (same size, then the same SHA-256), or null. Trashed files do not count. */
  D.findSame = async function (bytes, hash) {
    var list = await hub().list({ accept: 'application/pdf' }); // intake-ok: finds the same PDF already in Drive (no copy), not a picker
    for (var i = 0; i < list.length; i++) {
      if (list[i].size === bytes.length && (await hashOf(list[i])) === hash) return list[i];
    }
    return null;
  };
  /** The original record of the document a Drive file belongs to: itself for an original or a plain PDF. */
  D.docOf = async function (id) {
    if (!id || !hub()) return null;
    var rec = await hub().get(id);
    if (!rec) return null;
    if (roleOf(rec) === 'edited' || roleOf(rec) === 'changes') return (await hub().get(rec.meta.pdf.original)) || null;
    return rec;
  };
  /** The original, the edited copy and the change list of the document a Drive file belongs to. Null when none. */
  D.versions = async function (id) {
    var orig = await D.docOf(id);
    if (!orig) return null;
    var p = orig.meta.pdf || {};
    return { original: orig, edited: (p.edited && (await hub().get(p.edited))) || null, changes: (p.changes && (await hub().get(p.changes))) || null };
  };

  /** Stores an opened PDF's original bytes in Drive, or links the same bytes already there. Resolves { id, name, reused }. */
  D.keepOriginal = async function (bytes, name) {
    var hash = await SP.editLog.fingerprint(bytes);
    var same = hash ? await D.findSame(bytes, hash) : null;
    if (same) {
      var orig = await D.docOf(same.id);
      return { id: orig.id, name: orig.name, reused: true };
    }
    var id = await hub().put(new Blob([bytes], { type: 'application/pdf' }), { name: name, from: 'pdf', meta: { sha256: hash, pdf: { role: 'original' } } });
    return { id: id, name: name, reused: false };
  };

  /** Writes or updates one Drive file that belongs to a document; prev is its record or null. */
  async function store(prev, blob, name, meta, folderId) {
    if (prev) return hub().update(prev.id, { blob: blob, type: blob.type, name: name, meta: meta }).then(function (rec) { return rec ? rec.id : prev.id; });
    return hub().put(blob, { name: name, from: 'pdf', folderId: folderId, meta: meta });
  }
  /** The versions of the document a Drive file belongs to, newest first: { n, at, edited, changes } (records, or null). */
  D.versionList = async function (id) {
    var orig = await D.docOf(id);
    return orig ? window.SlopVersions.records(hub(), orig) : null;
  };
  /** Saves the edited bytes of the document a Drive file belongs to as a new version (the edited copy and its change list,
   * beside the original). Earlier versions are kept, up to 20 (SlopVersions). Resolves { id, editedId, changesId, version } or null. */
  D.save = async function (linkId, blob, name) {
    var orig = await D.docOf(linkId);
    if (!orig) return null;
    var bytes = await bytesOf(blob), hash = await SP.editLog.fingerprint(bytes), origHash = await hashOf(orig);
    var stem = U.baseName(name || orig.name) || 'document';
    var changes = SP.docChanges.build(
      { name: orig.name, sha256: origHash, size: orig.size },
      { name: name, sha256: hash, size: bytes.length });
    var v = await window.SlopVersions.add(hub(), orig, {
      blob: blob, name: name, sha256: hash, originalSha256: origHash,
      changesBlob: new Blob([JSON.stringify(changes)], { type: 'application/json' }), changesName: stem + '.changes.json',
    });
    return { id: orig.id, editedId: v.editedId, changesId: v.changesId, version: v.version };
  };
})();
