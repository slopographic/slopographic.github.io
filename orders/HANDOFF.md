# Slop Orders: handoff

Customers, products and orders with stock, fulfilment and one-click conversion to an invoice. Browser only, no build
step, no network. Every record goes through `SlopData` (see `shared/data/HANDOFF.md`): `SlopData.store` for orders and
customers, `SlopData.stock` for fulfilment, `SlopData.billing.invoiceFromOrder` for conversion, `SlopData.exporter` for
backups. Money is integer minor units; the line maths is `SlopDocs.model` and `SlopData.money`.

## Files

- `index.html`: the page (Orders list, Order editor, Data). Loads `shared/data`, `shared/docs` (the paper view, templates and
  PDF renderer, see `shared/docs/HANDOFF.md`), `vendor/pdf-lib/pdf-lib.min.js`, the core and the UI.
- `css/orders.css`: tokens (dark by default, `data-theme="light"`), order rows, form, line cards. Works at 390 px.
- `js/core/util.js`: refusals in plain words, settings, money formatting, the DOM builder.
- `js/core/orders.js`: list with status filter and search, customers, products, save, status change, cancel.
- `js/core/fulfil.js`: fulfilment through `SlopData.stock`.
- `js/core/actions.js`: confirm, convert, fulfil and cancel by id (shared by the list menu and the editor).
- `js/ui/list.js`: the list, row menu (right-click or Menu key).
- `js/ui/editor.js`: one order on the shared editor (`shared/docs/doc-editor.js`): the order's statuses, its invoice link,
  and the actions for its status (confirm, fulfil, cancel, convert). The form, lines, save and leave are the shared editor's.
- `js/core/pdf.js`: `SlopDocs.docPdf` for orders: `load`, `viewOf` and the PDF (`orderPdf`).
- `js/ui/page.js`: `SlopDocs.docPage` for orders: the paper view in its template, with in-place editing, the layout pick, and
  the PDF download. Draft and confirmed orders edit in place; fulfilled and cancelled ones are read only.
- `js/ui/app.js`, `layout.js`, `commands.js`, `data.js`: `SlopDocs.docApp` (routes `#list`, `#new`, `#o/<id>`, `#data`),
  `SlopDocs.docLayout`, SlopCmd commands, and `SlopBiz.backup` (backup and restore).
- `js/core/samples.js`: the io for random samples (no DOM). `js/ui/samples.js`: the list buttons and the editor action.
- Shared with invoices, in `shared/docs/`: `model.js` (percent and money text, line totals, `addDays`, status names),
  `lines.js` (line cards and totals box), `customer-dialog.js` (New customer), `product-dialog.js`, and the sample generator
  `samples.js`, `samples-run.js` and `samples-dialog.js` (see invoices/HANDOFF.md, Random samples).

## What works

- Orders: draft, then confirmed, then fulfilled or cancelled. Only the transitions the data layer allows are offered.
  A draft is saved with "Save draft"; "Confirm order" makes it confirmed.
- Lines: product (from the catalogue, with SKU and price; or a custom line), description, quantity, unit price, tax %,
  discount %. Tax and discount are typed as percentages. Totals: subtotal, tax by rate, total.
- Customers: pick from the customers collection, or "New customer" inside the order (stored as a customer).
- Fulfil: checks stock first (main location). Then one `sale` movement per product line, with the order number as the
  reference, and the order becomes fulfilled. Not enough stock refuses and changes nothing.
- Convert to invoice: one click. The invoice draft gets the lines, customer, currency and notes; the due date is the
  order date plus the payment terms. The order keeps its link ("Invoice: draft" or the number). A second convert is
  refused.
- List: search (number, customer, notes), status filter, newest first. Right-click (or Menu key) on a row: Open, Confirm,
  Fulfil, Cancel, Convert, Open invoice, as the status allows.
- Data: full backup download, and restore through the validated import (a bad file changes nothing).
- Random samples: "Random sample" on the list and in the editor (a new order), "Random samples…" (count 1 to 50, seed,
  currency, date range, create missing customers and products; a progress bar from five), "Delete all samples" (SlopUI.confirm).
  Samples are drafts with a number and `sample: true`, shown with a Sample chip. Customers and products come from the same
  generator as invoices (`shared/docs/samples.js`). The same seed, count and dates give the same orders.
- **Delete all samples cancels, it does not delete.** Orders cannot be deleted (their number is taken on creation, and a
  deleted number would leave a gap), so a sample order that is a draft or confirmed becomes cancelled and stays in the
  list with its number. Fulfilled samples stay. Sample customers and products that no live invoice or order uses are deleted.
- Page and PDF: the order is drawn as a page (Page / Form switch in the editor; Form is the default on a phone). Click the
  company name, customer, date, notes, a line's description, quantity, unit price, tax or discount to change it (the same
  checks as the form; a wrong value is shown and not saved until fixed). "Layout" picks one of five templates or random from
  the order's seed. "Export PDF" saves the changes first, then downloads `<order number>.pdf` in that template, with the
  company block from the settings, the lines, totals, notes and a footer.
- The company name on the page is the shared settings' company name (the same value the settings page edits).
- SlopCmd commands (Ctrl+K), SlopGuard (unsaved edits warn before leaving), SlopHub registration.

## Data written

- `orders` (create, edit while draft or confirmed, status changes, `invoiceId`, `sample`, `pdfSeed`, `pdfLayout`),
  `customers` (inline adds and samples), `settings` (only when the company name is changed on the page),
  `stockMovements` (only through `SlopData.stock`: `sale` on fulfil, `return` when a fulfil is undone), `invoices`
  (drafts from conversion only). The order number comes from the `order` sequence.

## Limits

- The data layer's statuses are draft, open, fulfilled, cancelled. The `open` status is shown as "Confirmed".
- Fulfil takes stock from the `main` location only. It runs as one stock movement per line, not in a single
  transaction. Stock is checked first, and if a later step still fails the earlier movements are undone with `return`
  movements (the history keeps both sides).
- Quantities are whole numbers. Discounts are per line, as a percentage of the line net. Prices are tax-exclusive.
- The line currency is the order's currency (the base currency). No per-order currency choice in the UI.
- The editor does not redraw under you when the same order changes in another tab; the list does.
- No delete: cancel instead (the data layer's rule).
- The PDF uses standard Helvetica or Times (see shared/docs/HANDOFF.md); characters outside Latin become "?". The paper on
  screen is not paginated; the PDF is.
- Customers are chosen from the list; there is no customer editor here (use the invoices app or the data import).

## Tests

- `node tests/run.mjs orders` runs `tests/orders/orders.test.html`: totals with tax on two lines (34.99), the discount
  before tax, gapless order numbers, the editor's text parsers, the status path (draft, confirmed, fulfilled, no way
  back), fulfil taking stock out, fulfil refused with no stock and no change, convert copying the lines and linking
  both records, the second convert refused, a draft refused for conversion, and the list filter and search.
- `node tests/run.mjs orders` also runs `tests/orders/paper.test.html`: in the iframe of the real page, click the customer
  and a line description on the page, a wrong date is refused with the form's message, Save draft stores the edits, and
  Export PDF downloads a PDF (`%PDF-` bytes).
- The random samples are tested by `node tests/run.mjs samples` (the Node test `tests/node/invoices-orders-samples.test.mjs`
  covers both apps; the browser test is the invoices one). Orders run through the same generator and runner as invoices.

