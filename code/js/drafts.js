/* Slop Code: drafts. Unsaved text is autosaved per Slop Drive record in IndexedDB (database 'slop-code',
 * store 'drafts'), so a reload or a closed tab does not lose work. Every call is best effort: private
 * windows and blocked storage just mean no autosave. */
const DB = 'slop-code', STORE = 'drafts';
let dbp = null;

function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}
async function run(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out && out.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  });
}

/** The draft { id, text, time } for a record, or null. */
export async function getDraft(id) {
  try { return (await run('readonly', (s) => s.get(id))) || null; } catch (e) { return null; }
}
export async function putDraft(id, text) {
  try { await run('readwrite', (s) => s.put({ id, text, time: Date.now() })); } catch (e) { /* no autosave */ }
}
export async function dropDraft(id) {
  try { await run('readwrite', (s) => s.delete(id)); } catch (e) { /* nothing to drop */ }
}
