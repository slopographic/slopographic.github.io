# Slop Inventory: handoff

Products, stock by location, barcode scanning (camera or any USB or Bluetooth scanner), stock counts, reports and
backups. Browser only, no build step, no network. Every change is written through `SlopData` (see
`shared/data/HANDOFF.md`): `SlopData.store` for products, `SlopData.stock` for every stock change, `SlopData.exporter`
for backups. No second product or stock model exists here.

## Files

- `index.html`: the page (six views: Products, Scan, Stock, Count, Reports, Data). Loads `shared/data`, the core, the
  scanners and the views, in that order.
- `css/inventory.css`: tokens (dark by default, `data-theme="light"`), the product rows (name and SKU, one column), the
  scan panel and forms.
- `js/core/`: no DOM, so the tests load it directly.
  - `util.js`: refusals in plain words, money formatting and parsing, the DOM builder `h()`.
  - `csv.js`: CSV parse and build (quotes, CRLF, BOM, semicolons).
  - `products.js`: save, delete (refused with the reason when stock history exists), SKU lookup.
  - `import.js`: plan a CSV import (validation report, nothing written), apply it all or nothing, export rows.
  - `rows.js`: product rows with on hand, low-stock flag and stock value (`money.mulDiv`, integer minor units).
  - `stock-ops.js`: receive, sell, adjust, transfer through `stock.move` and `stock.transfer`; undo as a counter-movement.
  - `count.js`: the open count (in memory), review, and `stock.postCount` in one step.
  - `scan.js`: one scan: lookup, the chosen action, a log entry; undo.
- `js/scan/wedge.js`: keyboard-wedge capture on the scan field.
- `js/scan/camera.js`: BarcodeDetector plus getUserMedia, about 5 frames a second.
- `js/ui/`: app boot and view switching, products, the product form (the products view's right panel), CSV import and backup, stock, scan view, count,
  reports, SlopCmd commands.

Shared change: `shared/data/schema-defs.js` gained one optional product field, `reorderLevel` (whole number, zero or
more). A product with no reorder level is never flagged low. `shared/apps.js` gained the registry entry.

## What works

- Products: search, sort (name, SKU), filter to low stock, add, edit, delete (refused while stock
  movements exist, with the reason). Right-click or the Menu key on a row: Edit product, Show movements, Delete.
  Each list row shows the product name and the part number (SKU) only. Price, tax, EAN, on hand and reorder level
  are not in the rows: they are in the product form, the reports and the CSV export. A low product still shows its
  SKU in the warning colour, the low-stock filter still works, and the line above the list still gives the stock value
  total. To see a product's stock, use Show movements or the Stock tab.
- Import CSV (SKU, EAN, Name, Price, Reorder level; any column order): preview with new and update counts, a line
  report with errors, and an import that is refused as a whole when any row is wrong. A row whose SKU exists updates
  that product; tax rate and unit are kept. An export imports back.
- Export the product list as CSV. Download a full backup (`slop-data-DATE.json`). Restore a backup through the
  validated import; a bad file changes nothing and its errors are listed.
- Stock: levels per location (default `main`), movement history, and forms for receive, sell, adjust (signed) and
  transfer. Sales below zero are refused unless "Allow stock below zero" is ticked.
- Scan: an action (Receive +, Sell −, Count, Look up only) and a quantity (default 1) shared by both modes, and a
  location. The scan log lists each scan with its result. Undo reverses the newest movement by a counter-movement.
- Count: start at a location, set counted quantities or scan with the Count action, review the differences, then post
  them in one step. Cancelling writes nothing.
- Reports: stock value (on hand times price, before tax, whole minor units, formatted for display), low stock
  (at or below reorder level), value by product.
- Commands (⌘K or Ctrl+K): scan mode, receive, sell, adjust, transfer, start and review or post a count, cancel a
  count, undo last scan, products, reports, backup.

## Scanner modes

- Keyboard or scanner (every browser, always available): the scan field has focus in the Scan view. A scanner types
  the code fast and presses Enter. Enter ends one scan. A burst (median gap under 60 ms, at least 3 keys) is marked
  "Scanner"; slow typing is marked "Typed". Both are scanned the same way. Key repeat on Enter is ignored.
- Camera (needs `window.BarcodeDetector` and `getUserMedia` on a secure page): Chromium-based browsers today. Frames
  are read about 5 times a second. A code held in view is reported once, and again only after it has left the view
  for three frames in a row, so one label cannot make several movements. Where the browser has no BarcodeDetector,
  the camera panel says so and the keyboard mode is still there.
- On any scan, the result stays on screen for at least 2 seconds. A newer scan within that time is logged at once and
  shown when the 2 seconds are up.
- An unknown code: a valid EAN offers "Create product with this EAN" (the form opens with the EAN filled in) and "Link
  EAN to this product" (only for a product with no EAN). After either succeeds, the same code is scanned again so the
  chosen action applies. A code that is not an EAN offers "Create product with this code as SKU" only.
- A wrong check digit is rejected with the digit it should have, and nothing is written.

## Limits

- The scan log, the count and the scan field's state are in memory. A reload clears them. Stock movements persist.
  After a reload, an old scan cannot be undone from the log; reverse it with Adjust in the Stock tab.
- Count mode is not a movement. Each scan adds to the count's counted quantity, and nothing changes until the count is
  posted. So Count scans are undone by taking them back out of the count, not by a counter-movement.
- Linking only works for EANs. A non-EAN code can become a SKU only by creating a product.
- Stock value uses the selling price and excludes tax. There is no cost price.
- CSV import matches existing products by SKU only. Tax rate and unit are never taken from the file. An EAN column
  that is blank clears the EAN of an existing product; a missing EAN column keeps it.
- Restore replaces every record of the shared business data, including customers, invoices and the ledger. The
  confirmation says so.
- Locations are free text (any name), listed from the movements already stored. There is no location manager.
- Camera mode is tested with a stub (the missing-API message) and by reading the code; it has not been run against a
  real camera in these tests. Only Chromium has BarcodeDetector.
- Multiple tabs: store changes from another tab redraw the open view. The count session stays in the tab that opened it.

## Next steps

- Keep the scan log and an open count in IndexedDB so a reload does not lose them.
- Cost price and a stock value at cost; price history.
- Revenue account per product (the ledger still credits 4000 for every sale).
- Print or export product labels from a list (SlopLabel can read the CSV).
- Non-EAN links, and location names with a manager and a default location per user.

## Tests

- `node tests/run.mjs inventory` runs `tests/inventory/`:
  - `scan.test.html`: EAN lookup and receive; each scan one movement; SKU lookup; look up only; unknown EAN creation
    keeps the EAN; wrong check digit rejected; sale below zero refused; keyboard-wedge burst and slow typing; a held
    Enter; undo of a receipt, a sale, and a count tally; undo refused below zero; camera message with BarcodeDetector
    missing (stub).
  - `stock.test.html`: count differences and posting; no open count; transfer; zero and fractional quantities; negative
    adjustment rule; delete refused with stock history; low stock at or below the level; stock value in minor units;
    CSV preview, all-or-nothing, duplicates, missing columns, export round trip, quoted cells.
  - `app.test.html`: the real page in a 390 px frame: add a product in the form, the list row shows name and SKU with no
    price, scanner burst in the Scan view, unknown EAN creation applies the scan, refused sale, undo, camera fallback,
    Stock tab, count post, reports, no errors.
- `node tests/run.mjs data` covers the shared data layer, including the new `reorderLevel` field.

- `js/core/pricelist.js` (pure: rows by name with the price with tax, search, CSV) and `js/ui/prices.js`: the Price list tab,
  a printable business sheet (`shared/biz/sheet.js` and `sheet.css`) with Print and CSV.
