# SlopLabel: handoff

Status: **beta.** The designer works end to end in the browser: design, data merge, print, PDF/ZPL/EPL/TSPL/PNG/SVG export, ZPL import and preview, print-form links, Slop Hub, offline single-file build. Tests: `node tests/run.mjs label` gives 62 passing, with no console errors. Not yet checked on real printer hardware (see Known risks).

## Layout (classic scripts with top-level globals; every file is under 300 lines)
`index.html` loads the scripts in this order: `../shared/slopui.js`, `../shared/apps.js`, `../shared/hub.js`, `../shared/commands/*.js` (all five parts listed, so the offline build inlines them), `../vendor/bwip-js/bwip-js-min.js`, then core → barcode → vars → render → print → io → templates → ui. Keep the exact tag forms `<link rel="stylesheet" href="…">` and `<script src="…"></script>`, because the offline builder's regexes match them. No CDN, no web fonts.

### Engine (`js/`)
| File | What it does |
|---|---|
| core/units.js | mm/in/dots/pt conversion, `num`, `fmtLen`, `clamp`, `round`, `uid`, `escHTML` |
| core/stocks.js | `STOCKS` library (thermal rolls, Avery Letter/A4, Herma A4), `stockOf`, `sheetPositions` |
| core/model.js | `newDoc`, `applyStock`, `setOrientation`, `makeObject`, `History` (snapshot undo/redo with coalescing), align/distribute/reorder/group, `parseProject`/`normalizeDoc` |
| core/configs.js | Label configs: `configFromDoc`, `validateConfig` (a zero or negative size, a sheet grid that does not fit or overlaps are refused), `applyConfigToDoc`, `docFromConfig`, `styleProps` (the default text and shape style of new objects) |
| core/presets.js | Built-in presets as configs: `PRESETS` (Avery L7651, L7159, L7160 on A4; 4×6 in shipping, 62×29 mm address, 40×30 mm product, file folder, round 50 mm), `presetFits`, `presetPreviewSvg` |
| barcode/symbols.js | `SYMBOLOGIES`, `gs1Check`, UPC-E expansion, Code 39 mod 43, GS1 AI table, `parseGS1`, `gs1Raw`, `gs1FromRaw` |
| barcode/code128.js | Code 128 auto-subset encoder, `normalizeBarcode` (readable errors, automatic check digits) |
| barcode/geometry.js | `barcodeGeometry`: mm rects and HR text. Most linear and all 2D codes go through `bwipjs.raw` |
| vars/vars.js | Variables (prompt, counter, date, formula, fixed), `formatDate`, `interpolate` with `{Name\|filter:arg}`, `makeResolver`, `checkPrompts` |
| vars/sources.js | `parseCSV`, `parseJSONSource`, `readZip`, `readXLSX`, `loadDataFile` |
| render/text.js, scene.js, canvas.js, svg.js | Fonts and layout, the shared display list (`buildScene`), canvas/SVG backends, 1-bit rasterising |
| print/job.js, html.js, pdf.js | Jobs (records, quantity column, copies, sheet start; `records: 'only'` with a list of indexes for ticked rows), `@page` print HTML, hand-written PDF 1.4 |
| print/zplgfx.js, zpl.js, epl.js | ^GFA compression, ZPL II, EPL2, TSPL |
| io/zplimport.js, files.js, offline.js | ZPL → document, projects/autosave/form-link hashing, offline single-file builder |
| io/tabstate.js | One tab as plain data (`tabRecord`, `tabToState`, `stateToTab`): the label, its undo history (last 100 steps), selection, record, prompts, unsaved flag and view |
| io/configs-store.js | `makeConfigStore(storage)`: configs and user presets in the versioned localStorage envelope `slop.label.configs.v1` (try/catch; a newer or corrupt file is read as empty and never overwritten); export and import of `sloplabel-configs` JSON |
| io/examples.js | Example CSV (text from `SlopExamples`) and a sample product-label `.sloplabel` template, built in the browser |
| templates/gallery.js | 6 starter templates (shipping 4×6, product EAN-13, SSCC pallet, asset QR, badge, Avery 5160 merge) |

### UI (`js/ui/`)
| File | What it does |
|---|---|
| app.js | `App` state (`App.T` is the current tab), `commit`/`editSel`/`undo`/`redo`/`setDoc` (replaces the current tab's label), selection, `refresh` (one frame later; `App.stale` makes `itemOf`/`boxOf` rebuild the scene when they are called before then), status bar, theme, dock |
| tabs.js | The label tabs on the shared strip (`shared/doctabs`): `LabelTabs`, `startTabs`, `openDocTab` (a new tab), `syncIn`/`syncOut` (App ⇄ tab record), `tabChanged`, rename and Drive link per tab |
| configs-dlg.js | File ▸ Save as config…, File ▸ Configs… (apply as one undo step, rename, duplicate, save as preset, delete, export all, import) |
| presets-dlg.js | File ▸ Presets… gallery with a preview of each page; **New tab** or **This tab** (one undo step); the user's own presets under “Your presets” |
| view.js | Canvas viewport (screen = pan + mm × zoom), label/grid/margins, selection handles, smart guides, rulers |
| interact.js | `TOOLS`, hit testing, move/resize (grid snap, smart guides, Alt disables), click or drag to create, image placing, marquee, pan (Space, middle button, Hand, one finger on empty canvas), wheel and pinch zoom |
| commands.js | Every tool and menu action registered with the shared command palette (`shared/commands`, `SlopCmd`): Ctrl/⌘+K search, all shortcuts rebindable (Help ▸ Keyboard shortcuts…, stored in `slop.keys.label`). `K(id)` gives menu key labels; `updateKeyTitles` refreshes tooltips after a rebind. Nothing runs from the keyboard in print-form mode |
| keys.js | Space-to-pan (held), clipboard (internal copy/paste, pasted images/text/ZPL), align/order/group/rotate/lock commands, context menu |
| props.js, props-types.js | Properties panel: form helpers, label properties, geometry, per-type sections, the "{ } Insert field" menu. `applySymbology` keeps the module sensible when the type changes |
| barcode-gen.js | "Generate random value" block of a barcode: symbology (Code 128, EAN-13, EAN-8, UPC-A, Code 39, QR, Data Matrix), value kind, length, prefix. **Generate** fills the selected barcode; **Generate many…** replaces the data with N random values (column `Barcode`, one label per row) and sets the barcode to `{Barcode}`. Values come from `shared/data/barcode.js` |
| props-reset.js | **Reset** at the top of the Properties panel. The baseline is taken when the selection changes; Reset restores those objects (or the label settings when nothing is selected), after a SlopUI confirm when they were edited |
| bulkprint.js | **Print all** / **Print selected** (Data tab). One label per record (the quantity column is ignored). Layout: the label stock, or a custom grid (labels across × down, gaps, margin, A4 or Letter). Preview, page count and a refusal when the grid does not fit. Prints through `printHTML` + `printViaIframe`, the same print page as single labels |
| panels.js | Dock tabs: Properties, Objects (list with hide/lock), Variables (plus preview values for prompts), Data (table, quantity column) |
| dialogs.js | Label setup (stock picker, size, printer settings), variable editor (live preview, renames references), template gallery, About |
| datadlg.js | Data import (CSV/TSV/JSON/xlsx file or paste) and column → field mapping |
| export.js | `jobScenes`, project open/save, `openFiles` (dispatch by type), PNG/SVG/PDF/ZPL quick export, ZPL import dialog, `zplPreviewCanvas` |
| printdlg.js | Prompt values, Print dialog (records, quantity, copies, sheet start, page preview, all outputs), ZPL preview dialog |
| form.js | Print-form mode (`#form=` + `encodeDocHash`) and "Share print form link…" |
| hub.js | `SlopHub.register('label')`, `consumeLaunch` (image → placed; CSV/xlsx → data; .sloplabel/.zpl → opened), Slop Drive pickers, File → Send to (PDF to Slop PDF; PNG to PhotoSlop and SlopVector). Hidden under `file:` and in the offline build |
| menus.js | Menu bar: File, Edit, Insert, Object, Data, View (themes), Help |
| boot.js | Toolbox, chrome wiring, drag and drop, boot order (form link → the tabs come back, or the starter label → hub launch), adds `body.ready` |

CSS (`css/`): themes.css (tokens for Pro, Light and Classic 98, mapped onto `--sui-*`), layout.css, panels.css, classic.css, mobile.css (≤760 px: tools along the bottom, panels in a slide-up sheet opened with ☰).

## Tabs, configs and presets
- **Tabs.** Each label is a tab on the shared strip (`#tabs`, `shared/doctabs`). New tab (Ctrl+T, File ▸ New tab), close (Ctrl+W, with a dirty check), switch (click, Ctrl+Tab), reorder (drag), rename (double-click; renames the label). Opening a `.sloplabel` file, a JSON project, a ZPL file, a template, a preset or a form link opens a new tab. A tab keeps its label, undo history, selection, record, prompts, unsaved flag, Drive link, tool, zoom and pan; the strip's session writes them to this browser (IndexedDB and a small localStorage index) and they come back after a reload. The old single autosave is read once, when no tab was saved.
- **Configs.** A config holds the label size and stock (a sheet's columns, rows, pitch and margins included), units, resolution, the margin, the printer settings, the default style (font, text ink, shape fill, line width for new objects, set in Label setup) and the data columns with their field mapping. No rows or objects. Applying one to the open label is one undo step. Saved configs live in `slop.label.configs.v1`; export and import use `sloplabel-configs` JSON, and a file dropped on the app is imported the same way.
- **Presets.** Built-in presets are configs. Sheet sizes and grids come from the stock library (`core/stocks.js`), which is the printer standard used here; the Avery codes shown are the ones the library names. The round label is a roll with a corner radius of half its side.

## Forms: Reset and examples
- Every Label form has a **Reset** button that puts back the values the form had when it opened (the property panel: the selection when it was selected; dialogs: the values when the dialog opened). With edits, it asks first (SlopUI confirm). Dialogs use `SlopFormReset.dialogButton(body)` from `shared/ui/form-reset.js`: label setup, variable editor, Print, Print values, map columns, paste data, ZPL import and ZPL preview. The stock picker list in label setup is not a form field, so Reset restores its size and printer fields but not the stock chosen.
- **Example CSV** and **Example template** sit in the Data tab, next to Import. The CSV is `SlopExamples.csv('label')` (columns SKU, Name, Price, EAN, Qty). The template is `exampleTemplateText()`.
- The ZPL import dialog has no example file yet.

## Tests
- `tests/label/tabs-configs.test.html`: two extra label tabs, a config saved and applied to another tab (one undo step), a preset in a new tab and applied to this tab, a file dropped on the strip, a refused negative size in an imported file, and a reload that brings back the tabs, undo and configs.
- node: `tests/node/label-configs.test.mjs`, `label-presets.test.mjs` (every preset valid and its grid on its sheet, label counts 21/24/65), `label-tabstate.test.mjs`. They load the real scripts through `tests/node/label-env.mjs`.
- `tests/label/view-state.test.html` now checks the tool, zoom and pan of the tab (through `flushTabs()`), not the old SlopSession view store.
`tests/label/sloplabel.test.html` loads the app in two same-origin iframes (1280 px and 390 px) and reaches its globals with `win.eval`:
- engine.test.js: units, check digits, Code 128 values (`ABC123` gives `[104,33,34,35,17,18,19,67,106]`), barcode validation, GS1, variables, CSV, JSON, and xlsx (generated by a small zip writer in the test).
- output.test.js: Avery 5160 positions, sheet start offsets, `pageCSS`, jobs, History, scene errors, ZPL snapshot and round trip, ^PQ merging, ^FH escaping, ^GFA, ZPL import (^FN/^SN/GS1/QR), GS1 DataMatrix, EPL/TSPL, PDF xref offsets and resources, projects, form-link hashes, offline builder escaping.
- ui.test.js: creating objects with each tool by synthetic pointer events, smart-guide snap, move/resize/marquee/delete/undo, wheel zoom, properties panel edits, align/rotate/group/order, clipboard.
- commands.test.js: commands registered for every tool and menu action, tool keys through SlopCmd and rebinding (tooltips follow), zoom keys, Ctrl+K palette and toolbar button, Help entries and the shortcut editor, offline manifest includes the palette.
- generate-reset.test.html (`tests/label/generate-reset.test.html`): the shared form Reset on a plain form (confirm, cancel, no-confirm, segmented control and the dialog button), then in the designer: Generate fills an EAN-13, Generate many makes 25 unique rows, the panel Reset restores the content, the example CSV header.
- node: `tests/node/barcode-gen.test.mjs` (check digits, lengths, alphabets, prefixes, seeded uniqueness, refusals) and `tests/node/examples-csv.test.mjs` (every example's header and row widths, EAN check digits, quoting).
- ui-flows.test.js: CSV import through the mapping dialog, variable editor, print dialog outputs (PDF/ZPL/EPL/TSPL/PNG captured), sheet layout, ZPL preview, templates, themes, label setup, opening files, Slop Hub Send to, menus, form-link mode, phone layout.

Verified by hand in this round:
- Every symbology (0° and 90°), rendered to PNG, decodes with zxing-cpp (`pip install zxing-cpp`). So does the round trip through ZPL export → import → render (including ^GFA graphics).
- `pdfinfo` reports 288 × 432 pt for 4×6 and Letter for Avery 5160, with no syntax errors. `pdffonts` lists the base-14 fonts.
- The offline file (`File → Download app`) boots from `file://` and can rebuild itself.
- Screenshots in all three themes at desktop size and at 390×844.

Engine bugs fixed this round: literal U+2028/2029 in an offline.js regex (syntax error); PDF font/image resource names lost their `/`; 2D geometry dropped `gs1`, which broke GS1 DataMatrix ZPL; ZPL import of ITF-14 drew a second bearer; the offline builder inserted its JSON at the first `</body>`, which can sit inside inlined code; templates anchored right-aligned text off the label.

## Known risks / next steps
- Not tested on hardware: ZPL GS1 DataMatrix (`^BX…,_` with `_1`), the QR ^BQ origin offset, ITF bearer ^GB, and the TSPL/EPL bitmap polarity (assumes 0 = black).
- UPC-E, GS1 QR, rotated QR and rectangular Data Matrix go to ZPL as ^GFA graphics. They decode fine, but output is larger. ^B9 needs checking against a printer before it is used.
- Direct printing to a printer (Zebra Browser Print / WebUSB) is not implemented. The print dialog explains the workaround.
- Text is edited in the Properties panel (double-click or Enter focuses it). There is no on-canvas text editing yet.
- Rotation is in 90° steps only (thermal printers rotate fonts and barcodes in 90° steps).
- NiceLabel `.nlbl` import is deliberately skipped.
- Generate many replaces the current data after a confirm. Bulk print does not offer PDF or ZPL output; use the Print dialog for those.
- `service-worker.js` precaches the shared files by path. The new `shared/data/examples.js` and `shared/ui/form-reset.js` (and the Label scripts `js/ui/barcode-gen.js`, `js/ui/props-reset.js`, `js/ui/bulkprint.js`, `js/io/examples.js`) are not in that list yet, so they are missing from the offline cache until it is updated.

## Slop Drive (shared storage)

- **Save (Ctrl+S)** writes the `.sloplabel` project back to the Drive file it was opened from (`App.driveId`, cleared by `setDoc`). The first save asks for a folder. `File ▸ Download project (.sloplabel)` downloads; offline and without the hub, Save downloads as before.
- `File ▸ Open project from Slop Drive…` and `?drive=` launch open JSON/.sloplabel records and link them; `Insert image` and `Data` pickers are unchanged.

## Phone layout (SlopSheet)
Under 760 px the dock (Properties, Objects, Variables, Data) is a bottom sheet: `App.sheet`, a `SlopSheet.attach` from
`shared/ui/sheet.js` (see `shared/ui/HANDOFF.md`), wired by `wireDock()` in `ui/app.js` from `wireChrome()`. The ☰ Panels
button opens and closes it; the shared ×, Escape, a tap outside (the label, the toolbox) and a swipe down close it.
`showDock(tab)` / `hideDock()` are thin wrappers; there is no `dock-open` class, stage tap handler or own motion any more
(the shared look gives place and motion; `mobile.css` sets the height and puts the × over the tab row's end). Test:
`tests/label/ui-flows.test.js` (phone layout), run by `tests/label/sloplabel.test.html`.

## Assistant commands (`js/ui/ai-commands.js`, `js/ui/ai-files.js`)
Loaded on demand by `SlopCmd.prepare()` (`loadLabelAI` in `ui/commands.js`, with `shared/commands/sources.js`); not in the
offline build, which has no AI panel. All `label.ai.*`, hidden, each edit one undo step through `commit`/`editDoc`; lengths in
mm from the label's top-left. `new_label` (preset, stock or width/height; a new tab), `add_text` (font, size, bold, italic,
align, rotation, wrap width), `add_barcode` (every `SYMBOLOGIES` id; refused when the value cannot be encoded), `add_qr`,
`add_shape` (rect, ellipse, line, inverse), `add_image` (Slop Drive or a same-origin URL, `addImageAsset`), `set_property`,
`data_merge` (columns + rows, or a CSV/TSV/JSON file from Slop Drive; map, quantity column), `delete_object` (the only
destructive one), `export` (PDF of every record, PNG, ZPL or .sloplabel, to Slop Drive and/or a download), `undo`. The add
commands say where the object sits and warn when it runs past the label's edge; `fit: true` shrinks it inside.
`state()` lists the label, objects and data; the checkpoint closes the tabs the assistant opened and undoes back.
Not built: a headless "spec → label PDF" operation (the writer needs the app's page globals; it would need the hidden-app host).
Test: `tests/label/ai-commands.test.html`.
