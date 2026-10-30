# Slop Timesheets: handoff

Time tracking for a business: a timer or typed time, per customer and project, at an hourly rate, billable or internal;
totals by week or month; CSV; and billing open hours onto a draft invoice. Browser only, no build step, no network. Every
record goes through `SlopData` (see `shared/data/HANDOFF.md`): `timeEntries` in the store, `SlopData.timesheets` for
billing (one transaction: the draft invoice and the links). The invoice is issued in Slop Invoices.

## Files

- `index.html`: the page (Time, Entry, Bill). Loads `shared/data` (with `timesheets.js`), `shared/docs/model.js` (dates),
  `shared/biz` (base, router), SlopList and SlopTabs.
- `css/timesheets.css`: the timer card and the billing rows only.
- `js/core/time.js`: pure: `parseDuration` ("1:30", "1.5", "90m", "2h 15m"), `hm`, `periodRange` (weeks run Monday to
  Sunday), `filter`, `summary`, `csv`. Node tests in `tests/node/timesheets-core.test.mjs`.
- `js/core/entries.js`: rows for the list (customer name, state open / billed / internal, amount, invoice number), customers,
  the rate and project last used, project names, save (releases time on a void or deleted invoice first).
- `js/ui/list.js`, `timer.js`, `editor.js`, `bill.js`, `commands.js`, `app.js`: the list with filters and totals, the timer,
  one entry, billing, the commands, and the routes (`#list`, `#new`, `#new/<id>`, `#t/<id>`, `#bill`, `#bill/<customer>`).

## Rules

- Billable time needs a customer; internal time has none. Minutes are 1 to 1440 per entry.
- Each entry bills as one invoice line, quantity 1, priced minutes x rate / 60 (rounded), described with its date, project,
  description and h:mm. One invoice per customer and currency.
- Billed time cannot change its date, customer, minutes, rate, currency or billable flag, and cannot be deleted. Void the
  invoice (or delete it while it is a draft) and the time is open again.
- The timer is kept in this browser (localStorage), so it survives a reload; nothing is stored in the books until the
  entry it opens is saved.

## Tests

`tests/data/timesheets.test.html` (data rules and billing), `tests/node/timesheets-core.test.mjs` (pure parts),
`tests/timesheets/app.test.html` (the app end to end at 1100 and 390 px).
