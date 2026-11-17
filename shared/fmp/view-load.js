/* SlopFmpView.load() and SlopFmpView.show(): the way an app or SlopPreview shows a FileMaker file without listing the
   reader's and the viewer's scripts on its page. Classic script; this is the only file the page needs.
     SlopFmpView.load()  → Promise   loads what is missing, once: the reader (window.SlopFmp, READER) and the viewer's files
                                    (PARTS), in order. A page that already has them is left as it is.
     SlopFmpView.show(host, { blob | blobUrl, name }, { title?, outtake? }) → { destroy() }
         Opens the file (SlopFmp.open) and mounts the viewer in host (mount), or the error screen (mountError) when the
         file does not open. destroy() takes the viewer down and closes the database. A blobUrl is a blob: URL the host
         made from the file; it is read in this page, nothing goes over the network.
   READER: the reader's script files in shared/fmp/, in load order (the list in shared/fmp/HANDOFF.md). */
(function () {
  'use strict';
  const V = (window.SlopFmpView = window.SlopFmpView || {});
  const BASE = (document.currentScript && document.currentScript.src ? document.currentScript.src : '').replace(/[^/]*$/, '');
  V.READER = V.READER || ['scsu.js', 'charset.js', 'sectors.js', 'chunks.js', 'chunks7.js', 'values.js', 'reader.js', 'xml.js', 'export.js', 'fmp.js']; // shared/fmp/HANDOFF.md
  V.PATTERNS = ['../patterns/patterns.js', '../patterns/patterns-kinds.js']; // shared/patterns: the kinds of text the find list offers (IP addresses, keys...)
  V.PARTS = ['view-util.js', 'view-error.js', 'view-grid.js', 'view-find.js', 'view-export.js', 'view.js'];
  // the two words this file shows before view-util.js is in (the rest are in view-util.js, which merges into the same table)
  V.EN = Object.assign(V.EN || {}, { 'ui.fmp.opening': 'Opening the database…', 'ui.fmp.load_failed': 'The database viewer could not be loaded.' }); // i18n-ignore: the English of the keys
  const word = (key) => { const I = globalThis.SlopI18n; return I && I.has && I.has(key) ? I.t(key) : V.EN[key]; };

  /** One script, once: a page that has it already (same URL) counts as loaded. Scripts added here run in the order added. */
  function script(src) {
    if (window.SlopLoad && window.SlopLoad.script) return window.SlopLoad.script(src);
    if (Array.from(document.scripts).some((s) => s.src === src)) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false; // scripts added by code run in the order they were added
      s.onload = () => res();
      s.onerror = () => { s.remove(); rej(new Error('Could not load ' + src)); };
      document.head.append(s);
    });
  }
  let loading = null;
  V.load = function () {
    if (loading) return loading;
    const need = [...(window.SlopPatterns ? [] : V.PATTERNS), ...(window.SlopFmp ? [] : V.READER), ...(V.mount && V.mountError && V.grid && V.finder && V.exporter ? [] : V.PARTS)];
    loading = need.reduce((p, f) => p.then(() => script(new URL(f, BASE).href)), Promise.resolve()).then(() => {
      if (!window.SlopFmp || !window.SlopFmp.open) throw new Error('SlopFmp is not loaded');
    }, (e) => { loading = null; throw e; });
    return loading;
  };

  V.show = function (host, src, opts) {
    opts = opts || {};
    src = src || {};
    const name = src.name || opts.title || '';
    let dead = false, view = null, db = null;
    const note = (text) => {
      const n = document.createElement('div');
      n.className = 'sfv-note';
      n.style.cssText = 'display:grid;place-items:center;height:100%;padding:16px;text-align:center;opacity:.75;font:13px system-ui,sans-serif';
      n.textContent = text;
      host.replaceChildren(n);
    };
    note(word('ui.fmp.opening'));
    (async () => {
      try { await V.load(); } catch (e) { if (!dead) note(word('ui.fmp.load_failed')); return; }
      if (dead) return;
      try {
        const blob = src.blob || await (await fetch(src.blobUrl)).blob(); // a blob: URL from the host, not the network
        db = await window.SlopFmp.open(blob, { name });
        if (dead) { db.close(); return; }
        view = V.mount(host, db, { title: opts.title || name, outtake: opts.outtake });
      } catch (e) {
        if (dead) return;
        view = V.mountError(host, e, { name });
      }
    })();
    return {
      destroy() {
        dead = true;
        if (view) view.destroy();
        try { if (db) db.close(); } catch (e) { /* already closed */ }
        view = db = null;
      },
    };
  };
})();
