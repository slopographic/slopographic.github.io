// The invoice on the page: the shared paper view (shared/docs/doc-page.js) for an invoice, with its due date, payments and
// balance. Drafts are edited in place; issued, paid and void invoices show the page read only.
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  NS.page = g.SlopDocs.docPage.create({
    ns: NS, kind: 'invoice',
    editable: (st) => st.status === 'draft',
    pdf: async (id) => { const c = await NS.context.load(id); return c.ok ? NS.pdf.invoicePdf(c.value) : c; },
    view: (st) => ({
      dueDate: st.dueDate, paid: st.paid, balance: st.status === 'issued' || st.status === 'paid' ? st.balance : null,
      status: st.status === 'issued' && st.balance <= 0 ? 'paid' : st.status,   // printed as biz.st.<status> in the document's language
    }),
    field: (st, name, value) => { if (name !== 'dueDate') return false; st.dueDate = value; return true; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
