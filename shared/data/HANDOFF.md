# shared/data: business records (the contract for the apps)

One source of truth for customers, products, orders, invoices, payments, accounts, the journal, settings,
stock movements, stock counts and document numbering. Browser-only, no build step, no accounts. Storage is
IndexedDB `slop-data`, one object store per collection. Nothing else may define these shapes or write the store.

## Load it (classic scripts, in this order; all of them, because modules call each other at run time)

```html
<script src="…/shared/data/money.js"></script>
<script src="…/shared/data/barcode.js"></script>
<script src="…/shared/data/schema-checks.js"></script><script src="…/shared/data/schema-checks.js"></script>
<script src="…/shared/data/schema-defs.js"></script>
<script src="…/shared/data/schema.js"></script>
<script src="…/shared/data/currency.js"></script>
<script src="…/shared/data/store.js"></script>
<script src="…/shared/data/numbering.js"></script>
<script src="…/shared/data/fx.js"></script>
<script src="…/shared/data/ledger.js"></script>
<script src="…/shared/data/stock.js"></script>
<script src="…/shared/data/billing.js"></script>
<script src="…/shared/data/credits.js"></script>   <!-- credit notes: credit an invoice, refund what was paid -->
<script src="…/shared/data/expenses.js"></script>  <!-- money going out: record and void, posted to the journal -->
<script src="…/shared/data/quotes.js"></script>    <!-- quotes: to an order or a draft invoice -->
<script src="…/shared/data/timesheets.js"></script> <!-- time worked: billed onto a draft invoice -->
<script src="…/shared/data/recurring.js"></script>  <!-- repeating invoices: due drafts made from schedules -->
<script src="…/shared/data/purchases.js"></script>  <!-- purchase orders: receive into stock, the bill as an expense -->
<script src="…/shared/data/statement.js"></script>  <!-- customer statements: running balance and ageing (pure) -->
<script src="…/shared/data/bundle-check.js"></script>
<script src="…/shared/data/export.js"></script>
<script src="…/shared/data/rates-ecb.js"></script>   <!-- only if the page offers the ECB update -->
```

`schema-defs.js` holds the record definitions and `schema.js` the rules over them (split to keep each file small).
`rates-ecb.js` is optional and does nothing until the person turns on the consent category (see below).

Everything hangs off `window.SlopData`: `money`, `barcode`, `schema`, `schemaDefs`, `result`, `locale`, `store`,
`numbering`, `fx`, `ledger`, `stock`, `billing`, `expenses`, `quotes`, `timesheets`, `recurring`, `purchases`, `statement`, `bundleCheck`, `exporter`, `rates`. The Node tests load the same
files in a vm context (`tests/node/data-env.mjs`, `tests/node/fx-env.mjs`). The database version is 12 (see storage/INVENTORY.md for
what each version added), and upgrades only create the missing stores.

## Credit notes

`SlopData.credits.issue({ invoiceId, amount, date, reason, method })` credits part or all of an issued or paid invoice (at most
its total less earlier credit notes), as credit note CN-0001 and on, in one transaction: revenue (4000) and tax (2100) are
debited in the invoice's proportions (`split`), AR (1200) is credited with the part that comes off what is owed, and cash or
the bank with the part paid back (`refund`, when the customer had already paid more than is now owed; `method` is then
required). The invoice keeps `credited` and `refunded`; `billing.balanceDue` counts them, so payments, lists, the statement
and reports agree. Once credit notes cover the whole total the invoice is `credited`; an issued invoice with nothing left
owed becomes `paid`. A credited invoice cannot be voided. Credit notes are immutable and posting-only; a foreign-currency
invoice is credited at its own rate. `forInvoice(id)` lists them; `split`, `creditable`, `effect` and `statusAfter` are pure.
The statement (`statement.build(..., { credits })`) shows each credit note and its refund as lines.

## Expenses

`SlopData.expenses.record({ date, supplier, description, account, amount, tax, currency, method, receiptId, notes })` writes
a posted expense and its journal entry in one transaction: the expense account (default 5000; it must be an expense account)
is debited with the amount without tax, the tax account (2100) with the reclaimable tax, and cash (method `cash`) or the bank
with the total. `voidExpense(id)` marks it void and reverses the entry. `expenseLines(e)` and `totals(list)` are pure.
Expenses are posting-only: `store.put('expenses', ...)` is refused.

Quotes are ordinary records (`store.put('quotes', ...)`, numbered QUO-0001, never deleted). Status: draft -> sent ->
accepted or declined; a sent quote can go back to draft, a declined one can be reopened, an accepted one is final.
`SlopData.quotes.toOrder(id)` makes a confirmed order and `toInvoice(id, { dueDate })` a draft invoice, in one transaction
that links both ways (`quoteId` on the new document, `orderId` or `invoiceId` on the quote) and accepts the quote. Nothing is
posted. `isExpired(q, day)` is pure.

Time entries are ordinary records (`store.put('timeEntries', ...)`): minutes (1 to 1440) at an hourly `rate`; billable time
needs a customer. `SlopData.timesheets.toInvoice(ids, { dueDate, taxRate })` bills open entries of one customer and one
currency onto one draft invoice (one line per entry, by date) and links them (`invoiceId`). Billed time cannot change its
date, customer, minutes, rate, currency or billable flag. Time on a void or deleted invoice is open again; `release(id)`
unlinks it. `amountOf`, `hm`, `isOpen`, `deadInvoice` and `lineOf` are pure.

Repeating invoices are `schedules` records (`store.put`, or `SlopData.recurring.fromInvoice(id, { every, unit, start,
endDate, dueDays })`). `makeDue(today, { scheduleId })` makes a draft invoice (with `scheduleId`) for every period due on or
before today, at most `CATCH_UP` (12) per schedule at a time, and moves each schedule on, in one transaction; a schedule
past its end date stops (`active: false`). Months keep `anchorDay`, clamped to short months. `step`, `dueDates`, `due` and
`describe` are pure; `SlopData.ledger.addDays` is the one date step every app uses (SlopDocs.model.addDays calls it).

## Result shape (every async call)

Every public async call **resolves and never rejects**: `{ ok: true, value }` or
`{ ok: false, code, message, errors? }`. `errors` is `[{ field, message }]` for validation failures.
Codes: `invalid`, `invalid_transition`, `immutable`, `posting_required`, `deleted`, `not_found`, `forbidden`,
`in_use`, `conflict`, `duplicate_source`, `unbalanced`, `insufficient_stock`, `overpayment`, `has_payments`,
`quota`, `blocked`, `unavailable` (no IndexedDB), `idb`, `aborted`.

## Money and tax (money.js)

- Amounts are **integer minor units** (cents). `$12.34` is `1234`. Never floats.
- Tax rates are **integer basis points**: `2000` = 20.00%.
- **Rounding: half away from zero** (ties go up in magnitude: 0.5 -> 1, 2.5 -> 3, -0.5 -> -1). All products use BigInt.
- Line: `gross = qty * unitPrice` (exact), `net = gross` less `discount` (optional basis points, `round(gross * (10000 - discount) / 10000)`; absent is 0), `tax = round(net * taxRate / 10000)`, `total = net + tax`. Prices are tax-exclusive.
- Document: `subtotal = sum(net)`, `tax = sum(line tax)` (rounded per line, then summed), `total = subtotal + tax`.
  `documentTotals(lines).byRate` gives the tax breakdown.
- `parseMinor('12.5')` -> `1250`, or `null` (never rounds typed text; too many decimals is `null`).
- **Typed amounts follow the UI language** (SlopI18n's current language; separators from `Intl.NumberFormat(lang).formatToParts`).
  `parseTyped(text, currency, lang?)` (= `parseMinor(text, currency, { typed: lang || true })`), `parsePercent(text, { typed })`
  (basis points, 0 to 100 %, two decimals at most) and `plainFromTyped(text, lang?)` (-> plain `"1234.5"` for other parsers, such
  as `locale.parseRate`). Rules, the same everywhere (the full list is the comment in money.js):
  - the language's decimal mark, and a plain `.` too (sv/de/fr `"12,50"` and `"12.50"`, en/ja only `"12.50"`); one at most;
  - group marks are optional, only the language's own and only in its pattern of three (hi 2-2-3): en `"1,234.50"`,
    de `"1.234,50"`, sv/fr `"1 234,50"` with a space, no-break space (U+00A0) or narrow no-break space (U+202F);
  - where `.` groups (de, es, it, pt-BR, nl, tr, id, vi), dots that fit the pattern are grouping (`"1.234"` is 1234), else one
    dot is the decimal point (`"12.50"`); where `,` groups (en, ja, zh, ko, hi), a comma is never decimal: `"1,234"` is 1234 and
    `"1,5"` is `null` (not 15, not 1.5);
  - a leading `-` or U+2212 is a minus; no `+`, currency signs, exponents or bare `".5"`; too many decimals is `null`.
  - Inputs are filled with `typedMinor(minor, currency)` / `typedPlain("12.50")` (the language's decimal mark, no grouping), so
    what is shown reads back the same. Examples and placeholders of typed fields use them too.
- **Strict callers keep `parseMinor(text, currency)`** (a dot, no grouping, never the page's language): AI tool arguments
  (ai-records.js), CSV imports without a format setting (Inventory products), stored data and files. Typed by a person:
  Ledger journal lines and manual rates, the company profile's tax rate, Expenses (amount, tax, rate, mileage), Inventory's
  product form, Timesheets (hourly rate, the bill's tax rate), and every document line and dialog through `SlopDocs.model`.
- `formatMinor(minor, currency, locale)` -> `"$12.34"` via `Intl.NumberFormat` only (digits from the currency, half-expand rounding).
  Settings hold `defaultCurrency` and `locale`; pass them in.
- Largest stored amount: `money.MAX_MINOR` (9e12).

## Collections (schema.js: `schema.def(name)`, `schema.COLLECTIONS`)

| collection | key | notes |
|---|---|---|
| `settings` | `id` ('main') | companyName, address, taxNumber, **defaultCurrency** (ISO 4217; the ledger's base; USD unless the browser's region says otherwise), locale (the browser's, else en-US), defaultTaxRate, paymentTermsDays, ratesUpdateOnOpen (bool, false) |
| `customers` | `id` | `sample` (optional boolean, true only for random samples), name*, email, phone, address, `categories[]` (tags), `stage` lead\|contacted\|customer\|lost (default lead), `notes` (text; the CRM writes dated lines `[YYYY-MM-DD] text`), `contactId` (the Slop Contacts id a customer was imported from; the CRM never imports the same id twice), `followUp` (date, optional). Contact fields (Slop Contacts reads and writes them; all optional): `company`, `department`, `title`, `website`, `birthday` (YYYY-MM-DD or --MM-DD when the year is not known), `photo` (a data URI or a link kept as text), `phoneLabel`, `emailLabel`, `addressLabel` (the label of the first phone, e-mail and address: mobile, work, home, other, or text), and `phones`, `emails`, `addresses` (`[{ label, value }]`, the further values after the first; `entries` type, at most 10). `phone`, `email` and `address` always hold the first value, so the CRM and Orders keep working. **Soft delete.** |
| `products` | `id` | `sample` (optional boolean, true only for random samples), sku* (no spaces, unique), `ean` (optional, unique, GS1 check digit), name*, price* (minor), taxRate* (bp), unit |
| `orders` | `id` | `sample` (optional boolean, true only for random samples), number (ORD-0001, auto), customerId*, date*, currency (default: base), status draft\|open\|fulfilled\|cancelled (`open` is shown as Confirmed), `lines[]`*, totals, invoiceId (the invoice made from it). Never deleted: cancel. |
| `invoices` | `id` | `sample` (optional boolean, true only for random samples), number (INV-0001, assigned on issue), customerId*, date*, dueDate, currency (default: base), status draft\|issued\|paid\|void, `lines[]`, totals (in `currency`), orderId; set on issue for a foreign currency: rateId, rate, amountBase. **Soft delete, drafts only.** |
| `payments` | `id` | invoiceId*, amount* (> 0, in the invoice's currency), date*, method cash\|bank\|card\|other; currency, amountBase, rate, rateId. Immutable. |
| `exchangeRates` | `id` | base*, quote* (ISO codes), date* (YYYY-MM-DD), rate* (integer, scaled by 1e6), source manual\|ecb\|fixed, note. **Immutable**: a correction is a new row. |
| `accounts` | `code` (4 digits) | name*, type asset\|liability\|equity\|revenue\|expense. Never deleted. |
| `journal` | `id` | date*, memo, source* (unique, e.g. `invoice:<id>:issue`), `lines[{account, debit, credit, origDebit?, origCredit?}]` (debit and credit in base), reverses; a foreign entry also has currency, amount (original), amountBase, rateId, rate. Immutable. |
| `stockMovements` | `id` | productId*, location (default main), qty* (signed, non-zero), reason receipt\|sale\|adjustment\|transfer\|count\|return, date*, ref. Immutable. |
| `stockCounts` | `id` | location*, date*, `lines[{productId, expected, counted, diff}]`, status posted. Immutable. |
| `numbering` | `id` ('invoice', 'order') | prefix, pad, next. Only moves forward. |
| `projects` | `id` | Slop Projects. name*, color (tag colour), start, end, notes, `columns[]`* (`rows`: id*, name*, wip 0–999, done; 1 to 12), `people[]`, customerId. Hard delete. |
| `projectTasks` | `id` | projectId*, title*, description, column* (a column id), order, assignee, priority none\|low\|medium\|high, start and end (both or neither, end not before start), due, `tags[]`, `checklist[]` (`rows`: text*, done), `deps[]` (ids of tasks that finish first; not itself), customerId. Indexes projectId, customerId. Hard delete. |

Field type `rows` (`F.rows(of, { min, max })` in schema-defs.js, checked by `checkRows` in schema.js): a list of small records with
their own field specs, such as a project's columns or a task's checklist. Unknown keys in a row are refused.

`*` = required. Every record also carries `createdAt`, `updatedAt` (ms), `version` (starts at 1, +1 per save), and
`deletedAt` for soft-deleted records. Those are stamped by the store; callers never set them.

Default chart (`schema.DEFAULT_CHART`, seeded on first open): 1000 Cash, 1010 Bank, 1200 Accounts Receivable,
2100 Sales Tax Payable, 3000 Equity, 4000 Sales Revenue, 5000 Expenses. `schema.ACCT` has the codes.

Rules enforced by `schema.js` and `store.js`:
- Unknown fields are refused. Text is trimmed, blanks are dropped, defaults applied, and totals are always
  recomputed from `lines` (callers cannot set them).
- `prepare(name, input)` normalises and validates. `validate(name, record)` checks a stored shape (needs `id`).
- Issued invoices: `customerId`, `date`, `dueDate`, `number`, `lines`, `notes`, totals are frozen. Status moves
  only draft->issued->paid|void (issued->void). Orders: draft->open->fulfilled|cancelled. A draft or open order is editable; fulfilled and cancelled are frozen (the invoice link can still be set).
- Invoice status can change only through `billing` (`store.put` refuses it otherwise).
- `journal`, `payments`, `stockMovements`, `stockCounts` are `postingOnly`: only `ledger`, `billing` and `stock` write them.
- Journal lines: each has exactly one positive side (debit or credit), whole amounts, and the entry balances.
  A foreign entry must also balance in its original currency, and `amount` and `amountBase` must equal the sums.
- New invoices and orders take `settings.defaultCurrency` unless a currency is given. A journal entry without a
  currency is a base-currency entry.
- The default currency cannot change once any journal entry exists (`base_locked`). Old postings never change.
- Stock sign rules: receipt and return add (+), sale removes (-), adjustment, count and transfer are non-zero.
- Products with stock movements cannot be deleted (`in_use`). Unique: sku, ean, invoice number, order number, journal source.

## Currency and exchange rates (currency.js, fx.js, rates-ecb.js)

- **Base currency** = `settings.defaultCurrency`. Every journal line and every trial-balance total is in base.
- **Rates**: a row says 1 unit of `base` = `rate / 1e6` units of `quote`, from `date`. `1.0842` is stored as `1084200`.
  `locale.parseRate('1.0842')` reads typed text (up to six decimals; a seventh decimal rounds half up).
- `fx.rateOn(base, quote, date)` (async) -> `{ id, rate, inverted, base, quote, date }`: the latest row on or before the
  date (a later-created row wins a same-day tie). With no direct row, a reversed row is used inverted. **It fails with
  `no_rate`** when neither exists; there is never a silent 1:1. The same currency is 1 with no row.
- `fx.addRate({ base, quote, date, rate, source?, note? })` -> the stored row. Rows cannot be edited or deleted.
- **Posting in a foreign currency** (`ledger.postJournal` or `billing.issue`): each line converts at the rate on the
  posting date, rounded half away from zero. The rounding difference goes to the largest line on the short side, so
  base balances. The entry keeps `currency`, `amount` (original debits), `amountBase`, `rateId` (the row used) and
  `rate` (the rate applied). Each line keeps `origDebit` and `origCredit`.
- A reversal of a foreign entry uses the same row and rate, so it cancels the original in base exactly. Old postings
  are never recomputed when new rows arrive.
- An invoice in a foreign currency takes its rate on issue and stores `rateId`, `rate` and `amountBase`. Payments
  convert at that rate. The payment that clears the invoice takes the remaining base amount, so the balance closes to
  zero. **No realised exchange gain or loss is booked** (not built yet).
- `ledger.trialBalance()` checks base totals (debits equal credits in base) and returns `foreign: [{ currency, debit,
  credit, balanced }]` for the original amounts, reported apart. A foreign entry that does not balance in its own
  currency is an error.
- Dates: `locale.formatDate('2026-10-11', locale)` (Intl, UTC, so the day never shifts). Numbers and currencies:
  `money.formatMinor(minor, currency, locale)`. **Translations of the app text are not part of this.** The locale only
  changes number, currency and date formats.
- `locale.currencies()` is `Intl.supportedValuesOf('currency')` when available. `locale.browserDefaults()` gives the
  browser's locale and the currency of its region (USD when unknown).

### Online rates (rates-ecb.js): opt-in and consent-gated

- Source: `https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A?lastNObservations=1&format=csvdata` (ECB daily
  reference rates, EUR-based, SDMX CSV). The data API sends `Access-Control-Allow-Origin: *`; the old XML file under
  `www.ecb.europa.eu` sent none, so browser fetches of it always failed. The host is on the allow-list in
  `shared/sync/HANDOFF.md`.
- `rates.updateRates({ fetch?, allowed?, today? })` checks the `rates` consent category **before** any
  request (`consent_off`, and no fetch, otherwise). It reads the CSV by hand (never evaluated) and stores one
  row per currency with source `ecb` for today's date (`note: "ECB reference <date>"`), in one transaction. A same-day
  row with the same rate is left alone. Returns `{ date, referenceDate, added: [{ quote, rate, previous }], unchanged: [] }`.
  A failed download, an HTTP error or an unreadable file stores **nothing**, and the message says so.
- `rates.updateOnOpen()` runs `updateRates` only when `settings.ratesUpdateOnOpen` is true **and** the category is on.
  The Settings page calls it when it opens. Other pages must opt in the same way. Nothing else runs in the background.
- `rates.parseEcb(text)` is pure. It reads the CSV columns `CURRENCY`, `TIME_PERIOD` and `OBS_VALUE`, skips rows with an
  empty `OBS_VALUE`, and keeps only the rows on the newest `TIME_PERIOD`. The API returns the last observation of every
  series, so discontinued currencies carry old dates and must not be stored as today's rate. It returns
  `{ date, rates: [{ quote, rate }] }` with rate scaled by 1e6.

## store.js: storage

- `store.ready()` opens the DB and seeds defaults (idempotent). Other calls do this implicitly.
- `store.get(name, id, { includeDeleted? })` -> `value` record or `null`.
- `store.list(name, { index?, value? | lower?/upper?, includeDeleted?, filter?, limit? })` -> array.
  Indexes: customers `name`, `stage`, `categories` (multi-entry tag); products `sku`, `ean`, `name`;
  invoices `number`, `customerId`, `status`, `date`; payments `invoiceId`, `date`; journal `source`, `date`, `reverses`; etc.
- `store.put(name, record, { posting? })` -> saved record. `store.remove(name, id)` -> `{ id, soft }`.
  New invoices and orders take the default currency here when none is given. A settings change of `defaultCurrency`
  is refused (`base_locked`) once any journal entry exists. On first open after version 1, a stored `currency`
  field in settings moves to `defaultCurrency`.
- `store.transact(fn)`: `fn(tx)` runs in ONE read-write transaction over every store. `tx` has
  `get(name, id)`, `list(name, opts)`, `put`, `remove`, `allocate(seq)`, and `fail(result)`. A failed step, or
  returning a failed Result, rolls back everything. Only IndexedDB work may happen inside `fn` (no fetch, no timers).
- `store.readAll(fn)`: `fn(tx)` in one read-only transaction (same `tx.get`/`tx.list`).
- `store.subscribe(({ changes: [{collection, id, kind}], source })` -> unsubscribe. `source` is `local` or `remote`
  (other tabs, through BroadcastChannel). Fires only after a commit.
- `store.newId()` (UUID). `store.erase()` deletes the whole database (destructive; confirm in the UI).

## numbering.js

- `numbering.next('invoice')` -> `"INV-0007"` in its own transaction. `numbering.peek(name)` -> the next one.
- Inside `store.transact`, `numbering.allocate(tx, name)`. Invoices take a number when they are issued;
  orders take one on creation (`autoNumber` in the schema). The number commits or rolls back with the document, so there are no gaps.
- `format(seq, n)`, `parse('INV-0007')`, `take(seq)` are pure.

## ledger.js (double entry)

- `ledger.postJournal({ date, memo, source, lines: [{ account, debit, credit }] })` -> entry. Refuses unbalanced
  entries, unknown or non-integer amounts, and a `source` already posted (`duplicate_source`).
- `ledger.reverseJournal(id, { date?, memo? })` -> reversing entry (source `reversal:<id>`, so one reversal per entry).
  Posted entries are immutable: `store.put`/`remove` return `immutable`.
- `ledger.trialBalance()` -> `{ rows: [{ code, name, type, debit, credit, balance }], debit, credit, balanced, errors }`
  as a Result. Fails with `unbalanced` (and `summary`) when the totals disagree.
- Pure: `ledger.validateEntry(entry, accounts?)`, `ledger.summarize(entries, accounts)`, `ledger.reverseLines(lines)`.

## billing.js (the only way to issue, pay or void)

- `billing.issue(invoiceId)`: draft -> issued. Numbers it, posts Dr AR total, Cr Sales Revenue subtotal, Cr Sales Tax Payable tax.
  Needs an existing customer. Zero-total invoices post nothing.
- `billing.recordPayment({ invoiceId, amount, date?, method?, note? })`: partial or full. Cash debits Cash (1000), others Bank (1010).
  Credits AR. Marks the invoice paid when nothing is due. Refuses overpayment.
- `billing.voidInvoice(invoiceId)`: issued -> void, only while there are no payments. Reverses the issue entry. The number stays used.
- `billing.invoiceFromOrder(orderId, { dueDate? })`: one transaction. Creates a draft invoice with the order's customer, currency, notes and lines (discounts included), sets `orderId` on the invoice and `invoiceId` on the order. Refused for draft or cancelled orders, and while the order's invoice still exists (`conflict`).
- Pure: `billing.invoiceLines(invoice)`, `billing.paidOn(payments)`, `billing.balanceDue(invoice, payments)`.

## stock.js

- Stock on hand is never stored. It is the sum of movements.
- `stock.onHand(productId, location?)`, `stock.levels(productId)` -> `{ location: qty }`.
- `stock.move({ productId, location, qty, reason, date?, ref?, note? })`. A negative movement that would take the
  location below zero fails with `insufficient_stock` unless `allowNegative: true`.
- `stock.transfer({ productId, from, to, qty, date?, note? })`: two movements sharing a `transfer:` ref.
- `stock.postCount({ location, date?, counts: [{ productId, counted }], notes? })`: one `count` movement per
  difference and one `stockCounts` record, in one transaction.
- `stock.lowStock(threshold)` -> `[{ productId, sku, name, onHand }]`, lowest first.
- `stock.lookupBarcode(code)` -> product or `null`. Tries the EAN (if the check digit is valid), then the SKU.
- Pure: `onHandOf`, `levelsOf`, `lowStockRows`, `countRows`.

## barcode.js

- `barcode.isValidEan(code)` (8, 12, 13 or 14 digits with a valid GS1 check digit), `barcode.checkDigit(body)`,
  `barcode.normalizeEan(text)` (strips spaces and hyphens).

## export.js and bundle-check.js

- `exporter.exportFile()` -> `{ name: 'slop-data-YYYY-MM-DD.json', blob }` (every record, deleted ones included).
  `exporter.exportBundle()` -> the plain object.
- `exporter.importBundle(objectOrJsonText)`: validates the **whole** file first (`bundleCheck.validateBundle`:
  format and version, every record against the schema, unique keys, references, balanced ledger, gapless
  invoice and order numbers with the counter past the last one). Only then does it replace every collection in
  one transaction. A bad file changes nothing; the result has `errors`.
- `bundleCheck.validateBundle(bundle)` -> `{ ok, errors: [string] }` is pure and can be used to preview a file.

## Tests

- `node tests/run.mjs data` runs `tests/node/data.test.mjs`, `tests/node/data-ledger.test.mjs` and
  `tests/node/data-fx.test.mjs` (pure logic, and an in-memory transaction over the real schema: rate lookup, scaling and
  half-up rounding, EUR into a USD ledger, old postings unchanged after a new row, reversals, the base trial balance,
  and the ECB CSV parse on a fixture). It also runs the browser pages `tests/data/store.test.html` (IndexedDB behaviour:
  validation, soft delete, uniqueness, transactions and rollback, numbering rollback, subscribers),
  `tests/data/flows.test.html` (issue, payments, voids, reversals, stock, counts, export and import) and
  `tests/data/currency.test.html` (default currency, base lock, immutable rates, a foreign invoice paid to the base total,
  the ECB CSV parse, and consent off means no fetch).

## Not built yet (decide before the apps need it)

- Fractional quantities (quantities are whole numbers), and a line in a different currency from its document.
- Realised and unrealised exchange gains or losses (payments on foreign invoices convert at the issue rate, so no gain
  or loss arises yet). Cross-rates through a third currency: GBP to USD needs its own row, or the inverse of one. A
  rate-history view, and deletion of a mistaken row (rows are immutable; add a correcting row instead).
- Import of a version 1 backup: its settings still carry `currency`, so the bundle check refuses it until renamed.
- Translations of the app text (the locale only changes number, currency and date formats).
- Automatic background rate updates: none. Only the Settings button, or "Update on open" when both it and the consent category are on.
- Revenue accounts per product (all sales credit 4000 Sales Revenue), and tax-inclusive pricing.
- Due-date reminders and aged receivables reports (the invoices app lists overdue and balances per customer).
- Accounts cannot be deactivated or deleted, and there is no UI or rule for renaming them safely once used.
- Cross-tab conflict UI: the transactions serialise writes correctly, but the apps must re-read on `subscribe` events.
- Authorisation. Posting-only checks protect integrity inside the app, not against a malicious script.

## Random barcodes and example files (added with SlopLabel's generator)

- `SlopData.barcode.randomValue({ symbology, kind, length, prefix, rand })` and `randomValues(n, opts)` (distinct values):
  Code 128, Code 39, QR and Data Matrix take `kind` (digits, letters, alnum), `length` and a `prefix`. EAN-13, EAN-8 and UPC-A
  are always digits with a valid GS1 check digit (`prefix` is the leading digits). Values come from `crypto.getRandomValues`
  with rejection sampling. Pass `rand` (a function returning [0,1)) for a repeatable sequence. `seededRand(seed)` makes one (tests).
- `SlopExamples` (`shared/data/examples.js`): `kinds()`, `info(kind)` (title, file, columns, note), `csv(kind)` (CSV text, no
  network) and `download(kind)`. Kinds: `label` (SlopLabel merge data), `inventory` (product CSV import), `contacts` (Google
  Contacts CSV, which Slop Contacts reads), `crm` (the same columns; the CRM imports them through Slop Contacts).
- Tests: `tests/node/barcode-gen.test.mjs`, `tests/node/examples-csv.test.mjs`.

## Status flows

Invoices, orders, quotes and purchase orders each have a flow in `schema-defs.js` (`FLOWS`): the statuses each status may go
to, the statuses the document can still be edited in, the fields locked otherwise, and the refusals in plain words.
`schema.checkTransition` applies them; there is no per-collection code.

Purchase orders (`purchases`, PO-0001) are ordinary records for draft, ordered and cancelled. `SlopData.purchases.receive(id,
{ date, location })` puts every product line into stock and marks the order received, and `recordBill(id, { date, account,
method })` records the supplier's bill as a posted expense (`SlopData.expenses.recordIn`, the in-transaction form of
`record`) and links it (`expenseId`), each in one transaction. The supplier is a contact (`customers`) with `supplier: true`.
