/* SlopBuffer store: the latest item in IndexedDB (database slop-buffer, store latest, key current), so it survives a
 * reload. Blobs are stored as they are. Every call resolves: a missing or blocked IndexedDB gives null or false, and
 * the buffer keeps working in memory. Classic script; adds SlopBuffer.store. */
(function (g) {
  'use strict';
  var B = g.SlopBuffer = g.SlopBuffer || {};
  var DB = 'slop-buffer', STORE = 'latest', KEY = 'current';
  var dbp = null;

  function idb() { return g.indexedDB || null; }

  function open() {
    if (dbp) return dbp;
    var f = idb();
    if (!f) return (dbp = Promise.reject(new Error('IndexedDB is not available')));
    dbp = new Promise(function (res, rej) {
      var r = f.open(DB, 1);
      r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error('slop-buffer is blocked')); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  /** Runs one request on the store. mode 'readonly' or 'readwrite'. */
  function run(mode, make) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), out = null;
        var r = make(t.objectStore(STORE));
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = t.onabort = function () { rej(t.error || new Error('slop-buffer transaction failed')); };
      });
    });
  }

  B.store = {
    /** The stored record ({ kind, formats, source, t }) or null. */
    read: function () {
      return run('readonly', function (s) { return s.get(KEY); }).then(function (v) { return v || null; }, function () { return null; });
    },
    /** Stores a record (replaces the one there). Resolves true when written. */
    write: function (rec) {
      var copy = { kind: rec.kind, formats: rec.formats, source: rec.source, t: rec.t };
      return run('readwrite', function (s) { return s.put(copy, KEY); }).then(function () { return true; }, function () { return false; });
    },
    clear: function () {
      return run('readwrite', function (s) { return s.delete(KEY); }).then(function () { return true; }, function () { return false; });
    },
    /** Test hook: forget the open connection so the next call opens again. */
    _reset: function () { dbp = null; }
  };
})(window);
