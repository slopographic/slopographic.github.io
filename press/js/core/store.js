/* Slop Press — autosave to IndexedDB ('slop-press', store 'docs', key 'autosave') and small prefs in localStorage. */
(function () {
  'use strict';
  var PR = window.PR, U = PR.util;
  var ST = PR.store = { DB: window.SLOP_PRESS_DB || 'slop-press', enabled: true };
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('No IndexedDB'));
      var r = indexedDB.open(ST.DB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains('docs')) r.result.createObjectStore('docs'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('docs', mode), s = t.objectStore('docs'), q = fn(s);
        t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); };
      });
    });
  }
  ST.save = function (key, value) { return tx('readwrite', function (s) { return s.put(value, key); }); };
  ST.load = function (key) { return tx('readonly', function (s) { return s.get(key); }).catch(function () { return null; }); };
  ST.remove = function (key) { return tx('readwrite', function (s) { return s.delete(key); }).catch(function () { return null; }); };

  /** Saves the open document (debounced by the caller). */
  ST.autosave = function () {
    var S = PR.state;
    if (!ST.enabled || !S.doc) return Promise.resolve(false);
    return ST.save('autosave', { time: Date.now(), name: S.doc.name, fileName: S.fileName, json: JSON.stringify(S.doc) })
      .then(function () { PR.emit('autosaved'); return true; }).catch(function () { return false; });
  };
  ST.restore = function () {
    return ST.load('autosave').then(function (rec) {
      if (!rec || !rec.json) return null;
      try { return { doc: JSON.parse(rec.json), time: rec.time, fileName: rec.fileName }; } catch (e) { return null; }
    });
  };
  ST.schedule = U.debounce(function () { ST.autosave(); }, 1200);

  /* ---------- preferences ---------- */
  ST.pref = function (k, v) {
    var key = 'slop.press.' + k;
    try {
      if (v === undefined) { var s = localStorage.getItem(key); return s == null ? null : JSON.parse(s); }
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) { /* storage blocked */ }
    return v;
  };
})();
