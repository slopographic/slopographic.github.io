/* Slop Reports: reads the data the reports need. Read-only: it opens the shared database without creating it and never
 * writes. Contacts, Invoices, Expenses, the ledger and CRM keep their records in one database, 'slop-data' (shared/data/store.js, DB_NAME),
 * in the stores below. Soft-deleted rows (deletedAt) are dropped here. Classic script: sets window.SlopReports.loadData. */
(function (g) {
  'use strict';
  const ns = (g.SlopReports = g.SlopReports || {});
  const DB_NAME = 'slop-data';
  const STORES = ['customers', 'customerGroups', 'customerTags', 'invoices', 'payments', 'expenses', 'accounts', 'journal', 'timeEntries', 'quotes', 'settings'];

  const alive = (rows) => (rows || []).filter((r) => !r.deletedAt);

  /** Resolves to { found, data, baseCurrency, locale, counts }. found is false when the database has never been made. */
  async function loadData(name = DB_NAME) {
    const db = await g.SlopDb.openExisting(name);
    if (!db) return { found: false, data: {}, baseCurrency: 'USD', locale: 'en-US', counts: {} };
    try {
      const raw = await db.readAll(STORES);
      const data = {};
      for (const s of STORES) data[s] = alive(raw[s]);
      const main = data.settings.find((s) => s.id === 'main') || {};
      const counts = Object.fromEntries(STORES.map((s) => [s, data[s].length]));
      return { found: true, data, baseCurrency: main.defaultCurrency || 'USD', locale: main.locale || 'en-US', counts };
    } finally {
      db.close();
    }
  }

  /** True when there is at least one contact, invoice, expense, journal entry, time entry or CRM record to report on. */
  const hasData = (counts) => ['customers', 'invoices', 'expenses', 'journal', 'timeEntries', 'quotes'].some((s) => (counts[s] || 0) > 0);

  ns.loadData = loadData;
  ns.hasData = hasData;
  ns.DB_NAME = DB_NAME;
})(typeof window !== 'undefined' ? window : globalThis);
