# Slop Purchases: handoff

Purchase orders to suppliers: lines, tax, an expected date and a PDF; place, receive into stock, record the supplier's bill
as an expense. Browser only, no build step, no network. Every record goes through `SlopData` (see `shared/data/HANDOFF.md`):
`purchases` in the store, `SlopData.purchases.receive` (stock) and `recordBill` (an expense, through
`SlopData.expenses.recordIn`), each in one transaction. Suppliers are contacts (`customers`) with `supplier: true`; Slop CRM
leaves them off the sales pipeline.

## Files

- `index.html`: the page (Purchase orders, Purchase order, Data). Loads `shared/data` (stock, expenses, purchases),
  `shared/docs` (the document kit, its party a supplier) and `shared/biz`.
- `css/purchases.css`: the link line only; the base and the status chips are `shared/biz/app.css`.
- `js/core/util.js`: the words for refusals and the status names. `js/core/purchases.js`: list (filters late and to bill),
  suppliers, products, save, setStatus, receive, recordBill. `js/core/pdf.js`: `SlopDocs.docPdf` ("Order from", Expected).
- `js/ui/editor.js`: the shared editor plus the expected date, the bill link, and the actions per status (place, receive,
  record bill, cancel). `page.js`, `list.js`, `commands.js`, `app.js` (`#list`, `#new`, `#po/<id>`, `#data`), `layout.js`.
  The Data view is `SlopBiz.backup.attach`, through `SlopDocs.docApp`.

## Statuses

Draft -> Ordered -> Received, or Cancelled from draft or ordered (`FLOWS.purchases` in `shared/data/schema-defs.js`). Received
and cancelled orders are read only. The bill can be recorded once, from ordered or received.

## Tests

`tests/data/purchases.test.html` (the data rules, stock and the expense), `tests/purchases/app.test.html` (end to end).
