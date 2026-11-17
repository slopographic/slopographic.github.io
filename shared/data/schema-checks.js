// The checks the record table (schema-defs.js) names: errors for a stock movement, a journal entry and its currency
// fields, and each document's own rules. Pure: each takes a record and returns a list of errors in plain words.
// Load order: money.js, barcode.js, schema-checks.js, schema-defs.js, schema.js. Exposes window.SlopData.schemaChecks.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const say = (k, v) => { const I = g.SlopI18n; return I && I.t ? I.t(k, v) : k; };   // words: shared/i18n/ui/<code>/data.js, data2.js
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /** Errors for one stock movement: a receipt or return adds stock, a sale removes it, nothing is zero. */
  function movementError(reason, qty) {
    if (!Number.isSafeInteger(qty) || qty === 0) return say('ui.data.chk.qty_nonzero');
    if ((reason === 'receipt' || reason === 'return') && qty < 0) return say(reason === 'receipt' ? 'ui.data.chk.receipt_adds' : 'ui.data.chk.return_adds');
    if (reason === 'sale' && qty > 0) return say('ui.data.chk.sale_removes');
    return null;
  }

  /** Errors for a journal: each line has exactly one positive side and the base totals agree. */
  function journalErrors(lines) {
    if (!Array.isArray(lines)) return [];
    const out = [];
    let dr = 0, cr = 0;
    for (const l of lines) {
      if (!isObj(l) || !Number.isSafeInteger(l.debit) || !Number.isSafeInteger(l.credit)) continue;
      if ((l.debit > 0) === (l.credit > 0)) out.push(say('ui.data.chk.one_side'));
      dr += l.debit;
      cr += l.credit;
    }
    if (dr !== cr) out.push(say('ui.data.chk.unbalanced', { debit: String(dr), credit: String(cr) }));
    return out;
  }

  /** Errors for the currency fields of a journal entry: amountBase equals the base debits; a foreign entry's original amounts balance too. */
  function fxErrors(r) {
    if (!Array.isArray(r.lines)) return [];
    const sum = (k) => r.lines.reduce((s, l) => s + (isObj(l) && Number.isSafeInteger(l[k]) ? l[k] : 0), 0);
    const out = [];
    if (r.amountBase !== undefined && r.amountBase !== sum('debit')) out.push(say('ui.data.chk.amount_base'));
    if (!r.rateId) return out;
    if (r.amount !== sum('origDebit')) out.push(say('ui.data.chk.amount_orig'));
    if (sum('origDebit') !== sum('origCredit')) out.push(say('ui.data.chk.orig_unbalanced'));
    return out;
  }

  const invoiceCheck = (r, o = {}) => {
    if (r.status === 'draft') return r.number ? [say('ui.data.chk.draft_number')] : [];
    const out = [];
    if (!r.number && !o.deferNumber) out.push(say('ui.data.chk.invoice_number'));
    if (!r.lines || !r.lines.length) out.push(say('ui.data.chk.invoice_line'));
    return out;
  };
  const orderCheck = (r, o = {}) => (!r.number && !o.deferNumber ? [say('ui.data.chk.order_number')] : []);
  const purchaseCheck = (r, o = {}) => (!r.number && !o.deferNumber ? [say('ui.data.chk.purchase_number')] : []);
  const quoteCheck = (r, o = {}) => (!r.number && !o.deferNumber ? [say('ui.data.chk.quote_number')] : []);
  const countCheck = (r) => {
    const ids = (r.lines || []).map((l) => l && l.productId);
    const out = new Set(ids).size === ids.length ? [] : [say('ui.data.chk.count_once')];
    for (const l of r.lines || []) {
      if (isObj(l) && Number.isSafeInteger(l.counted) && Number.isSafeInteger(l.expected) && l.diff !== l.counted - l.expected) out.push(say('ui.data.chk.count_diff'));
    }
    return out;
  };
  /** Calendar events: timed ones need start and end (ms); all-day ones need startDay and endDay (inclusive). */
  const eventCheck = (r) => {
    if (r.allDay) {
      if (!r.startDay) return [say('ui.data.chk.allday_start')];
      if (r.endDay && r.endDay < r.startDay) return [say('ui.data.chk.end_day')];
      return [];
    }
    if (r.start === undefined) return [say('ui.data.chk.timed_start')];
    if (r.end !== undefined && r.end < r.start) return [say('ui.data.chk.end_time')];
    return [];
  };
  /** Tasks: a due time needs a due date, and a repeating task needs a due date to repeat from. */
  const taskCheck = (r) => {
    const out = [];
    if (r.dueTime && !r.due) out.push(say('ui.data.chk.due_time'));
    if (r.freq && r.freq !== 'none' && !r.due) out.push(say('ui.data.chk.repeat_due'));
    return out;
  };
  const rateCheck = (r) => (r.base && r.base === r.quote ? [say('ui.data.chk.rate_same')] : []);

  ns.schemaChecks = { movementError, journalErrors, fxErrors, invoiceCheck, orderCheck, purchaseCheck, quoteCheck, countCheck, eventCheck, taskCheck, rateCheck };
})(typeof window !== 'undefined' ? window : globalThis);
