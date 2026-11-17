/* Slop Font: the project kept in this browser between visits (IndexedDB through shared/db, SlopDb: database
 * 'slop-fontcreator', store 'projects', record 'current'), written a moment after each change. A private window or
 * blocked storage simply starts fresh each visit. Classic script, after state.js.
 *   FC.store.restore() → Promise<boolean>   the kept project loaded into the state (true), or a new one (false)
 *   FC.store.flush() → Promise              write now (tests, before leaving the page) */
(function (g) {
  'use strict';
  const S = () => g.FC.state;
  let db = null, timer = 0, opening = null;
  function open() {
    if (opening) return opening;
    opening = g.SlopDb ? g.SlopDb.open('slop-fontcreator', { version: 1, stores: { projects: { keyPath: 'id' } } }).catch(() => null) : Promise.resolve(null);
    return opening.then((d) => { db = d; return d; });
  }
  async function flush() {
    clearTimeout(timer); timer = 0;
    const d = await open();
    if (!d) return;
    try { await d.put('projects', { id: 'current', json: S().snapshot(), at: Date.now() }); } catch (e) { /* storage full or blocked: not kept */ }
  }
  function later() { clearTimeout(timer); timer = setTimeout(flush, 600); }
  async function restore() {
    const d = await open();
    let row = null;
    try { row = d ? await d.get('projects', 'current') : null; } catch (e) { row = null; }
    S().on((e) => { if (e.what !== 'select' && e.what !== 'settings') later(); });
    if (!row || !row.json) return false;
    try { S().boot(JSON.parse(row.json)); return true; } catch (e) { console.warn('Slop Font: the kept project could not be read', e); return false; }
  }
  g.addEventListener('pagehide', () => { if (timer) flush(); });
  g.FC.store = { restore, flush };
})(window);
