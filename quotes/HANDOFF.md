# Slop Quotes: handoff

Quotes (estimates) for customers: lines, tax and discounts, a valid-until date, a PDF, and one click from an accepted quote
to a confirmed order or a draft invoice. Browser only, no build step, no network. Every record goes through `SlopData`
(see `shared/data/HANDOFF.md`): `SlopData.store` for quotes and customers, `SlopData.quotes` for conversion. Nothing is
posted to the ledger until the invoice made from a quote is issued in Slop Invoices.

## Files

- `index.html`: the page (Quotes list, Quote editor, Data). Loads `shared/data` (with `quotes.js`), `shared/docs` (the
  document kit: `doc-editor`, `doc-page`, `doc-app`, `doc-pdf`, `doc-layout`, see `shared/docs/HANDOFF.md`), `shared/biz`.
- `css/quotes.css`: only the link line; the base and the status chips are `shared/biz/app.css`.
- `js/core/util.js`: the quote's words for refusals and its status names (`STATUS`); the rest is SlopBiz.
- `js/core/quotes.js`: list (status filter with `expired`, search), customers, products, save, setStatus, toOrder,
  toInvoice (due after the payment terms in settings).
- `js/core/pdf.js`: `SlopDocs.docPdf` for quotes, with Valid until under the date.
- `js/ui/editor.js`: the shared editor plus the quote's own: valid-until date, links, and the actions for its status.
- `js/ui/page.js`, `list.js`, `commands.js`, `data.js`, `app.js`, `layout.js`: paper view, the list (SlopList), commands,
  backup (`SlopBiz.backup`), routes (`#list`, `#new`, `#q/<id>`, `#data`) and the workspace layout.

## Statuses

Draft -> Sent -> Accepted or Declined. A sent quote can go back to draft; a declined one can be reopened; an accepted one
is final and read only. Make order or Make invoice works from draft, sent or accepted (it accepts the quote), once. A draft
or sent quote past its valid-until date shows as Expired (derived, not stored).

## Tests

`tests/data/quotes.test.html` (the data rules and conversion), `tests/quotes/app.test.html` (the app end to end at 1100 and
390 px).
