/* Slop Code: the Slop Drive side. Reads and writes records through window.SlopHub (shared/hub.js), builds the
 * folder tree the way Drive shows it (trashed items hidden), and gathers a folder's files for Run. */
import { mimeFor, extOf } from './lang.js';

const H = () => window.SlopHub;
const APP = 'code';

/** The text of a record, or null when it is not text (a NUL byte in the first 8 KB). */
export async function readText(rec) {
  const head = new Uint8Array(await rec.blob.slice(0, 8192).arrayBuffer());
  if (head.includes(0)) return null;
  return rec.blob.text();
}

/** Write text back to a record: the same id, the same name, a new blob. Throws if the record is gone. */
export async function writeText(id, text, name) {
  const out = await H().update(id, { blob: new Blob([text], { type: mimeFor(name) }) });
  if (!out) throw new Error('this file is no longer in Slop Drive');
  return out;
}

export async function createFile(name, folderId) {
  const id = await H().put(new Blob([], { type: mimeFor(name) }), { name, from: APP, folderId: folderId ?? null });
  return H().get(id);
}

/** Folders and files that are visible (not in the Trash, and not inside a trashed folder). */
export async function tree() {
  const folders = await H().listFolders();
  const map = new Map(folders.map((f) => [f.id, f]));
  const visibleFolders = folders.filter((f) => !H().inTrash(f, map));
  const files = (await H().list()).filter((f) => !H().inTrash(f, map)); // intake-ok: the project folder tree (projectFiles), not a picker
  return { folders: visibleFolders, files, map };
}

/** Names of the folders above and including `folderId`, e.g. "/Site/css". */
export async function pathOf(folderId, name = '') {
  const parts = (await H().folderPath(folderId ?? null)).map((f) => f.name);
  return '/' + [...parts, name].filter(Boolean).join('/');
}

/** A name that is free in the folder: "index.js" becomes "index (2).js" when taken. */
export async function uniqueName(name, folderId) {
  const taken = new Set((await H().list({ folderId: folderId ?? null })).map((r) => r.name.toLowerCase())); // intake-ok: names already taken in a folder, not a picker
  if (!taken.has(name.toLowerCase())) return name;
  const dot = extOf(name) ? name.lastIndexOf('.') : -1;
  const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n++) if (!taken.has(`${stem} (${n})${ext}`.toLowerCase())) return `${stem} (${n})${ext}`;
}

/** Every visible file under `folderId` (recursively), keyed by its path relative to that folder ("css/site.css"). */
export async function projectFiles(folderId) {
  const { files, map } = await tree();
  const out = new Map();
  for (const f of files) {
    const rel = [];
    let node = f.folderId ?? null, ok = true;
    for (let n = 0; node !== folderId; n++) {
      const fo = map.get(node);
      if (!fo || n > 64) { ok = false; break; }
      rel.unshift(fo.name);
      node = fo.parentId ?? null;
    }
    if (ok) out.set([...rel, f.name].join('/'), f);
  }
  return out;
}
