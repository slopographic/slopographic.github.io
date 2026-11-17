// The one view of a document that the paper view, the print view and the PDF all draw: the company block, the number and
// dates, the bill-to, the lines (text as shown, with the raw value each editable cell edits), the totals and the notes.
// Money, dates and every printed word are formatted here in the document's language; the renderers only lay it out.
// Pure: no DOM, no storage.
// Classic script, loaded after shared/data and shared/docs/model.js and pdf-layouts.js. Exposes window.SlopDocs.view.
(function (g) {
  'use strict';
  const S = g.SlopData;
  const NS = (g.SlopDocs = g.SlopDocs || {});
  const M = NS.model;

  const lines = (text) => String(text || '').split('\n').map((t) => t.trim()).filter(Boolean);

  /** The words of the document's language: doc.words (SlopBiz.docLang.words: t, day, locale), else English through SlopI18n. */
  function wordsOf(doc) {
    if (doc.words) return doc.words;
    const w = g.SlopI18n && g.SlopI18n.at ? g.SlopI18n.at('en', doc.locale) : null;
    return { code: 'en', t: w ? w.t : (k) => k, day: (d) => d || '', num: w ? w.num : null, locale: doc.locale || 'en-US' };
  }
  const DAYS = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

  /** The view of one document. doc: { kind ('invoice' | 'quote' | 'order' | 'purchase'), id, number, status, date, dueDate,
   *  notes, currency, locale, lines, customer { name, email, phone, address }, company { name, address, taxNumber },
   *  totals (SlopDocs.model totals, or null when a line is not complete), paid, balance (null hides the row), money(minor),
   *  pdfSeed, pdfLayout, words (the document language's words, SlopBiz.docLang.words), partyKey (the heading over the other
   *  party, default biz.pr.bill_to), moreMeta [{ key, value, field }] (more dated fields under the date, such as a quote's
   *  Valid until) }. Every printed word is a biz.pr.* key read in the document's language; the stored text stays as it is. */
  function build(doc) {
    const w = wordsOf(doc), tx = w.t;
    const money = doc.money || ((m) => S.money.formatMinor(m, doc.currency || 'USD', w.locale || 'en-US'));
    const pct = (bp) => (w.num ? w.num((bp || 0) / 100, { maximumFractionDigits: 2 }) : M.percentText(bp) || '0');
    const c = doc.customer || {};
    const co = doc.company || {};
    const rowOf = (l, index) => {
      const bad = M.lineErrors(l).length > 0;
      const a = bad ? null : S.money.lineAmounts(M.cleanLine(l));
      return {
        index, bad,
        description: l.description || '',
        qty: l.qty == null ? '' : String(l.qty),
        unit: Number.isSafeInteger(l.unitPrice) ? money(l.unitPrice) : '',
        disc: l.discount ? `${pct(l.discount)}%` : '',
        tax: a ? money(a.tax) : '',
        total: a ? money(a.total) : '',
        raw: {
          description: l.description || '', qty: l.qty == null ? '' : String(l.qty),
          unitPrice: Number.isSafeInteger(l.unitPrice) ? M.amountText(l.unitPrice, doc.currency || 'USD') : '',
          taxRate: M.percentText(l.taxRate ?? 0), discount: M.percentText(l.discount || 0),
        },
      };
    };
    const totals = [];
    if (doc.totals) {
      const t = doc.totals;
      totals.push({ label: tx('biz.pr.subtotal'), value: money(t.subtotal) });
      for (const r of t.byRate) totals.push({ label: tx('biz.pr.tax_on', { rate: pct(r.rate), net: money(r.net) }), value: money(r.tax) });
      totals.push({ label: tx('biz.pr.total'), value: money(t.total), strong: true });
    }
    if (doc.paid) totals.push({ label: tx('biz.pr.paid'), value: money(doc.paid) });
    if (doc.balance !== null && doc.balance !== undefined) totals.push({ label: tx('biz.pr.balance_due'), value: money(doc.balance), strong: true });
    const dated = (label, raw, field) => ({ label, value: w.day(raw || ''), raw: raw || '', field });
    const meta = [dated(tx('biz.pr.date'), doc.date, 'date')];
    if (doc.kind === 'invoice') {
      meta.push(dated(tx('biz.pr.due'), doc.dueDate, 'dueDate'));
      const n = doc.date && doc.dueDate ? DAYS(doc.date, doc.dueDate) : NaN;
      if (n >= 0) meta.push({ label: tx('biz.pr.terms'), value: tx('biz.pr.terms_days', { n }), raw: '' });
    }
    for (const m of doc.moreMeta || []) meta.push(dated(tx(m.key), m.value, m.field));
    const kind = ['quote', 'order', 'purchase'].includes(doc.kind) ? doc.kind : 'invoice';
    const ls = doc.lines || [];
    return {
      kind: doc.kind, lang: w.code || 'en', title: tx(`biz.pr.t_${kind}`),
      number: doc.number || tx('biz.pr.draft'), statusText: doc.status ? tx(`biz.st.${doc.status}`) : '',
      style: NS.layouts.resolve({ id: doc.id, pdfSeed: doc.pdfSeed, pdfLayout: doc.pdfLayout }),
      company: { name: co.name || tx('biz.pr.your_company'), lines: lines(co.address), taxNumber: co.taxNumber || '', field: 'company' },
      meta,
      bill: { title: tx(doc.partyKey || 'biz.pr.bill_to'), name: c.name || '', lines: [c.email, c.phone, ...lines(c.address)].filter(Boolean), field: 'customer', customerId: doc.customerId ?? c.id ?? '' },
      hasDiscount: ls.some((l) => l.discount),
      rows: ls.map(rowOf),
      totals,
      totalsNote: doc.totals ? '' : tx('biz.pr.totals_later'),
      notes: { text: doc.notes || '', field: 'notes' },
      editable: doc.editable !== false,
      // the fixed words the paper and the PDF print, in the document's language
      words: {
        number: tx(`biz.pr.no_${kind}`), notes: tx('biz.pr.notes'), noCustomer: tx('biz.pr.no_customer'), noDesc: tx('biz.pr.no_desc'),
        noLines: tx('biz.pr.no_lines'), taxNumber: co.taxNumber ? tx('biz.pr.tax_number', { number: co.taxNumber }) : '',
        cols: { desc: tx('biz.pr.c_desc'), qty: tx('biz.pr.c_qty'), unit: tx('biz.pr.c_unit_price'), disc: tx('biz.pr.c_disc'), tax: tx('biz.pr.c_tax'), total: tx('biz.pr.c_total') },
        pageOf: (i, n) => tx('biz.pr.page_of', { i: String(i), n: String(n) }),
      },
    };
  }

  NS.view = { build };
})(typeof window !== 'undefined' ? window : globalThis);
