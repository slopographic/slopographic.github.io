/* Slop Tables test helpers: boot the real app in an iframe (same origin, so Slop Drive and the draft
   store are the real ones), drive it through window.SlopTables and read results back. Exposes window.TB. */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const TB = window.TB = {};

  /** Forget the open tabs (and their unsaved workbooks) so a plain start is blank (unless keepDrafts). */
  TB.clearDrafts = async () => {
    await SlopTest.sleep(300); // a page that was just removed still writes its tabs on pagehide: let that land first
    localStorage.removeItem('slop.doctabs.tables.v1');
    // Clear the records rather than delete the database: a live frame still holds it open, and a pending delete would
    // block every later open of it.
    await new Promise((res) => {
      const r = indexedDB.open('slop-doctabs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('docs');
      r.onerror = r.onblocked = () => res();
      r.onsuccess = () => {
        const d = r.result;
        try { const tx = d.transaction('docs', 'readwrite'); tx.objectStore('docs').clear(); tx.oncomplete = tx.onerror = tx.onabort = () => { d.close(); res(); }; }
        catch (e) { d.close(); res(); }
      };
    });
  };

  /** Loads tables/index.html (plus an optional query) into the iframe and waits for launch to finish. */
  TB.boot = async function (query = '', frameId = 'app', { keepDrafts = false } = {}) {
    const fr = document.getElementById(frameId);
    // Blank every app frame first: a frame left running from an earlier test (the second window of
    // the autosave test) would otherwise write its draft back after clearDrafts, and the next plain
    // start would restore that stale workbook into this one.
    // The main frame ('app') stays alive unless it is the one being booted: TB.hub and TB.T point into it.
    for (const f of document.querySelectorAll('iframe')) if (f === fr || f.id !== 'app') f.src = 'about:blank';
    await SlopTest.sleep(60);
    if (!keepDrafts) await TB.clearDrafts();
    fr.src = '../../tables/index.html' + query;
    await waitFor(() => fr.contentWindow && fr.contentWindow.SlopTables && fr.contentWindow.SlopTables.ready, { timeout: 30000 });
    const win = fr.contentWindow;
    if (frameId === 'app') Object.assign(TB, { win, T: win.SlopTables, hub: win.SlopHub, doc: win.document });
    return win;
  };
  TB.frame = (id = 'app') => document.getElementById(id).contentWindow;

  /** Dispatch a key the way the browser does, on the element (default: the grid). */
  TB.key = function (key, { on = null, ctrl = false, shift = false } = {}) {
    const doc = TB.doc, el = on || doc.getElementById('grid');
    el.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: ctrl, shiftKey: shift, bubbles: true, cancelable: true }));
  };

  /** A hub record for the current app: the Drive record by id. */
  TB.drive = (id) => TB.hub.get(id);
  TB.wait = (ms) => SlopTest.sleep(ms);
})();
