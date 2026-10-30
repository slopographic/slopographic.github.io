// Double-entry ledger. Posted entries are immutable: a correction is a reversing entry. Lines are in the base
// currency (debit, credit). A foreign-currency entry also keeps its original amounts (origDebit, origCredit,
// amount, currency) and the rate row it used (rateId, rate); see fx.js. The pure helpers (validateEntry,
// summarize, reverseLines) need no storage. postIn/reverseIn run inside a store transaction.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const { ok, fail } = ns.result;
  const TYPE_SIDE = { asset: 'debit', expense: 'debit', liability: 'credit', equity: 'credit', revenue: 'credit' };

  /** Local calendar date as YYYY-MM-DD. */
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** A YYYY-MM-DD date moved by n whole days (negative goes back). */
  function addDays(date, n) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(n || 0));
    return d.toISOString().slice(0, 10);
  }

  /** Errors for an entry before posting: shape, positive whole amounts, balance and, when `accounts` is given, known codes. */
  function validateEntry(entry, accounts) {
    const errors = ns.schema.prepare('journal', entry, { skipKey: true }).errors.slice();
    if (accounts && entry && Array.isArray(entry.lines)) {
      const known = new Set(accounts.map((a) => a.code));
      for (const l of entry.lines) if (l && !known.has(l.account)) errors.push({ field: 'lines', message: say('ui.data.led.unknown', { code: String(l.account) }) });
    }
    return errors;
  }

  /** The same entry with each line's sides swapped (original amounts too, when the line has them). */
  function reverseLines(lines) {
    return lines.map((l) => {
      const r = { account: l.account, debit: l.credit, credit: l.debit };
      if (l.origDebit !== undefined) { r.origDebit = l.origCredit; r.origCredit = l.origDebit; }
      return r;
    });
  }

  /** Pure trial balance: per-account totals and balance (normal side) in base, the checks that base totals agree,
   *  and the foreign totals per currency (original amounts, reported apart from the base totals). */
  function summarize(entries, accounts) {
    const rows = new Map(accounts.map((a) => [a.code, { code: a.code, name: a.name, type: a.type, debit: 0, credit: 0 }]));
    const errors = [];
    const foreign = new Map();
    let debit = 0, credit = 0;
    for (const e of entries) {
      let ed = 0, ec = 0, od = 0, oc = 0;
      for (const l of e.lines || []) {
        ed += l.debit;
        ec += l.credit;
        od += l.origDebit || 0;
        oc += l.origCredit || 0;
        const row = rows.get(l.account);
        if (row) { row.debit += l.debit; row.credit += l.credit; } else errors.push(say('ui.data.led.entry_unknown', { id: String(e.id), code: String(l.account) }));
      }
      if (ed !== ec) errors.push(say('ui.data.led.entry_unbalanced', { id: String(e.id), debit: String(ed), credit: String(ec) }));
      debit += ed;
      credit += ec;
      if (e.rateId) {
        if (od !== oc) errors.push(say('ui.data.led.entry_unbalanced_fx', { id: String(e.id), currency: e.currency, debit: String(od), credit: String(oc) }));
        const f = foreign.get(e.currency) || { currency: e.currency, debit: 0, credit: 0 };
        f.debit += od;
        f.credit += oc;
        foreign.set(e.currency, f);
      }
    }
    if (debit !== credit) errors.push(say('ui.data.led.differ', { off: String(debit - credit) }));
    const list = [...rows.values()].map((r) => ({ ...r, balance: TYPE_SIDE[r.type] === 'debit' ? r.debit - r.credit : r.credit - r.debit }));
    const fx = [...foreign.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1)).map((f) => ({ ...f, balanced: f.debit === f.credit }));
    return { rows: list, debit, credit, balanced: errors.length === 0, errors, foreign: fx };
  }

  /** Posts an entry inside a transaction. A foreign currency is converted first (see fx.prepareIn). Rejects unknown
   *  accounts and a source that was already posted. Returns the stored journal row. */
  async function postIn(tx, input) {
    const accts = await tx.list('accounts');
    if (!accts.ok) return accts;
    const prep = await ns.fx.prepareIn(tx, input || {});
    if (!prep.ok) return prep;
    const e = prep.value;
    const errors = validateEntry(e, accts.value);
    if (errors.length) return tx.fail(fail('invalid', ns.schema.errorText(errors), { errors }));
    const dup = await tx.list('journal', { index: 'source', value: e.source, includeDeleted: true });
    if (!dup.ok) return dup;
    if (dup.value.length) return tx.fail(fail('duplicate_source', say('ui.data.led.posted', { source: e.source })));
    return tx.put('journal', {
      date: e.date, memo: e.memo, source: e.source, lines: e.lines, reverses: e.reverses,
      currency: e.currency, amount: e.amount, amountBase: e.amountBase, rateId: e.rateId, rate: e.rate,
    }, { posting: true });
  }

  /** Reverses a posted entry inside a transaction. A foreign entry reverses at its original rate. Reversing the same entry twice is rejected by the source rule. */
  async function reverseIn(tx, id, opts = {}) {
    const j = await tx.get('journal', id);
    if (!j.ok) return j;
    if (!j.value) return tx.fail(fail('not_found', say('ui.data.led.no_entry', { id: String(id) })));
    const o = j.value;
    const fx = o.rateId ? { rateId: o.rateId, rate: o.rate, amount: o.amount, amountBase: o.amountBase } : {};
    return postIn(tx, {
      date: opts.date || today(), memo: opts.memo || `Reversal of ${o.memo || id}`,
      source: `reversal:${id}`, reverses: id, lines: reverseLines(o.lines), currency: o.currency, ...fx,
    });
  }

  /** Posts one balanced entry. Example: { date, memo, source: 'manual:42', currency: 'EUR', lines: [{ account: '1000', debit: 500 }, { account: '4000', credit: 500 }] }
   *  Without currency (or with the base currency) the lines are base amounts. */
  const postJournal = (input) => ns.store.transact((tx) => postIn(tx, input));
  const reverseJournal = (id, opts) => ns.store.transact((tx) => reverseIn(tx, id, opts));

  /** Trial balance of the whole ledger. Fails with code 'unbalanced' (and the summary) when totals disagree. */
  function trialBalance() {
    return ns.store.readAll(async (tx) => {
      const a = await tx.list('accounts');
      if (!a.ok) return a;
      const j = await tx.list('journal');
      if (!j.ok) return j;
      const s = summarize(j.value, a.value);
      return s.balanced ? ok(s) : Object.assign(fail('unbalanced', s.errors[0], { errors: s.errors }), { summary: s });
    });
  }

  ns.ledger = { addDays, TYPE_SIDE, today, validateEntry, reverseLines, summarize, postIn, reverseIn, postJournal, reverseJournal, trialBalance };
})(typeof window !== 'undefined' ? window : globalThis);
