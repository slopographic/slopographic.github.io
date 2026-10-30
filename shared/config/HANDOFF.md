# shared/config: the one config and template format

Every app's shareable config, templates and settings use one versioned JSON format, `.slop.json`. The format, the
validator, import and export, and the AI helpers live here. An app only registers the kinds it understands.

## The file

```json
{
  "format": "slop-config",
  "version": 1,
  "kind": "template",
  "app": "tables",
  "name": "Monthly budget",
  "description": "Optional, one line",
  "created": "2026-10-11T09:00:00Z",
  "data": { }
}
```

- `format` and `version` must be exactly `"slop-config"` and `1`. Any other version is refused with a message.
- `kind` is a short lowercase name. `app` is the app that wrote the file: a registry id from `shared/apps.js`, or
  `"slop"` for shared kinds. No other envelope keys are allowed.
- `data` must match the kind's schema. Keys the schema does not list are refused, with their path.
- Limits: 5 MB for the whole file, 200 pages or sheets (`templateSchema`), 200 items in any list by default, 5000
  characters of text, 120 characters for a name. Text may not hold code or markup (`<script`, `javascript:`,
  event-handler attributes), and nothing is fetched from a URL.

## The kinds

| kind | app | data | what apply does |
| --- | --- | --- | --- |
| `settings` | `*` (any app) | `defaultCurrency` (ISO code), `locale` (e.g. `en-US`), `defaultTaxRate` (a percent, 0 to 100) | writes the `settings/main` record through `SlopData.store.transact`, one transaction |
| `numbering` | `*` (any app) | `sequences`: 1 or 2 of `{ id: "invoice" \| "order", prefix, pad }` | sets prefix and pad on the SlopData numbering records; the counter `next` is never in the file and is kept |
| `template` | `tables`, `slides` | `pages`: a list of `{ name, blocks }`; a block is `{ type: heading \| text \| list \| table, text?, items?, rows? }` | the app builds its own document from the pages (see the app sections below) |
| `project` | `slopedit` (SlopCut) | frame size, markers, tracks with clips | replaces the timeline in one undo step; media by name and size, missing media is listed |
| `project` | `remix` (Reel Remix) | export size, clips, plan options, lane, locks, keyframes | sets the reel and plans it again with the file's seed |
| `document` | `docs` (Slop Docs) | page setup, paragraphs, tables | opens a new document (after the discard prompt) |
| `document` | `photoslop` (PhotoSlop) | canvas size, layer stack; pictures by name | opens a new tab; pictures are added after import |
| `document` | `vector` (SlopVector) | artboard, layers with rectangles, ellipses, paths, text | replaces the open document (after a prompt) |
| `label` | `label` (SlopLabel) | label size, units, stock, objects | replaces the open label (after a prompt) |
| `project` | `cutout` (SlopIsolate) | the look new pictures start with | sets the look for new pictures |
| `scene` | `3d` (Slop 3D) | `objects`, `lights` (core/config.js shapes) | adds the objects in one undo step |

The per-app details (what is in the file and what is not) are in the sections "Apps" below.

## How an app registers a kind

```js
SlopConfig.registerKind(kind, app, schema, apply, opts)
// kind:   'template' (lowercase name)
// app:    your registry id, e.g. 'slides'; '*' only for shared kinds
// schema: { fields: { key: spec, ... }, strict: true }   (strict is the default)
// apply:  async (data, ctx) => { ... }   runs only after validation passed; throw to roll back
// opts:   { read: async () => data, label, description }  read enables Export for this kind; label and description
//         may be i18n keys ('ui.config.kind_settings') or functions: read each time they are shown (a language change)
```

Field specs (`SlopConfig.F`): `str({max, pattern})`, `text({max})`, `num({min, max})`, `int({min, max})`, `bool()`,
`enum(values)`, `currency()`, `locale()`, `cell()`, `list(itemSpec, {min, max})`, `obj(fields)`. Add `required: true`
to make a key mandatory, and `desc: '...'` to tell a model what it means. Schemas are plain objects, so the prompt
writer reads them directly.

For a template, register `SlopConfig.templateSchema` and map its pages to your store in `apply` and `read`. A sheet
is a page with a table block. A slide is a page with heading, text and list blocks.

`apply` should write through your app's own store API, in one transaction if the store has one. If it throws, the
store's transaction aborts. Anything written outside a transaction should be undone with `ctx.undo(fn)`, which runs in
reverse order when the apply throws.

## The rule: every import goes through validate, then apply

- `SlopConfig.validate(input, { app })` returns `{ ok, value, errors: [{ path, message }] }`. It never throws.
- `SlopConfig.importFile(file, { app })`, `importText(text, { app })`, `importFromDrive({ app })` and
  `applyValue(value, { app })` all validate first. `applyValue` validates again, so an AI reply cannot skip the check.
- An apply runs only after validation passed. Applies run one at a time. A failed apply reports `rolledBack: true`.
- `{ app }` is the importing app. A file for another app is refused with "mismatched app", unless the kind is shared.

## Export

`SlopConfig.exportFile(kind, app, name, data, { description, created })` returns a `File` named
`<name>.slop.json`. It throws if the data is not valid, so an export never writes a file the import would refuse.
`SlopConfig.exportKind(kind, app, name, opts)` reads the kind's current data with `read()` and exports it.

## The AI flow

1. `SlopConfig.buildPrompt(kind, app, request)` returns the instructions, every key with its type, limits and allowed
   values, the description of each field, and an example that is a valid file. It is written for a small local model.
2. The model's reply, or the reply pasted by the person from any assistant, goes to
   `SlopConfig.parseAiReply(text, { app })`. It takes the first complete `{ ... }` (prose and code fences around it
   are fine, and braces inside strings are respected), reports invalid JSON with a message, then validates it.
   It returns `{ ok, value, errors }`.
3. Only a reply that checked ok, and is unchanged since, can be applied, through `applyValue`.

`SlopConfigDialog.makeAi({ app })` does all of this in a dialog. It uses `SlopAI.ask` when a local model is loaded,
and otherwise shows the prompt to copy.

## The dialogs (any app)

```html
<script src="../shared/slopui.js"></script>
<script src="../shared/config/schema.js"></script>
<script src="../shared/config/validate.js"></script>
<script src="../shared/config/template.js"></script>   <!-- only if the app uses templates -->
<script src="../shared/config/io.js"></script>
<script src="../shared/config/kinds.js"></script>      <!-- settings and numbering; needs shared/data/ for apply -->
<script src="../shared/config/prompt.js"></script>
<script src="../shared/config/dialog.js"></script>
<script src="../shared/config/dialog-ai.js"></script>
```

Apps that show the Config menu also load `io.js`, `prompt.js`, `dialog.js` and `dialog-ai.js` in that order, after `slopui.js`.

```js
SlopConfigDialog.open('import', { app: 'tables' });   // 'import' | 'export' | 'template' | 'ai'
SlopConfigDialog.menuItems({ app: 'tables' });        // four items for SlopUI.menu (see "The Config menu" below)
```

Load the scripts in this order. `kinds.js` needs `shared/data/` only when an apply runs, so a page without SlopData can
still load it.

## Checks beyond the schema

`registerKind(kind, app, schema, apply, { check })`: `check(data)` returns `[{ path, message }]` for rules the schema cannot
say (an end before a start, a name used twice, a clip on the wrong kind of track). It runs only when the shape passed, and
its paths are written under `data.`. SlopCut, Reel Remix and 3D use it.

## The Config menu and the palette (one list)

- `SlopConfigDialog.install({ app })` binds drag and drop once per page: a `.slop.json` file dropped anywhere on the page is
  checked and imported. Other drops reach the app. The drop is taken in the capture phase, so the app never sees that file.
- `SlopConfigDialog.menuItems({ app, example? })`: four items for a menu: Export current config…, Export plain template…,
  Import config…, Ask AI to write a config….
- `SlopConfigDialog.commands({ app, prefix, example? })`: the same four as palette commands with ids `<prefix>.config.export`,
  `.template`, `.import`, `.ai` and group `Config`. Apps with SlopCmd add them to their list.
- `SlopConfigDialog.templateDialog({ app, example })`: a plain template. Without `example` it is the schema's example value
  (every required key). `example: { kind, value }` lets an app show its own shape (Slop Tables shows a table, not a heading).
- `SlopConfig.exampleValue(kind, app)` is the example value on its own.

## Apps

Each app loads the same classic scripts (`schema`, `validate`, `io`, `prompt`, `dialog`, `dialog-ai`, plus `template` for
`template` kinds) and registers its kinds in one file of its own, `js/io/config.js` or similar. Nothing else in shared/
changes per app.

- **SlopCut** (`slopedit`, `slopcut/js/io/config-map.js`, `config.js`): kind `project`. `dims` (width, height, fps),
  `duration` (written, ignored on import), `markers`, `tracks` (name, kind video or audio, mute, solo, lock, hide, clips). A clip
  has `kind` (video, audio, image or color), `file` ({ name, size }; the media is never in the file), `start`, `in`, `out`,
  `speed`, `position` (x, y), `scale`, `rotation`, `opacity`, `keyframes` (x, y, scale, rotation, opacity), `effects`
  (brightness, contrast, saturation, temperature), `gain`, `gainKeys`, `fades` (in, out, audioIn, audioOut), `link`. Titles and
  random effect layers are not in the format; Export leaves them out.
  Import: the file's media is matched to the bin by name; a name the bin does not hold becomes a `missing` record (its clips
  show a "!" in the bin), and a dialog lists the files to add. A file added with the same name fills that record, so its clips
  come alive (`SE.media` in `library.js`, `L.addMissing`, `L.importFiles`).
- **Reel Remix** (`remix`, `remix/js/config-map.js`, `config.js`): kind `project`. `output` (width, height), `clips` (file,
  kind video or image, dur, w, h), `plan` (target, pace, seed as 8 hex digits, base, switches, layouts, fill, timing, video,
  min, max, stagger, effect, audio: mode, source random/clip/file, clip by name, file), `lane`, `locks` (cut, slot, clip index,
  in, fill), `keys`. Import reuses a loaded clip with the same name, else makes a `missing` placeholder (not planned, not
  draggable, and filled by `RM.addFiles` when a file with that name is added). The plan is made again from the file's seed,
  so the same file gives the same edit.
- **Slop Tables** (`tables`, `tables/js/io/config.js`): kind `template` with `templateSchema`. A sheet is a page with one table
  block. A cell holds its input: a formula is text starting with `=`, a value is the value. Styles, widths and freeze panes are
  not in the file. Import opens a new unsaved workbook (the same path as From template), and keeps the open one if the person
  cancels. A sheet larger than 1000 rows or 100 columns is refused at export. Tables' own `.stab-template` file is unchanged.
- **Slop Slides** (`slides`, `slides/js/io/config.js`): kind `template`. A slide is a page: its title is the heading, its other
  text boxes are text blocks, and a text box of bullets is a list. Pictures, shapes, tables and the theme are not in the file.
  Import builds a deck with title, title-and-content or title-only layouts, and replaces the open deck after a prompt.
- **Slop Docs** (`docs`, `docs/js/io/config.js`): kind `document`. Page setup (size, orientation, margins) and blocks: paragraphs
  (style, alignment, text) and tables (cell text). Marks, lists, images, footnotes, headers and footers are not in the file yet.
- **PhotoSlop** (`photoslop`, `photoslop/js/io/config.js`): kind `document`. Canvas size and the layers (name, visible, locked,
  opacity, blend, x, y) with the picture of each layer named `<layer>.png` (size in bytes). The pictures are not in the file:
  after import the layers wait, a dialog asks for the pictures, and a picture goes on the layer with the same file name.
  Export writes the names and sizes only, so the layer PNGs must be kept beside the file.
- **SlopVector** (`vector`, `slopvector/js/io/config.js`): kind `document`. Artboard and layers (name, colour, hidden, locked)
  with rect, ellipse, path (SVG path data) and text objects, each with a flat fill, stroke, stroke width and opacity. Groups
  are flattened; gradients, effects, clipping masks and placed images are not in the file. The four actions are added to
  `SV.actions` (File ▸ Config and the palette).
- **SlopLabel** (`label`, `label/js/io/config.js`): kind `label`. Label size, unit, dpi, stock id and name, and objects of the
  types text, para, barcode, rect, ellipse, line and inverse with their main settings. Images, groups, the data-merge source and
  the printer settings are not in the file; Export counts the images it leaves out (`window.LabelConfig.skipped`).
- **SlopIsolate** (`cutout`, `slopisolate/js/io/config.js`): kind `project`. The look new pictures start with (edges,
  background, shadow, crop). Pictures are not in the file. Import changes the look new pictures start with, not the open ones.
- **Slop 3D** (`3d`, `3d/js/app/configio.js`): kind `scene`, data `{ objects, lights }` as core/config.js reads them. Its
  `check` is core/config.js `validate`, so the rules did not change. Import still takes the older bare `{ objects, lights }`
  JSON, and Export writes the shared envelope.

## Tests

`node tests/run.mjs config` runs `tests/node/config.test.mjs` and `config-kinds.test.mjs`. The helpers are in
`config-env.mjs`. The app kinds have their own tests: `tests/node/slopcut-config.test.mjs` (SlopCut round trip, refusals,
missing media), `tests/node/remix-config.test.mjs` (Reel Remix: the same plan after a round trip, missing clips, refusals), and
`tests/slopcut/slopcut-config.test.html` (drop a config on SlopCut: clips listed as missing media). The other apps are checked for
load and wiring by their own suites.

## Words (shared/i18n)

`SlopConfigDialog.menuItems(o)` labels are getters (a menu drawn again reads the current language) and `commands(o)` titles
are in the current language; once registered, SlopCmd's copies are retitled after a language change. The words are
`ui.config.*` in `shared/i18n/ui/<code>/widgets.js`; the shared kinds' labels are keys too. Still English: the bodies,
buttons and toasts of the import, export, template and AI dialogs (dialog.js, dialog-ai.js).

