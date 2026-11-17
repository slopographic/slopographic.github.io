# Slop Workflows: handoff

Slop Workflows (`workflows/`) runs a batch of files through several apps in one go: remove the background (SlopIsolate),
put on a watermark (Slop Watermark), resize (Slop Resize), upscale, clean metadata, convert (every File convert
conversion), PDF merge / compress / password, OCR, rename, zip. Everything runs on the device; nothing is uploaded.
Status `building` in `shared/apps.js`.

## One registry, one runner (no second engine)

- **Registry** `shared/ops/registry.js`: every file operation on the site, files in → files out, in File convert's catalog
  shape (`{ id, label, group, app, kind, from, ext | out(inKind, opts), mode: each | combine, options, run(files, opts,
  { signal, progress }) }`, plus `check(opts)` (a problem to show before running), `fromApp(settings)` (an app's own
  settings → options), `notice`, `engine`, `description`, `keywords`). `register(list, { app, label })`, `all({ app })`,
  `byId`, `apps()` (the menu groups), `accepts`, `outOf`, `defaultsOf`, `argsOf` (the options as SlopCmd arguments,
  `shared/commands/args.js`), `validateOptions` (through `SlopCmdArgs.validate`: "1080px" → 1080, clamped, choices by
  value or label, unknown keys dropped with a note).
- **File convert's catalog registers its conversions** (`convert/js/core/catalog.js`, app `convert`). File convert keeps
  showing only those (`CONVERSIONS` is unchanged); Workflows shows `all()`. `shared/ops/all.js` imports the catalog and
  every app module, in menu order.
- **Runner** `convert/js/core/chain-run.js runChain`, extended (File convert's routes still use it unchanged): named
  steps, `to` as a function of the input kind (Watermark keeps JPG as JPG), an op may return its own `kind`, `keepStep(i)`
  for "Keep these files", `onUnit` (each file at each step: run / done / error, with the step's own fraction), and an
  `AbortSignal` (Stop: the files not done get "Cancelled"). `workflows/js/core/plan.js` turns a workflow into its steps.

## Operations (shared/ops/*.js; each loads its app's own code on first use, Node-importable)

| id | app | what | the app's code it runs |
|---|---|---|---|
| `slopisolate.remove-bg` | SlopIsolate | model fast/quality/portrait; see-through, colour or blurred background; shadow; crop to subject | `shared/cutout` `SlopCutout.removeBackground`, `slopisolate/js/render/compose.js`; first-use notice 'slopisolate' with the model size |
| `slopisolate.background` | SlopIsolate | a see-through picture on a colour | the same compositor |
| `watermark.apply` | Slop Watermark | text and/or logo (data URL), font, colour, size, opacity, nine positions, margin, rotation, tiling | `shared/watermark/core.js` |
| `resize.image` | Slop Resize | width/height, longest side, %; fit/cover/within/stretch + anchor; background; format; quality; largest KB | `resize/js/core/size.js`, `format.js`, `resize/js/image/image.js` |
| `upscale.image` | Slop Upscale | 2× / 4×, Fast (FSRCNN, bundled), Quality (Real-ESRGAN once installed, else Lanczos with a note), Lanczos | `upscale/js/engine/pipeline.js` + engine/worker; notice 'upscale' |
| `clean.metadata` | SlopClean | app default, GPS only, or everything (JPEG, PNG, WebP; TIFF stays in SlopClean) | `clean/js/core/*` `SlopClean.strip` |
| `ocr.read` | Slop OCR | searchable PDF, text or Markdown | `aitools/common.js` (PP-OCRv4 worker), `ocr/js/sources.js`, `layout.js`, `export.js`; asks to install the model in Slop OCR (Get more) if missing |
| `files.rename` | Files | `{name}` `{n}` `{date}`, first number, digits (combine) | `renameAll` (pure) |
| `pdf.compress` | Slop PDF | lossless re-save, or strong (pages to JPEG at 72/110/150 dpi) | pdf-lib; File convert's `pdf-raster.js` and `pdf-images.js` |
| `outline-to-presentation` | Slop Slides | an outline (.json/.md/.txt) → PPTX, PDF or .sslide; theme, size | `slides/js/core/outline.js`, `pptx.js`, `pdf.js` via File convert's `slidesEngine` |
| `outline-to-document` | Slop Docs | an outline (.json/.md/.txt) → DOCX, PDF, Markdown or .sdoc; page size | `docs/js/model/build.js` + File convert's Docs `engine` |
| every catalog entry | File convert | merge-pdf (fan-in), images-to-pdf, pdf-to-images, pdf-protect (`check`: password), Files to ZIP (now with a ZIP name), to-jpg… | the catalog |

`shared/ops/load.js`: `scripts(paths, ready)` (through SlopLoad when present), `notice(app, opts)` (SlopFirstRun),
`decode`, `encode`, `kindOfBlob`, `pictureKind`, `stem`.

## The document, files and links (`shared/ops/flowdoc.js`, window.SlopFlowDoc, also CommonJS)

`{ kind: 'slopflow', v: 1, name, steps: [{ kind: 'op' | 'macro', id, app?, macroId?, options, keep? }] }`. `normalize`,
`toText`/`fromText` (.slopflow, no step ids stored), `encode`/`decode` (`?flow=`: deflate-raw + base64url, 'z' prefix; 'j'
plain where the browser cannot compress). Passwords are never in a document: the step cards keep them in `S.secrets` for
the visit. A share link leaves out a logo over 16 KB and says so.

## The tool: one mountable UI (`workflows/js/ui/mount.js`)

`mountWorkflow(host, { files, workflow, compact, frame, draft, landmark, drop, onResults })` → `{ ready, root, ns, S,
addFiles, run, stop, addStep, load, openTemplate, results, resultsZip, lib, runner, frame, undo, destroy }`.
Each instance has its own state (`state.js createState`), ids (`wf-…`, then `wf2-…`), Undo and drop zone; styles are all
under `.wf-tool` with its own tokens (`--wf-bg`, `--wf-surface`, `--wf-text`, `--wf-line`, `--wf-accent`: the theme's
`--sl-*` on a page, the dialog's `--s-*` in a dialog). Parts: `markup.js` (DOM), `steps.js` (cards, drag and Alt+↑/↓,
inline options with File convert's `convert/js/ui/options.js`, which now also draws an `image` option), `addmenu.js` (+ Add
step: SlopMenuButton with search, grouped by app), `run.js` (files, run, the progress grid, results: download, ZIP, Slop
Drive, Open in via SlopHub), `library.js` (saved in IndexedDB `slop-workflows` through SlopDb, `core/store.js`; templates;
export/import; share link; `?flow=` `?template=` `?add=`), `core/compat.js` (each step against what the step before makes).

- **The page** (`workflows/index.html`, `js/ui/app.js`): the tool inside SlopFrame (list · view · panel; phones: the list is
  the page, a workflow opens over it, Files and run is the bottom sheet), the draft kept in localStorage, the address,
  `?drive=` from Slop Drive, and the commands (`commands.js`).
- **The dialog** (`shared/ops/dialog.js` `open({ files, workflow, ask, title })`, `dialog.css`): the compact tool in a
  SlopUI dialog (whole screen under 640 px), loaded on first use. With no files it asks the page's app for what it has open
  through File convert's event `slop:convert-files` (`shared/convert/provided.js`) and says "From <app>: …".
- **Entry points**: the command `cmd.workflow` "Run a workflow…" is built into `shared/commands/commands.js`, so every page
  with SlopCmd has it in Ctrl+K (not on the Workflows page itself). `shared/ops/entry.js` (window.SlopWorkflowEntry, classic,
  tiny): `open(opts)`, `menuItems(getFiles)` → "Run a workflow…" (the dialog with those files) and "Add to a workflow…" (the
  page in a new tab with the file, through Slop Drive), and `register(addItems)` → calls `addItems({ id: 'workflows', label,
  items: menuItems })`. **The shared Open in… menu (wip/central-intake) should load `shared/ops/entry.js` and call
  `SlopWorkflowEntry.register(...)` or `menuItems(getFiles)`.**
- **Add to a workflow… from an app** (a step with the app's current settings): `SlopFlowDoc.addToWorkflow({ id }, {
  settings })` stores the step in localStorage (`slopflow:add:<id>`) and opens `workflows/?add=<id>`; there the operation's
  `fromApp(settings)` makes its options. SlopIsolate: File ▸ Add to a workflow… and the command `co.add-to-workflow`
  (model and look). Slop Watermark: the panel's "Add to a workflow…" button (setup and logo).

## Commands (page; menus, Ctrl+K and the AI assistant)

`workflows.run` (Ctrl+Enter), `stop`, `add-step` (args `op` enum of every operation, `options` JSON, `at`), `set-option`
(`step`, `key`, `value`, checked by the step's schema), `remove-step`, `move-step`, `template`, `rename`, `new`, `save`
(Ctrl+S), `export`, `import` (Ctrl+O), `share`, `undo`, `files`, `clear-files`, `zip`; `provide({ state, checkpoint })`:
the workflow with each step's options and problem, the files, the results.

## Templates (`core/templates.js`)

Product photos (remove background → background colour white → resize 1080 × 1080 fit on white → watermark → JPG), Photos for
the web (clean metadata → longest side 1600 PNG → WebP), Scans to one PDF (images to A4 PDF → compress), Protect and send
(merge → password; asks for the password before running).

## App macros

Built: see `shared/macros/HANDOFF.md`. A macro recorded in PhotoSlop or SlopIsolate (its own SlopCmd commands with args)
is kept in IndexedDB `slop-macros`; `shared/ops/macros.js` (imported by `all.js`) is the app host adapter that calls
`R.provide(app, { label, list })`, so each saved macro is an operation of kind `macro` under its app in + Add step
(`{ kind: 'macro', id: 'macro:<app>:<macroId>', app, macroId, options }`), checked by `compat.js` and run by the one
runner. PhotoSlop's run in a hidden same-origin iframe at `photoslop/?macro-host=1` (`shared/macros/frame.js`);
SlopIsolate's fold into Remove background's options. `mount.js` waits for `macrosReady` before drawing a saved workflow
and draws again on `onMacros` (a macro saved in another tab shows up at once). An app's Macros panel has "Add to a
workflow…", which hands the macro step over through `SlopFlowDoc.addToWorkflow` like the other apps' hooks.

## Tests

Node: `tests/node/workflows-ops.test.mjs` (registry, option checks, kinds, groups, macros through `provide`, app settings
mappings, clean choices, rename), `tests/node/macros.test.mjs` and `tests/workflows/macros.test.html` (app macros), `tests/node/workflows-flow.test.mjs` (document, file and link round trips, step checks,
templates, plan and run with fakes, cancel). Browser: `tests/workflows/run.test.html` (remove background with a stub
SlopCutout → watermark → resize on 3 pictures → a ZIP of 3 PNGs 200 × 200, see-through corners and magenta watermark
pixels; progress grid; a step that cannot take PDF; Stop), `library.test.html` (templates, passwords never stored, save and
open, export and import, share link, Undo, keyboard reorder, commands with args, the add menu), `tool.test.html` (two tools
on one page, Open ▾, onResults, the dialog at 600 px with the app's files, entry menu items), `hook.test.html` (SlopIsolate
and Watermark Add to a workflow…, Run a workflow… in SlopIsolate's Ctrl+K), `phone.test.html` (390 px). The real cutout
model is tested by `tests/slopisolate/inference.test.html`.
