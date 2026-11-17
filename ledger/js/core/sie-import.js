// Slop Ledger: Import SIE, the pure part. An SIE file (read by shared/finance/sie.js into the shared ledger model) becomes
// a plan: the accounts to add, rename or map onto the chart, one opening-balance entry and one journal entry per voucher,
// and what is skipped and why. Nothing is written here; ui/sie.js shows the plan, asks, and posts it through SlopData.
// The data schema is not changed: accounts keep four-digit codes and one type, entries are ordinary balanced journal
// entries (source sie:<file key>:<voucher>, so a second import of the same file adds nothing).
// Exposes SlopLedger.sieImport:
//   mapAccounts(model, chart)            -> [{ sie, name, type, code, action, note }]; action: 'add' (a new account),
//                                           'same' (the chart has it), 'rename' (the chart has it under another name),
//                                           'map' (its code is taken by another type, or it is not four digits: a new
//                                           code) or 'merge' (a sub-account, its lines go to the four-digit parent)
//   plan(model, { chart, sources, digits, mapping }) -> { accounts, entries, skipped, key, currency }
//                                           mapping: { sieNumber: code } the person changed; sources: the journal's
//                                           sources (a Set); digits: the currency's minor digits (2 for SEK)
(function (g) {
  'use strict';
  const NS = (g.SlopLedger = g.SlopLedger || {});
  const TYPE_WORD = { asset: 'asset', liability: 'liability', equity: 'equity', revenue: 'revenue', expense: 'expense' };

  /** A free four-digit code near `want` (same first digit first, then any), not in `used`. */
  function freeCode(want, used) {
    const start = Number(String(want).slice(0, 4).padEnd(4, '0')) || 1000;
    const lo = Math.floor(start / 1000) * 1000;
    for (let c = start + 1; c < lo + 1000; c++) if (!used.has(String(c))) return String(c);
    for (let c = lo; c < start; c++) if (!used.has(String(c))) return String(c);
    for (let c = 1000; c <= 9999; c++) if (!used.has(String(c))) return String(c);
    return null;
  }

  function mapAccounts(model, chart, mapping = {}) {
    const here = new Map((chart || []).map((a) => [a.code, a]));
    const inFile = new Map(model.accounts.map((a) => [a.number, a]));
    const used = new Set([...here.keys(), ...model.accounts.map((a) => a.number).filter((n) => /^\d{4}$/.test(n))]);
    const out = [];
    const typeAt = (code) => (here.get(code) || {}).type || (inFile.get(code) || {}).type;
    for (const a of model.accounts) {
      const row = { sie: a.number, name: a.name || `Account ${a.number}`, type: TYPE_WORD[a.type] || 'expense' };   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      const forced = mapping[a.number];
      if (forced && /^\d{4}$/.test(forced)) {
        const h = here.get(forced);
        row.code = forced;
        row.action = h ? (h.type === row.type ? 'same' : 'conflict') : forced === a.number ? 'add' : 'map';
        if (row.action === 'conflict') row.note = `${forced} is ${h.type === 'asset' || h.type === 'expense' || h.type === 'equity' ? 'an' : 'a'} ${h.type} account here (${h.name}); pick a free code.`;
        out.push(row);
        continue;
      }
      if (/^\d{4}$/.test(a.number)) {
        const h = here.get(a.number);
        if (!h) { row.code = a.number; row.action = 'add'; }
        else if (h.type === row.type) { row.code = a.number; row.action = h.name === row.name ? 'same' : 'rename'; row.here = h.name; }
        else {
          row.code = freeCode(a.number, used);
          used.add(row.code);
          row.action = 'map';
          row.note = `${a.number} is ${h.name} (${h.type}) here, so this ${row.type} account gets ${row.code}.`;
        }
      } else {
        const parent = String(a.number).slice(0, 4).padEnd(4, '0');
        if (/^\d+$/.test(a.number) && a.number.length > 4 && typeAt(parent) === row.type) {
          row.code = parent; row.action = 'merge';
          row.note = `${a.number} has more than four digits; its lines go to ${parent}.`;
        } else {
          row.code = /^\d+$/.test(a.number) && !used.has(parent) ? parent : freeCode(parent, used);
          used.add(row.code);
          row.action = 'map';
          row.note = `${a.number} is not a four-digit code, so it gets ${row.code}.`;
        }
      }
      out.push(row);
    }
    return out;
  }

  const minor = (amount, digits) => Math.round(Math.abs(amount) * 10 ** digits);
  const sideOf = (amount, digits) => (amount > 0 ? { debit: minor(amount, digits), credit: 0 } : { debit: 0, credit: minor(amount, digits) });
  const keyOf = (m) => String(m.orgNo || m.companyId || m.company || 'file').replace(/[^\w.-]+/g, '-').slice(0, 60) + (m.years[0] ? `:${m.years[0].from}` : '');

  function plan(model, o = {}) {
    const digits = o.digits === undefined ? 2 : o.digits;
    const sources = o.sources || new Set();
    const accounts = mapAccounts(model, o.chart || [], o.mapping || {});
    const codeOf = new Map(accounts.map((a) => [a.sie, a.code]));
    const key = keyOf(model);
    const entries = [], skipped = [];
    const lineOf = (account, amount) => ({ account: codeOf.get(account), ...sideOf(amount, digits) });
    const balanced = (lines) => lines.reduce((t, l) => t + l.debit - l.credit, 0);
    const bad = accounts.filter((a) => a.action === 'conflict');
    // opening balances of the current year (#IB 0), one entry on the first day of the year
    const ib = model.openingBalances.filter((b) => b.year === 0 && minor(b.amount, digits) > 0);
    if (ib.length) {
      const date = (model.years.find((y) => y.index === 0) || {}).from || (model.vouchers.find((v) => v.date) || {}).date || model.generated;
      const merged = new Map();
      for (const b of ib) { const c = codeOf.get(b.account); merged.set(c, (merged.get(c) || 0) + Math.round(b.amount * 10 ** digits)); }
      const lines = [...merged].filter(([, v]) => v).map(([account, v]) => ({ account, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 }));
      const source = `sie:${key}:ib`;
      const off = balanced(lines);
      if (sources.has(source)) skipped.push({ what: 'Opening balances', why: 'already imported' });   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      else if (!date) skipped.push({ what: 'Opening balances', why: 'the file gives no date for the start of the year' });   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      else if (off) skipped.push({ what: 'Opening balances', why: `they do not balance (off by ${(off / 10 ** digits).toFixed(digits)})` });   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      else if (lines.length < 2) skipped.push({ what: 'Opening balances', why: 'they come to nothing on the accounts here (sub-accounts joined to their parent cancel out)' });   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      else entries.push({ what: 'Opening balances', input: { date, memo: `Opening balances (SIE, ${model.company || 'imported file'})`.slice(0, 300), currency: model.currency, source, lines } });   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
    }
    model.vouchers.forEach((v, i) => {
      const what = `Voucher ${`${v.series}${v.number}`.trim() || `#${i + 1}`}${v.date ? ` (${v.date})` : ''}`;   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      const source = `sie:${key}:${v.series || '-'}:${v.number || `#${i + 1}`}`.slice(0, 200);
      const lines = v.lines.filter((l) => minor(l.amount, digits) > 0).map((l) => lineOf(l.account, l.amount));
      if (sources.has(source)) { skipped.push({ what, why: 'already imported' }); return; }   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      if (!v.date) { skipped.push({ what, why: 'it has no date' }); return; }   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      if (lines.length < 2) { skipped.push({ what, why: 'it has fewer than two lines with an amount' }); return; }   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      if (lines.some((l) => bad.some((a) => a.code === l.account))) { skipped.push({ what, why: 'one of its accounts has no free code here' }); return; }   // i18n-ignore: the SIE plan's words: compared as names and stored in memos; shown through say() in ui/sie.js
      const off = balanced(lines);
      if (off) { skipped.push({ what, why: `it does not balance (off by ${(off / 10 ** digits).toFixed(digits)})` }); return; }
      const memo = [`${v.series}${v.number}`.trim(), v.text].filter(Boolean).join(' ').slice(0, 300);
      entries.push({ what, input: { date: v.date, memo: memo || undefined, currency: model.currency, source, lines } });
    });
    return { accounts, entries, skipped, key, currency: model.currency };
  }

  NS.sieImport = { mapAccounts, plan, freeCode };
})(typeof window !== 'undefined' ? window : globalThis);
