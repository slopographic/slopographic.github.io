/* SlopDrop.folders: the files of a drop, whole folders included, for SlopDrop.attach's files() hook.
 *   SlopDrop.attach(zone, { ..., files: (dt) => SlopDrop.folders.read(dt) })
 * read(dataTransfer) → Promise<File[]>. Folder entries (webkitGetAsEntry) are collected at once, inside the drop event as
 * the browser requires, then walked (every readEntries batch, sub-folders too). A file found in a folder carries its path
 * from the dropped folder down, as the "Choose a folder" input gives it in webkitRelativePath: "Trip/Day 1/a.jpg". The
 * path is set as file.slopPath, and as webkitRelativePath when the browser left that empty (it is empty for entries).
 * Loose files keep their name. Where entries are missing (older browsers, synthetic drops) it falls back to dt.files.
 * An unreadable file or folder is skipped. Optional: drop.js works without it. See shared/drop/HANDOFF.md. */
(function (root) {
  'use strict';
  const SD = (root.SlopDrop = root.SlopDrop || {});

  const entryFile = (entry) => new Promise((res, rej) => entry.file(res, rej));
  const readBatch = (reader) => new Promise((res) => reader.readEntries(res, () => res([])));
  /** Gives a file the path it had inside the dropped folder. */
  function withPath(file, path) {
    try { file.slopPath = path; } catch (e) { /* frozen */ }
    if (!file.webkitRelativePath) { try { Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true }); } catch (e) { /* read-only */ } }
    return file;
  }
  async function walk(entry, prefix, out) {
    if (entry.isFile) {
      try { const f = await entryFile(entry); out.push(prefix ? withPath(f, prefix + f.name) : f); } catch (e) { /* unreadable */ }
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader(), dir = prefix + entry.name + '/';
    for (let batch = await readBatch(reader); batch.length; batch = await readBatch(reader)) {
      for (const child of batch) await walk(child, dir, out);
    }
  }
  /** Whether a drop holds a folder (only knowable inside the drop event). */
  function hasFolder(dt) {
    return Array.from((dt && dt.items) || []).some((i) => { const e = i.webkitGetAsEntry ? i.webkitGetAsEntry() : null; return !!(e && e.isDirectory); });
  }
  async function read(dt) {
    if (!dt) return [];
    const items = Array.from(dt.items || []).filter((i) => !i.kind || i.kind === 'file');
    const plain = Array.from(dt.files || []);
    if (!items.length || !items.some((i) => i.webkitGetAsEntry)) return plain;
    // synchronously, before any await: entries and files are only readable during the drop event
    const parts = items.map((i, n) => ({ entry: i.webkitGetAsEntry ? i.webkitGetAsEntry() : null, file: (i.getAsFile && i.getAsFile()) || plain[n] || null }));
    const out = [];
    for (const p of parts) {
      if (p.entry && p.entry.isDirectory) await walk(p.entry, '', out);
      else if (p.file) out.push(p.file);
      else if (p.entry) await walk(p.entry, '', out);
    }
    return out;
  }
  SD.folders = { read, hasFolder };
})(typeof window !== 'undefined' ? window : globalThis);
