// SlopStorage.classify(err): which failed writes are a full quota, and where they were going.
// Loads the real shared/storage/classify.js in a vm context (see storage-env.mjs). Run: node tests/run.mjs storage
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassic } from './storage-env.mjs';
import { setLang } from './ui-i18n-en.mjs';   // the message's words (shared/i18n/ui/<code>/backup2.js), as a page has them

const ctx = await loadClassic(['shared/storage/classify.js'], { SlopI18n: globalThis.SlopI18n });
const classify = ctx.SlopStorage.classify;
const named = (name, message = '', extra = {}) => Object.assign(new Error(message), { name }, extra);

test('a QuotaExceededError is a quota error, with the plain message', () => {
  const r = classify(named('QuotaExceededError', 'The quota has been exceeded.'));
  assert.equal(r.quota, true);
  assert.match(r.message, /storage is full/);
  assert.match(r.message, /not saved/);
});

test('Firefox names it NS_ERROR_DOM_QUOTA_REACHED (code 1014)', () => {
  assert.equal(classify(named('NS_ERROR_DOM_QUOTA_REACHED', 'The operation failed because the storage quota was reached.')).quota, true);
  assert.equal(classify({ name: 'DOMException', code: 1014, message: '' }).quota, true);
});

test('the legacy DOMException code 22 is a quota error', () => {
  assert.equal(classify({ name: 'DOMException', code: 22, message: 'Storage is full' }).quota, true);
  assert.equal(classify({ code: 22, message: '' }).quota, true);
});

test('the IndexedDB quota error inside an AbortError is found and placed in indexeddb', () => {
  const quota = named('QuotaExceededError', 'The current transaction exceeded its quota limitations.');
  const abort = named('AbortError', 'Transaction was aborted', { error: quota });
  const r = classify(abort);
  assert.equal(r.quota, true);
  assert.equal(r.store, 'indexeddb');
  assert.equal(classify({ name: 'AbortError', target: { error: quota } }).quota, true);
  assert.equal(classify({ name: 'UnknownError', cause: quota }).quota, true);
});

test('a SlopData Result with code quota is a quota error', () => {
  assert.equal(classify({ ok: false, code: 'quota', message: 'x' }).quota, true);
  assert.equal(classify({ code: 'quota' }).quota, true);
});

test('a message that says the quota was exceeded is a quota error, even without a name', () => {
  assert.equal(classify(new Error('Failed to execute setItem on Storage: Setting the value exceeded the quota.')).quota, true);
  assert.equal(classify('storage quota reached').quota, true);
});

test('the storage the write was going to is named when the browser says so', () => {
  assert.equal(classify(named('QuotaExceededError', "Failed to execute 'setItem' on 'Storage'")).store, 'localstorage');
  assert.equal(classify(named('QuotaExceededError', "Failed to execute 'put' on 'IDBObjectStore'")).store, 'indexeddb');
  assert.equal(classify(named('QuotaExceededError', 'Failed to execute put on Cache')).store, 'cache');
  assert.equal(classify(named('QuotaExceededError', 'full')).store, 'unknown');
});

test('other errors are not quota errors', () => {
  for (const e of [new TypeError('x is not a function'), named('ConstraintError', 'Key exists'), named('AbortError', 'aborted'),
    { ok: false, code: 'conflict' }, { code: 'invalid' }, new Error('invalid quota value'), 'boom', null, undefined, 42]) {
    const r = classify(e);
    assert.equal(r.quota, false, `expected not quota: ${String(e && (e.message || e.code || e))}`);
    assert.equal(r.message, '');
  }
});

test('a cyclic error and a throwing getter do not throw', () => {
  const a = { name: 'AbortError' }; a.error = a;
  assert.equal(classify(a).quota, false);
  const bad = {};
  Object.defineProperty(bad, 'name', { get() { throw new Error('nope'); } });
  assert.equal(classify(bad).quota, false);
});

test('classify is also on window.SlopStorage, so the other storage scripts can extend it', () => {
  assert.equal(typeof ctx.SlopStorage.classify, 'function');
  assert.equal(typeof ctx.SlopStorage.QUOTA_MESSAGE, 'string');
});

// Covers: shared/i18n/ui/en/backup3.js, shared/i18n/ui/sv/backup3.js
test('the quota message is in the chosen language, read when an error is classified', () => {
  setLang('sv');
  try {
    assert.match(classify(named('QuotaExceededError')).message, /^Webbplatsens lagring är full\./);
    assert.match(ctx.SlopStorage.QUOTA_MESSAGE, /lagring är full/);
  } finally { setLang('en'); }
  assert.match(classify(named('QuotaExceededError')).message, /storage is full/);
});
