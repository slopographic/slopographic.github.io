// Exchange rates and foreign-currency postings. A rate row (collection exchangeRates) says: 1 unit of base
// = rate / 1e6 units of quote, on a date. Rows are immutable; a correction is a new dated row.
// A posting in another currency keeps its original amounts and currency, and stores its base amounts at the
// rate on the posting date plus the row id it used. Old postings never change.
// Pure helpers first, then the store hooks that store.js and ledger.js call, then the public rateOn/addRate.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;
  const ONE = 1000000; // the rate scale: 1.0000 is 1000000
  const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
  const scale = (amount, rate) => ns.money.mulDiv(amount, rate, ONE);
  const invert = (rate) => ns.money.mulDiv(ONE, ONE, rate);
  const sumOf = (lines, k) => (Array.isArray(lines) ? lines.reduce((s, l) => s + ((l && l[k]) || 0), 0) : 0);

  /** Pure: the rate for base -> quote on `date`, from a list of rows. Latest date first, then latest created.
   *  A direct row wins; a reversed row is used inverted when there is no direct one. Null when neither exists. */
  function pickRate(rows, base, quote, date) {
    const latest = (a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : (a.date < b.date ? 1 : -1));
    const direct = rows.filter((r) => r.base === base && r.quote === quote && r.date <= date).sort(latest);
    if (direct.length) return { row: direct[0], rate: direct[0].rate, inverted: false };
    const back = rows.filter((r) => r.base === quote && r.quote === base && r.date <= date).sort(latest);
    if (back.length) return { row: back[0], rate: invert(back[0].rate), inverted: true };
    return null;
  }

  /** Pure: converts original lines ({account, debit, credit}, one side each) to base at `rate`. Each amount rounds
   *  half away from zero. The rounding difference goes to the largest line on the short side, so base balances. */
  function convertLines(lines, rate) {
    const out = lines.map((l) => ({
      account: l.account,
      debit: scale(l.debit || 0, rate), credit: scale(l.credit || 0, rate),
      origDebit: l.debit || 0, origCredit: l.credit || 0,
    }));
    const diff = sumOf(out, 'debit') - sumOf(out, 'credit');
    if (diff !== 0) {
      const side = diff > 0 ? 'credit' : 'debit';
      const orig = side === 'credit' ? 'origCredit' : 'origDebit';
      let best = null;
      for (const l of out) if (l[orig] > 0 && (!best || l[orig] > best[orig])) best = l;
      if (best) best[side] += Math.abs(diff);
    }
    return { lines: out, amount: sumOf(out, 'origDebit'), amountBase: sumOf(out, 'debit') };
  }

  /** Base currency from settings. USD when there is no settings record yet. */
  async function baseIn(tx) {
    const s = await tx.get('settings', 'main');
    if (!s.ok) return s;
    return ok((s.value && (s.value.defaultCurrency || s.value.currency)) || 'USD'); // 'currency' is the v1 name
  }

  /** The rate to use for base <- ... inside a transaction. Same currency is 1 (no row). Fails with 'no_rate' when none exists. */
  async function rateIn(tx, base, quote, date) {
    if (base === quote) return ok({ id: null, rate: ONE, inverted: false });
    const rows = await tx.list('exchangeRates');
    if (!rows.ok) return rows;
    const hit = pickRate(rows.value, base, quote, date);
    if (!hit) return fail('no_rate', say('ui.data.fx.no_rate', { base, quote, date: String(date) }));
    return ok({ id: hit.row.id, rate: hit.rate, inverted: hit.inverted });
  }

  /** Journal input in the base currency, or converted from a foreign currency. A rateId means the lines are
   *  already in base (reversals keep the original rate), so they are only labelled. */
  async function prepareIn(tx, input) {
    const b = await baseIn(tx);
    if (!b.ok) return b;
    const currency = String(input.currency || b.value).toUpperCase();
    if (input.rateId) return ok({ ...input, currency });
    if (currency === b.value) {
      return ok({ ...input, currency, amount: sumOf(input.lines, 'debit'), amountBase: sumOf(input.lines, 'debit') });
    }
    const r = await rateIn(tx, currency, b.value, input.date);
    if (!r.ok) return r;
    const c = convertLines(input.lines || [], r.value.rate);
    return ok({ ...input, currency, lines: c.lines, amount: c.amount, amountBase: c.amountBase, rateId: r.value.id, rate: r.value.rate });
  }

  /** Store hook: a new document takes the default currency unless one was chosen. */
  async function docDefaults(api, d, prev, input) {
    if (!d.docCurrency || prev || input.currency) return {};
    const b = await baseIn(api);
    return b.ok ? { currency: b.value } : {};
  }

  /** Store hook: the base currency cannot change once any entry is posted (old postings would mix bases). */
  async function lockCheck(api, name, prev, value) {
    if (name !== 'settings' || !prev || prev.defaultCurrency === value.defaultCurrency) return ok(true);
    const j = await api.list('journal', { limit: 1, includeDeleted: true });
    if (!j.ok) return j;
    return j.value.length ? fail('base_locked', say('ui.data.fx.base_locked')) : ok(true);
  }

  /** The rate on a date, read in its own transaction. Returns { id, rate, inverted, base, quote }. */
  function rateOn(base, quote, date) {
    const b = String(base || '').toUpperCase(), q = String(quote || '').toUpperCase();
    if (!ns.locale.isCurrency(b) || !ns.locale.isCurrency(q)) return Promise.resolve(fail('invalid', say('ui.data.fx.iso')));
    if (!DATE_RX.test(String(date || ''))) return Promise.resolve(fail('invalid', say('ui.data.fx.date')));
    return ns.store.readAll(async (tx) => {
      const r = await rateIn(tx, b, q, date);
      return r.ok ? ok({ ...r.value, base: b, quote: q, date }) : r;
    });
  }

  /** Adds one dated rate row. rate is the scaled integer (1.0842 is 1084200). Returns the stored row. */
  function addRate(input) {
    const { base, quote, date, rate, source = 'manual', note } = input || {};
    return ns.store.put('exchangeRates', { base, quote, date, rate, source, note });
  }

  ns.fx = {
    ONE, scale, invert, pickRate, convertLines, prepareIn, rateIn, rateOn, addRate, baseIn, docDefaults, lockCheck,
  };
})(typeof window !== 'undefined' ? window : globalThis);
