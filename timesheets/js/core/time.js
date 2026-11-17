// Slop Timesheets, the pure parts: typed durations, periods, the list filter, the totals and the CSV. No DOM, no storage.
// Classic script; exposes window.SlopTimesheets.core (and module.exports for the Node tests).
(function (g) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const day = (s) => new Date(`${s}T00:00:00Z`);

  // The words for hours and minutes in every language the site ships (i18n-ignore: parser data, not shown), the one
  // source of truth for parseDuration. A plain table here, not the i18n tables: the parser is pure (Node tests, no
  // SlopI18n), and what a person types must not depend on the UI language or on whether that language's timesheets
  // tables have shipped yet ("90м" works in a page that still reads English). No word is an hour in one language and a
  // minute in another. Written lower case and without Latin accents (fold() strips them from the input too).
  const UNITS = {
    h: 'h hr hrs hour hours hora horas heure heures std stunde stunden ora ore t tim timme timmar u uur ure g godz godzina godziny godzin '   // i18n-ignore
      + 'ч час часа часов г год година години годин sa saat j jam gio saa ሰዓት awa sa\'a wakati elekere ihora amahora iyure iiyure '
      + 'س ساعة ساعات ساعه ש ש׳ ש\' שעה שעות घंटा घंटे घं 小时 小時 時 時間 시간',
    m: 'm min mins minute minutes mn minuto minutos minuti minuten minut minuter minuut minuta minuty м мин минута минуты минут хв хвилина '   // i18n-ignore
      + 'хвилини хвилин dk dakika mnt menit p phut dakika ደቂቃ minti mintuna iseju nkeji minit umzuzu imizuzu د دقيقة دقائق دقيقه ד ד׳ ד\' '
      + 'דקה דקות मिनट मि 分 分钟 分鐘 분',
  };
  /** Arabic-Indic, Persian and Devanagari digits as ASCII (full-width ones NFKC already maps). */
  const DIGITS = /[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f]/g;
  const ascii = (d) => { const c = d.charCodeAt(0); return String(c - (c >= 0x966 ? 0x966 : c >= 0x6f0 ? 0x6f0 : 0x660)); };
  /** Lower case, digits as ASCII, the Arabic decimal sign as a dot, Latin accents and Arabic vowel marks dropped. */
  const fold = (s) => String(s).normalize('NFKC').toLowerCase().replace(DIGITS, ascii).replace(/\u066b/g, '.')
    .normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f]/g, '').normalize('NFC');
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /** One unit as a regex part: any of its words (longest first), an optional dot after an abbreviation ("Std.", "мин."). */
  const unit = (list) => `(?:${[...new Set(fold(list).split(' '))].sort((a, b) => b.length - a.length).map(esc).join('|')})\\.?`;
  const H = unit(UNITS.h), M = unit(UNITS.m);
  const RE = {
    hours: new RegExp(`^(\\d{1,2}(?:\\.\\d{1,2})?)\\s*(?:${H})?$`, 'u'),
    minutes: new RegExp(`^(\\d{1,4})\\s*${M}$`, 'u'),
    both: new RegExp(`^(\\d{1,2})\\s*${H}\\s*(\\d{1,2})\\s*(?:${M})?$`, 'u'),
  };

  /** Minutes from typed text, or null: "1:30", "1.5" or "1,5" (hours), "90m", "2h", "2h 15m", "2 h 15 min", and the same
   *  with any shipped language's unit words ("90 мин", "2 Std. 15 Min.", "1時間30分", "١٫٥ ساعة"). Case and spaces do
   *  not matter. 1 to 1440. */
  function parseDuration(text) {
    const t = fold(text ?? '').trim().replace(/\s+/g, ' ').replace(',', '.');
    let m = null, x;
    if ((x = /^(\d{1,2}):([0-5]\d)$/.exec(t))) m = Number(x[1]) * 60 + Number(x[2]);
    else if ((x = RE.hours.exec(t))) m = Math.round(Number(x[1]) * 60);
    else if ((x = RE.minutes.exec(t))) m = Number(x[1]);
    else if ((x = RE.both.exec(t))) m = Number(x[1]) * 60 + Number(x[2]);
    return m !== null && m >= 1 && m <= 1440 ? m : null;
  }

  /** Minutes as "1:30" (hours and minutes). */
  const hm = (min) => `${Math.floor(min / 60)}:${pad(min % 60)}`;

  /** The first and last day (inclusive, YYYY-MM-DD) of a period around today: week (Monday to Sunday), last week, month,
   *  last month. Null for 'all'. */
  function periodRange(period, today) {
    const t = day(today);
    if (period === 'week' || period === 'lastweek') {
      const mon = new Date(t);
      mon.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) - (period === 'lastweek' ? 7 : 0));
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 6);
      return [iso(mon), iso(sun)];
    }
    if (period === 'month' || period === 'lastmonth') {
      const y = t.getUTCFullYear(), m = t.getUTCMonth() - (period === 'lastmonth' ? 1 : 0);
      return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
    }
    return null;
  }

  /** The rows that match: period, customerId ('' = any), state (all, open = billable and not billed, billed, internal =
   *  not billable) and search (description, project, customer name). Rows carry state and customerName. Newest first. */
  function filter(rows, { period = 'all', customerId = '', state = 'all', search = '' } = {}, today = '') {
    const range = periodRange(period, today), q = String(search).trim().toLowerCase();
    return rows.filter((r) => (!range || (r.date >= range[0] && r.date <= range[1]))
      && (!customerId || r.customerId === customerId) && (state === 'all' || r.state === state)
      && (!q || [r.description, r.project, r.customerName].some((s) => String(s || '').toLowerCase().includes(q))))
      .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
  }

  /** Totals of rows: count, minutes, billable minutes, and the billable amount per currency ({ USD: 12000 }). amountOf(row)
   *  prices one row (SlopData.timesheets.amountOf). */
  function summary(rows, amountOf) {
    const out = { count: rows.length, minutes: 0, billableMinutes: 0, amounts: {} };
    for (const r of rows) {
      out.minutes += r.minutes;
      if (!r.billable) continue;
      out.billableMinutes += r.minutes;
      out.amounts[r.currency] = (out.amounts[r.currency] || 0) + amountOf(r);
    }
    return out;
  }

  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  /** CSV of rows, oldest first: date, customer, project, description, hours (decimal), h:mm, rate, amount, currency, state.
   *  plain(minor, currency) is the plain money text (SlopData.money.plainMinor). */
  function csv(rows, amountOf, plain) {
    const head = ['Date', 'Customer', 'Project', 'Description', 'Hours', 'Time', 'Rate', 'Amount', 'Currency', 'Billable', 'State'];   // i18n-ignore: CSV columns, a file format for other programs
    const lines = rows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((r) => [
      r.date, r.customerName || '', r.project || '', r.description, (r.minutes / 60).toFixed(2), hm(r.minutes),
      plain(r.rate || 0, r.currency), plain(r.billable ? amountOf(r) : 0, r.currency), r.currency || '', r.billable ? 'yes' : 'no', r.state,
    ].map(cell).join(','));
    return [head.join(','), ...lines].join('\r\n') + '\r\n';
  }

  const api = { parseDuration, UNITS, fold, hm, periodRange, filter, summary, csv };
  const NS = (g.SlopTimesheets = g.SlopTimesheets || {});
  NS.core = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
