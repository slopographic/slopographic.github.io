# Slop PDF — handoff

In-browser PDF editor at `/pdf/` (pdf.js 5.7.284 for parsing/rendering, pdf-lib 1.17.1 for writing,
both vendored in `/vendor/`).

## What works (verified with Playwright e2e scripts + poppler)
- Open PDFs/images (picker, drag & drop), merge, colour-coded thumbnail grid (lazy, cached).
- Reorder by mouse drag, multi-select drag (click/shift/ctrl/marquee), Alt+arrows keyboard reorder,
  rotate, delete, duplicate, insert blank, insert from file, reverse, sort/collate, extract selection.
- Split by ranges / every N / each page, to zip (hand-written store-only zip, CRCs verified) or separate files.
- Undo/redo for all operations.
- Page view: navigation and zoom through `shared/nav` (see below), annotations: text, pen, highlighter, rect, ellipse,
  line, arrow, whiteout, highlight box, image, signature (draw/type/saved in localStorage).
  Move/resize/edit/delete. Export placement verified pixel-exact on /Rotate 90, user-rotated and
  offset-MediaBox pages.
- Page numbers, watermark, metadata (pdfinfo shows Title/Author/Keywords), AcroForm fill (text,
  checkbox, dropdown, radio) with keep-editable or flatten.
- Compress (lossless re-save; lossy JPEG rasterise), pages→PNG/JPEG (zip), images→PDF, text extraction.
- Password PDFs: RC4-128, AES-128, AES-256 (R6), with/without object streams, owner-only restricted
  files — decrypted locally so pdf-lib can rewrite them. Broken files show a clear error. The crypto is the site's one
  implementation, `shared/pdf-crypto/` (`window.SlopPdfCrypto`, its own HANDOFF); `js/io/decrypt.js` is only a shim onto
  it (`SP.decrypt`: `load`, `isEncrypted`, `decryptPdf`, `inspect`, `describe`, `encryptPdf`). See "Passwords" below.
- Themes Pro/Light/Classic 98, shared SlopUI dialogs/menus, Slop Hub (register, ?drive= launch,
  File ▸ Open from Slop Drive, File ▸ Send to, page context menu ▸ Send page as image to).
- Code split into packages; every non-vendor file ≤ 300 lines.
- **Commands & shortcuts (SlopCmd)** (`js/ui/commands.js`): every tool, panel, page operation and menu action is
  registered with the shared `shared/commands/` package (app id `pdf`); all global keys go through it (the old
  keydown handler in `ui/input.js` is gone). `when()` guards keep keys mode-aware: letters are annotation tools
  only in page view, R / Shift+R / Del act on the selected or focused pages in the grid, arrows nudge a
  selected annotation or turn pages, everything is off while a menu is open or a field has focus.
  `organize/keys.js` keeps only the grid's listbox navigation (arrows, Home/End, Space, Enter, Alt+arrows,
  context menu). Menus show `A.key(id)` (= `SlopCmd.keyFor`), so user remaps show up. Help ▸ Search
  commands… (Mod+K, also the magnifier button in the top bar) and Help ▸ Keyboard shortcuts… (`?` opens the
  shared shortcut editor). The offline build inlines commands.css and runs the five SlopCmd scripts (B.CMD).
- **Thumbnail size** (`js/organize/zoom.js`): S/M/L presets + a continuous slider from 80 px up to the grid's
  inner width (one page per row, "fit" button), Ctrl/⌘ + wheel, two-finger pinch (touch events, cancels a
  pending long-press drag), Ctrl +/− and View ▸ Zoom in grid mode. Saved as `slop-pdf.thumbSize`; a resize
  clamps it. While zooming only CSS sizes change; rasters load once it settles (160 ms). Render cache buckets go
  up to 2800 px (JPEG above 1000 px, PNG below) with a ~190 MB byte budget, and zooming out keeps the sharper
  raster already shown.
- **True redaction** (`js/redact/`, `css/redact.css`, rail tool "Redact", page tool X):
  - Marks are box annotations of type `redact` (hatched red, movable/resizable like other boxes). Drawn with
    the Redact tool, or added by **Find & redact** (`find.js`): plain text / regex / match case and presets
    (e-mail, phone, Luhn-checked card numbers, SSN and Swedish personnummer-like IDs) over every page, using
    pdf.js text items; per-character boxes come from canvas-measured glyph widths, padded.
  - Review list in the panel (jump to / remove each mark), then **Apply redactions** behind a "permanent"
    confirm dialog (`panel.js`). `E.applyRedactions` (`apply.js`) rasterises each marked page with pdf.js
    (150/200/300 dpi, ≤ 40 MP), burns black boxes into the bitmap and replaces the page with an image-only page
    (raw Flate RGB XObject via CompressionStream; PNG fallback) of the same size and /Rotate in a new source
    file "Redacted pages.pdf". Only URI links outside the boxes are kept; form fields, comments and other
    annotations on that page are flattened/gone. User annotations touching a box are removed. Optional: blank
    the document metadata. Pages get `p.redacted` → "Redacted" badge on thumbnails and the page view.
  - Undoable while the document is open (the original file stays in memory/autosave locally); the download is
    always a fresh pdf-lib save (no incremental history). `E.build` refuses to export pending marks;
    `A.download` offers "Apply and download". On export, `/Thumb`, `/PieceInfo` and page `/Metadata` are
    stripped from every page, and when any page is redacted, each page's `/XObject` resources are pruned to the
    ones its content stream actually paints (`E.pruneXObjects`), so shared/inherited resources cannot carry a
    redacted page's content along.
  - No "keep vector text" mode is offered (content-stream rewriting was not done; image-only is the safe path).
    Invisible OCR text on redacted pages is lost too (they become pure images).

## Loading: the first view first (`index.html`, `ui/app.js`, `shared/load`)
The page runs only what the empty first view needs before its first paint, and loads the rest after it (the pattern,
for every app: `shared/load/HANDOFF.md`).
- Before the paint (parser-blocking, about 30 small scripts and 9 stylesheets): `shared/load/load.js`, SlopUI, intake,
  the app registry, the Drive link, view modes, `core/util`, `ui/icons`, `core/model`, `core/history`, `core/layers`,
  `ui/sheet`, `organize/grid`, `editor/view` (namespaces the later files keep in variables), `ui/panel-kit`, `ui/dock`,
  the Organize, Layers and History panels, `ui/app`, `ui/menus`, the bottom sheet (`shared/ui/sheet.js`), the drop zone
  (`shared/drop/*`, `ui/drop`), the shell and Spotlight. `A.boot` (DOMContentLoaded) builds the rail, menus, panel and
  drop zone from them. The command-search button is in the HTML; the tab strip keeps its height (`css/doc-tabs.css`).
- `<template id="pdf-later" data-load="paint">`: every other script and stylesheet, in the old order, right after the
  first paint. `A.bootRest` then wires the rest (context bars, grid, editor, keys, tabs, the saved view, `?drive=`) and
  resolves `A.ready` (`A.isReady`). Controls drawn by `A.boot` wait for it through `A.whenReady(fn)`; a drop waits too.
- `<template id="pdf-idle" data-load="idle">`: the consent card, the Convert dialog, the mascot, the offline worker.
- `<template id="pdf-engine">`: pdf-lib, loaded by `E.pdflib()` (core/pdfjs.js). pdf.js is a dynamic import in
  `E.pdfjs()`. Neither loads on the empty page: `E.libs()` (both, then `E.initFonts`) is awaited by `E.registerPdf`
  (every open, tab restore and Drive file), `E.makeSample`, `E.imagesToPdf`, `E.build` and `E.openOutput`. Code that
  uses `PDFLib` runs only with a document open, so after one of those.
- `<template id="pdf-crypto">`: the five `shared/pdf-crypto/` scripts, loaded by `SP.decrypt.load()` (io/decrypt.js, through
  `SlopLoad.scripts`, so a failed load can be retried) only when pdf.js reports a security handler on an opened file
  (`E.mayBeEncrypted`: `info.EncryptFilterName`, or a password was typed) or a download with a password is asked for.
- Offline copy: the manifest's `scripts` list is the page's order (first view, then later); the boot runs all of them
  and pdf-lib, so the templates are empty there.
- Tests: `tests/pdf/lazy.test.html` (no pdf-lib or pdf.js on the empty page, the later files asked for after the page
  is built, both libraries on the first open or sample), `tests/pdf/phone-sheet.test.html` (390 px sheet).
- A script in the later group must not wait for DOMContentLoaded (it has fired): `ui/rename.js` checks readyState.
  `editor/paste-image.js` attaches to the shared paste intake with `first: true`, ahead of the drop zone.

## Passwords (`core/pdfjs.js`, `io/decrypt.js`, `ui/protect.js`, `ui/exports.js`)
- Opening: `E.registerPdf` decrypts a protected file with the password typed in `A.askPassword` and keeps
  `f.security` = `SP.decrypt.describe(original bytes, password)`: `{ encrypted, R, V, method, bits, P, permissions,
  needsPassword, owner }` (owner: the typed password was the owner's). The password itself is not kept on `f`, in the
  edit log, the session or tab state (`io/session.js`, `io/doc-state.js` carry `security` only) or Drive metadata.
- Notice: the Organize panel's Files section shows "This PDF had a password. Downloads have no password unless you add
  one." (`.pw-notice`, `tools/organize-panel.js`) with **Remove password** (a plain `A.download()`) and **Keep the
  password** (`A.protect(A.protectPreset(f.security))`: the dialog with the original print/copy/edit permissions). The
  status line says it too when the file is opened. Before this, decrypted files were saved without a password silently.
- Download with a password: `A.protect(preset)` (`ui/protect.js`) is the Download PDF dialog with a "Protect with a
  password" section: the checkbox, Password, Confirm, Allow printing / copying / editing. Empty or different passwords
  keep it open with an error. `A.download({ protect: { pw, owner, print, copy, edit } })` builds and validates first
  (`E.validate` opens the output with pdf.js), then `SP.decrypt.encryptPdf` (AES-256, R 6, `%PDF-1.7`; a blank owner
  password is random). The dialog's fields are emptied when the download starts and `A.download` blanks the option's
  `pw` when it is done (success or error); the status and toast say only "password-protected". The plain Download
  button and Mod+S are unchanged (no dialog).
- Reached from File ▸ Protect with password…, File ▸ Export as ▸ PDF with a password…, and the command
  `file.protect` (Mod+K, keywords password encrypt lock secure; enabled with pages).
- `redact/panel.js` wraps `A.download` and passes its arguments on, so a protected download asks to apply marks too.
- Tests: `tests/pdf/protect.test.html` (`pdf.spec-protect.js`): a plain PDF does not load the crypto; the qpdf AES-256
  fixture (`tests/pdf-crypto/fixtures/qpdf-aes256.pdf`, password `sesame`) opens and `f.security` is right with no
  password anywhere; the notice; Remove password gives a file with no `/Encrypt`; Keep the password presets the
  permissions, refuses different passwords, empties the fields, and pdf.js needs the new password, refuses a wrong one,
  opens with it and reads the permissions back; the command and menu item, an empty password refused, unchecked = plain.

## Navigation and zoom (page view)
The page view uses the shared navigation engine (`shared/nav`, `SlopNav.engine.attach`), not its own wheel or pinch code.
The bindings are fixed for Slop PDF (`NAV` in `js/editor/view.js`), so the Navigation preset store does not apply here:
- Ctrl/⌘ + wheel zooms about the pointer, eased over 120 ms; a trackpad pinch (small Ctrl + wheel deltas) is immediate.
- The plain wheel scrolls the pages vertically and Shift + wheel scrolls them sideways. The engine is opened with
  `passthrough: true`, so a wheel it does not bind is left to the viewer's native scrolling.
- Ctrl/⌘ + and − zoom (eased), Ctrl/⌘ 0 fits the page width, Ctrl/⌘ 1 is 100%. The grid keeps its own keys: the engine's
  `skip` hands every key and Space to SlopCmd outside page view, so Ctrl/⌘ + in the grid still resizes thumbnails.
- Space drag and middle drag pan. Touch: two-finger pinch zooms (immediate) and two-finger drag pans. A single-finger
  drag on the empty viewer pans from `S.startPan`, which `cancelStroke` stops when a second finger lands.
- Zoom limits are 25% to 800% as the status bar shows them. The status bar is `Ed.zoom × 72/96` (1 is 75%), so the
  internal limits are `Ed.ZOOM_MIN` / `Ed.ZOOM_MAX` (0.333 to 10.67). The pointer arithmetic is `editor/zoom-math.js`
  (`SlopPdfZoom`, shared by the page view and `tests/node/pdf-zoom.test.mjs`); the anchor is the page under the pointer. `Ed.easing()` tells tests when an ease has landed.
- Anchoring: each eased frame keeps the page point under the pointer in place (`setRaw`). A page smaller than the
  viewer cannot scroll, so the rest of the move becomes a `left`/`top` offset on the page; the next layout clears it.
  The viewer sets `overflow-anchor: none`, so the browser does not also move the scroll.
- Phone width (≤ 900 px): the status bar is hidden, so a floating cluster (`.pv-zoomfab`, built in `Ed.init`) shows
  − / percentage / + / fit width above the bottom rail. The toolbar's zoom buttons stay in the context bar too.
- Saved view: `ui/view-state.js` saves the zoom, mode and scroll. Its listeners are on `window` in capture phase,
  because the engine stops the wheel, Space and pointer events it takes before any listener further down sees them.
  A reopened page keeps the saved zoom when the app reloads; opening a page from the grid still starts at fit (as before).

## Engine changes made for this (shared/nav)
- `engine.attach({ passthrough: true })`: an unbound wheel is not stopped (default off, so the other apps are unchanged).
- Fixed the pinch start: `touchDown` stored the midpoint in client coordinates while every later midpoint is
  host-relative, so the first pinch move jumped by the host's offset. Affects any app whose host is not at the
  window's origin (PhotoSlop, SlopVector, Slop PDF).

## Tests
`node tests/run.mjs pdf` runs the Slop PDF pages in `tests/pdf/`: the specs are split over `pdf.test.html` (core, I/O, redact, OCR), `pdf-view.test.html`, `pdf-text.test.html` and `pdf-workspace.test.html` (about 40 s each, so they run in parallel), plus `view-state.test.html` and the others. The real app runs in
an iframe; `tests/pdf/pdf.helpers.js` (`window.PT`) boots it, makes fixture PDFs with the app's own pdf-lib,
opens them through `A.addFiles`, captures downloads and reads output back with pdf.js. Specs:
- `pdf.spec-core.js`: ranges, zip/CRC, sniffing, geometry, page ops, undo/redo/coalescing, page-number text,
  `SP.build.escapeJSON`/`toClassic`.
- `pdf.spec-export.js`: merge order/rotation/blank pages, annotation placement pixel-checked on /Rotate 90,
  user-rotated and offset-MediaBox pages, text/pen/arrow/image/stamps, metadata, forms (fill + keep
  editable, flatten), split to zip and to files, extract.
- `pdf.spec-io.js`: RC4-128/AES-128/AES-256/owner-only fixtures (`tests/pdf/fixtures/`, made with pypdf;
  user password `slop`), wrong/cancelled password, broken files, autosave to IndexedDB + restore after reload,
  autosave off, Slop Hub (Send to items, Send page as image → Drive + `?drive=`, open from Drive picker,
  launch with `?drive=`), offline build (self-contained, byte-identical rebuild, boots and exports).
- `pdf.spec-redact.js`: presets/regex/Luhn, match boxes on a rotated page, apply on a 3-page file (secret
  e-mail, text, form field and drawn box gone from pdf.js text extraction AND from every decoded stream/string;
  untouched pages keep text; rotation/size kept; metadata gone; link outside kept; black pixels), shared
  XObject resources not leaking, confirm dialog, download prompt and undo.
- `pdf.spec-cmds.js`: registered ids/keys, mode-aware dispatch (R rotate, Shift+R, Mod+Z, T/X tools, Esc), menu
  key labels follow remaps, palette and shortcut editor open.
- `pdf.spec-thumbs.js`: presets + slider up to one page per row, clamping, localStorage, sharp raster at full
  width, Ctrl+wheel and pinch (synthetic TouchEvents).
Cross-realm gotcha: arrays/typed arrays passed into the iframe's pdf-lib/pdf.js must be made with
`PT.win.Array`/`PT.win.Uint8Array`.

## Verified by hand (Playwright scripts, not in the repo)
- Offline file: File ▸ Download app, opened from file:// in an offline context with every non-file request
  aborted: zero requests, zero console errors, sample loads, export validates, `SP.build.make()` inside it
  reproduces the downloaded file byte-for-byte. The offline file has no Slop Hub (Drive belongs to the site's
  origin), so Drive/Send to menu items are hidden there.
- Mobile 390×844 with touch: no horizontal page scroll (rail and page toolbar scroll inside themselves), tap
  selects, long-press drag reorders, two-finger pinch zooms the page view, bottom sheet panel opens/closes.
- Themes Pro/Light/Classic 98 screenshotted on desktop and mobile.
- Send page as image → PhotoSlop opens `photoslop/?drive=` with the page (1240×1754 at 150 dpi).

## Fixed in this pass
- Radio groups with an /Opt array (pdf-lib, Acrobat) showed options "0", "1" and could not be filled;
  real labels now come from pdf-lib (`io/forms.js`).
- Touch long-press on an unselected page dragged the previously tapped page along too.
- Closed mobile panel peeked 10 px above the bottom edge; rail labels wrapped and clipped in Classic.
- Removed the dead pre-split `js/engine.js` / `js/util.js` (944/318 lines, not loaded anywhere).

## Blank-page / lost-edits investigation (owner report: "adding stuff renders a blank white page") — IN PROGRESS
Stopped early (usage limits). **No app code changed yet.** Findings so far:
- Repro harness (scratch, not in repo): drives the real app in Playwright (sample-like 3-page all-green
  fixture so any white = blank), takes CDP screenshots every ~57 ms (fastest achievable headless; the
  `--use-angle=swiftshader` launch flags make screenshots ~380 ms, so leave them off) plus an in-page
  per-rAF DOM probe (does `.pv-canvas` hold the current page's bitmap; SVG annot count vs model; empty
  thumbnails in view). Covered: text, pen, rect, highlighter, whiteout, image, signature, move, resize,
  delete, undo/redo, zoom (buttons, Ctrl+wheel, fit), rotate, next/prev page, grid, thumb size L/S,
  grid rotate/duplicate/move/undo, back to page.
- Result at 1280x800 headless: **no white frames and no lost annotations** in page view for any annotation
  edit, undo/redo, zoom or rotate (white fraction stays ≤ 0.007; annotations present in every frame after
  each commit). The architecture already matches the target for annotations: `editor/view.js` renders
  pdf.js into an offscreen canvas and copies it in only when complete; annotations are an SVG overlay
  (`ui/sheet.js` `V.paintAnnots`); the raster key (`file:page:formKey@zoom`) does not change on annotation
  edits; zoom CSS-stretches the old bitmap until the sharp one lands; no pdf-lib reload while editing.
- Real defects found:
  1. **Page switch shows the PREVIOUS page's bitmap** (stretched to the new page size) for ~150 ms until the
     new render lands (`Ed.show` → `layout(true)` → `scheduleRaster`; view.js ~line 81-104). 9/7 frames on
     next/prev. Fix: on page change, immediately paint the cached thumbnail raster for the new page
     (`E.thumbURL` cache) into the canvas, or hide the stale canvas behind a page-coloured placeholder.
  2. **First open of page view**: `.pv-page` is `background:#fff` with an empty canvas until pdf.js
     finishes (2 frames) — white flash. Same fix as 1 (seed from thumbnail cache).
  3. **Grid**: a newly created thumbnail element (duplicate, thumb size change re-bucket) has an empty
     `<img>` for 2-3 frames even when the raster is cached (`V.loadRaster` waits on a promise + async
     decode). Fix: synchronous cache lookup in `E.thumbURL` (return url directly when resolved) and
     `img.decode()` before swapping; keep the old src until the new one decodes.
  4. Latency (dispatch → next frame): nudge ~10-13 ms, prop change ~11-12 ms, add ~16-20 ms, undo 11-70 ms
     (undo cost is `O.render()` of the whole grid + `JSON.parse` snapshot; could skip grid render while in
     page view and re-render lazily).
- Not reproduced: the owner's "blank page after adding stuff". Candidates still to check: real-GPU
  browsers with high devicePixelRatio (16 MP cap in `S.renderRaster` → large canvas copies), form-field
  PDFs (`E.formKey` is in the raster key, so every form edit re-renders — and `renderToCanvas` on a form
  PDF re-renders, which is the only key that changes during editing), and mobile Safari canvas memory
  limits (a canvas over the limit renders white). Test with the sample PDF (it has a form) next.
- Next steps, in order: (a) re-run the repro with the sample PDF and with form fields filled;
  (b) fix 1-3 above; (c) add `tests/pdf/pdf.spec-render.js` sampling canvas pixels per rAF during
  edit/zoom/undo/page switch (assert non-blank and annotation SVG nodes present), keep placement tests green;
  (d) smoke-test desktop + 390x844.

## Offline build note
Site-only scripts in `index.html` (fonts.css, `shared/guard.js`) carry `data-offline="strip"` so the offline
file stays self-contained; the guard/backup cannot work from file:// anyway.

## Known limitations
- Bookmarks/outlines and tagged structure are not carried over; non-WinAnsi text (CJK, emoji) in added text
  becomes "?" (standard fonts only); cMaps/standard fonts are not embedded in the offline file (only the
  Symbol/Dingbats fonts are), so CJK PDFs without embedded fonts may render with fallback glyphs offline.
- Classic 98 on phones ellipsises "Page numbers" in the bottom rail.

## Next steps
- Optional: outlines carry-over, embedding a Unicode font for added text.
- Recommended status in `shared/apps.js`: live.

## Slop Drive (shared storage)

- **Save (Ctrl+S)** builds the PDF and writes it back to the Drive file the document came from (`A.driveId`, set when a Drive file opens into an empty document, cleared by Close all and Try the sample). The first save asks for a folder. Without the hub or offline, Ctrl+S downloads as before; `File ▸ Download PDF` is unchanged (no shortcut now).
- Open from Drive, `?drive=` launch and `register('pdf')` as before.
- `pdf.spec-nav.js`: Ctrl+wheel zooms about the pointer (eased, the document point stays under the pointer), the plain
  wheel is left to the viewer, Shift+wheel scrolls sideways, 10% and 800% limits, Ctrl/⌘ 0 fits the width, and the zoom
  comes back after a reload.

## Undo/redo, saved edits and text highlight
- **History** (`js/core/history.js`): every change is one `E.commit(label, fn, coalesce)`. It records the difference
  between the document before and after (page objects by id, page order, meta/stamps/forms) as a command with
  `do()` and `undo()`. Cap 300. `H.useStack(key)` swaps the stacks, so a tab adapter can give each tab its own history.
  No-op commits make no step.
- **Saved edits** (`js/io/edit-log.js`): each logged file's applied commands go to IndexedDB (`U.idb`, key
  `edits/<sha256 of the original bytes>`), restricted to that file's pages. The original bytes are never stored.
  File ids are `f<first 16 hex of the fingerprint>` and page ids `<fileId>.<index>`, so a reopened file lines up.
  Opening a file with a saved log asks Replay or Discard (`L.offer`, called at the end of `A.addFiles`).
  Not logged: sample, image-made PDFs, restored autosave files, the Redacted file, and a second copy of a file in one
  session. Apply redactions drops the file's log (its pages cannot be replayed).
- **Text highlight** (`js/editor/texthl.js`): tool `texthl` (key U). Lines and per-glyph boxes come from pdf.js
  `getTextContent`; the annotation keeps its quads in `pts` (four per line) and exports as filled multiply quads.
- Tests: `tests/pdf/pdf.spec-history.js`. Fixtures carry a unique creation date (pdf-lib dates have one-second
  resolution, and identical files would share a saved log).

## Page layouts, lazy pages and Extract assets
- **Layouts** (`editor/view.js`, `view-rows.js`): continuous scroll (default), Single page and Two pages side by side, from
  View ▸ Page layout or the commands `view.continuous|single|two`. The choice is kept in `slop-pdf.pageLayout` (try/catch).
  The page in view (most of its area in the viewer, the middle on a tie, the last page at the end) is the active page;
  the page indicator, the properties panel and the grid selection follow it. A press on another page makes it active
  first, so the tools act on the page under the pointer. Previous/next and the page commands scroll to the page.
- **Pages** (`editor/view-pages.js`): one element per page with its own raster and annotation SVG. An
  IntersectionObserver (one viewport margin) rasters only the pages near the view and gives the raster back when they
  leave; the active page is never released. Renders run one at a time, active page first. The overlay and the text box
  move to the active page's element; they are not moved on every layout, so a text box keeps its focus.
- **Extract assets** (File ▸ Extract assets…, `ui/assets.js`): `io/assets-scan.js` reads the images and fonts of the
  pages still in the document with pdf-lib (pdf.js does not expose the stored stream or the object reference of an
  image or font, so it cannot give the JPEG bytes). `io/assets-model.js` is pure (classification, PNG predictors, pixels,
  list rows, zip order; `tests/node/pdf-assets.test.mjs`). `io/assets-save.js`: DCTDecode images as stored (JPEG), other
  8-bit images decoded and encoded as PNG through a canvas, fonts as the embedded file (FontFile/2/3). Skipped items
  (JPEG 2000, JBIG2, CCITT, CMYK, 1-bit, other filters) are listed with the reason. Output: one zip through
  `shared/office/zip.js` (loaded on demand; offline it falls back to the app's store-only zip) or one file each, or
  Slop Drive in a folder named after the PDF (`SlopHub.appSubfolderId('pdf', name)`, "PDF assets" without a name).
  Since then this is **File ▸ Extract all…** (below); inline images are listed too.

## Find, Replace, text selection, Edit text, page actions (this pass)
- **Find (Ctrl+F)** (`js/find/`): `bar.js` (query, Match case, Whole word, "3 of 12", Next/Previous with Enter/Shift+Enter,
  the result list behind List, Escape closes). `search.js` runs the same locator as Replace text (`macro/text.js`,
  `T.find`), so the count, the highlights and the replacements agree; `paint.js` draws one SVG rect per match box in
  each page's layer (current match stronger). Pure helpers (`step`, `label`, `context`) are in `search.js`
  (`tests/node/pdf-find.test.mjs`). Matches inside one text item are highlighted by measured glyph widths; a match whose
  position is not exact is still counted and highlighted but is not replaced.
- **Replace all** (`js/find/replace-ui.js`, `replace.js`): the dialog lists every match with a checkbox (page, the text
  around it). Replace checked writes each replacement as a white whiteout over the old run plus the new text in the
  standard font, one undo step each (edit log included). Geometry is `M.coverPlan` in `macro/ops-edit.js`, shared with
  the Replace text macro (pdf-lib path). Unplaceable matches are listed as not replaced.
- **Selectable text** (`js/editor/textlayer.js`): pdf.js `TextLayer` per rasterised page, in the page layer under the
  annotations and over the find highlights; `--scale-factor` must be the zoom or the spans are misplaced. The select tool
  lets a press on a span select text (no pan); the annotation SVG has `pointer-events: none` (its marks keep theirs).
- **Edit text (Ctrl+E)** (`js/editor/edit-text.js`): click a run, type, Enter applies (Escape cancels). The old run is
  covered and the new text drawn at the same baseline, size and bold/italic, in the standard font of its family. The
  colour is the darkest ink in the run on the rendered page. The info line names the font and "embedded"/"not embedded".
  NOT DONE: reusing an embedded font for the new text, and "Use a font file…": pdf-lib needs `@pdf-lib/fontkit` to embed
  TTF/OTF, which is not vendored (`vendor/` was out of scope), so the new text is always a standard font.
  (Since then: the new text is set in the installed family, the answer to the font check, or the closest bundled one —
  `editor/font-check.js` S.runFont.) Edit text now has two modes, Lines (this) and Paragraphs (below).
- **Page actions** (`js/ui/page-acts.js`, `organize/grid.js`): each thumbnail has rotate left/right, open, duplicate,
  move up, move down, extract this page, delete; the focused thumbnail's buttons are in the Tab order. Each is one undo
  step. The current page has a border on its thumbnail and its canvas (`css/page-acts.css`).
- **Zoom**: the zoom keeps the point under the anchor (workspace centre for the buttons, pointer for Ctrl+wheel). A
  regression test (`tests/pdf/pdf.spec-pages.js`) checks the anchor at 60% to 300% in continuous, single and two-page
  layouts. Drifting to the left was not reproduced. Pan: drag empty space, Space+drag, middle drag, scrollbars.
- Tests: `tests/pdf/find.test.html`, `replace.test.html`, `edit.test.html`, `pages.test.html`;
  `tests/node/pdf-find.test.mjs`. Offline build lists and `pdf/css/find.css`, `page-acts.css` updated.
- **Document tabs** (`js/ui/doc-tabs.js`, `js/io/doc-state.js`): every open document is a tab of the shared strip
  (`shared/doctabs`, unchanged). The editor still works on the globals `E.files`/`E.assets`/`E.state`; a tab's record
  (`SP.docs.make`) takes them over when the tab is shown and keeps them when it is left (`swapIn`/`swapOut`): files, state,
  view (`A.viewNow`/`A.applyView`: tool, mode, page, zoom, layout, scroll), file name, undo stack (`H.useStack` keyed by the
  record id) and edit log (`SP.editLog.flush` before and after the swap). A stored tab is only its saved form until it is
  shown (`D.load` reads the files with pdf.js into its own maps; no live state is touched). A file already open in another
  tab gets a random id and is not logged (`E.fileIdTaken`), so the edit log and thumbnail cache keys never collide.
  `A.driveId` is a view of the open tab's Drive link; rename goes through the strip (`SP.tabs.rename`), which keeps the tab,
  the top-bar name and a Drive-linked file in step. Storage: the strip's own (`slop.doctabs.pdf.v1`, IndexedDB `slop-doctabs`);
  `session` in IndexedDB is a mirror of the open document without file bytes (the tests and the old readers use it).
  Autosave off stores nothing (`serialize` throws, the strip keeps no content) and deletes the stored tabs.
- **Drops** (`js/ui/drop.js`, SlopDrop with the empty page's zone `#pdfDrop`; the targets are the stage and the tab strip,
  so the outlines and "Drop to add N files" label show over them, not the whole window): on the strip each file opens in a new tab; a PDF already
  open in a tab asks first. On the document (or anywhere else while one is open) the pages are added at a position the
  person picks (start, end or after page N) as one `addFiles` commit (one undo step); a PDF already in the document asks
  first. With no document open a drop just opens the files. While a file opens or a tab loads, the strip and its keys are
  locked (`html.is-locked`) so the pages cannot land in another tab.
- **Convert** (`shared/convert/dialog.js`, `targets.js`, `dialog.css`; `window.SlopConvert.open({ file, drive })`): the
  toolbar button and File ▸ Convert… pass the open document (as a PDF, edits included). The targets are the converters of
  `convert/js/core/catalog.js` that take every open file (`targetsFor`); PDF to PNG and PDF to JPG are the one "PDF to
  images" converter with the format set, and PDF to text is added in `targets.js` (no converter in convert/js yet; no
  PDF to HTML). Merge needs two files: "Add files…" in the dialog picks more. Options are the converter's own. Results:
  Download, Download all as ZIP, and Save to Slop Drive when the document is linked. Not in the offline file (the module
  script is `data-offline="strip"`; the button and menu item are hidden there).
- **Still to do**: the service worker precache does not list the new files yet (run `node tools/pwa-precache.mjs` and
  bump VERSION, see below); a PDF to HTML target; Drive open into a tab from the strip (only File ▸ Open from Slop Drive).
- Tests: `tests/pdf/tabs.test.html` (two tabs and their state, strip drop and its duplicate prompt, page drop with the
  position and undo, reload, the Convert button); `tests/convert/dialog.test.html` (targets for a PDF, PNG, PDF to text,
  a second file for Merge). `pdf.spec-history.js` now takes the home stack key from `H.stackKey()` (the key of a tab).
- After any change to script or CSS lists, run `node tools/pwa-precache.mjs` and bump VERSION in `service-worker.js`
  (the new files are not in the precache until it is run).

## Drop choice, drop routing, layers, sidebar dock
- **Drops on the open document** (`js/ui/drop.js`): `SlopDropChoice.ask` (shared/drop/choice.js, the PhotoSlop dialog)
  offers Add to current (the position dialog, then one undo step) or Create new (each file in a new tab). Cancel adds nothing.
  No document open: the files open as before. A drop on the tab strip still opens new tabs.
- **Files the app cannot open** (`js/ui/drop.js`, `notice`): PDF, PNG, JPEG, WebP, GIF and BMP open; SVG is offered Convert to PDF
  (`A.convertFiles`, the Convert dialog with the file, Images to PDF among its targets); every other type is named in a dialog
  and the status line ("Not supported"). CSV, TXT, MD, HTML, JSON, XLSX, DOCX, ODT, ODS and PPTX have no PDF converter.
- **Layers** (`js/core/layers.js`, `js/editor/layers-ops.js`, `js/tools/layers-panel.js`): each annotation is a layer item; the
  page's annots array is the stack. `hidden` (not drawn in the page view or thumbnails, not exported, a hidden redaction mark
  is not burned in) and `locked` (drawn and exported, but not moved, resized, edited, nudged, deleted or given new props) are
  flags on the item. Move up/down reorders the stack. Each change is one undoable step. Duplicate and paste clear both flags.
  Not done: renaming a layer, drag-to-reorder, grouping, layers for stamps (page numbers, watermark) or form fields.
- **Sidebar dock** (`js/ui/dock.js`, `css/dock.css`): sections under the tool panel (`#props .pp-dock`). Layers starts open,
  History starts collapsed; open state is kept for the session only. The tool panels themselves are not collapsible.
- **History** (`js/tools/history-panel.js`, `H.steps()` and `H.goTo(n)` in `core/history.js`): applied steps oldest first, then
  undone steps greyed; a click goes to that state by undo or redo.
- Tests: `tests/pdf/pdf.spec-drop.js`, `pdf.spec-layers.js`, `pdf.spec-sidebar.js` (in `pdf-workspace.test.html`).

## Slop Drive: originals, saved copies and versions (`io/drive-docs.js`, `io/doc-changes.js`, `ui/versions.js`)
- **The original is kept at once.** Opening a PDF (drop, File ▸ Open, Add pages, Open from Drive into an empty document)
  stores its untouched bytes as a Drive file before anything else happens. An encrypted PDF is stored encrypted. The
  original is never written again. Images opened as pages are not stored (no original file exists for them).
- **Duplicates are linked, not copied.** The SHA-256 of the bytes (`SP.editLog.fingerprint`) finds a Drive PDF with the same
  bytes: sizes are compared first, and each PDF's hash is cached in its record (`meta.sha256`). A plain PDF another app put
  in Drive is adopted as the original. An edited copy links back to its original, so opening it finds the same document.
- **Save** (File ▸ Save to Slop Drive, Ctrl+S) writes two more Drive files beside the original: the edited PDF (`meta.pdf`
  role `edited`) and `<name>.changes.json` (role `changes`). Later saves update those two; the original is not overwritten.
  Behaviour change: Save used to write back to the Drive file the document came from, which is now the untouched original.
- **Change list** (`slop-pdf-changes`, version 1, `io/doc-changes.js`): `original` and `edited` (name, sha256, size),
  `layers` (each page's annotations as numbers, booleans, short strings and number lists, with the hidden and locked
  flags), and `log` (the edit-log records of the open document: the commands that replay on the original, assets as data
  URLs). Replaying `log` on the original gives the edited document (checked in `pdf.spec-drive-docs.js`).
  The change list does not contain the original bytes.
- **File ▸ Versions**: Open the original; Open the edited copy (a new tab, linked to the original, no new Drive copy); Open the
  original with the saved changes (replays `log` on it); Revert to the original (asks first; drops the edits in this tab and
  the device's saved edits for that file; the saved edited copy stays in Drive); Download the change list (JSON).
- **Without Slop Drive** (offline file, no hub, or a storage error) nothing is written. The document opens and works here,
  and a message says it is kept on this device only. File ▸ "Save opened PDFs to Slop Drive" (`slop-pdf.driveAutosave`)
  turns the automatic save off; Save and Versions still work once a document is in Drive.
- **Limits.** A document built from several files is linked to its first file; the other files are stored as their own
  originals. The offline file has no Drive, so none of this runs there.
- Tests: `tests/pdf/pdf.spec-drive-docs.js`.

## Edit text ▸ Paragraphs (`editor/para-*.js`, `css/para.css`)
- **Modes**: while Edit text is on, a bar under the page toolbar (`#ctxEditText`, built by `para-mode.js` after `#ctxPage`)
  has a Lines | Paragraphs segmented control (a radio group: Tab reaches the checked one, arrows switch; the commands treat
  it as a field so arrows do not turn pages), a hint and Done. The choice is kept in `slop-pdf.editTextMode` (try/catch).
  `Ed.setEditTextMode('lines' | 'paragraphs')`, `Ed.paraMode`. Lines mode is unchanged (`edit-text.js`).
- **Blocks** (`para-blocks.js`, pure, `tests/node/pdf-para-blocks.test.mjs`): the page's runs (`S.textRuns`, only the
  ones no cover hides, `S.visibleRuns`; upright runs only) become lines (one baseline, a gap over 1.5 em splits: column
  gutters) and lines become blocks: the nearest line below in the same column (x ranges overlap), same family, size
  (±12%) and weight of the line's main run (bold/italic runs inside a line stay), the pitch of the block (±20%; the first
  join at most 1.8 em), and the block's edge: same left edge (a first-line indent or a bullet's hanging indent on the
  second line is allowed), else the right edge or the centre. A new indent, a bullet or number ("•", "-", "1.", "a)") or
  a bigger gap starts the next block. Alignment: left / right / center / justify (both edges even over at least two
  lines, the last one shorter; tolerance 0.06 em). Right-to-left lines (mostly Arabic/Hebrew letters) are mirrored, so
  their start edge is the right one.
- **Frame** (`para-mode.js`): in Paragraphs mode a press goes to `S.paraDown` (hook in `pointer.js`): a frame annotation
  under it is selected; on page text, the block under the press, or every block a drag crosses (one frame, one paragraph
  each). The frame (`.para-frame` in the page layer, focusable) shows at once and its fonts are set up behind it
  (`P.fromBlocks`, `para-model.js`): the font check (`S.fontsReady`), each document font's substitute (`S.runFont`), the
  ink and paper colours (`edit-colours.js`) and the old lines taken out of the content (`S.strip.take`, see "Taking old
  text off a page"; one cover per old line only as the fallback and as the drag preview, `M.coverPlan` + `F.coverAnnot`,
  0.12 em wider so overhanging glyphs are hidden). Double-click / Enter / F2 edits, a side handle reflows (page space, so rotated pages
  work), the body moves, Escape lets go. Nothing changes until the first move, resize or edit, which commits the removal (or covers)
  and the frame as one undo step (`P.commit`); later changes replace the frame (one step each: Edit / Move / Resize
  paragraph). With the select tool a frame is an ordinary box annotation (`E.BOX.para`): left/right handles reflow it on
  an unrotated page (`S.paraReflow`, `view.js` handles), double-click edits it.
- **Typing** (`para-edit.js`): a contenteditable box over the frame in the paragraph's face (the pdf.js face of the
  document font when it has one, `P.faces`), size, pitch, alignment, indents and paper colour, stretched horizontally
  (scaleX) by the ratio of the document's widths to the browser's so it wraps where the saved frame will. Enter = new
  paragraph, Shift+Enter = line break, Ctrl+B/I bold/italic (a style of the frame with that weight, else the substitute
  font in it), paste is plain text. Ctrl+Enter or a click elsewhere applies, Escape cancels.
- **Layout and saving** (`para-layout.js` pure, `tests/node/pdf-para-layout.test.mjs`; `para-fonts.js`): greedy wrap to
  the frame width (first-line / hanging indent, paragraph gap kept from the original), left/right/centre, justify spreads
  the words of every line but a paragraph's last (each word is its own positioned piece). The frame annotation keeps its
  laid-out lines (`lines[].segs[]: x, w, t, s, fb, rtl`), so it draws (`V.paraNode`, `para-view.js`, SVG text with
  textLength) and saves (`E.drawPara`, hook in `io/export.js`) without the fonts at hand. Each style keeps `cm`
  (character → [code, width]) for the characters it uses, read from the document font with pdf-lib (`P.info`: Type 0
  Identity-H with a ToUnicode map and W widths, or simple TrueType/Type 1 with Widths and ToUnicode or WinAnsi; embedded
  fonts only). Saving writes those codes in the document's own font (the copied page's font dictionary, found by
  BaseFont, registered as `SlopPara…`), so the text is the original face and stays searchable through its ToUnicode map.
  A character the font lacks (a subset), right-to-left lines (they need shaping) and fonts that cannot be reused (Type 3,
  other CMaps, not embedded: Helvetica stays the standard Helvetica) go through the substitute font and the language
  fonts (`E.runsOf`, `SlopPdfRuns.drawRun`). `E.paraFontNeeds` lets `E.prepareAnnotFonts` ready them before a save.
- **Limits**: a frame does not push the text below it (a longer paragraph can overlap the next one; drag a side or move
  it); right-to-left lines are not spread when justified (they stay at their start edge); a multi-style RTL line places
  its style runs from the right but SlopBidi orders only inside each run; rotated text (not upright) is not grouped;
  colour is one per frame (the first line's ink).
- Tests: `tests/node/pdf-para-blocks.test.mjs`, `tests/node/pdf-para-layout.test.mjs`, `tests/pdf/para.test.html`
  (`para.helpers.js`, `pdf.spec-para.js`, `pdf.spec-para-intl.js`: select a 3-line paragraph, type, the saved lines
  inside the frame one pitch apart, narrower frame → more lines, move, undo, a drag over two paragraphs, justified stays
  justified, Lines mode and the remembered mode, Swedish å ä ö, a Barlow subset reused with ö in the substitute, Arabic).

## Taking old text off a page (`editor/text-strip.js`, `core/content-*.js`)
- **One path** for Edit text ▸ Lines (`S.coverRun`), Edit text ▸ Paragraphs (`P.fromBlocks` / `P.commit`) and the
  selection bar's Remove (`A.remove`): `S.strip.take(p, targets)` with targets `{ x0, x1, y (baseline), fs }` in PDF user
  space (a whole run, or the part of a run a selection crosses). The page's content stream is rewritten
  (`core/content-strip.js` on the operators of `core/content-lex.js`): every glyph whose centre is in a target on its
  baseline is dropped; the Tj/TJ/'/" that showed it becomes a TJ that keeps the other glyphs and moves the pen by the
  dropped advance (Tc, Tw, Tz included), so nothing after it moves, and every other operator stays byte for byte. Widths
  come from the font dictionaries (Widths/FirstChar, Type 0 Identity-H W/DW, the standard 14 by pdf-lib's AFM metrics).
  The result is a derived copy of the file (`f.derived = { from, i, targets }`, id `d` + a hash of those, same colour),
  checked with pdf.js (no text left in the targets, every other item where it was) before the page's `f` points at it in
  the commit (`S.strip.use`); undo points it back. Nothing is painted over the old text: it is gone from screen, print,
  search and copy, and from the saved file (the old content stream is deleted unless another page shows it).
- **Covers are the fallback**, in the colour under the text: text in a Form XObject, invisible text (Tr 3: a scan's words are in its picture), clipping text (Tr 4–7), fonts that
  cannot be measured (Type 3, CMaps other than Identity-H, a lost pen position), turned text, files over 80 MB, a check
  that fails, and OCR words (their own path, `ocr/layer.js`). The colour is the rendered page's (`edit-colours.js`), or,
  when the browser does not let the page read its canvas back (Firefox / Tor Browser with fingerprinting resistance read
  white: that was the white bar on the beige sample) or the page is not rendered, the colour the content paints there
  (`core/content-fills.js`: the last filled rectangle under the box, followed into forms; an image, shading, pattern or
  curved shape there is not flat → white). Replace all and the selection box's lift still use covers (with that colour).
- **The new text's colour** (Lines, Paragraphs, Replace: `S.textInk` in `edit-colours.js`) is the colour the content
  painted the old text in (`core/content-ink.js`: fill colour, or stroke for stroked-only text, through q/Q and Form
  XObjects; DeviceGray/RGB/CMYK, ICCBased as its alternate, Indexed, Separation and one-ink DeviceN with an exponential
  tint; CMYK converted as pdf.js draws it), read from the page's resources by `core/content-res.js` before the content is
  rewritten. Else the median of the glyph pixels on the rendered page (not the paper), else black or white with at least
  4.5:1 on the paper. The editor shows its text in that colour; its field is the paper unless the ink reads under 3:1 on
  it (`S.fieldColour`: black or white then). Tests: `tests/node/pdf-content-ink.test.mjs`, `tests/pdf/ink.test.html`
  (white on near-black, pink on beige, CMYK, grey, in a form, canvas reads blocked, Paragraphs and Replace; the saved
  text's fill read back from pdf.js's operator list equals the original's). Not done: the Replace text macro (pdf-lib
  path) still draws black; Lab, DeviceN with several inks and sampled/PostScript tint transforms give no content colour.
- **Edit log**: a derived file is replayable: the log keeps its recipe (`rec.derived`) and replay makes it again
  (`S.strip.build` with the same id) before applying the steps; a step whose copy cannot be made ends the replay there.
  The status bar counts a derived copy as its file. A paragraph selected and left unchanged lets its copy go
  (`S.strip.release`).
- **Remove** lets the selection go (browser selection, snapshot, bar and selection box), so nothing is left where the
  text was.
- Tests: `tests/node/pdf-content-strip.test.mjs` (operators dropped or replaced, the rest untouched, positions kept,
  colours under a box), `tests/pdf/strip.test.html` (`pdf.spec-strip.js`: the beige sample in Lines, Paragraphs and
  Remove, screen canvas and saved rendering with no bar, old text not extractable, undo, edit-log replay, text over a
  gradient image, text in a form covered in the paper colour with the canvas unreadable).

## The selection bar in every mode (`editor/sel-bar.js`, `sel-annot.js`, `css/selbar.css`)
- One bar for whatever is selected in page view, in Select and in Edit text (Lines or Paragraphs). Text: Highlight,
  Underline, Strikethrough, Colour, Copy, Comment, Edit text, Remove, Redact, Replace, Find (`sel-actions.js`). A selected
  annotation (not locked, not being typed in): Edit (text box, callout, step, paragraph), Colour (the type's own colour:
  `color`, or `fill` for boxes, whiteouts and steps), Opacity (100/75/50/25%), Comment (the composer at its top-right),
  Duplicate, Delete (the old floating `.sel-del` button is gone; Del still deletes). All through the editor's commands
  (`Ed.setProp`, `Ed.duplicateSelected`, `Ed.deleteSelected`), one undo step each. The bar follows every repaint of the
  selection (it wraps `S.drawSelection`), sits above the selection or below it near the top, stays above the on-screen
  keyboard (`SlopKeyboard.visible()`, the `slopkeyboard` event), and wraps its annotation row on a phone. Tab moves
  into it, Escape puts it away (for an annotation until another one is selected).
- Edit text ▸ Lines (`pointer.js S.textPress`): a press on page text that stays put opens the line on release; a drag
  selects the text it crosses and a long press the word (the selection is made with `caretRangeFromPoint` and
  `setBaseAndExtent`, the browser's own drag selection being held off), and the bar shows; its marks keep Edit text on.
  The bar's Edit text opens the line at once from any mode (Edit text comes on), or in Paragraphs mode the paragraph
  under the selection (`S.para.selectBlocks` + `edit`).
- Tests: `tests/pdf/actions.test.html` (`pdf.spec-actions.js`).

## Fonts (`ui/fonts.js`, the shared panel)
- File ▸ Fonts…, the top-bar "Aa" button and the command palette ("Fonts…"). It opens the shared Fonts panel
  (`shared/fonts/panel.js`, `SlopFonts.openPanel`) and can be reopened at any time.
- The panel is given the families the open file embeds as a subset, and the standard ones. A family in the file as a
  full embed needs no answer and is not listed. If nothing is listed, a notice says the document has no subset fonts.
- The panel shows each family's status: built in (a standard name), bundled, downloaded, your own file, or missing.
  A missing family offers Download from the library (only when `shared/library` lists it; nothing downloads before the
  confirmation), Drop your own font… (stored on this device), and Use the closest font instead.
- A closest font chosen there is kept on each open file that uses the family (`f.fontMap`). The first-edit prompt
  (`editor/font-check.js`, through `SlopFontCheck.ask`, now a shim over the same panel) skips a family that has an answer and
  still asks for any missing family that has none.
- Tests: `tests/pdf/pdf.spec-fonts-dialog.js`.

## Export as (`ui/export-menu.js`, `shared/convert/pdf-office.js`, `pdf-pptx.js`, `pdf-layout.js`)
- File ▸ Export as ▸ Word, Excel, PowerPoint, PNG, JPG, or Other formats… (the Convert dialog with that target chosen).
  The three new targets live in `convert/js/core/catalog.js`, so the Convert app offers them too.
- **PDF to Word (DOCX)**: text-based. `pdf-layout.js` groups the text into lines and cells (a gap of a fifth of the text
  height starts a cell); consecutive lines with the same column starts become a Word table, other lines are paragraphs.
  The page size is Letter or A4, whichever is closer. Images, drawings, colours and fonts are not kept. A page with no text
  layer gets a line saying so.
- **PDF to Excel (XLSX)**: one sheet. Each page starts with a "Page n" row; each line goes into the column its text starts
  in (columns are the text start positions of the page). Values that round-trip as numbers are numbers. No formulas,
  formats or images.
- **PDF to PowerPoint (PPTX)**: one slide per page, the page drawn as a picture at 144 dpi, fitted to 16:9. The text is not
  editable in the deck. Not yet checked in Microsoft PowerPoint.
- **Cells**: `shared/convert/pdf-text-items.js` builds the text items from the page's operator list (pdf.js
  `getOperatorList`, text state operators, Tm/Td/TJ/'/" advances and widths), one item per show operation, so each cell
  drawn as its own Tj keeps its own x. A TJ kerning gap wider than a fifth of an em is read as a space. The old
  `getTextContent` path (which joins text on one baseline) is the fallback when the operator list is unavailable, and
  `readPages(bytes, spec, { textContent: true })` forces it.
- **PDF to text** reads through the same `pdf-layout.js`.
- Each target's fidelity is its `note`, shown in the dialog.
- Tests: `tests/pdf/pdf.spec-office.js` (a generated table with cells on one baseline splits into a Word table).

## Still to do
- The service worker precache does not list the new files until `node tools/pwa-precache.mjs` runs and VERSION is bumped.
- Tables are found from text alignment only: no ruled-line detection, no merged cells.
- Scanned pages are marked, not OCR'd, in Word and Excel (PowerPoint keeps them as pictures).

## Assistant commands (`js/ui/ai-pages.js`, `js/ui/ai-commands.js`)
Loaded on demand by `SlopCmd.prepare()` (`ui/commands.js`, not in the offline build), with `shared/commands/sources.js`. All
`pdf.ai.*`, hidden, one `E.commit` each: `new_document` (size a4/letter/legal/a5/a3 or width/height in points, landscape,
pages, title; a new tab when a PDF is open), `add_pages`, `insert_pdf` (a Slop Drive PDF through `A.addFiles`), `delete_pages`
(the only destructive one), `rotate_pages`, `move_page`, `add_text` (Helvetica/Times/Courier, size, colour, bold, italic),
`add_shape` (rect, ellipse, line, arrow, highlight box, whiteout), `add_image` (Slop Drive or a same-origin URL), `fill_form_field`,
`set_metadata`, `export_pdf` (`E.build`, to Slop Drive and/or a download), `undo`. Positions are points from the top-left of the
page as shown; results say where the addition landed and warn when it runs past the page. `state()` lists pages, additions,
metadata and form fields; the checkpoint closes tabs the assistant opened and undoes back to its depth (`SP.history.goTo`).
Test: `tests/pdf/ai-commands.test.html`.

## Page objects, PDF layers, Extract all (`core/content-objs.js`, `content-move.js`, `content-svg.js`, `editor/obj-*.js`, `io/ocg.js`)
- **Objects mode** (Edit ▸ Edit page objects, the toolbar's Objects button, key O; `Ed.toggleObjects`): the page's own objects
  from its content stream (`SlopPdfObjs.objects` on the operators of content-lex.js): image XObjects and inline images (the
  CTM they paint with, their quad and box, clipped or not, their /OC layer), Form XObjects (placed logos and artwork: BBox
  through Matrix and CTM) and vector groups (a BDC/BMC … EMC or a clipped q … W n … Q that paints paths only; the outermost
  one; one as big as the page is the page). Hover outlines an object, a press selects it; drag moves, eight handles resize
  (Shift keeps the aspect; a turned object scales evenly), the round handle turns (Shift: 15°), two fingers pinch (the nav
  engine's zoomAt/panBy go to the object while it is held), the arrows nudge (1 pt, Shift 10 pt, a run of presses is one
  step), Delete deletes, Escape lets go (commands `edit.objects`, `obj.*` in `ui/commands.js`). A copy of the object's
  pixels follows the drag; the content is rewritten once on release.
- **The rewrite** (`SlopPdfMove`, Node-tested in `tests/node/pdf-content-objs.test.mjs`): a placement T in user space
  becomes X = outer × T × outer⁻¹, folded into the first cm of the object's own wrapper (q [cm gs clip]… Do Q, as pdf-lib and
  most writers place pictures) or a new q X cm … Q around a bare object; delete drops the span; duplicate adds a moved
  copy after it; arrange moves the span past the next / before the previous object, or to the end / start, wrapped so it
  keeps its place; replace paints a new image XObject (`newXObject('SlopImg')`) in the old box, fitted to its aspect. Every
  other operator stays byte for byte. Matrices are written with ten significant digits.
- **One path**: each edit is `S.strip.edit(p, { kind: 'obj', op, id, T | dir | image })` (`editor/text-strip.js X.edit`
  → `X.build` with `X.kinds.obj`, `editor/obj-derive.js`): a derived copy of the file, checked by pdf.js (the page's
  operator list builds), then one `E.commit` that points the page at it; undo points it back; the edit log keeps the
  recipe (`rec.derived[].edit`) and makes it again on replay. Object ids are `kind:operator index` on the file the edit is
  made from; after an edit the same object is found again by kind, name and the box it should have (`O.follow`).
- **Selection bar**: `SlopSelBar.provide({ id, label, active, box, build, refresh, dismiss })` (`editor/sel-bar.js`) lets
  another selection show its own row in the one bar; the object row (`editor/obj-bar.js`): Arrange (front, forward,
  backward, back), Turn 90°, Duplicate, Replace image… (the shared intake, spec `pdf.objimage`), Save image / Save as SVG,
  Open in… (SlopOuttake), Delete. `editor/obj-files.js`: a stored JPEG is saved as its bytes, an 8-bit Flate image as
  PNG, an inline JPEG as its bytes, anything else as a PNG cut from the page drawn at the image's resolution; forms and
  vector groups as SVG (`SlopPdfSvg.toSVG`: paths, colours, line styles, even-odd, clip paths, nested forms; images by
  callback, no text).
- **PDF layers** (optional content groups, `io/ocg.js`, `tools/ocg-panel.js` in the Layers section under the annotation
  layers): listed per opened file from pdf.js (`getOptionalContentConfig`). Show/hide is `E.state.ocHidden` (one undo step,
  logged): the page view, thumbnails and page images draw with it (`E.renderOptions` in `core/pdfjs.js`, the raster key
  through `E.formKey`), and a saved PDF has it as its default view. Delete layer removes every `/OC /name BDC … EMC` for
  the layer from each page (`SlopPdfMove.stripMarked`, also membership dictionaries of that layer only) and the group from
  OCGs, D/Configs ON, OFF, Order, Locked, RBGroups and AS: a derived copy (`X.kinds.ocg`, page: false) for every file of
  that opened file, one step.
- **Saving keeps them** (`io/export-oc.js`): `E.build` copies pages with one `PDFObjectCopier` per source file
  (`E.copyPagesWith`) and then carries `/OCProperties` (merged, the hidden layers in OFF) and the EmbeddedFiles name tree
  (and AF) into the output (`E.carryCatalog`). Before this, layers and attachments were dropped on every save.
- **Extract all** (File ▸ Extract all…, `ui/assets.js`; the command keeps its id `file.extractAssets`): images (stored, once
  each, and inline), embedded files (EmbeddedFiles tree, AF, FileAttachment annotations: name, MIME, size, description,
  relationship, the Factur-X / ZUGFeRD mark), fonts (FontFile/2/3 → .pfb/.pfa, .ttf, .otf, .cff), the text of each page
  (.txt and/or .md, `SlopPdfAssets.pageText`) and each page as PNG (150 or 300 dpi) or SVG (`io/extract-more.js`; pages and
  text come from the built document, so edits are in). Download ZIP or one file each, Save to Slop Drive (a folder per
  PDF), Open in… (one file as it is, more as the ZIP). The reading is `core/pdf-parts.js` (`SlopPdfParts`, pdf-lib, no
  DOM), shared with the headless operation `pdf.extract` (`shared/ops/pdf-extract.js`, registry app `pdf`: File convert,
  Workflows, the assistant).
- **Assistant / macros** (`ui/ai-objects.js`, loaded with the other assistant commands): `pdf.objects.list|move|resize|rotate|
  arrange|duplicate|delete|replace` and `pdf.extract.list|save`, positions in points from the page's top-left as shown.
- **Limits**: objects inside a Form XObject are part of the form (the form moves as one); a vector group needs marked
  content or its own clip (loose paths are not objects); arranging moves an object out of a clip it shared with others;
  shading (`sh`) and text are not objects; a vector group whose operators change state for what follows it (no q … Q of
  its own) may leak that state when moved; Delete layer does not touch annotations or form XObjects with an /OC entry of
  their own; SVG export has no text for objects and only the XObject pictures of a page.
- Tests: `tests/node/pdf-content-objs.test.mjs`, `tests/node/pdf-assets.test.mjs`, `tests/pdf/objects.test.html`
  (`pdf.spec-objects.js`, `pdf.spec-ocg.js`), `tests/pdf/extract.test.html` (`pdf.spec-extract.js`), fixtures made in the
  tests (`objects.helpers.js`).

## The select tool edits what it selects (`editor/select-edit.js`, `para-xform.js`, `annot-xform.js`, `multi-sel.js`, `clip.js`, `cross-page.js`)
- **Why it did not before**: one gesture went to three mechanisms. A click on page text gave the browser's character
  selection of one pdf.js span plus a "lift" box (`sel-lift.js S.onClick`; its handles turned the selection into a white cover
  and a Helvetica text annotation, losing the font); a double click opened the one-line editor (`Ed.editRunAt`, no handles);
  the paragraph frame that keeps the document's font (`para-*.js`) only came with Ctrl+E ▸ Paragraphs, and had width handles
  only; page pictures needed Objects mode (O).
- **Now** (select tool, Edit text and Objects mode off: `Ed.uniOn()`): a click on page text (a span, a gap between words, or
  before the text layer is built) selects its paragraph block as the frame (`S.selectTextAt` → `P.selectBlocks(p, bs, true)`,
  `sel.uni`) with move (body), width (`.para-h`), scale (`.para-c`: fs, pitch, indents and width together, the opposite corner
  kept) and turn (`.para-r`, Shift 15°) handles; typing a letter, Enter / F2 or a double click edits in the same frame (caret at
  the click), the handles stay; Escape applies and keeps the frame (it used to cancel); a click elsewhere applies and lets go
  (`sel.pending` keeps the derived file from being released under the edit: the regression test). Arrows nudge, Delete
  removes the text (`P.remove`). A click on a page picture / placed artwork / vector group selects it with its handles
  (`obj-mode.js O.live()`); a paragraph frame annotation opens its frame; other annotations select as before.
- **Plain text selection** stays in the same tool: a mouse drag across text selects characters (the selection bar: copy,
  highlight…); on touch a long press selects the word and a drag scrolls; a second click on a selected block selects a word
  (below). No separate tool was added: one tool, no mode.
- **Markup on a block and on words** (`block-mark.js`, `sel-handles.js`; since M53 the bar of a selected block had lost them):
  the block bar (`para-bar.js`) has a Mark up group — Highlight, Underline, Strikethrough, Colour, Comment, Redact — that
  acts on the whole block through the text selection's own actions (`sel-actions.js` takes a snapshot argument: a block of
  page text gives its line rectangles, an edited or moved frame its laid-out line quads, turned with it). Pressed buttons
  show markup the block already has; a second press takes it off. At ≤ 860 px the group folds into a "Mark up" button that
  opens it below the bar (`css/selbar.css`). Words instead of the block: a mouse drag across unselected text (as before);
  a second click or tap that stays put on a selected block's text selects the word there after the double-click time
  (`P.still`, called by `para-xform.js` for a press on the frame that does not move; a double click still edits, a drag
  still moves); Edit ▸ Select text in block (`edit.selectBlockText`) selects all of its words. Those, and a long press on
  touch, give a text selection with the full markup row (`sel-bar.js`). A touch selection gets two drag handles
  (`.sel-knob`) that move its ends (`S.caretAt`), because the page view takes a finger's drag for scrolling. Limit: markup
  stays where it was put when the block is moved afterwards. Tests: `tests/pdf/markup-bar.test.html`.
- **Turning** annotations: a round `.sel-rot` handle on text boxes, pictures/signatures, rectangles, ellipses, covers and
  highlight boxes; `a.rot` at any angle (view angle = page rotation − rot). `E.annotViewRect` gives a turned box's bounds;
  a turned box shows turned handles that resize along its own edges (`SlopPdfXform`, `xform.js`, Node-tested). A turned
  paragraph frame is saved inside a `cm` about its centre (`E.drawPara`).
- **Groups**: Shift+click toggles, a mouse drag on empty page draws a box (Shift adds); the group moves, nudges, deletes and
  duplicates as one step (`S.selectedIds()`). Mouse drag on empty page is the box now; Space / middle drag and a finger pan.
- **Copy / paste** (`clip.js`): Ctrl+C / X / V / D on annotations, groups, text blocks (copied as a para frame in its font,
  `st.src` says where its font is read from, and the export finds the font on any output page) and page objects (copied as a
  picture). Paste in place: another page → the same coordinates; its own page (and every further paste to one page) +12 pt.
  Edit ▸ Paste on all pages / Paste on pages… (a range). The clipboard survives tab switches (pictures carry their asset).
  The copied text goes to the system clipboard; a plain text paste from elsewhere becomes a text box.
- **Between pages** (`cross-page.js`): a move dropped on another shown page (continuous, single, two-page) goes there at the
  drop point; Alt copies; the target page is outlined and the viewer scrolls near its edges. Page objects (content stream)
  do not cross pages.
- **Panel** (`tools/sel-panel.js`): a text block's font (read-only: the document's), size, colour, alignment, X/Y/W and
  rotation; a page picture's X/Y/W/H and a turn; every annotation gets X/Y/W/H/rotation under its own properties.
- **Assistant** (`ui/ai-edit.js`): `pdf.text.list|select|edit|move|resize|rotate`, `pdf.annot.transform`, `pdf.annot.to-page`,
  `pdf.clip.copy|paste|paste-pages`. Strings: `pdf/i18n/<lang>/select.js` (all five languages).
- **Limits**: a pasted frame in another document saves in its substitute font when that document lacks the font; a text block
  cannot join a group (its frame is one selection); rotated pages: the frame's handles work in page space.
- Tests: `tests/pdf/select-edit.test.html` (`pdf.spec-select-edit.js`, `pdf.spec-clip.js`, `select-edit.helpers.js`),
  `tests/node/pdf-xform.test.mjs`; `pdf.spec-lock-text.js` and `pdf.spec-edit-inplace.js` follow the new click / double click.
