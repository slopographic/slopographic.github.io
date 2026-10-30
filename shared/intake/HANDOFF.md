# shared/intake: one way in, one way out (window.SlopIntake, window.SlopOuttake)

The owner's rule: **one way only** for getting files into an app, and one way for getting them out. Every source of files
ends in `SlopIntake.take(files, { source })`, runs one pipeline, and reaches the one reader the app registered. Every
"Open in…" / "Send to" / "Save to Slop Drive" menu is made by one builder, `SlopOuttake.items`.

## Files (load in this order, before the app's own scripts)

| File | What | Pure? |
|---|---|---|
| `rules.js` | `SlopIntake.rules` (also `SlopDrop.rules`): `check(file, rules)` with the reason, `acceptAttr`, `describe` (toast words), `dragLabel`, `size`, `ext`. Moved here from shared/drop. | yes (Node tests) |
| `normalize.js` | `SlopIntake.normalize(input)` → `File[]` from a File, FileList, array, DataTransfer (drop), clipboard data (a paste, also `<img src="data:…">`), a Slop Drive record `{ id, name, type, blob }` (kept as `file.slopDrive`), a converted result `{ name, blob }`, a Blob, a data: URL, a launch file handle, or a Promise of these. `dataUrlFile`, `toFile`, `listOf`, `pool(items, n, fn)` (bounded pool). | yes |
| `pipeline.js` | `SlopIntake.createPipeline(env)`: register / spec / take, the steps below. The page's side comes in as `env`. | yes |
| `intake.js` | The page's one pipeline: the events, the first-use notice (shared/firstrun), the Add or New question (`SlopIntake.choose`, a SlopUI dialog `.si-choose`), the feedback (the drop zone's rows, else a toast). `register`, `take`, `on`, `view`, `accepts`, `acceptAttr`, and the old paste-only `attach`. | no |
| `sources.js` | The adapters: paste (one listener per page), `pick`, `fromDrive`, `launch` (?drive= and launchQueue), `fromConvert`, `sample`, `dropTarget`. | no |
| `outtake.js` | `SlopOuttake`: the one "Open in…" builder (after shared/hub.js; `SlopHub.openIn` and `SlopHub.sendMenuItems` are it). | no |

Pages: `<script>` tags for rules, normalize, pipeline, intake, sources (in that order) where the page has files coming in;
`shared/drop/panel.js` and `drop.js` after them for a drop zone; `outtake.js` right after `shared/hub.js`.
`shared/convert/load.js` loads them for the Convert dialog; `shared/offline/manifest.js` lists them for offline copies.

## The pipeline (one per `take()`; a single file is a batch of one)

1. **normalize** the source's input to Files.
2. **accept**: the spec's rules (`accept: { types, exts, noun, maxBytes, any, allowEmpty }`) or `accept(file)` → true |
   false | 'reason'; `except(file)` leaves some to the app's own path (its clipboard copies). Refusals keep their reason
   ("notes.txt is not a picture"). `noun` is an i18n key (`'sorter.app.a_photo'`), a function, or plain text: it is read
   when a file is refused, so it follows a language change; pass the key, not `t(key)`. `route(files, batch)` → the files kept (the app hands the rest to another spec or a dialog).
3. event **`slop:intake-before`** (cancelable: `preventDefault()`, or return false from `SlopIntake.on('before', fn)`).
4. **gates, in order**: the first-use notice (`notice: { title, lines, downloads }`, once per batch whatever the source);
   the count and size limits (`limit`, `maxTotal`); **Add to <open doc> or New** when `hasOpen()` is true (one dialog,
   `labels` to word it; skipped when the source gave `mode`; `ask: ['paste', …]` limits it to some sources); the app's
   `gate(batch)` → false stops.
5. **`before(batch)`** → batch | File[] | false.
6. **process**: `process(file, ctx)` over the files, `concurrency` at once (default 1), or a whole-batch reader:
   `onAdd(files, ctx)` / `onNew(files, ctx)` for the chosen mode, `processAll(files, ctx)`. `ctx = { source, mode, at,
   index, data, batch, signal, progress(0..1), drive }` (`drive`: the Slop Drive record the file came from). A thrown
   Error is that file's reason. Event **`slop:intake-file`** after each file (`file`, `ok`, `result`, `error`).
7. **`after(results, batch)`**, the feedback (the zone's rows and toast through `SlopIntake.view(id, …)`, else a toast;
   `toast: false` for a spec that reports itself), event **`slop:intake-after`** (`files`, `results`, `summary`).

Batches for one spec run one after another (drops during a batch queue up). `take()` resolves the summary
`{ app, source, mode, added: [{ name, value, file }], skipped: [{ name, reason }], refused, cancelled }`.

## The app spec (registered once)

```js
SlopIntake.register({
  id: 'myapp',                       // take() without `to` goes to the page's main spec (main: false for a part)
  accept: { types: ['image/*'], exts: ['.heic'], noun: 'a picture' },
  driveAccept: ['image/*'],          // the Drive picker's types (default: accept.types)
  notice: { title, lines, downloads },   // optional first-use notice
  hasOpen: () => doc.open, openName: () => doc.name, labels: { add: 'Add to current', new: 'Create new' },
  process: async (file, ctx) => addItem(file, ctx.mode),   // or onAdd / onNew / processAll
  after: (results, batch) => {}, concurrency: 1,
  paste: true, first: false, toast: true,
});
```

Parts of an app with files of their own (a watermark logo, brushes, a backup, a macro's test PDF) are specs of their own
(`main: false, paste: false`), reached with `SlopIntake.pick({ to: 'myapp.logo' })`.
`SlopIntake.part(spec)` registers such a part once (`main: false, paste: false, toast: false` unless given) and returns its
id: `SlopIntake.pick({ to: SlopIntake.part({ id: 'keys.import', accept, process }) })`. A shared component on pages that
may not load shared/intake keeps its old picker as the fallback, marked `intake-ok`.

## Sources (every one calls take)

| Source | Call | `source` |
|---|---|---|
| a drop on the app's zone / targets (with the zone UI, outlines, rows) | `SlopDrop.attach(zone, { intake: 'myapp', targets, mode?(e), data?(e), files?(dt, e) })` | drop |
| the zone's Choose files | (the zone) | picker |
| File ▸ Open, Ctrl+O, Insert from file, an "Open…" button, Upload a folder (`folder: true`) | `SlopIntake.pick({ to, mode, data, multiple, accept, folder })` | picker |
| a drop on a plain area (no zone UI) | `SlopIntake.dropTarget(el, { to, mode?(e), data?(e) })` | drop |
| a paste | automatic: the first spec (paste ≠ false) that takes the file | paste |
| Open from Slop Drive | `SlopIntake.fromDrive({ to, mode, title, accept })` | drive |
| ?drive=<id> (another app's Send to… / Open in…), PWA `launchQueue` (manifest `file_handlers`) | `SlopIntake.launch({ to, mode })` once the app is ready | launch |
| the Convert dialog's results handed back | `SlopIntake.fromConvert(outputs, { to, mode })` | convert |
| Try it with a sample | `SlopIntake.sample(files or fn, { to, mode })`, or the zone's `sample` option | sample |
| code (tests, an app API) | `SlopIntake.take(files, { to })` | api |

**The one Slop Drive picker.** Every "from Slop Drive" in every app is `SlopIntake.fromDrive`, which opens
`SlopHub.pickFromDrive` → `shared/drive/picker.js`: folders with breadcrumbs, a search over every folder, and each file
as a picture (the Drive app's cached thumbnail through `shared/drive/thumb-read.js`, which also serves the Gallery's
Drive source; else the picture itself, a video's first frame, or a card with the file's kind from shared/kinds). A
resting pointer or a long press shows a larger preview. `accept` (default: the spec's `driveAccept`, else its types)
decides what is listed. No app builds its own list of Drive files for picking (rule 4 below);
`tests/intake/drive-picker.test.html` tests the picker and `tests/intake/drive-buttons.test.html` that the apps' Drive
buttons open it.

## Extension points

- Events on `document`: `slop:intake-before` (cancelable), `slop:intake-file`, `slop:intake-after`; detail `{ app,
  source, mode, files, … }`. `SlopIntake.on('before' | 'file' | 'after', fn, { app })` → off. Shared features (Workflows'
  "Add to a workflow", recent files, Sloppo) listen here without touching apps.
- `SlopIntake.view(id, { begin, refuse, row, end })`: a feedback view for a spec (SlopDrop registers its zone).

## SlopDrop on top (shared/drop)

`SlopDrop.attach(zone, o)` is the drop zone UI and the drop, Choose files and sample source. With `o.intake` it is the UI of
a registered spec. Without it (the apps not migrated yet) it registers a spec from `o` (`accept`, `process(file, progress,
ctx)`, `begin`, `done`, `limit`, `paste`), so the old callers work unchanged and already go through the pipeline.
`SlopIntake.attach({ accept, hasOpen, openName, onAdd, onNew, first })` (paste only) is a spec too.
`SlopDropChoice.ask` asks the same intake question; `SlopDropChoice.zones` are the drop places that give a drop its mode.

## One way out: SlopOuttake (outtake.js)

```js
SlopOuttake.items({ get: () => blob, name: 'x.png', type: 'image/png', from: 'myapp', verb: 'ui.outtake.send_to', folder: true })
SlopOuttake.send('code', { id: rec.id, name: rec.name, type: rec.type }) // a file already in Slop Drive: no copy
SlopOuttake.menu(buttonOrPoint, o); SlopOuttake.button(o, { label: 'Open in…' }); SlopOuttake.send('upscale', o)
SlopOuttake.handover({ from: 'cutout', to: 'photoslop', types: ['image/*'], replaces: true, label: 'Send to PhotoSlop as a layer', run: async (ctx) => { … } })
SlopOuttake.extend((ctx) => [{ label: 'Add to a workflow…', act }])
```

Items, in order: the app's registered handovers (richer, and `replaces` the plain item of that target), every registry app
that takes the type (`SlopHub.appsAccepting`; the file goes to Slop Drive and the target opens on ?drive=<id>, where its
`SlopIntake.launch` takes it), the shared features' items (`extend`, and `slop:outtake` listeners with `phase: 'items'` →
`detail.add(item)`), then "Save to Slop Drive…". Slop Workflows comes in one way: when the page has `shared/ops/entry.js`
(loaded after outtake.js), its `SlopWorkflowEntry.menuItems` gives "Run a workflow…" and "Add to a workflow…", and the
plain "Open in Slop Workflows" (the registry says it takes images and PDFs) is left out so it is not listed twice.
`items(o)` gives no separators (menus that do not draw them); `menu()` and `button()` add them. After a file went out: `slop:outtake` with `phase: 'sent'` (`from, to,
type, name, id`). `SlopHub.openIn(o)` is `items`; `SlopHub.sendMenuItems(getBlob, name, type, { folder })` is `items`
with the verb `'ui.outtake.send_to'`. Use the same items for the toolbar button, the More menu and the context menus.

`verb` is one i18n key per item whose text holds `{app}` (`'ui.outtake.send_to'`: "Send to {app}"; an app's own:
`'press.io.send_pdf_to'`: "Send PDF to {app}"), or a function `({ app }) → text`; never a word joined to the app name.
Without it the item reads `'ui.outtake.open_in'`. An app's plain item carries `plain: true` and "Save to Slop Drive…"
`save: true`: filter on those, never on the label's words (they are translated).

## Rule 4 (tools/one-way.mjs, run by tools/check-rules.mjs)

In the apps listed in `STRICT` (in tools/one-way.mjs: every folder in the Migrated list below), app code may not add a
`drop` or `paste` listener, call `pickFiles`, make a file input, read ?drive= (`consumeLaunch`) or `launchQueue`, call
`pickFromDrive`, list Slop Drive files with `SlopHub.list` (a picker of its own; a library view or a lookup by name
says `intake-ok:`), or build an "Open in"/"Send to" list by hand. A line that must stay (a tab dragged to a new place, text
pasted into a field) says why with an `// intake-ok: …` comment. When an app below is migrated, add its folder to
`STRICT`.

## Migrated (every entry point through take; duplicates deleted)

- **Slop PDF** (`pdf/js/ui/drop.js` spec `pdf`; parts `pdf.image` (paste-image.js), `pdf.logo` (watermark-panel.js),
  `pdf.images-to-pdf` (exports.js), `pdf.macro-test` (macro/ui.js)): drop on the stage / tab strip / a split pane (mode
  and data from the drop's place), the zone and Choose files, File ▸ Open, Insert pages from file (mode add, data.at),
  a pane's "Open a file", Open from Slop Drive, ?drive= launch, the Convert dialog's PDFs (`A.openConverted` →
  fromConvert), paste (a picture onto the page or a new PDF; any other file to `pdf`). Files PDF does not open go to
  the Convert dialog (`route`). Add to current or Create new is the intake's question (SlopDropChoice.ask is gone from
  PDF). Out: File ▸ Send to and the page's Send page as image use SlopHub.sendMenuItems (the builder).
- **PhotoSlop** (`photoslop/js/app/intake.js`, spec `photoslop`; parts `photoslop.brushes`, `photoslop.logo`,
  `photoslop.layer-pictures` (io/config.js), `photoslop.fx-preset` (layers/fx-preset-picker.js)): Open…, Place Image as
  Layer…, the tab bar's Open…, a drop (its zone gives the mode), a picture dragged from a web page, a paste (asks Add or
  New), Open/Place from Slop Drive, ?drive= launch, the welcome sample. The app's own `onPaste` is only its clipboard.
  `photoslop/classic/` (the classic Paint edition, its own page) is not migrated: see the list below.
- **File convert** (`convert/js/ui/tool.js`: one spec per tool, `convert` for the page's; the Convert dialog's tool is
  `main: false, paste: false` and unregisters when the dialog closes): the zone, Choose files, paste, the sample, the
  dialog's own files, `addFiles` (now a take), ?drive= / launch (mount.js). Out: the results' Open in… is
  `SlopOuttake.button` (shared/convert/results.js).
- **Slop Gallery** (`gallery/js/ui/main.js` spec `gallery`; part `gallery.backup`): a drop of files or folders
  (SlopDrop.folders), Import (Ctrl+O), Import a folder, Import from Slop Drive, ?drive= launch, paste, the sample. Each
  photo is one `G.actions.importOne` (a duplicate is skipped with its reason). Out: SlopHub.sendMenuItems.
- **SlopIsolate** (`slopisolate/js/io/files.js`, spec `cutout`): see its section below (in and out are done).
- **Slop Resize** (`resize/js/app/main.js` spec `resize`): a drop on the column or the zone, Choose files, Open
  (Ctrl+O), Open from Slop Drive, ?drive= launch, paste, the sample. Out: Send to Slop Upscale is `SlopOuttake.send`.
- **Slop Press** (`press/js/io/intake.js`, spec `press`): a drop on the stage or the zone (a picture goes into the frame
  under the drop point), the zone's Choose files, File ▸ Open (Ctrl+O, mode `new`: opens as a document), File ▸ Place
  (Ctrl+D) and Place Image into Frame (mode `add`, `data.frame`), Open and Place from Slop Drive, ?drive= launch and
  launchQueue (mode `new`), a pasted picture. A .slpress always opens; one from Slop Drive stays linked (Save writes back).
  The app's own paste listener is only its clipboard (items copied in Press) and pasted text. Out: File ▸ Send to is
  `SlopOuttake.items` twice (the PDF with Workflows; the page PNG, apps only) and Press's own Save to Slop Drive.
  `tests/intake/press.test.html`.
- **SlopLabel** (`label/js/ui/intake.js`, spec `label`; parts `label.replace` (Replace image…), `label.configs` (Configs ▸
  Import…), `label.zpl-text` (Import ZPL ▸ Open file…)): a drop on the app (a picture on the stage lands where it was
  dropped), the strip's Choose files, File ▸ Open (Ctrl+O), Insert image (mode `image`, `data.props`), Import CSV / Excel
  / JSON (mode `data`), Open project / Insert image / Data from Slop Drive, ?drive= launch and launchQueue, a pasted
  picture. Otherwise `openFiles` decides from the file; a project from Slop Drive stays linked. The accept rules now take
  text, JSON and spreadsheet types (a dropped .csv or .json was refused before). The app's paste listener is only its
  clipboard, ZPL and text. Out: File ▸ Send to is `SlopOuttake.items` for the PDF and the PNG.
  `tests/intake/label.test.html`.
- **Slop Upscale** (`upscale/js/app/main.js`, spec `upscale`, `limit: 1`): Open, the zone and its Choose files, a drop
  on the stage, a paste (new), Open from Slop Drive (the result keeps the Drive link), ?drive= launch and launchQueue, the
  sample, and `SlopUpscale.controller.open` (now a take). The first-use notice is the spec's `notice` (once per batch,
  whichever source); `open()` is only the reader. `drive.js` lost its own picker and `output.js` its record opener.
  `tests/intake/upscale.test.html`.
- **SlopCut** (`slopcut/js/io/intake.js`, spec `slopedit`, one `processAll` reader for the whole batch): Import media
  (Ctrl+I, the bin), Open project (Ctrl+O), Import from Slop Drive (a .slopedit stays linked), a drop on the window or the
  strip over the monitor and its Choose files, a drop on a timeline lane (`SlopIntake.dropTarget`, `data.tl`: placed
  where dropped), a paste (new), ?drive= launch and launchQueue (a file, a reel from Slop Gallery, a matte pair from
  SlopIsolate), SlopIsolate's `cutout-result` message (`SE.cutout.receive` hands the two Drive records to the intake,
  `data.cutout`), the sample project's media (`data.sample`). The drops of bin items, effects and slots stay (`intake-ok`).
  Out: Send frame to PhotoSlop is `SlopOuttake.send`. In STRICT by subfolder (not `js/watermark/`, see below).
  `tests/intake/slopcut.test.html`.
- **SlopVector** (`slopvector/js/io/intake.js`, spec `vector`): a drop on the window or the strip (placed at the drop
  point), the strip's Choose files, File ▸ Place, File ▸ Open (mode `new`), Open from Slop Drive (mode `new`, linked) and
  Place from Slop Drive, ?drive= launch and launchQueue (mode `new`: an SVG opens, a picture becomes a new artboard), a
  pasted picture; its own clipboard copies (SlopBuffer) are `except`ed and stay with its paste. `HUB.openRecord` /
  `placeRecord` / `sendTo` and `IO.openFile` / `pickFile` / `bindDrop` are gone. Out: File ▸ Send to is
  `SlopOuttake.items` (SVG with Workflows, PNG apps only). `tests/intake/slopvector.test.html`.
- **Slop OCR** (`ocr/js/app.js`, spec `ocr`, `processAll` → `addFiles`): the zone and its Choose files (the page's own
  hidden `#file` input is gone), a paste (new), ?drive= launch (the page now loads Slop Hub, so Open in Slop OCR
  arrives) and launchQueue, the sample. A paste is not taken before the model gate has shown the page (`gate`).
  `tests/intake/ocr.test.html`.
- **AI tool pages** (`aitools/intake.js`, `SlopAITools.intake(id, { accept, read, drive })`; specs `ai-denoise`, `ai-ocr`,
  `ai-portrait`, `ai-speech`, `ai-tags`, one file at a time): a drop on the box (`SlopIntake.dropTarget`), its "choose a
  file" button (was a file input in a label), a paste (new), launch, and Auto tags' "pick a photo from Slop Drive"
  (`fromDrive`; was a hand-made list of Drive photos). `tests/intake/aitools.test.html`.
- **Slop Transcribe** (`transcribe/js/app.js`, spec `transcribe`): the zone and its Choose files (the hidden `#trPick` is
  gone), the sample, a paste (new), a recording (a take with source `record`), ?drive= launch and launchQueue. A paste is
  not taken before the model gate has shown the page. `tests/intake/transcribe.test.html`.
- **Slop Music** (`music/js/ui/library.js`, spec `music`; part `music.playlist` in `ui/playlists.js`): Add files (the
  header and the empty library), a drop on the library and its strip, the sample, a paste (new), ?drive= launch (a track
  the library has plays, `M.playTrack`) and launchQueue (added to Slop Drive). Open a playlist from Slop Drive is the
  part's `fromDrive`. `tests/intake/music.test.html`.
- **Slop Drive** (`drive/js/ui/dnd.js`, spec `drive`, one `processAll` upload for the whole batch,
  `paste: false` (Ctrl+V is Drive's own clipboard)): a drop on the pane or the tree (files and folders,
  into the folder under the pointer; a provider folder and a lone .slop backup keep their own handling in the zone's
  `files` hook), Upload files… and Upload a folder… (`SlopIntake.pick({ folder: true })`, new in sources.js), ?drive=
  launch (a file Drive has is shown, no copy) and launchQueue (uploaded). Out: Open with, Quick look's Open in and New ▸
  (open) go out through `SlopOuttake.send(app, { id })` (new in outtake.js: an output already in Slop Drive opens without
  a copy, and has no Save to Slop Drive…). Drive keeps its own Open with list (default app per type, remembered; see
  "Open questions"). `tests/intake/drive.test.html`.
- **Slop Tables** (`tables/js/ui/drop.js`, spec `tables`; part `tables.template` in `ui/templates.js`): a drop on the grid
  or the strip, Open file from this device, Open from Slop Drive (Ctrl+O; the tab stays linked to the record), a pasted
  file, ?drive= launch and launchQueue. The reader waits for the tabs (`before: whenTabs`), and a launch that opens
  replaces the blank tab; a zero-byte .stab (Drive's New) is taken (`allowEmpty`). The grid's own paste is only cells and
  text. Import a template (file or Slop Drive) is the part's pick / fromDrive. `tests/intake/tables.test.html`.
- **Slop Sheets viewer** (`sheetview/js/main.js`, spec `sheetview`): Open spreadsheet… (both buttons, Ctrl+O), a drop,
  the sample (`SlopIntake.sample`), a paste (new), ?drive= launch and launchQueue, and the test hook. A file that fails
  is refused with its reason (was an alert per file). Out: Open current sheet in Slop Table is `SlopOuttake.send`.
  `tests/intake/sheetview.test.html`.
- **Slop Docs** (`docs/js/ui/intake.js`, spec `docs`): Open from Slop Drive (a .sdoc, linked; was the tab strip's own
  Drive picker), Import Word, Markdown or text from Slop Drive (mode `import`, unlinked), a drop on the page (new),
  ?drive= launch and launchQueue (the reader waits for the tabs; a launch replaces the blank tab). The hidden input's
  paste is only text. Out: Send to is `SlopOuttake.items` (the document as DOCX). `tests/intake/docs.test.html`.
- **Slop EML** (`eml/js/main.js`, spec `eml`): Open messages… (both buttons, Ctrl+O), a drop on the strip or the page,
  the sample (`SlopIntake.sample`), a paste (new), ?drive= launch and launchQueue; a message already open is refused with
  its reason; a batch of two or more goes to the list (`ctx.batch`). `EmlActions.openFiles` is gone. Out: Open in Slop
  PDF (`EmlExport.toApp`) is `SlopOuttake.send`; an attachment's Open in is `SlopOuttake.items`.
  `tests/intake/eml.test.html`.
- **Slop Hex** (`hex/js/main.js`, spec `hex`, `limit: 1`): Open file… (Ctrl+O, both buttons), Open from Slop Drive
  (linked; was the tab strip's own Drive picker), a drop on the tabs, the strip or the bytes, the sample, a paste (new),
  ?drive= launch and launchQueue (the reader waits for the tabs). A file already open is refused.
  `tests/intake/hex.test.html`.
- **Slop Code** (`code/js/main.js`, spec `code`): Open from Slop Drive, ?drive= launch and launchQueue, a drop on the
  editor (new) and a paste (new); Slop Code edits Slop Drive files, so a file from this device is put in Slop Drive (the
  folder chosen in the tree) and opened from there. The page now loads shared/intake. The tree's drag of rows stays
  (`intake-ok`). Out: a file that is not text offers `SlopOuttake.items({ id })` (the record opens in the app, no copy;
  its bytes are read from Slop Drive when an item needs them). `tests/intake/code.test.html`.
- **Slop Slides** (`slides/js/ui/file-drop.js`, spec `slides`; part `slides.template`): a drop on the editor, Open a file
  from this computer, Open from Slop Drive (a .sslide, linked; was the tab strip's own Drive picker), Import a PowerPoint
  or picture from Slop Drive, Insert picture (mode `image`), a pasted picture (new: inserted on the slide), ?drive=
  launch and launchQueue (read before the tabs, opened after them). Not during a slide show (`gate`). Import a template
  (file or Slop Drive) is the part. The sorter's drag of thumbnails stays (`intake-ok`). `tests/intake/slides.test.html`.
- **Slop Workflows** (`workflows/js/ui/run.js`, spec `workflows` on the page; a tool in the "Run a workflow…" dialog is a
  part `workflows.<ns>` with no paste, unregistered by `destroy()`; part `workflows.import` in `ui/library.js`): a drop
  on the zone, Choose files, the sample, a paste, ?drive= launch (Add to a workflow…, Open in) and launchQueue, and the
  tool's `addFiles` (now a take; the dialog's files too). Each batch is added at once. The step cards' drag stays
  (`intake-ok`). Out: a result's Open in is `SlopOuttake.items`. `tests/intake/workflows.test.html`.
- **Reel Remix** (`remix/js/intake.js`, spec `remix`; part `remix.music`): a drop on the bin or the stage, the zone's Choose
  files (the hidden `#rm-file` is gone) and sample, Add files… (the config prompt), a paste, ?drive= launch (new: Open in
  Reel Remix used to do nothing) and launchQueue. Pick music file is now a button (the part's pick). The drags of bin
  clips and cuts stay (`intake-ok`). Out: Send to SlopCut is `SlopOuttake.send('slopedit', { id })` with the manifest.
  `tests/intake/remix.test.html`.
- **Slop Clean** (`clean/js/app/main.js`, spec `clean`): Open pictures… (Ctrl+O, both buttons), a drop on the page
  (`SlopIntake.dropTarget`; was its own document drop listener), a paste (new), ?drive= launch (the picture keeps its
  Drive record: Replace original) and launchQueue. The page now loads shared/intake. `tests/intake/clean.test.html`.
- **Slop Image to 3D** (`img3d/js/app/main.js`, spec `img3d`, `limit: 1`): Open image… (now a button; the file input is
  gone), a drop on the view (`dropTarget`), From Slop Drive…, a paste (new), ?drive= launch and launchQueue. The
  first-use notice is the spec's `notice` (once per batch); `openBlob` is only the reader. The page now loads
  shared/intake. Out: Open in Slop 3D is `SlopOuttake.send('3d')`. `tests/intake/img3d.test.html`.
- **Slop Contacts** (`contacts/js/app/drop-import.js`, spec `contacts`, the whole batch to the import flow; part
  `contacts.photo`): a drop on the list and the zone, Import ▸ Choose files…, a paste (new), ?drive= launch and
  launchQueue. Every source now takes the same files (vCard, CSV, TSV, text, .scontacts; a drop used to refuse .tsv and
  .scontacts). Choose photo… is the part. The drag of contacts onto a group stays (`intake-ok`).
  `tests/intake/contacts.test.html`.
- **Slop Checksum** (`checksum/js/checksum.js`, spec `checksum`, one file): the box is a button (the intake's picker; was
  a label with a file input) and a drop target (`dropTarget`), and a paste (new). The page now loads shared/intake.
  `tests/intake/checksum.test.html`.
- **Serial counter** (`serials/js/app.js`, spec `serials`): the box is a button (the intake's picker; was a label with a
  file input) and a drop target, and a paste (new; waits for the model gate). The first-use notice is the spec's.
  `tests/intake/serials.test.html`.
- **HTML to PDF** (`html2pdf/js/app.js`, spec `html2pdf`, one file; part `html2pdf.images`): Open HTML… (both buttons;
  the hidden file input is gone), a drop anywhere on the page (`dropTarget` on the body; was a window drop listener), a
  paste of an .html file (new), ?drive= launch (new: the page now loads Slop Hub, so Open in arrives) and launchQueue.
  Attach local images… is now a button (the part's pick). `tests/intake/html2pdf.test.html`.
- **Photo Sorter** (`sorter/js/app.js`, spec `sorter`, the whole batch at once): a drop of photos or folders on the
  zone, Choose files and the sample, Choose a folder… (`SlopIntake.pick({ folder: true })`; the two hidden file inputs
  are gone), a paste (new), ?drive= launch (new) and launchQueue. `tests/intake/sorter.test.html`.
- **QR SLOP** (`qr/js/app.js`, spec `qr`, the logo; part `qr.open` in `save.js`): the logo tab's box (a click: the
  intake's picker; a drop: `dropTarget`; its own file input and drop listener are gone) and a pasted picture (new).
  Open from Slop Drive is the part's `fromDrive` (its settings are read from the record's meta).
  `tests/intake/qr-signature.test.html`.
- **Slop Signature** (`signature/js/form.js`, spec `signature`, the picture): the button (the intake's picker; was a
  hidden file input) and a pasted picture (new). `tests/intake/qr-signature.test.html`.
- **Slop Pastebin** (`paste/js/actions.js`, spec `paste`, pictures): Add image… (the intake's picker) and a pasted
  picture, also in the text box (`#pb-src` is a `paste-catcher`, so a file pasted there is the intake's too). The page's
  own paste listener is only pasted text. `tests/intake/paste.test.html`.
- **Slop Notes** (`notes/js/blocks.js`, spec `notes`, a picture up to 2 MB): Insert ▸ Image… (the intake's picker) and
  a pasted picture outside the text (new). The body's paste listener is only HTML tables (`intake-ok`). The rule test's
  "not migrated" fixture moved from notes/ to a made-up folder. `tests/intake/notes.test.html`.
- **Slop Calendar** (`calendar/js/ui/ics-ui.js`, spec `calendar`, one .ics up to 5 MB, no paste): Import .ics opens a
  dialog whose zone is the intake's (a drop on it, its Choose files); the reader hands the file to the waiting import
  preview. The old fallback picker is the intake's. `tests/intake/calendar.test.html`.
- **Slop Effects** (`effects/js/app/io.js`, spec `effects`): Add media (this computer, Slop Drive), Relink media (mode
  `relink`, `data.mediaId`), Open project from Slop Drive (a .json project, linked), a drop on the view (new), a paste
  (new), ?drive= launch (new: Open in Slop Effects used to do nothing) and launchQueue. `tests/intake/effects.test.html`.
- **Slop 3D** (`3d/js/app/files.js`, spec `3d`, the whole batch: a model and its companion files): File ▸ Open and Open
  from Slop Drive (mode `open`, after asking when the scene has changes; a Drive scene stays linked), ?drive= launch and
  launchQueue (open), File ▸ Import, a drop on the view (new) and a paste (new) add to the scene. The config import's
  fallback (no shared config dialog) is a part `3d.config`. The outliner's drag stays (`intake-ok`).
  `tests/intake/3d.test.html`.
- **Slop AI** (`ai/js/ui/intake.js`, spec `ai`, text files to a chat panel (`data.panel`); parts `ai.conv`, `ai.model`,
  `ai.launch`): the attach menu (this computer, Slop Drive), a drop on the messages, a paste (new), ?drive= launch and
  launchQueue (a picture is refused with the reason). Import a conversation and Open a chat from Slop Drive (linked) are
  `ai.conv`; the model folder fallback (no directory picker) is `ai.model` (`pick({ folder: true })`); the Apps list's
  "Open a file from this computer / a Slop Drive file in it" is `ai.launch`, which sends through `SlopOuttake.send`.
  The page now loads shared/intake. `tests/intake/ai.test.html`.
- **Slop Projects** (`projects/js/ui/files.js`, spec `projects`, one .json backup): Open a backup, the empty page's zone
  (a drop, its Choose files, the sample: `SlopIntake.sample`), Try a sample project and a paste (new).
  `tests/intake/projects.test.html`.
- **Slop CRM** (`crm/js/ui/form-parts.js`, spec `crm`, the customer's photo, no paste): Add / Change photo is the intake's
  picker; the page now loads shared/intake. `tests/intake/crm.test.html`.
- **Slop Expenses** (`expenses/js/ui/receipt.js`, spec `expenses`, the receipt photo): From a receipt… is the intake's
  picker (the hidden `#eReceiptPick` input is gone), and a pasted photo while the editor is open (new). The page now
  loads shared/intake. `tests/expenses/receipt.test.html`.
- **The business apps' backups** (`shared/biz/backup.js`, part `biz.backup`; admin's own `admin.backup` in
  `admin/js/ui/data.js`): Restore from a backup file… is now a button (the intake's picker; was a labelled file input) in
  Slop Inventory, Invoices, Orders, Purchases, Quotes and Admin, and those pages load shared/intake. **Slop Inventory**'s
  Import products from CSV is a part `inventory.csv` (its Choose a CSV file… button). `tests/intake/business.test.html`,
  `tests/biz/backup.test.html`, `tests/admin/admin.test.html`.
- **Slop Ledger** (parts `ledger.sie` in `ledger/js/ui/sie.js` and `ledger.bank` in `ui/bank.js`, no paste): Import SIE…
  and Import a statement… (the buttons and the commands) are the intake's pickers; the two hidden file inputs are gone,
  and the page loads shared/intake. `tests/intake/ledger.test.html`.
- **Shared components' files** (`SlopIntake.part`, new in sources.js): Import shortcuts (`keys.import`,
  shared/commands/recorder.js), the guides' Import Presets (`guides.presets`, shared/guides/panel-tabs.js), the presets
  dialog's Import… (`presets.import`, shared/presets/ui.js; its hidden file input is gone), Backup & restore's Choose
  backup file… (`backup.import`, shared/backup/ui.js) and Export everything's (`backup.everything`,
  shared/backup/central-ui.js) are parts of the one intake on pages that load it; on a page without shared/intake each
  keeps its old picker (`intake-ok`). `tests/intake/shared-parts.test.html`.
- **SlopDocTabs** (shared/doctabs): its own Open from Slop Drive (`api.openFromDrive`, `drive.js`) is gone: every app
  that used it (Docs, Hex, Slides) opens from Slop Drive through its intake, whose reader calls `api.openDoc(doc, {
  driveId, origName })`. The tab strip's drag of tabs stays (`intake-ok`). `tests/doctabs/doctabs.test.html`.
- **Import config** (shared/config/dialog.js, part `config`, a .slop.json): From this computer…, From Slop Drive…, the
  dialog's zone (`SlopDrop.attach({ intake: 'config' })`) and a .slop.json dropped anywhere on the page (the page-wide
  capture drop is now a source that hands the file to `SlopIntake.take`, `intake-ok`). A page without shared/intake keeps
  the old picker and `SlopConfig.importFromDrive`. `tests/intake/config.test.html`.
- **The fonts panel** (shared/fonts/panel.js, part `fonts.file`): each missing row's and the foot's "Drop your own font…"
  are the intake's picker and a drop on a row is `dropTarget` (data: the row's family); the per-row file inputs are gone.
  A page without shared/intake keeps a file input of its own (`intake-ok`). Covered by the apps' own-fonts tests (Press,
  Docs, Slides, PDF) and `tests/fonts/font-panel.test.html`.
- **Out, shared**: the order's address label (`shared/biz/address-label.js`) and Workflows' Add to a workflow…
  (`shared/ops/entry.js`) go out through `SlopOuttake.send` where the page has it. `tests/biz/address-label.test.html`,
  `tests/intake/outtake.test.html`.
- **Slop Paint Classic** (`photoslop/classic/paint/17-files.js`, spec `paint-classic`, one picture): File ▸ Open (mode
  `open`) and Paste From (mode `paste`) are the intake's picker (the hidden `#fileInput` is gone), a drop on the window
  (`dropTarget`), a pasted picture (unless the app's own copy is newer: `except`), Open from Slop Drive and ?drive= launch
  (`classic/hub.js`; a Drive file stays linked through `SlopPaint.linkDrive`). The page's own paste is only its copy.
  `tests/intake/paint-classic.test.html`. (`photoslop/classic/` is in STRICT.)
- **Slopnodes** (`nodes/js/app.js`, part `nodes.project`): Open project… is the shared Slop Drive picker (was a
  hand-made list of saved projects; `SlopNodesProjects.list` is gone). The page now loads shared/intake.
  `tests/nodes/nodes-projects.test.html`, `tests/intake/drive-buttons.test.html`.
- **Slop CRM, Import from Slop Contacts** (`crm/js/ui/import.js`, part `crm.contacts`): the newest saved list is offered
  first, and Choose another list… is the shared Slop Drive picker (was a select of saved lists).
  `tests/crm/crm.test.html`.

PWA: `manifest.webmanifest` has `file_handlers` for these five; the files reach `SlopIntake.launch` through launchQueue.

## Tests

- `node --test tests/node/intake-pipeline.test.mjs`: normalize, accept and reasons, gate order, notice once per batch,
  Add or New, route/before/after hooks, the bounded pool, events, specs, queueing, the view.
- `tests/node/drop.test.mjs`, `tests/node/drop-rules.test.mjs`: SlopDrop on the pipeline, the rules.
- `tests/node/check-rules.test.mjs`: rule 4.
- `tests/intake/sources.test.html`: every source ends in the same process() with the same events; the notice once per
  batch whichever source; the gates. `tests/intake/intake.test.html`: the old paste API. `tests/intake/outtake.test.html`:
  the outbound builder. `tests/intake/resize.test.html`, `photoslop.test.html`, `pdf.test.html`: the reference apps,
  every way in reaches the same reader with the same events, one notice per batch, the parts of their own. `tests/pwa/manifest.test.html`: the file handlers.

## How to migrate an app (mechanical)

1. Register the spec once at boot (`SlopIntake.register`), with the reader the app already has as `process` (or
   `onAdd`/`onNew` when it reads a batch). Put "is something open" in `hasOpen`/`openName`.
2. `SlopDrop.attach(zone, { intake: id, …the zone's look… })`; drop the zone's `accept`/`process`.
3. Replace every entry point in the list below: `SlopUI.pickFiles` / file inputs → `SlopIntake.pick({ to, mode })`;
   `SlopHub.pickFromDrive` → `SlopIntake.fromDrive`; `consumeLaunch` → `SlopIntake.launch` (once ready); own drop and
   paste listeners → the zone, `SlopIntake.dropTarget`, or nothing (paste is automatic); `SlopIntake.attach` → the spec.
4. Delete what is left over (record → File helpers, the second "add files" path).
5. Out: hand-made "Open in"/"Send to" lists → `SlopOuttake.items` / `menu` / `button`; app-specific handovers →
   `SlopOuttake.handover`.
6. Add the folder to `STRICT` in `tools/one-way.mjs` and run `node tools/check-rules.mjs --all`; add the app to a
   `tests/intake/<app>.test.html` like resize's.

## Open questions (for the owner)

- **Slop Drive's Open with**: Drive lists the apps for a file itself (`DR.openInRows`, `DR.orderedAppsFor`: the app that
  made the file first, then the most specific match, the default per type remembered) because SlopOuttake.items lists the
  registry in its own order and has no default or remember. The files go out through `SlopOuttake.send` already; to make
  the list the builder's too, SlopOuttake.items needs an `order(apps)` hook and a `remember` item, or Drive keeps its list.

## Still to migrate (found by grepping; tick as done)

### slopisolate: in and out are migrated (spec 'cutout', `slopisolate/js/io/files.js`; out: `slopisolate/js/ui/openin.js`)

In (done, after wip/isolate-batch): every route is a source of the intake and the spec's reader (`processAll`) hands the
whole batch to `CO.files.take` at once, which keeps the app's one first-use gate (`F.gate`) and its one add
(`CO.process.add`); the accept rules are `F.ACCEPT`. Open (`CO.files.open` → `SlopIntake.pick`), the sample
(`SlopIntake.sample`), Open from Slop Drive (`SlopIntake.fromDrive`, both menus), ?drive= (`SlopIntake.launch`; a file
PhotoSlop sent keeps its origin and request), the drop zone on #workspace and #queue (`SlopDrop.attach({ intake:
'cutout' })`), paste. `slopisolate/` is in rule 4's STRICT list. `tests/slopisolate/intake.test.html` checks it.
Out (done, wip/isolate-bulk-edit; `tests/slopisolate/openin.test.html`): was three overlapping menus, now one
`SlopOuttake.items({ from: 'cutout', type: 'image/png', … })` used by the toolbar
"Open in…", More ▸ Send to and the context menu: `slopisolate/js/ui/openin.js` (a hand-kept list of PhotoSlop and Slop
Vector; Slop Upscale is missing), More ▸ "Send to" (`menus.js`, sendMenuItems), and "Send cut-out to PhotoSlop as a new
layer". Its two richer handovers are `SlopOuttake.handover`s:
- `{ from: 'cutout', to: 'photoslop', replaces: true, label: 'Send to PhotoSlop as a layer (with its mask)' }`
  (the layer round trip in `slopisolate/js/io/send.js` and `photoslop/js/io/isolate.js`);
- `{ from: 'cutout', to: 'slopedit', types: ['video/*'], replaces: true, label: 'Send to SlopCut as a colour + matte pair' }`.

### photoslop

- [ ] `photoslop/index.html:97`: `<input type="file" id="fileIn">` is not read by any script any more (PhotoSlop's ways in
  are its intake); delete it once wip/macros has landed, so the two branches do not collide on the page.

### Not ways in or out (the grep's false positives, kept here so they are not looked at again)

- `shared/hub.js` `sendTo`, `consumeLaunch`: the hub itself; SlopOuttake.send and SlopIntake.launch are built on them.
- `shared/slopui.js` `pickFiles`: the base file dialog that `SlopIntake.pick` opens.
- `shared/convert/load.js:52`, `shared/convert/results.js:50`: they load and use SlopOuttake (results' Open in… button).
- `shared/i18n/strings.js:32`, `shared/preview/chrome.js:95`, `shared/tour/tours/img3d.js:11`, `shell/switcher.js:38`,
  `shared/seo/guides/*.mjs`: words ("Open in a new tab", "Open in Slop 3D"), not lists of apps.
- `shared/buffer/buffer.js:68`: the drop of a copy-buffer item (not a file) into an app. Mark it `intake-ok` when the file
  next changes (it has no test page yet to name it).
- `shared/presets/store.js:52`: a Slop Drive change refreshes the presets list.
- `shared/sync/ui.js:97`: the cloud backup panel's Upload backup file…; no page loads the panel yet. When one does, make
  it a part (`SlopIntake.part({ id: 'sync.restore' })`, as shared/backup does).

### slopcut (done but for its watermark panel's logo, left to wip/watermark-all)

- [ ] pickFiles: the watermark logo, `slopcut/js/watermark/panel.js` (`pickLogo`) → a part `slopedit.logo`; then put
  `slopcut/` in STRICT in place of its subfolders.

### watermark (pictures done; the logo is left to the watermark panel rewrite, wip/watermark-all)

- [x] pictures: spec `watermark` (`watermark/js/main.js`): a drop, the zone, Open pictures… (`SlopIntake.pick`; the
  page's hidden `#wm-open` input is gone), a paste, ?drive= launch (the page now loads shared/hub.js, so another app's
  Open in Slop Watermark reaches it) and launchQueue, the sample. `tests/intake/watermark.test.html`.
- [ ] file input: the logo's Upload logo… (`#wm-logo-file` in `watermark/index.html`, read by `watermark/js/settings.js`)
  → a part `watermark.logo` (`main: false, paste: false`) and `SlopIntake.pick({ to: 'watermark.logo' })`; then add
  `watermark/` to STRICT.
