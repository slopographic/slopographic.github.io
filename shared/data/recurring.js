// Repeating invoices. A schedule (`schedules`) holds what to bill (customer, currency, notes, lines) and when: every `every`
// weeks or months from nextDate. makeDue(today) makes a draft invoice for every period that has come round (catching up
// on missed ones, at most CATCH_UP per schedule at a time) and moves each schedule on, all in one transaction, so a period
// is never billed twice. Drafts are checked and issued in Slop Invoices as usual. The date maths is pure.
(function (g) {
  'use strict';
  const ns = (g.SlopData = g.SlopData || {});
  const ok = (v) => ns.result.ok(v), fail = (code, msg) => ns.result.fail(code, msg);
  const CATCH_UP = 12;
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const parse = (s) => new Date(`${s}T00:00:00Z`);

  /** Pure: the date `every` weeks or months after date. Months keep anchorDay (default: date's day), clamped to the
   *  month's last day, so the 31st runs 31 Jan, 28 Feb, 31 Mar. */
  function step(date, every, unit, anchorDay) {
    const d = parse(date);
    if (unit === 'week') { d.setUTCDate(d.getUTCDate() + 7 * every); return iso(d); }
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + every, want = anchorDay || d.getUTCDate();
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return iso(new Date(Date.UTC(y, m, Math.min(want, last))));
  }

  /** "every month", "every 2 weeks", in the chosen language (shared/i18n/ui/<code>/calendar.js: plural forms by every). */
  const describe = (s) => (g.SlopI18n ? g.SlopI18n.t(s.unit === 'week' ? 'ui.recur.every_weeks' : 'ui.recur.every_months', { n: s.every }) : `${s.every} ${s.unit}`);

  /** Pure: the dates of the periods due on or before today, oldest first (at most CATCH_UP), and the next date after them. */
  function dueDates(s, today) {
    const dates = [];
    let next = s.nextDate;
    while (s.active !== false && next <= today && (!s.endDate || next <= s.endDate) && dates.length < CATCH_UP) {
      dates.push(next);
      next = step(next, s.every, s.unit, s.anchorDay);
    }
    return { dates, next };
  }

  /** Makes a schedule from an invoice (its customer, currency, notes and lines). opts: { every, unit, start (the first new
   *  invoice date), endDate, dueDays }. */
  function fromInvoice(invoiceId, { every = 1, unit = 'month', start, endDate, dueDays } = {}) {
    return ns.store.transact(async (tx) => {
      const r = await tx.get('invoices', invoiceId);
      if (!r.ok) return r;
      if (!r.value || r.value.deletedAt) return fail('not_found', `no invoice ${invoiceId}`);
      const inv = r.value;
      const rec = { customerId: inv.customerId, currency: inv.currency, notes: inv.notes, lines: inv.lines.map((l) => ({ ...l })),
        every, unit, nextDate: start, anchorDay: unit === 'month' ? Number(String(start).slice(8, 10)) : undefined, sourceInvoiceId: inv.id };
      if (endDate) rec.endDate = endDate;
      if (dueDays !== undefined) rec.dueDays = dueDays;
      return tx.put('schedules', rec);
    });
  }

  /** Makes the draft invoices that are due on or before today, for every active schedule (or only scheduleId), and moves
   *  the schedules on. Resolves to { made: [invoice], schedules: number }. */
  function makeDue(today, { scheduleId } = {}) {
    return ns.store.transact(async (tx) => {
      const all = await tx.list('schedules');
      if (!all.ok) return all;
      const made = [];
      let touched = 0;
      for (const s of all.value.filter((x) => !scheduleId || x.id === scheduleId)) {
        const { dates, next } = dueDates(s, today);
        if (!dates.length) continue;
        let last = s.lastInvoiceId;
        for (const date of dates) {
          const doc = { customerId: s.customerId, currency: s.currency, notes: s.notes, lines: s.lines.map((l) => ({ ...l })), date, scheduleId: s.id };
          if (s.dueDays !== undefined) doc.dueDate = ns.ledger.addDays(date, s.dueDays);
          const inv = await tx.put('invoices', doc);
          if (!inv.ok) return inv;
          made.push(inv.value);
          last = inv.value.id;
        }
        const ended = !!s.endDate && next > s.endDate;
        // an ended schedule keeps its last period as nextDate (the end date may not come before it) and stops
        const w = await tx.put('schedules', { ...s, nextDate: ended ? dates[dates.length - 1] : next, active: ended ? false : s.active, made: (s.made || 0) + dates.length, lastInvoiceId: last });
        if (!w.ok) return w;
        touched++;
      }
      return ok({ made, schedules: touched });
    });
  }

  /** Pure: the active schedules with a period due on or before today. */
  const due = (schedules, today) => schedules.filter((s) => dueDates(s, today).dates.length > 0);

  ns.recurring = { CATCH_UP, step, describe, dueDates, due, fromInvoice, makeDue };
})(typeof window !== 'undefined' ? window : globalThis);
