// SlopQuota (shared/storage/quota.js): estimate, persist, the formatter, the browser's limit in plain words, askIfBig once
// per visit, and its English fallback matching shared/i18n/strings.js. Uses a fake navigator. Run: node --test tests/node/storage-quota.test.mjs
// Covers: shared/storage/quota.js, shared/i18n/strings.js, shared/i18n/es.js, shared/i18n/fr.js, shared/i18n/de.js,
// Covers: shared/i18n/pt-BR.js, shared/i18n/it.js, shared/i18n/ar.js, admin/js/core/storage.js, ai/js/ui/models.js, ai/js/ui/sysview.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Q = createRequire(import.meta.url)(path.join(ROOT, 'shared/storage/quota.js'));
const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  firefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
};
/** A fake navigator: storage answers as given; calls counts persist() calls. */
function fake({ ua = UA.chrome, usage = 3.2 * 2 ** 30, quota = 120 * 2 ** 30, kept = false, grant = true, storage = true, throws = false } = {}) {
  const calls = { persist: 0 };
  const st = {
    estimate: async () => { if (throws) throw new Error('blocked'); return { usage, quota }; },
    persisted: async () => { if (throws) throw new Error('blocked'); return kept; },
    persist: async () => { calls.persist++; if (throws) throw new Error('blocked'); if (grant) kept = true; return grant; },
  };
  return { calls, navigator: { userAgent: ua, storage: storage ? st : undefined } };
}
const make = (o = {}, win = {}) => { const f = fake(o); return { f, q: Q.create({ navigator: f.navigator, window: win, i18n: null }) }; };

test('estimate: usage, quota, percent, persisted, the browser and whether a folder can be connected', async () => {
  const { q } = make({}, { showDirectoryPicker() {} });
  const e = await q.estimate();
  assert.equal(e.supported, true);
  assert.equal(e.usage, 3.2 * 2 ** 30);
  assert.equal(Math.round(e.percent * 10) / 10, 2.7);
  assert.equal(e.persisted, false);
  assert.equal(e.canPersist, true);
  assert.equal(e.folder, true);
  assert.deepEqual(e.browser, { engine: 'chromium', name: 'Chrome' });
  assert.equal((await make({ ua: UA.firefox }).q.estimate()).folder, false);
});

test('estimate never throws: no storage API, or a browser that refuses', async () => {
  const none = await make({ storage: false }).q.estimate();
  assert.equal(none.supported, false);
  assert.equal(none.usage, null);
  assert.equal(none.persisted, null);
  assert.equal(none.canPersist, false);
  const refused = await make({ throws: true }).q.estimate();
  assert.equal(refused.usage, null);
  assert.equal(refused.persisted, null);
});

test('persist: true when granted, false when denied or unsupported; persistAnswer names which', async () => {
  assert.equal(await make({ grant: true }).q.persist(), true);
  assert.equal(await make({ grant: false }).q.persist(), false);
  assert.equal(await make({ grant: false }).q.persistAnswer(), 'denied');
  assert.equal(await make({ storage: false }).q.persistAnswer(), 'unsupported');
  assert.equal(await make({ throws: true }).q.persistAnswer(), 'denied');
});

test('request goes through SlopPWA when the page has it, so the answer is recorded', async () => {
  const seen = [];
  const { q, f } = make({}, { SlopPWA: { requestPersist: async () => { seen.push('pwa'); return 'granted'; } } });
  assert.equal(await q.request(), 'granted');
  assert.deepEqual(seen, ['pwa']);
  assert.equal(f.calls.persist, 0);
});

test('the formatter: "3.2 GB of 120 GB", and a page formatter can be passed', () => {
  assert.equal(Q.bytes(3.2 * 2 ** 30), '3.2 GB');
  assert.equal(Q.bytes(512), '512 B');
  assert.equal(Q.bytes(null), 'unknown');
  const q = Q.create({ i18n: null });
  assert.equal(q.format(3.2 * 2 ** 30, 120 * 2 ** 30), '3.2 GB of 120 GB');
  assert.equal(q.format(1, 2, (n) => n + 'x'), '1x of 2x');
});

test('the browser: Firefox, Chrome, Edge, Safari, and every iOS browser is Safari', () => {
  const q = Q.create({ navigator: {} });
  assert.deepEqual(q.browser(UA.firefox), { engine: 'firefox', name: 'Firefox' });
  assert.deepEqual(q.browser(UA.edge), { engine: 'chromium', name: 'Edge' });
  assert.deepEqual(q.browser(UA.chrome), { engine: 'chromium', name: 'Chrome' });
  assert.deepEqual(q.browser(UA.safari), { engine: 'safari', name: 'Safari' });
  assert.equal(q.browser(UA.iosChrome).engine, 'safari');
  assert.equal(q.browser('curl/8').engine, 'other');
});

test('the limit in plain words, per browser, with the facts only', () => {
  const q = Q.create({ i18n: null });
  assert.match(q.limitText('chromium'), /about 60% of your disk/);
  assert.match(q.limitText('firefox'), /10% of your disk or 10 GB/);
  assert.match(q.limitText('firefox'), /50% of the disk \(at most 8 TB\)/);
  assert.match(q.limitText('safari'), /about 60% of your disk/);
  assert.match(q.limitText('nope'), /Your browser sets/);
  assert.match(q.folderText({ folder: true }), /connect a folder/);
  assert.match(q.folderText({ folder: false }), /needs Chrome or Edge/);
  assert.match(q.outcome('granted'), /will keep your files/);
  assert.match(q.outcome('denied', 'firefox'), /Firefox asked you/);
  assert.match(q.outcome('denied', 'chromium'), /Chrome and Edge decide/);
  assert.match(q.outcome('unsupported'), /cannot promise/);
});

test('askIfBig: nothing below 50 MB; the first big save asks once; later ones in the visit do not', async () => {
  const { q, f } = make({ grant: false });
  assert.equal(await q.askIfBig(10 * 2 ** 20), null);
  assert.equal(f.calls.persist, 0);
  assert.equal(await q.askIfBig(60 * 2 ** 20), 'denied');
  assert.equal(await q.askIfBig(900 * 2 ** 20), 'denied');
  assert.equal(f.calls.persist, 1);
  const kept = make({ kept: true });
  assert.equal(await kept.q.askIfBig(Q.BIG), 'granted');
  assert.equal(kept.f.calls.persist, 0, 'already kept: the browser is not asked');
});

test('text goes through SlopI18n when the page has it', () => {
  const q = Q.create({ i18n: { t: (k, v) => (k === 'storage.of' ? `${v.used} / ${v.quota}` : k) } });
  assert.equal(q.format(1024, 2048), '1.0 KB / 2.0 KB');
  assert.match(q.limitText('safari'), /Safari/, 'a key the table lacks falls back to English');
});

test('the English fallback is the same as shared/i18n/strings.js, and every language has each storage key', async () => {
  const ctx = { SlopI18n: { tables: {}, add(code, d) { this.tables[code] = d; } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['strings.js', 'es.js', 'fr.js', 'de.js', 'pt-BR.js', 'it.js', 'ar.js', 'sv.js']) vm.runInContext(await readFile(path.join(ROOT, 'shared/i18n', f), 'utf8'), ctx);
  for (const [k, v] of Object.entries(Q.EN)) {
    assert.equal(ctx.SlopI18n.tables.en[k], v, k);
    for (const code of ['es', 'fr', 'de', 'pt-BR', 'it', 'ar', 'sv']) assert.ok(ctx.SlopI18n.tables[code][k], `${code} ${k}`);
  }
});

test('no app makes its own navigator.storage calls: they go through shared/storage/quota.js', async () => {
  for (const f of ['drive/js/ui/sidebar.js', 'ai/js/ui/sysview.js', 'ai/js/ui/models.js', 'shared/ai/sysinfo.js', 'admin/js/core/storage.js', 'shared/pwa.js', 'settings/storage-keep.js', 'settings/storage.js', 'drive/js/app/main.js']) {
    const src = await readFile(path.join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /navigator\.storage\.|NAV\.storage/, f);
  }
});
