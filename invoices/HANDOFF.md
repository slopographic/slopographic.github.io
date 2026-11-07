# Slop Invoices: handoff

Invoices from scratch or from an order: gapless numbers on issue, a posted ledger entry, payments, void while unpaid,
overdue balances, a printable invoice and a one-page PDF. Browser only, no build step, no network. Every record goes
through `SlopData`: drafts through `SlopData.store`; issue, payments and void through `SlopData.billing` (each writes the
journal in the same transaction); conversion from an order through `SlopData.billing.invoiceFromOrder`; backups through
`SlopData.exporter`. Money is integer minor units. The PDF uses the vendored pdf-lib.

## Files

- `index.html`: the page (Invoices list, Invoice editor, Print, Data). Loads `shared/data`, `shared/docs` (the paper view,
  the templates and the PDF renderer, see `shared/docs/HANDOFF.md`), the core, the UI and `vendor/pdf-lib/pdf-lib.min.js`.
- `css/invoices.css`: tokens, rows, form, line cards, the printable sheet, and `@media print` (only the sheet prints).
- `js/core/util.js`: refusals in plain words, settings (company, terms, currency), money, the DOM builder.
- `js/core/invoices.js`: list with status and overdue, outstanding per customer and currency, customers, products,
  get with payments, save draft, remove draft, issue, record payment, void.
- `js/core/context.js`: `SlopDocs.docPdf` for invoices: one invoice with its customer, payments, balance, totals and company
  block (`NS.context.load`), its view (`NS.pdf.viewOf`) and the PDF (`NS.pdf.invoicePdf`).
- `js/ui/page.js`: `SlopDocs.docPage` (shared/docs/doc-page.js) for an invoice: the paper view with in-place editing, the due
  date, payments and balance. Drafts edit in place; issued invoices are read only. Each change gets the form's own check.
- `js/ui/list.js`: list, outstanding panel, row menu, "From an order…".
- `js/ui/editor.js`: one invoice on the shared editor (`shared/docs/doc-editor.js`): its due date, payments, balance, top
  bar and order link, and the actions for its status. The form, lines, save and leave are the shared editor's.
- `js/ui/payment-dialog.js`: record a payment (amount defaults to the balance).
- `js/ui/statement.js`: a customer statement (`#s/<customer id>`, from Owed by customer or an invoice's menu): every issued
  invoice and payment with a running balance, an optional From date (opening balance), ageing, Print and CSV
  (`SlopData.statement`). `js/ui/reminder.js`: a payment reminder from the statement (tone by lateness), to copy or open
  in the email app (mailto:).
- `js/ui/repeat-dialog.js`, `repeat.js`: Repeat… on an invoice (a schedule, `SlopData.recurring`), the Repeating view
  (`#repeat`: pause, resume, delete, make due drafts) and the due notice on the list.
- `js/ui/preview.js`: the printable sheet (the paper view, the same template as the PDF), and the PDF download.
- `js/ui/print.js`: the Print view (browser print dialog, PDF, back).
- `js/ui/app.js`, `layout.js`, `commands.js`, `data.js`: `SlopDocs.docApp` routes (`#list`, `#new`, `#i/<id>`, `#data`) plus
  `#p/<id>`, the top bar, `SlopDocs.docLayout`, SlopCmd commands, and `SlopBiz.backup`.
- `js/core/samples.js`: the io for random samples (no DOM). `js/ui/samples.js`: the list buttons and the editor action.
- Shared with orders, in `shared/docs/`: `model.js`, `lines.js`, `customer-dialog.js`, `product-dialog.js`, and the sample
  generator: `samples.js` (pure plan), `samples-run.js` (create and delete through the app's io), `samples-dialog.js` (the buttons).

## What works

- Draft: customer, invoice date, due date (defaults to the date plus the payment terms), notes, lines. Save draft.
- Issue: confirmation, then `billing.issue`. The invoice gets the next number (INV-0001, gapless) and a journal entry:
  receivables for the total, sales revenue for the subtotal, sales tax payable for the tax. The entry balances.
- Payments: amount (defaults to the balance), date, method (bank, cash, card, other), note. Partial payments allowed. An
  amount above the balance is refused. The last payment marks the invoice paid.
- Void: only an issued invoice with no payments. The issue entry is reversed; the number stays used. Refused with
  payments (the button is disabled, and the data layer refuses the call too).
- Status list: draft, issued, paid, void, and overdue (issued, balance due, due date before today), overdue rows
  highlighted. Balances are computed from the payments; nothing is stored twice.
- Owed by customer: issued balances per customer and currency, with the overdue part.
- From an order: a dialog lists confirmed or fulfilled orders with no invoice and creates the draft (lines copied, the
  order keeps its link).
- Preview / print: the Print view shows the invoice as the paper view (the number, dates, customer, lines, discounts, tax
  by rate, total, paid and balance due) in the invoice's template. Print opens the browser's print dialog; print CSS hides
  the app chrome.
- Page (the editor): the invoice is drawn as a page. Click the company name, customer, dates, notes, a line's description,
  quantity, unit price, tax or discount to change it; Enter, blur or Ctrl+Enter (notes) saves it into the form, and Escape
  puts it back. Page / Form switch in the editor (Form is the default on a phone). Drafts only. "Layout" picks one of the
  five templates or random from the seed; "New seed" draws a new seed.
- PDF: A4, in the invoice's template (classic, modern, minimal, bold header, side bar), with the company block, customer,
  number, dates, lines (description, qty, unit price, discount, tax, total), totals, paid and balance, notes and a footer
  with "Page n of N". A long invoice runs onto more pages with the head repeated. Export from the editor, the list menu
  or the Print view. The same invoice always exports the same way: its `pdfSeed` is kept on the record.
- Data: full backup download and validated restore. SlopCmd commands, SlopGuard, SlopHub registration.
- Random samples (see below): "Random sample" on the list and in the editor (new draft), "Random samples…" (options),
  "Delete all samples" (SlopUI.confirm). The same actions are in the palette (Ctrl+K).

## Data written

- `invoices` (drafts, issue, status changes made by billing only, `orderId`, `sample`), `payments` (through billing only),
  `journal` (through billing only: issue, payment, void reversal), `customers` (inline adds and samples). The invoice number
  comes from the `invoice` sequence, taken at issue.

## Random samples

- **Random sample**: one draft with a customer (a random one from the list; with none, a generated customer is saved), 1 to 6
  lines (catalogue products when there are any, generated products saved when the list is empty), random quantities (1 to
  12), catalogue prices and tax rates in the base currency, a discount on about a quarter of lines, a date in the last 90
  days, a due date (the payment terms), and a note. The editor's "Random sample" does the same and opens it.
- **Random samples…** (SlopUI dialog): count (1 to 50), seed (blank = new; same seed, count and dates give the same
  documents), currency, the date range, and whether to create missing customers and products. Five or more show a progress bar.
  The summary gives the count, totals per currency, customers and products added, the seed, and any refusals.
- Samples are **drafts**, so they take no invoice number: the gapless sequence is only used when one is issued. Each
  document is one save (one record, in the store's transaction). The apps have no undo stack, so Delete all samples is the way back.
- **Samples are marked** `sample: true` (the schema's optional flag on invoices, orders, customers and products). The list
  shows a Sample chip.
- **Delete all samples** deletes sample drafts (an issued sample stays: void it to remove it), then sample customers and
  products that no live invoice or order uses. A customer or product used by any live document, including an order, stays.
- Money is integer minor units and every total comes from `SlopDocs.model.totals`; the saved total must equal it, or the
  sample is refused. Options are checked before anything is saved.

## Limits

- Money is taken back with a credit note (Credit note… on an issued or paid invoice; shared/data/credits.js): a part already
  paid is refunded by the method chosen. A paid, part-paid or credited invoice cannot be voided, and payments cannot be removed.
- Currency: new invoices take the base currency. The UI has no currency choice. (The data layer supports a foreign
  currency through rates; the UI does not offer it yet.) No realised exchange gain or loss.
- The PDF fonts are the standard Helvetica or Times (pdf-lib cannot embed the bundled WOFF2 faces), so characters outside
  Latin text become "?". The paper on screen is not paginated; the PDF and the print sheet are.
- Overdue is judged on the local date when the list is drawn. There are no reminders and no aged-receivables report.
- Payment methods are the four in the data layer.
- The editor does not redraw under you when the same invoice changes in another tab; the list does.
- Restore replaces every record, including the ledger; the confirmation says so.

## Tests

- `node tests/run.mjs invoices` runs `tests/invoices/invoices.test.html`: gapless numbers (a removed draft takes none),
  the issue entry (AR 29.00, revenue 25.00, tax 4.00) balancing and the trial balance balanced, drafts not posted, a
  draft editable and an issued invoice not, payments reducing the balance and marking it paid, an overpayment refused,
  void refused after a payment, void before a payment reversing the entry and keeping the number, overdue and the
  outstanding balance per customer, an order invoiced through the data layer, the printable preview listing the number,
  customer, lines and total, the PDF having one page, and a long invoice (60 lines) running onto more than one page.
- `node tests/run.mjs invoices` also runs `tests/invoices/paper.test.html` (in the iframe of the real page: click a line
  description, the form and the store follow, the PDF downloads with `%PDF-` bytes) and `tests/node/pdf-render.test.mjs`
  (the bytes, the totals text, the templates, the seed).
- `node tests/run.mjs samples` runs `tests/invoices/samples.test.html` (three random invoices saved as sample drafts with
  totals equal to the model, the same seed giving the same documents, delete all samples removing the three drafts and
  nothing else, an issued sample left alone) and `tests/node/invoices-orders-samples.test.mjs` (a fixed seed: plans and
  saved totals validate against the schema across 300 seeds, the batch is repeatable, and bad options save nothing).

