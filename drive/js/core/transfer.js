/* Slop Drive — core/transfer: copies and moves entries between providers (Slop Drive, local folders). Pure: it calls
 * only the provider methods (list, readBlob, mkdir, write, uniqueName, remove, within), so Node can test it.
 * An entry is { provider, ref, name, isFolder, parent, from, meta }. A move copies first and removes the original
 * only after its copy is complete, so a failed copy never loses the source. A folder cannot go inside itself. */
'use strict';
(function (DR) {
  const nr = (r) => (r == null || r === '' ? null : r);
  // The words come from drive/i18n (DR.t, core/util.js); Node tests load this file alone and read the English.
  const tr = (key, en) => (DR.t ? DR.t(key) : en);

  /** Copies one entry (a file, or a folder with everything in it) into folder dstRef. Returns the new ref. */
  async function copyInto(src, e, dst, dstRef, name) {
    if (!e.isFolder) {
      const blob = await src.readBlob(e.ref);
      return dst.write(dstRef, name, blob, { from: e.from, meta: e.meta });
    }
    const ref = await dst.mkdir(dstRef, name);
    const { folders, files } = await src.list(e.ref);
    for (const f of files) await copyInto(src, f, dst, ref, f.name);
    for (const f of folders) await copyInto(src, f, dst, ref, f.name);
    return ref;
  }

  /** Why entry e cannot go into dst ({provider, ref}), or null. 'same' means a move into the folder it is in. */
  DR.transferBlocker = function (e, dst) {
    if (e.isFolder && e.provider.id === dst.provider.id && dst.provider.within(e.ref, dst.ref)) return tr('drive.toast.not_inside', 'A folder cannot go inside itself');
    if (e.provider.id === dst.provider.id && nr(e.parent) === nr(dst.ref)) return 'same';
    return null;
  };

  /** Copies (or moves) every entry into dst. Returns { done, skipped, failed, errors }. Never throws. */
  DR.copyTree = async function (entries, dst, { move = false } = {}) {
    const out = { done: 0, skipped: 0, failed: 0, errors: [] };
    for (const e of entries) {
      const why = DR.transferBlocker(e, dst);
      if (why === 'same' && move) { out.skipped++; continue; }
      if (why && why !== 'same') { out.skipped++; out.errors.push(`${e.name}: ${why}`); continue; }
      try {
        const name = await dst.provider.uniqueName(dst.ref, e.name, e.isFolder);
        await copyInto(e.provider, e, dst.provider, dst.ref, name);
        if (move) await e.provider.remove(e.ref, e.isFolder);
        out.done++;
      } catch (x) {
        out.failed++;
        out.errors.push(`${e.name}: ${(x && x.message) || tr('drive.prov.not_copied_lc', 'could not be copied')}`);
      }
    }
    return out;
  };
})(window.DR);
