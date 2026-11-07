/* Slopographic versions: a file's saved versions in the hub (Slop Drive), shared by Slop PDF, Slop Drive and the tests.
 * A document's original is a hub record. Each saved version is two hidden records (the version's file and its change list,
 * when it has one), named in the original's meta.pdf.versions as { n, at, edited, changes } (ids), oldest first.
 * meta.pdf.edited and meta.pdf.changes always point at the newest version (the copies Slop PDF opens by default).
 * Up to MAX versions are kept; the oldest are removed from the hub when a newer one is added.
 * Classic script: window.SlopVersions. Every function takes the hub (window.SlopHub, or a stand-in in tests). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SlopVersions = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Versions kept per document. */
  const MAX = 20;

  /** The saved versions of an original, oldest first. A document saved before versions existed has its one edited copy as version 1. */
  function listOf(orig) {
    const p = (orig && orig.meta && orig.meta.pdf) || {};
    if (p.versions && p.versions.length) return p.versions.map((v) => Object.assign({}, v));
    return p.edited ? [{ n: 1, at: 0, edited: p.edited, changes: p.changes || null }] : [];
  }

  /** The records of the versions, newest first: [{ n, at, edited, changes }] with the hub records (or null). */
  async function records(hub, orig) {
    const out = [];
    for (const v of listOf(orig)) {
      out.push({ n: v.n, at: v.at || 0, edited: v.edited ? await hub.get(v.edited) : null, changes: v.changes ? await hub.get(v.changes) : null });
    }
    return out.reverse();
  }

  /** Writes the original's meta with the new version list and pointers. */
  async function writeList(hub, orig, versions, extra) {
    const latest = versions[versions.length - 1] || {};
    const p = Object.assign({}, (orig.meta && orig.meta.pdf) || {}, { role: (orig.meta && orig.meta.pdf && orig.meta.pdf.role) || 'original', edited: latest.edited || null, changes: latest.changes || null, versions: versions });
    await hub.update(orig.id, { meta: Object.assign({}, orig.meta, extra || {}, { pdf: p }) }, { touch: false });
  }

  /** Removes a version's records from the hub (a missing record is not an error). */
  async function dropRecords(hub, v) {
    if (v.edited) await hub.remove(v.edited).catch(() => {});
    if (v.changes) await hub.remove(v.changes).catch(() => {});
  }

  /** Adds a version: the edited file (blob) and its change list (changesBlob, or none). Returns { version, editedId, changesId }. */
  async function add(hub, orig, o) {
    const versions = listOf(orig);
    const n = versions.reduce((m, v) => Math.max(m, v.n || 0), 0) + 1;
    const at = o.at || Date.now();
    const meta = (role) => ({ sha256: o.sha256 || null, pdf: { role: role, original: orig.id, n: n, at: at } });
    const edited = await hub.put(o.blob, { name: o.name, from: 'pdf', folderId: orig.folderId, meta: meta('edited') });
    const changes = o.changesBlob
      ? await hub.put(o.changesBlob, { name: o.changesName || (o.name + '.changes.json'), from: 'pdf', folderId: orig.folderId, meta: { sha256: null, pdf: { role: 'changes', original: orig.id, n: n, at: at } } })
      : null;
    versions.push({ n: n, at: at, edited: edited, changes: changes });
    const dropped = versions.length > MAX ? versions.splice(0, versions.length - MAX) : [];
    for (const v of dropped) await dropRecords(hub, v);
    await writeList(hub, orig, versions, o.originalSha256 ? { sha256: o.originalSha256 } : null);
    return { version: n, editedId: edited, changesId: changes };
  }

  /** Makes an earlier version the current one: its file and change list are copied into a new version (the history is kept). */
  async function restore(hub, orig, editedId) {
    const versions = listOf(orig);
    const v = versions.find((x) => x.edited === editedId);
    if (!v) throw new Error('That version is not part of this document.');
    const rec = await hub.get(v.edited);
    if (!rec || !rec.blob) throw new Error('That version is no longer in Slop Drive.');
    const chg = v.changes ? await hub.get(v.changes) : null;
    return add(hub, await hub.get(orig.id) || orig, {
      blob: rec.blob, name: rec.name, sha256: rec.meta && rec.meta.sha256,
      changesBlob: chg && chg.blob ? chg.blob : null, changesName: chg ? chg.name : undefined,
    });
  }

  /** Removes every version of a document (used when the original is deleted for good). */
  async function removeAll(hub, orig) {
    for (const v of listOf(orig)) await dropRecords(hub, v);
  }

  return { MAX, listOf, records, add, restore, removeAll };
});
