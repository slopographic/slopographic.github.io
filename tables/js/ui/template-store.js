/* Template storage: the person's own templates live in IndexedDB (database 'slop-tables-templates') and,
   when Slop Drive is there, a copy of each goes to a 'Templates' folder at the Drive root. */
const DB = 'slop-tables-templates';
const hub = () => window.SlopHub || null;
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('Storage is unavailable')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('templates', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}

/** One transaction on the templates store; resolves with the last request's result. */
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('templates', mode);
    const r = fn(t.objectStore('templates'));
    t.oncomplete = () => res(r && r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Aborted'));
  });
}

/** My templates, newest first. Records: { id, name, description, created, native, driveId? }. */
export async function listMine() {
  const all = (await tx('readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => b.created - a.created);
}
export const putMine = (rec) => tx('readwrite', (s) => s.put(rec));
export const removeMine = (id) => tx('readwrite', (s) => s.delete(id));

/** The 'Templates' folder at the Drive root, created on first use. Null without Slop Drive. */
export async function templatesFolder() {
  const h = hub();
  if (!h) return null;
  const found = (await h.listFolders({ parentId: null, trashed: false })).find((f) => f.name === 'Templates');
  return found ? found.id : h.createFolder('Templates', null);
}
