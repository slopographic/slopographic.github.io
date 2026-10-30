// The 'rates' consent category gates every ECB fetch: with the switch off nothing is fetched (fetch is stubbed and
// counted), and turning it off again stops later fetches. Loads the real consent scripts and the data scripts.
// Run: node tests/run.mjs consent
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadInto, DATA_FILES, fakeTx, plain, ECB_FIXTURE } from './fx-env.mjs';

const CONSENT = ['consent/config.js', 'consent/state.js', 'consent/consent-mode.js'];
const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

/** A fresh page: real consent scripts, data scripts, an in-memory transaction, and a counting fetch. */
async function page() {
  const calls = [];
  const fetchStub = async (url) => { calls.push(url); return { ok: true, status: 200, text: async () => ECB_FIXTURE }; };
  const storage = memStorage();
  const ctx = await loadInto([...CONSENT, ...DATA_FILES.map((f) => `data/${f}`)], {
    localStorage: storage, document: { currentScript: null }, location: { href: 'https://slopographic.com/settings/' },
    URL, fetch: fetchStub,
    // No DOM here: the tag loader is stubbed so granting analytics or ads does not touch document.
    SLOP_CONSENT_LOADER: () => {},
  });
  const D = ctx.SlopData;
  const tx = fakeTx(D);
  D.store.transact = (fn) => fn(tx);
  D.store.get = (name, key) => tx.get(name, key);
  return { ctx, D, tx, calls, storage, C: ctx.SlopConsent, S: ctx.SlopConsentState, rates: D.rates, fetchStub };
}

test('rates are off by default and the consent record carries the new category', async () => {
  const p = await page();
  assert.deepEqual(plain(p.S.current()), { necessary: true, analytics: false, ads: false, rates: false });
  assert.equal(p.S.needsChoice(), true); // no record yet: the visitor has not chosen
});

test('switch off: updateRates stores nothing and fetches nothing', async () => {
  const p = await page();
  const r = await p.rates.updateRates({});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'consent_off');
  assert.match(r.message, /Turn on Exchange rates/);
  assert.equal(p.calls.length, 0);
  assert.equal(p.tx.tables.exchangeRates, undefined);
});

test('switch off: "Update on open" is ticked but still nothing fetches', async () => {
  const p = await page();
  p.tx.tables.settings[0].ratesUpdateOnOpen = true;
  const r = await p.rates.updateOnOpen({});
  assert.deepEqual({ ok: r.ok, skipped: r.value.skipped }, { ok: true, skipped: 'consent' });
  assert.equal(p.calls.length, 0);
});

test('other consent switches do not turn rates on', async () => {
  const p = await page();
  assert.equal(p.C.grant('analytics'), true);
  assert.equal(p.C.grant('ads'), true);
  assert.equal(p.S.current().rates, false);
  assert.equal((await p.rates.updateRates({})).code, 'consent_off');
  assert.equal(p.calls.length, 0);
});

test('switch on: one fetch of the ECB file, rows stored, and a switch off stops later fetches', async () => {
  const p = await page();
  assert.equal(p.C.grant('rates'), true);
  assert.equal(p.S.current().rates, true);
  const r = await p.rates.updateRates({});
  assert.equal(r.ok, true);
  assert.deepEqual(p.calls, ['https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata']);
  const sent = new URL(p.calls[0]);
  assert.equal(sent.protocol, 'https:');
  assert.equal(sent.host, 'data-api.ecb.europa.eu');
  assert.equal(sent.pathname, '/service/data/EXR/D..EUR.SP00.A');
  assert.equal(sent.searchParams.get('format'), 'csvdata');
  assert.equal(p.tx.tables.exchangeRates.length, 3);

  assert.equal(p.C.grant('analytics'), true);      // an unrelated change keeps rates on
  assert.equal(p.S.current().rates, true);
  assert.equal(p.C.setChoices({ ads: true }), true);
  assert.equal(p.S.current().rates, true);

  assert.equal(p.C.revoke('rates'), true);
  assert.equal(p.S.current().rates, false);
  const off = await p.rates.updateRates({ today: '2026-10-12' });
  assert.equal(off.code, 'consent_off');
  assert.equal(p.calls.length, 1);
});

test('"Update on open" runs only with both the box and the switch on', async () => {
  const p = await page();
  p.tx.tables.settings[0].ratesUpdateOnOpen = true;
  p.C.grant('rates');
  const r = await p.rates.updateOnOpen({});
  assert.equal(r.ok, true);
  assert.equal(r.value.date !== undefined, true);
  assert.equal(p.calls.length, 1);
});

test('the record stores the category and the blocked-storage path keeps everything off', async () => {
  const p = await page();
  p.C.grant('rates');
  assert.equal(JSON.parse(p.storage.getItem('slop-consent')).categories.rates, true);
  const blocked = await page();
  blocked.ctx.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(blocked.S.current().rates, false);
  assert.equal(blocked.C.grant('rates'), false);
  assert.equal((await blocked.rates.updateRates({})).code, 'consent_off');
  assert.equal(blocked.calls.length, 0);
});
