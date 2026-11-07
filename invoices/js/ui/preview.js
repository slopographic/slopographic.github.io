// The printable invoice and the PDF download. The sheet is the paper view (shared/docs/paper.js) in the invoice's template,
// built from the same view as the PDF. The Print view prints it with the browser's print dialog (css/invoices.css hides the
// app chrome). The PDF is downloaded as <number>.pdf.
(function (g) {
  'use strict';
  const NS = (g.SlopInvoices = g.SlopInvoices || {});
  const U = NS.util;
  const UI = g.SlopUI;
  const t = (k, v) => (g.SlopI18n ? g.SlopI18n.t(k, v) : k);

  /** The sheet as DOM for one context from NS.context.load (read only). */
  function build(ctx) {
    return g.SlopDocs.paper.build(NS.pdf.viewOf(ctx), { editable: false });
  }

  /** Loads the invoice and shows its sheet on the Print view. */
  async function show(id) {
    const r = await NS.context.load(id);
    const box = document.getElementById('pSheet');
    if (!r.ok) { box.replaceChildren(U.h('p', { class: 'msg bad', text: U.refusal(r) })); return; }   // i18n-ignore: CSS class names
    box.replaceChildren(build(r.value));
  }

  /** Makes the PDF for an invoice and downloads it. A refusal says why. */
  async function pdf(id) {
    const c = await NS.context.load(id);
    if (!c.ok) { UI.alert(t('invoices.li.not_available'), U.refusal(c)); return; }
    const r = await NS.pdf.invoicePdf(c.value);
    if (!r.ok) { UI.alert(t('invoices.pv.not_made'), t('invoices.pv.not_made_why', { why: r.message })); return; }
    UI.download(new Blob([r.value], { type: 'application/pdf' }), `${c.value.invoice.number || 'draft'}.pdf`);
    UI.toast(t('invoices.pv.downloaded'));
  }

  NS.preview = { build, show, pdf };
})(typeof window !== 'undefined' ? window : globalThis);
