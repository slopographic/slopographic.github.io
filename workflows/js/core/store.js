/* Slop Workflows: saved workflows, in this browser's IndexedDB through the shared SlopDb (shared/db/db.js), database
 * 'slop-workflows', store 'flows': { id, name, text (the .slopflow JSON, no passwords), modified }. Nothing is uploaded.
 * Every call resolves (an empty list, false) when storage is blocked; the page still works, it only cannot keep them.
 *   list() → [{ id, name, text, modified }] newest first ; get(id) ; save({ id?, name, text }) → id ; remove(id) → bool */
const NAME = 'slop-workflows', STORE = 'flows';
let dbp = null;
const db = () => {
  if (!dbp) dbp = globalThis.SlopDb ? globalThis.SlopDb.open(NAME, { version: 1, stores: { [STORE]: { keyPath: 'id', indexes: [{ name: 'modified', keyPath: 'modified' }] } } }) : Promise.resolve(null);
  return dbp;
};
const newId = () => 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function list() {
  const d = await db();
  if (!d) return [];
  try { return (await d.getAll(STORE)).sort((a, b) => b.modified - a.modified); } catch (e) { return []; }
}
export async function get(id) {
  const d = await db();
  try { return d ? (await d.get(STORE, id)) || null : null; } catch (e) { return null; }
}
export async function save({ id, name, text }) {
  const d = await db();
  if (!d) throw new Error('This browser does not let the page keep workflows (storage is blocked). Use Export to keep a file.');
  const rec = { id: id || newId(), name: String(name || 'Untitled workflow'), text, modified: Date.now() };
  await d.put(STORE, rec);
  return rec.id;
}
export async function remove(id) {
  const d = await db();
  if (!d) return false;
  try { await d.remove(STORE, id); return true; } catch (e) { return false; }
}
