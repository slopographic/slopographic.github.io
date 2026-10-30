// Opt-in ECB reference rates. Nothing is fetched unless the 'rates' consent category is on, and the check
// runs on every call. Nothing runs in the background: updateRates() is started by the Settings button, and
// updateOnOpen() only runs when the person also ticked "Update on open" (a setting in the record).
// The source is the ECB data API (SDMX, CSV, daily EUR reference rates). It sends CORS headers, unlike the
// old XML file. The CSV is read by hand and never evaluated. Rows are EUR-based, one per currency, source 'ecb'.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;
  const ECB_URL = 'https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata';
  const ECB_HOST = 'data-api.ecb.europa.eu';
  const ECB_BASE = 'EUR';

  /** True when the visitor has turned on the 'rates' category in Settings. Missing consent state means off. */
  function consentAllowed() {
    try { return !!(g.SlopConsentState && g.SlopConsentState.current().rates); } catch (e) { return false; }
  }

  /** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes, CRLF and LF. Blank lines are dropped. */
  function csvRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch !== '"') cell += ch;
        else if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  }

  /** Pure: CSV text from the ECB data API to { date (the newest ECB reference day), rates: [{ quote, rate }] },
   *  with rate scaled by 1e6. Rows with an empty OBS_VALUE are skipped. The API returns the last observation of
   *  every series, so discontinued currencies carry old dates: only rows on the newest day are kept. */
  function parseEcb(text) {
    if (typeof text !== 'string' || !text.trim()) return fail('invalid', say('ui.data.ecb.empty'));
    const rows = csvRows(text.replace(/^﻿/, ''));
    const [head, ...body] = rows;
    const col = (name) => (head ? head.findIndex((h) => h.trim() === name) : -1);
    const iCur = col('CURRENCY');
    const iTime = col('TIME_PERIOD');
    const iObs = col('OBS_VALUE');
    if (iCur < 0 || iTime < 0 || iObs < 0) return fail('invalid', say('ui.data.ecb.columns'));
    const obs = [];
    for (const r of body) {
      const value = (r[iObs] || '').trim();
      if (!value) continue;
      const quote = (r[iCur] || '').trim();
      const date = (r[iTime] || '').trim();
      const rate = ns.locale.parseRate(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('invalid', say('ui.data.ecb.no_date'));
      if (!ns.locale.isCurrency(quote) || rate === null) return fail('invalid', say('ui.data.ecb.bad_rate', { quote }));
      obs.push({ quote, date, rate });
    }
    if (!obs.length) return fail('invalid', say('ui.data.ecb.no_rates'));
    const date = obs.map((o) => o.date).sort().pop();
    const rates = obs.filter((o) => o.date === date).map(({ quote, rate }) => ({ quote, rate }));
    return ok({ date, rates });
  }

  /** Stores one row per quote for `today` inside one transaction. A same-day row with the same rate is left alone. */
  function storeToday(parsed, today) {
    return ns.store.transact(async (tx) => {
      const all = await tx.list('exchangeRates');
      if (!all.ok) return all;
      const out = { date: today, referenceDate: parsed.date, added: [], unchanged: [] };
      for (const { quote, rate } of parsed.rates) {
        const hit = ns.fx.pickRate(all.value, ECB_BASE, quote, today);
        if (hit && !hit.inverted && hit.row.date === today && hit.row.source === 'ecb' && hit.rate === rate) { out.unchanged.push(quote); continue; }
        const prev = hit && !hit.inverted ? hit.rate : null;
        const w = await tx.put('exchangeRates', { base: ECB_BASE, quote, date: today, rate, source: 'ecb', note: `ECB reference ${parsed.date}` });   // i18n-ignore: stored with the rate
        if (!w.ok) return w;
        out.added.push({ quote, rate, previous: prev });
      }
      return ok(out);
    });
  }

  /** Downloads and stores the ECB rates. opts (for tests): fetch, allowed, today.
   *  Nothing is fetched while consent is off. A failed download stores nothing and says so. */
  async function updateRates(opts = {}) {
    if (!(opts.allowed || consentAllowed)()) return fail('consent_off', say('ui.data.ecb.consent'));
    const f = opts.fetch || g.fetch;
    if (typeof f !== 'function') return fail('unavailable', say('ui.data.ecb.no_fetch'));
    let text;
    try {
      const res = await f(ECB_URL, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res || !res.ok) return fail('http', (res ? say('ui.data.ecb.http', { status: String(res.status) }) : say('ui.data.ecb.no_answer')));
      text = await res.text();
    } catch (e) {
      return fail('network', say('ui.data.ecb.network'));
    }
    const parsed = parseEcb(text);
    if (!parsed.ok) return fail(parsed.code, say('ui.data.ecb.parse', { message: parsed.message }));
    return storeToday(parsed.value, opts.today || ns.ledger.today());
  }

  /** Runs updateRates() only when the person ticked "Update on open" and the rates category is on. */
  async function updateOnOpen(opts = {}) {
    const s = await ns.store.get('settings', 'main');
    if (!s.ok || !s.value || !s.value.ratesUpdateOnOpen) return ok({ skipped: 'off' });
    if (!(opts.allowed || consentAllowed)()) return ok({ skipped: 'consent' });
    return updateRates(opts);
  }

  ns.rates = { ECB_URL, ECB_HOST, ECB_BASE, consentAllowed, parseEcb, storeToday, updateRates, updateOnOpen };
})(typeof window !== 'undefined' ? window : globalThis);
