/* SlopDataAI.APPS: which records each business app's assistant works on (shared/data/ai-records.js install(app)), how a
 * posting-only record is made (SlopData.expenses.record), and the app's own steps through SlopData and the app's PDF
 * (SlopDocs.docPdf, shared/docs): issue an invoice, record a payment, a document's PDF to Slop Drive, invoices from time,
 * stock movements. Classic script, loaded after ai-records.js. */
(function (g) {
  'use strict';
  const D = () => g.SlopData, AI = g.SlopDataAI;
  const S = (name, description, extra) => Object.assign({ name, type: 'string', maxLength: 200, description }, extra);
  const TO = { name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive' };
  const LINES = { name: 'lines', type: 'array', required: true, maxItems: 100,
    items: { type: 'object', properties: { description: { type: 'string' }, qty: { type: 'number' }, unit_price: { type: 'string', description: 'like 12.50' }, tax_rate: { type: 'string', description: 'percent like 20' }, sku: { type: 'string' } } },
    description: 'the lines: [{ description, qty, unit_price, tax_rate }]' };
  const today = () => new Date().toISOString().slice(0, 10);

  /** A document's PDF through the app's own renderer (SlopDocs.docPdf: NS.pdf.load or NS.context.load, then viewOf). */
  async function docPdf(ns, id) {
    const NS = g[ns];
    if (!NS || !NS.pdf || !g.SlopDocs || !g.SlopDocs.pdf) throw new Error('This page cannot make the PDF');
    const c = await (NS.pdf.load || NS.context.load)(id);
    const ctx = AI.unwrap(c, 'Open');
    const bytes = AI.unwrap(await g.SlopDocs.pdf.renderPdf(NS.pdf.viewOf(ctx)), 'PDF');
    const doc = ctx.invoice || ctx.order || ctx.quote || ctx.purchase || ctx.doc || ctx.record || {};
    return { blob: new Blob([bytes], { type: 'application/pdf' }), name: `${doc.number || 'draft'}.pdf` };
  }
  /** A document id from an id or a number (INV-0003). */
  async function docId(collection, q) {
    const r = await D().store.get(collection, String(q));
    if (r.ok && r.value) return r.value.id;
    const list = AI.unwrap(await D().store.list(collection), 'List'), hit = list.find((x) => x.number === String(q).trim());
    if (!hit) throw new Error(`No ${collection} ${q}`);
    return hit.id;
  }
  function pdfCommand(add, collection, ns, noun) {
    add(`export_${noun}_pdf`, `Export the ${noun} as PDF`, [S('id', `the ${noun} id or number`, { required: true }), TO],
      async (a) => { const p = await docPdf(ns, await docId(collection, a.id)); return AI.save(p.blob, p.name, a.to, collection); },
      { description: `The ${noun}'s PDF (the same as Print), to Slop Drive and/or a download.` });
  }
  /** A draft document from a customer name and plain lines. */
  function docCommand(add, collection, noun, extraArgs = []) {
    add(`create_${noun}`, `Create ${noun === 'order' ? 'an' : 'a'} ${noun}`, [S('customer', noun === 'purchase' ? 'the supplier name (made when new)' : 'the customer name (made when new)', { required: true }),
      S('email', 'their e-mail, for a new customer'), LINES, S('date', 'YYYY-MM-DD, today when empty', { maxLength: 10 }), S('currency', 'ISO code, the default when empty', { maxLength: 3 }),
      S('notes', 'notes on the document', { maxLength: 2000 })].concat(extraArgs),
    async (a) => {
      const fields = { customer: a.customer, date: a.date || today(), lines: a.lines.map((l) => ({ description: l.description, qty: l.qty || 1, unitPrice: l.unit_price ?? l.unitPrice ?? l.price ?? 0, taxRate: l.tax_rate ?? l.taxRate ?? 0, sku: l.sku })) };
      if (noun === 'purchase') fields.supplier = true;
      if (a.currency) fields.currency = a.currency;
      if (a.notes) fields.notes = a.notes;
      if (a.due_days != null) fields.dueDate = D().ledger.addDays(fields.date, a.due_days);
      if (a.valid_days != null) fields.validUntil = D().ledger.addDays(fields.date, a.valid_days);
      if (a.email && !(await D().store.list('customers')).value.some((c) => c.name.toLowerCase() === a.customer.toLowerCase())) fields.customerId = await AI.customerId(a.customer, { email: a.email });
      const rec = await AI.toRecord(collection, fields);
      const made = AI.unwrap(await D().store.put(collection, rec), `New ${noun}`);
      AI.remember({ kind: 'created', collection, id: made.id });
      let note = '';
      if (a.issue && collection === 'invoices') { const r = AI.unwrap(await D().billing.issue(made.id), 'Issue'); note = ` Issued as ${r.number || (await D().store.get('invoices', made.id)).value.number}.`; }
      const now = AI.unwrap(await D().store.get(collection, made.id), 'Read');
      return { done: `Created ${noun} ${now.number || '(draft)'} for ${a.customer}, total ${D().money.formatMinor(now.total || 0, now.currency || 'USD')}.${note}`, id: made.id, number: now.number || null };
    }, { description: `Make ${noun === 'order' ? 'an' : 'a'} ${noun} in one step: the customer by name and the lines with prices.` });
  }

  const CUSTOMER_TYPES = ['customers'];
  AI.APPS = {
    invoices: { label: 'Slop Invoices', collections: ['invoices', 'customers', 'products'], extra(add) {
      docCommand(add, 'invoices', 'invoice', [{ name: 'due_days', type: 'number', min: 0, max: 365, integer: true, description: 'days until due' }, { name: 'issue', type: 'boolean', default: false, description: 'issue it now (number it, post it)' }]);
      add('issue_invoice', 'Issue an invoice', [S('id', 'invoice id or number', { required: true })], async (a) => { const id = await docId('invoices', a.id); AI.unwrap(await D().billing.issue(id), 'Issue'); return `Issued ${(await D().store.get('invoices', id)).value.number}.`; },
        { destructive: false, description: 'Number and post a draft invoice (it cannot be edited after).' });
      add('record_payment', 'Record a payment', [S('id', 'invoice id or number', { required: true }), S('amount', 'like 120.00; the balance when empty'), { name: 'method', type: 'enum', values: D().schema.ENUM.payMethod, default: 'bank' }, S('date', 'YYYY-MM-DD', { maxLength: 10 })],
        async (a) => {
          const id = await docId('invoices', a.id), inv = (await D().store.get('invoices', id)).value;
          const pays = (await D().store.list('payments', { index: 'invoiceId', value: id })).value || [];
          const amount = a.amount ? (await AI.toRecord('payments', { amount: a.amount, currency: inv.currency })).amount : D().billing.balanceDue(inv, pays);
          AI.unwrap(await D().billing.recordPayment({ invoiceId: id, amount, method: a.method, date: a.date || today() }), 'Payment');
          return `Recorded ${D().money.formatMinor(amount, inv.currency)} on ${inv.number}.`;
        });
      pdfCommand(add, 'invoices', 'SlopInvoices', 'invoice');
    } },
    orders: { label: 'Slop Orders', collections: ['orders', 'customers', 'products'], extra(add) { docCommand(add, 'orders', 'order'); pdfCommand(add, 'orders', 'SlopOrders', 'order'); } },
    quotes: { label: 'Slop Quotes', collections: ['quotes', 'customers', 'products'], extra(add) {
      docCommand(add, 'quotes', 'quote', [{ name: 'valid_days', type: 'number', min: 0, max: 365, integer: true, description: 'days the quote is valid' }]); pdfCommand(add, 'quotes', 'SlopQuotes', 'quote');
    } },
    purchases: { label: 'Slop Purchases', collections: ['purchases', 'customers', 'products'], extra(add) { docCommand(add, 'purchases', 'purchase'); pdfCommand(add, 'purchases', 'SlopPurchases', 'purchase'); } },
    crm: { label: 'Slop CRM', collections: CUSTOMER_TYPES },
    contacts: { label: 'Slop Contacts', collections: CUSTOMER_TYPES },
    inventory: { label: 'Slop Inventory', collections: ['products', 'stockMovements'], post: { stockMovements: (r) => D().stock.move(r) }, extra(add) {
      add('stock_move', 'Move stock', [S('product', 'product id, SKU or name', { required: true }), { name: 'qty', type: 'number', min: -1e6, max: 1e6, integer: true, required: true, description: 'positive in, negative out' },
        { name: 'reason', type: 'enum', values: D().schema.ENUM.stockReason, default: 'adjustment' }, S('location', 'default main')],
      async (a) => {
        const list = AI.unwrap(await D().store.list('products'), 'Products'), q = String(a.product).toLowerCase();
        const p = list.find((x) => x.id === a.product || x.sku.toLowerCase() === q) || list.find((x) => x.name.toLowerCase().includes(q));
        if (!p) throw new Error(`No product “${a.product}”`);
        AI.unwrap(await D().stock.move({ productId: p.id, qty: a.qty, reason: a.reason, location: a.location || 'main', date: today() }), 'Stock');
        return `Moved ${a.qty} of ${p.name}; on hand now ${AI.unwrap(await D().stock.onHand(p.id), 'Stock')}.`;
      });
    } },
    expenses: { label: 'Slop Expenses', collections: ['expenses'], post: { expenses: (r) => D().expenses.record(r) } },
    timesheets: { label: 'Slop Timesheets', collections: ['timeEntries', 'customers'] },
    todo: { label: 'Slop To-do', collections: ['tasks'] },
    calendar: { label: 'Slop Calendar', collections: ['events', 'tasks'] },
    // a reminder the person adds is 'custom' (events and tasks make their own); the time is ISO text or epoch ms
    admin: { label: 'Slop Admin', collections: ['settings', 'numbering'], extra(add) {
      add('set_company', 'Set the company profile', [S('name', 'company name'), S('address', 'postal address', { maxLength: 1000 }), S('tax_number', 'VAT or tax number', { maxLength: 60 }),
        S('currency', 'default currency, ISO code', { maxLength: 3 }), S('locale', 'language tag such as en-GB', { maxLength: 20 }), S('default_tax_rate', 'percent, like 20'),
        S('doc_language', 'language of printed documents (invoices, quotes, orders...), a code such as en or sv', { maxLength: 8 })],
      async (a) => {
        const before = AI.unwrap(await D().store.get('settings', 'main'), 'Settings') || { id: 'main' }, rec = Object.assign({}, before);
        const map = { name: 'companyName', address: 'address', tax_number: 'taxNumber', currency: 'defaultCurrency', locale: 'locale', doc_language: 'docLang' };
        for (const [k, f] of Object.entries(map)) if (a[k] != null && a[k] !== '') rec[f] = k === 'currency' ? a[k].toUpperCase() : a[k];
        if (a.default_tax_rate != null && a.default_tax_rate !== '') rec.defaultTaxRate = (await AI.toRecord('settings', { defaultTaxRate: a.default_tax_rate })).defaultTaxRate;
        AI.unwrap(await D().store.put('settings', rec), 'Save');
        AI.remember({ kind: 'updated', collection: 'settings', id: 'main', before });
        return `Company profile saved: ${rec.companyName || '(no name)'}, ${rec.defaultCurrency}, default tax ${(rec.defaultTaxRate || 0) / 100}%.`;
      });
      add('set_numbering', 'Set a numbering sequence', [{ name: 'sequence', type: 'enum', values: ['invoice', 'order', 'quote', 'purchase'], required: true }, S('prefix', 'like INV-', { maxLength: 20 }),
        { name: 'digits', type: 'number', min: 1, max: 12, integer: true }, { name: 'next', type: 'number', min: 1, max: 1e12, integer: true, description: 'can only move forward' }],
      async (a) => {
        const before = AI.unwrap(await D().store.get('numbering', a.sequence), 'Numbering'), rec = Object.assign({}, before || { id: a.sequence, next: 1 });
        if (a.prefix != null) rec.prefix = a.prefix; if (a.digits != null) rec.pad = a.digits; if (a.next != null) rec.next = a.next;
        AI.unwrap(await D().store.put('numbering', rec), 'Save');
        AI.remember({ kind: 'updated', collection: 'numbering', id: a.sequence, before });
        return `The next ${a.sequence} number is ${D().numbering.format(rec, rec.next)}.`;
      });
      add('export_backup', 'Export a full backup', [TO], async (a) => { const r0 = await D().exporter.exportFile(), f = r0 && r0.ok !== undefined ? AI.unwrap(r0, 'Backup') : r0; return AI.save(f.blob, f.name, a.to, 'admin'); },
        { description: 'Every business record in one JSON file (the same as Data ▸ Backup), to Slop Drive and/or a download.' });
    } },
    reminders: { label: 'Slop Reminders', collections: ['reminders'], post: { reminders: (r) => D().store.put('reminders', Object.assign({ source: 'custom' }, r)) } },
    ledger: { label: 'Slop Ledger', collections: ['journal', 'accounts'],
      post: { journal: (r) => D().ledger.postJournal(Object.assign({ source: `manual:${D().store.newId()}` }, r)) }, extra(add) {
        const L = () => g.SlopLedger;
        add('create_journal_entry', 'Post a journal entry', [S('date', 'YYYY-MM-DD, today when empty', { maxLength: 10 }), S('memo', 'what it is for', { maxLength: 300 }),
          { name: 'lines', type: 'array', required: true, maxItems: 50, items: { type: 'object', properties: { account: { type: 'string', description: '4-digit code' }, debit: { type: 'string', description: 'like 120.00' }, credit: { type: 'string' } } },
            description: 'balanced lines: [{ account, debit }, { account, credit }]; debits must equal credits' }],
        async (a) => {
          const rec = await AI.toRecord('journal', { date: a.date || today(), memo: a.memo || '', lines: a.lines.map((l) => ({ account: String(l.account), debit: l.debit || 0, credit: l.credit || 0 })) });
          const e = AI.unwrap(await D().ledger.postJournal(Object.assign({ source: `manual:${D().store.newId()}` }, rec)), 'Journal');
          AI.remember({ kind: 'posted', collection: 'journal', id: e.id });
          const total = e.lines.reduce((t, l) => t + (l.debit || 0), 0);
          return { done: `Posted the entry “${e.memo || e.id}” on ${e.date}: ${e.lines.length} lines, ${D().money.formatMinor(total, (await L().util.settings()).base)} each side.`, id: e.id };
        }, { description: 'Post a balanced journal entry (posted entries cannot change; a reversal undoes one).' });
        add('add_account', 'Add an account', [S('code', '4 digits', { required: true, maxLength: 4 }), S('name', 'account name', { required: true }),
          { name: 'type', type: 'enum', values: D().schema.ENUM.accountType, required: true }],
        async (a) => { const r = AI.unwrap(await D().store.put('accounts', { code: a.code, name: a.name, type: a.type }), 'Account'); AI.remember({ kind: 'created', collection: 'accounts', id: r.code }); return `Added account ${r.code} ${r.name} (${r.type}).`; });
        add('export_trial_balance', 'Export the trial balance', [TO], async (a) => {
          const s = await L().util.settings(), tb = AI.unwrap(await D().ledger.trialBalance(), 'Trial balance');
          const f = L().csv.trialCsv(Object.assign({ foreign: [] }, tb), s.base, L().util.today());
          return AI.save(f.blob, f.name, a.to, 'ledger');
        });
        add('export_statement', 'Export a statement', [{ name: 'statement', type: 'enum', values: ['profit_and_loss', 'balance_sheet'], default: 'profit_and_loss' },
          { name: 'period', type: 'enum', values: ['month', 'quarter', 'year', 'last-year'], default: 'year' }, TO],
        async (a) => {
          const s = await L().util.settings(), [j, ac] = await Promise.all([D().store.list('journal'), D().store.list('accounts')]);
          const ents = AI.unwrap(j, 'Journal'), accts = AI.unwrap(ac, 'Accounts'), p = L().statements.period(a.period, L().util.today()), dec = (m) => L().util.decimal(m, s.base);
          const rows = [['Section', 'Code', 'Account', `Amount (${s.base})`]];
          if (a.statement === 'balance_sheet') {
            const b = L().statements.balanceSheet(ents, accts, { at: p.to });
            for (const [k, list] of [['Assets', b.assets], ['Liabilities', b.liabilities], ['Equity', b.equity]]) for (const r of list) rows.push([k, r.code, r.name, dec(r.amount)]);
            rows.push(['Equity', '', 'Result to date', dec(b.resultToDate)], ['', '', 'Total assets', dec(b.totalAssets)], ['', '', 'Total liabilities and equity', dec(b.totalLiabilities + b.totalEquity)]);
          } else {
            const r0 = L().statements.profitAndLoss(ents, accts, p);
            for (const [k, list] of [['Revenue', r0.revenue], ['Expenses', r0.expenses]]) for (const r of list) rows.push([k, r.code, r.name, dec(r.amount)]);
            rows.push(['', '', 'Result', dec(r0.result)]);
          }
          const name = `${a.statement.replace(/_/g, '-')}-${p.from}-${p.to}.csv`;
          return AI.save(new Blob([L().csv.toCsv(rows)], { type: 'text/csv' }), name, a.to, 'ledger');
        }, { description: 'The profit and loss or the balance sheet for a period, as CSV.' });
      } },
  };
})(typeof window !== 'undefined' ? window : globalThis);
