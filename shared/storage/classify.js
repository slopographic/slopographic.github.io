/* SlopStorage.classify(err): says whether a failed write was a full storage quota, and where it was going.
 * Pure: no DOM, no storage access, so Node tests can load it (tests/node/storage-classify.test.mjs).
 * Classic script; adds window.SlopStorage.classify (storage.js adds the rest).
 * Recognised shapes:
 *   DOMException / Error named QuotaExceededError (Chrome, Edge, Safari; IndexedDB and Cache Storage put, localStorage setItem)
 *   NS_ERROR_DOM_QUOTA_REACHED (Firefox, legacy name; code 1014)
 *   legacy DOMException code 22 (QUOTA_EXCEEDED_ERR)
 *   an IDB request or transaction error wrapped by an AbortError (the quota error is in err.error or err.target.error)
 *   a SlopData Result { ok: false, code: 'quota' } and any { code: 'quota' }
 *   a message that says the storage quota was reached or exceeded (Chrome's IDB text: "exceeded its quota limitations")
 * Resolves to { quota, store, message }: store is 'indexeddb' | 'cache' | 'localstorage' | 'unknown'. Never throws. */
(function (g) {
  'use strict';
  const QUOTA_NAMES = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'];
  const QUOTA_CODES = [22, 1014];
  const QUOTA_TEXT = /quota (exceeded|reached|limit)|exceeded (its|the|this) quota|storage quota|quota ?exceeded/i;
  // read when an error is classified, in the current language (shared/i18n/ui/<code>/backup3.js)
  const MESSAGE = () => (g.SlopI18n ? g.SlopI18n.t('ui.storage.full_msg') : 'ui.storage.full_msg');

  /** Walks the error and the errors it wraps (IDB request.error, transaction.error, cause), up to a few levels. */
  function candidates(err) {
    const out = [], seen = new Set();
    const walk = (e, depth) => {
      if (e == null || depth > 3 || seen.has(e)) return;
      if (typeof e !== 'object' && typeof e !== 'function') { out.push({ message: String(e) }); return; }
      seen.add(e);
      out.push(e);
      walk(e.error, depth + 1);
      walk(e.cause, depth + 1);
      if (e.target && e.target !== e) walk(e.target.error, depth + 1);
    };
    walk(err, 0);
    return out;
  }
  function isQuota(e) {
    if (e.code === 'quota') return true;
    if (QUOTA_NAMES.includes(e.name)) return true;
    if (e.name === undefined || e.name === 'DOMException') { if (QUOTA_CODES.includes(e.code)) return true; }
    const text = typeof e.message === 'string' ? e.message : '';
    return !!text && QUOTA_TEXT.test(text);
  }
  /** Where the failed write was going, from the names and messages the browser gives. */
  function storeOf(err, list) {
    const txt = list.map((e) => `${e.name || ''} ${e.message || ''} ${e.code || ''} ${e.source || ''} ${e.store || ''}`).join(' ');
    if (/IDB|IndexedDB|IDBObjectStore|IDBTransaction|IDBDatabase|IDBRequest|transaction|indexeddb/i.test(txt)) return 'indexeddb';
    if (/Cache|cache\.put|Response/i.test(txt)) return 'cache';
    if (/localStorage|setItem/i.test(txt)) return 'localstorage';
    if (err && typeof err === 'object' && err.store) return String(err.store);
    return 'unknown';
  }

  function classify(err) {
    try {
      const list = candidates(err);
      const quota = list.some(isQuota);
      if (!quota) return { quota: false, store: 'unknown', message: '' };
      return { quota: true, store: storeOf(err, list), message: MESSAGE() };
    } catch (e) {
      return { quota: false, store: 'unknown', message: '' };
    }
  }

  g.SlopStorage = Object.assign(g.SlopStorage || {}, { classify });
  Object.defineProperty(g.SlopStorage, 'QUOTA_MESSAGE', { get: MESSAGE, enumerable: true, configurable: true });
})(typeof window !== 'undefined' ? window : globalThis);
