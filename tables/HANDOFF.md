# Slop Tables: handoff

Status: **building** (kept in shared/apps.js). The first working version exists: a grid UI on the engine,
with native storage in Slop Drive, CSV and XLSX export, XLSX and ODS import, charts and pivot tables. Print/PDF,
conditional formats, validation, sort/filter, find and comments are not built yet (see "Known limits").

## Files
- `index.html`, `css/tables.css`: the page (top bar, formula bar, grid, sheet tabs, status bar). Dark by default, `data-theme="light"` for light.
- `js/engine/`, `js/fn/`, `js/fmt/`: the engine (unchanged in this pass).
- `js/io/native.js`: `.stab` JSON (`toNative`, `fromNative`, `toBlob`, `fromBlob`). `checkNative(obj)` is the one structural validator, used by `fromNative` and by template import. Cells keep their input: formula text (`f`), or typed value (`v`, `e` for errors), plus a style id into a style table. Computed values are not stored; they recalc on open.
- `js/io/csv.js`: `toCsv(sheet)` (displayed text, CRLF, quoting) and `parseCsv(text, delim)`.
- `js/io/xlsx.js`: `toXlsx(wb)` → Blob, built with shared/office `zip.js` and `xml.js`. Writes values, formulas with cached values, bold/italic, number formats (custom ones registered), column widths, row heights, hidden rows and columns, merges, freeze panes, sheet view selection and global names.
- `js/ui/state.js`: shared state `S` (workbook, active sheet, selection `{r, c, er, ec}`, edit, file), `redraw()` (rAF-coalesced repaint) and `changed()` (dirty + events).
- `js/ui/layout.js`: `Axis` (offset ↔ index with sparse overrides, binary search) and `axesFor(sheet)`.
- `js/ui/grid.js`: the virtualised renderer. Only visible cells, column and row headers and the selection are in the DOM. Frozen rows and columns use the same `metrics()` as hit-testing. `ensureVisible`, `placeEditor`.
- `js/ui/pointer.js`: click, drag, Shift+click, double-click to edit, header selection, header-edge resize, corner selects all.
- `js/ui/keys.js`: arrows (Ctrl jumps to data edges, Shift extends), Home/End, PageUp/PageDown, Enter/Tab (Shift reverses), F2, Delete/Backspace, typing starts an edit.
- `js/ui/nav.js`: `moveTo`, `jumpEdge` (Excel rules).
- `js/ui/editor.js`: in-cell editor and formula bar, sharing one `S.edit`. Enter/Shift+Enter, Tab/Shift+Tab, Escape, Up/Down (when not a formula) commit; blur commits.
- `js/ui/actions.js`: style patches, clear, copy/cut/paste (formulas shifted), freeze, select all, selection stats, clipboard events.
- `js/ui/history.js`: undo/redo by workbook snapshots (native JSON + active sheet + selection), up to 200 steps. `transact(fn)` records one step if anything changed; `beginStep`/`commitStep` for drags.
- `js/ui/sheets.js`: tabs: switch, add, rename (double-click or menu), delete, right-click menu.
- `js/ui/chrome.js`: toolbar state, name box (type `B7` or `A1:C9` to jump), formula bar sync, status (Count, Sum, Average), save state, document title.
- `js/ui/commands.js`: every command (id, title, group, keys, `when`). Registered with SlopCmd (palette and remappable keys, ⌘K button). Without SlopCmd, `runShortcut` handles the Ctrl/⌘ keys. The menus (File, Edit, Format, View, Sheets, Help) are built from the same list.
- `js/ui/ai-commands.js`, `js/ui/ai-ops.js`: the Slop AI panel's commands with argument schemas (hidden from the palette, one undo
  step each): `sort_column`, `filter_rows`, `clear_filter`, `add_column`, `fill_column`, `set_cell`, `undo`; plus `SlopCmd.provide`
  state (sheets, table range, column headers, selection, filtered rows) and checkpoint. Loaded by `SlopCmd.prepare()` with a dynamic
  import (commands.js), so first paint is unchanged. Filter marks rows `filtered` (saved in `.stab`, not exported as an XLSX autofilter).
- `js/ui/storage.js`: open and save through SlopHub (see "Storage"), CSV import, downloads, `launch()`.
- `js/ui/drafts.js`: autosave draft in IndexedDB (`slop-tables-drafts`), written 0.6 s after a change, restored on a plain start.
- `js/ui/main.js`: boot and the test API `window.SlopTables` (`type`, `setCell`, `value`, `text`, `el`, `select`, `flush`, `save`, `csv`, `xlsx`, `native`, `command`, `undo`/`redo`, `ready`).
- `js/ui/numfmt.js`: number format presets (the engine's fmt/ codes).
- `js/io/import.js`, `js/io/import-charts.js`: XLSX and ODS import. The shared reader (`shared/sheets/read.js`, also used by
  Slop Sheets) reads the file; `importSheets(doc)` builds the workbook: values, formulas (recalculated; shared formulas filled
  in from their first cell; `_xlfn.` dropped), number formats and dates, bold, italic, column widths, row heights, merges,
  frozen panes and charts whose series are one block of cells. It returns `notes` (functions the engine lacks, charts left
  out, and the reader's `skipped` list: pictures, macros, comments, conditional formatting, …), shown in a notice on open.
- `js/objects/`: charts and pivot tables, no DOM. `region.js` (range text → cells, current region), `chart-data.js` (a chart's
  series and categories read live from its range; header row and label column guessed, or fixed by `header`/`catCol` from an
  import), `chart-svg.js` (the picture as an SVG string: column, bar, line, pie; validated 8-colour palette, light and dark;
  every mark has a hover title), `pivot.js` (the summary: row fields, one column field, values with sum, count, average, min,
  max, totals), `pivot-write.js` (read the source, write the summary as plain cells, overlap check, refresh), `store.js`
  (the `charts` and `pivots` lists of each sheet in the `.stab` file, checked by `checkNative`).
- `js/io/xlsx-charts.js`: charts in the XLSX export (drawing part plus a DrawingML chart part per chart, series referencing
  the same cells, values cached). Pivot tables go out as their cells.
- `js/ui/charts.js` (the chart boxes over the grid: select, drag, resize handles, Edit and × buttons, Delete key, arrows nudge),
  `js/ui/chart-dialog.js` (Insert ▸ Chart… and Edit chart, live preview), `js/ui/pivot-dialog.js` (Insert ▸ Pivot table… and
  Edit), `js/ui/objects.js` (commands, context menu rows, the sidebar's Charts and pivots with Refresh, sheet rename carried
  into sources), `js/ui/drop.js` (files dropped on the window open: .stab, .xlsx, .xlsm, .ods, .csv, .tsv).
- `js/templates/`: built-in templates. One data file per template (`budget.js`, `invoice.js`, `inventory.js`, `timesheet.js`, `project-plan.js`, `sales-pipeline.js`, `expense-claim.js`, `grade-book.js`): `{ id, name, description, sheets: [{ name, widths: {A: px}, styles: [[range, {b, i, nf, al}]], cells: {A1: 'input text'} }] }`. `build.js` makes a workbook from one (cells typed like a user types, so formulas compute). `index.js` lists `BUILTIN`.
- `js/io/template.js`: the `.stab-template` file (`format: 'slop-tables-template'`, name, description, one `.stab` workbook). `parseTemplate(text)` validates and does a full build before returning, so a broken file keeps nothing.
- `js/ui/template-store.js`: My templates in IndexedDB (`slop-tables-templates`, store `templates`) and the Drive `Templates` folder (root, created on first use).
- `js/ui/templates.js`: File ▸ From template… (dialog with cards: name, description, a small preview of computed values, Preview, Use, and ⋯ for download, Save to Drive, delete), File ▸ Save as template… (IndexedDB and a copy in Drive), import file or from Drive (validated, adds to My templates). Exposed as `SlopTables.templates`.

## Storage and Slop Drive
- Native type: `.stab`, mime `application/x-slop-table`. This is the `creates` entry in shared/apps.js, which Drive's New ▸ menu uses. (The brief said `.stables`; the registry says `.stab`, so `.stab` is used.)
- Launch: `?drive=<id>` opens that record. A zero-byte `.stab` (New ▸ Spreadsheet in Drive) opens as a blank workbook that saves back to the same id. A `text/csv`, `.tsv`, `.xlsx` or `.ods` record opens as an unsaved import, so its Drive record is never overwritten with `.stab` data. An unknown id opens a blank workbook. File ▸ Open file from this device… and a drop take the same files.
- Save: with a Drive id, `SlopHub.put(blob, { id, name, folderId, from: 'tables' })`. On the first save, `SlopHub.pickFolder` picks a folder, then `put`. (Same behaviour as `saveToDrive`, but it allows the test to stub the folder choice.) The URL gets `?drive=<id>`. Without SlopHub (offline), Save downloads the `.stab`.
- `SlopHub.register('tables')` on launch. `SlopGuard.setUnsaved('tables', dirty)` keeps the reload warning honest.
- Draft: a plain start with an unsaved draft restores it (toast "Restored your unsaved workbook").

## Templates
- File ▸ New is "New workbook" and "From template…" (both top level, also in the palette). "From template…" lists the 8 built-ins and My templates. Using a template opens it as a new, unsaved workbook (asks first if the current one has unsaved changes), named after the template.
- Save as template keeps the current workbook (cells, styles, widths, all sheets) as a template named by the person. Import and export use `.stab-template`. Export downloads the file or saves it to Drive's Templates folder. Import accepts a file or a Drive record and never changes anything when the file is broken.

## Tests
- `tests/tables/objects.test.html` (20 tests: a real .xlsx from SlopSamples opened, an .xlsx in Drive, a dropped .ods, the
  not-imported notice, .xls refused, chart XLSX round trip; Insert chart, live update, move/resize with undo, edit, delete,
  save and reopen, XLSX chart part; Insert pivot, Refresh, same-sheet place with the overwrite question, right-click Edit,
  save and reopen, sheet rename). Node: `tests/node/tables-objects.test.mjs`, `tests/node/tables-import.test.mjs`.
- `tests/tables/ai-commands.test.html` (7 tests: the AI commands through `SlopCmd.exec`, clamping, errors, undo, state, checkpoint).
- `node tests/run.mjs tables`: `tests/tables/templates.test.html` (9 tests: every built-in opens and its formulas compute, Budget and Invoice checks, the From template dialog, Save as template with the Drive copy, export and import round trip, broken import changes nothing, import from Drive), `tests/tables/app.test.html` (37 tests: boot, formulas, keyboard editing, styles and undo, layout and virtualisation, freeze panes, sheets, Drive save and reopen, zero-byte .stab, CSV in Drive, unknown id, autosave draft, CSV export text, XLSX package, native round trip) plus the engine's 11 tests. All green.
- Helpers in `tests/tables/tables.helpers.js`. The app runs in same-origin iframes, so the real Slop Drive and draft stores are used. Only the folder picker is stubbed.

## Known limits in this pass
- Import: XLSX and ODS read values, formulas, formats, sizes, merges and frozen panes; XLSX charts made of one block of cells.
  Not read: pictures, ODS charts, chart sheets, comments, conditional formats, validation, filters, macros (the notice says
  which a file had). Old .xls is refused with the reason. Formats a reader cannot map (ODS fractions, conditions) fall back.
- Charts: column, bar, line and pie only (no scatter, area, stacked or combo), one block of cells per chart, at most 8 series
  shown (pie: 7 slices plus Other). No axis titles, data labels or per-series colours.
- Pivot tables: one column field, two row levels, up to four values; refresh is by hand (sidebar, context menu, Insert menu),
  not on every edit; no grouping of dates, filters or calculated fields. In XLSX they are plain cells, not Excel pivot tables.
- Export: CSV exports the active sheet, as displayed. XLSX writes charts but no conditional formats, validation or comments. Newer functions (LET, LAMBDA, dynamic arrays) are written without the `_xlfn.` prefix, and spilled cells are written as plain values. ODS and print/PDF are not built.
- Editing: a click on another cell while typing a formula does not insert a reference (no point mode). Arrow keys in a formula edit move the caret. There is no fill handle and no autofit on double-click of a header edge.
- Structure: no insert or delete of rows and columns (the engine has `adjustForStructure` but no `Workbook.insertRows`).
- Templates: no template editing or deleting built-ins, no template categories or search, no thumbnails (the preview is a table of values), no sharing between devices except through Slop Drive.
- Not done: conditional formats, data validation, sort and filter, find, comments, fill colour and text colour, merge commands in the UI (the model and XLSX export support merges), zoom.
- Phone sidebar: at 720 px and under the sidebar column is only its toggle strip (›), and the toggle opens Sheets, Charts and pivots, Templates and Functions as a drawer from the left (`SlopSheet` from `shared/ui/sheet.js`, `side: 'start'`, in `js/ui/sidebar.js`). The toggle again, the shared ×, Escape, a tap outside, a swipe left, picking a sheet or a function close it; the desktop collapsed choice is not touched. `tests/tables/tables.spec-layout.js` checks it in the 390 px frame.
- Layout: a phone (390 px) has no page scroll, but the menus and toolbar scroll sideways inside the top bar. Sheet scroll positions are not remembered between sheets. Text does not spill into empty neighbours.
- Undo covers edits, styles, paste, sheet operations, freeze and resize. Sheet selection and scroll are not undo steps.

## Next steps, in order
1. (done) XLSX and ODS import.
2. Point mode in formulas, and fill handle and autofit.
3. Insert and delete rows and columns (`Workbook.insertRows` / `deleteRows`: move cell keys, row and column props, merges, then `calc.dirtyAll()`).
4. Sort, filter and find; conditional formats; validation; comments.
5. ODS export and print/PDF with page setup (a print preview that matches the print output).
6. (done) Charts (SVG) and the pivot builder. Next there: chart types (scatter, area, stacked), axis titles, data labels,
   pivot date grouping and filters, and reading ODS charts.
7. The offline single-file build (`tables/` modules are plain ES, so a small bundler can inline them), then SlopCmd palette and keymap tests.

## Assistant: making workbooks (`js/ui/ai-create.js`, `js/io/build.js`)
Registered with the other `tables.ai.*` commands (`ai-commands.js`, on `SlopCmd.prepare()`): `new_workbook` and `build_table`
(rows, or `sheets: [{ name, rows }]`; a new tab, header row bold), `set_range` (rows of values and formulas from a cell),
`add_rows` (under the table), `add_sheet`, `format_cells` (bold, italic, number format, alignment; Tables has no fill colour),
`create_chart` (column, bar, line, pie), `delete_rows` and `delete_column` (destructive; formulas, names, charts and pivots
follow or become #REF!, through the native JSON like `insertColumn`), `export_workbook` (xlsx, csv of the active sheet, .stab;
Slop Drive through `shared/commands/sources.js` and/or a download). `io/build.js` (no DOM) writes cells with the engine's
own `input`/`setFormula` and checks every formula first; the operation `table-data-to-spreadsheet`
(`shared/ops/create-tables.js`) uses it with `io/xlsx.js` headlessly. The checkpoint closes the tabs the assistant opened.
Test: `tests/tables/ai-create.test.html`.
