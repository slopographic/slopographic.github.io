# SlopIsolate — module contract (internal, shared by all js/ files)

Namespace `window.CO`. Classic scripts, IIFE per file, `'use strict'`, ≤300 lines per file, no CDNs, no
external requests, no attribution text anywhere. Load order is in `slopisolate/index.html`.

## Already written (do not change the API)
- `core/util.js` (`CO.util` = U): `$`, `h(tag, attrs, ...kids)`, `clamp`, `raf`, `maxPixels`, `store.get/set`,
  `fmtBytes`, `fmtMs`, `baseName(name)`, `debounce(fn, ms)` (+ `.flush`, `.cancel`), `canvas(w,h)`, `ctx(c, opts)`,
  `blobOf(canvas, type, q)`, `hexRGB`, `rgba(hex, a)`, `isImage(file)`, `decode(blob)` → ImageBitmap, `pixels(bmp)`,
  `icon(name)` → svg html string, `btnIcon(el, name, label)`. Icon names: open download undo redo panel more hand
  keep remove compare mask result zoomin zoomout fit sparkle x plus image send lock search sliders crop zip.
- `core/state.js` (`CO.state` = S): `items[]`, `activeId`, `tool` ('pan'|'keep'|'remove'), `view`
  ('result'|'before'|'split'|'mask'), `split` (0..1), `brush {size, hardness}`, `model` ('fast'|'quality'|'portrait'),
  `exportOpts {format:'png'|'webp'|'jpg', quality, jpgBg}`, `DEFAULT_LOOK`. Methods: `createItem(file)`, `get(id)`,
  `current()`, `index(id)`, `setStatus(it, status, extra)`, `setTool(t)`, `setView(v)`, `setBrush(patch)`,
  `setExport(patch)`. Events: `CO.on(type, fn)` (returns unsubscribe), `CO.emit(type, data)`.
  Item look fields: `s {threshold, softness, feather, decontaminate, refine}`, `bg {mode:'transparent'|'color'|
  'gradient'|'blur', color, blur, gradA, gradB, angle}`, `shadow {on, opacity, blur, x, y, color}`,
  `crop {mode:'original'|'subject', pad}`. Other item fields: `id, file, name, url (object URL), w, h, status
  ('queued'|'working'|'done'|'error'), error, progress (0..1 or null), phase (engine progress phase), model (null = follows `S.model`; set only by the bulk
  bar's Re-run model), modelUsed, base (Uint8ClampedArray),
  edit (Uint8ClampedArray or null), timings, hist {undo[], redo[]}`.
  `S.defaults` and `S.rememberLook(it)` save the last look for new images. `S.sel` (selected ids), `S.targets()` (what the
  panel edits: the selection when 2+, else the image on screen), `S.bulk()`.
- `core/settings.js` (`CO.settings`): settings by path, merge/mixed, copy/paste, `needsModel`. `ui/edit.js` (`CO.edit`): the one
  way settings change (`begin(items).change(patch)/commit(label)`, `apply`, `copy`, `paste`, `applyToAll`); a bulk change is one
  undo group (`H.group()`, `pushLook(it, before, label, group)`). `S.modelOf(it)` = `it.model || S.model`, read
  when an image's run starts.
- `core/brush.js` (`CO.brush`): `begin(it, mode)` with mode 'keep'|'remove'|'restore' → stroke state;
  `line(st, x0, y0, x1, y1, r, hardness)` in IMAGE pixels, r = radius in image px; `dab`; `end(st)` → undo entry or null;
  `swap`; `hasEdits(it)`.
- `core/history.js` (`CO.history` = H): `push(it, entry)`, `pushLook(it, beforeSnapshot, label)` (call AFTER the
  change; ignores unchanged looks), `snapLook(it)` (take BEFORE a change), `undo(it)`, `redo(it)`, `can(it, 'undo'|'redo')`,
  `label(it, dir)`, `clear(it)`. Emits `history` `{it, entry, dir, rect}`.
  Stroke usage: `st = begin(it,'keep')` → `line(...)` on pointer moves → `e = end(st)`; `if (e) H.push(it, e)`.
  Look usage: `const b = H.snapLook(it); <change it.s/bg/shadow/crop>; H.pushLook(it, b, 'Threshold')`.
- `render/compose.js` (`CO.compose` = C): `bbox(mask, w, h)`, `cutCanvas(act)`, `boxOf(it, act)` → `{x,y,w,h}` in image
  px (whole image or subject+pad), `render(it, act)` → full-res canvas of the output (background, shadow, crop),
  `maskCanvas(it, act)` → cropped grey mask canvas.
- `io/process.js` (`CO.process` = P): `add(files, opts)` (only `CO.files.take` calls it: creates items, queues them,
  selects the first; returns the image items with `.videos` promises), a bounded pool (`SlopCutout.poolSize()` images at
  once, `P.limit` overrides), `followModel()` (re-run every image that follows the app's model and has another),
  `select(it)` (makes it the active image), `refresh(it)`, `refreshSoon(it)` (debounced), `rerun(it)` (new model; cancels
  a running pass), `remove(it)` (cancels too), `drop()`, `build(it)` → record (caller must `SlopCutout.release(record.jobId)`),
  `pending()`, `running()`.
  `P.active` = record `{item, jobId, w, h, bitmap (ImageBitmap of original), mask (Uint8ClampedArray w*h), cutout
  (ImageData), cut (canvas cache), bbox, rev}`. Events emitted: `list` (items), `activeItem` (item or null),
  `active` (record), `progress` `{it, p}`, `look` (it) — emit it after changing a look; process.js reacts.
  `process.js` reacts to `look` and `history` events by refreshing the worker result.

## Events (names are fixed)
`list`, `activeItem`, `active`, `item` (item changed: status, error, progress), `progress`, `look` (it),
`history`, `tool`, `view`, `brush`, `export`, `toast` (msg), `busy` ({on, msg, progress}).

## Owned by the parallel agents (create these; exports are fixed)
- `io/zip.js` → `CO.zip(entries)`: entries `[{name, blob}]` → Promise<Blob> (store-only zip, CRC32, UTF-8 names).
- `io/export.js` → `CO.export.one(it)`: encodes the item's result (or builds it via P.build, releasing the job) in
  `S.exportOpts.format` (png|webp|jpg; jpg fills `jpgBg` behind transparency; quality for webp/jpg) and downloads
  `<baseName>-cutout.<ext>` via `SlopUI.download`. `CO.export.all()`: every `done` item → one zip via CO.zip.
  Never add watermarks. Returns Promise.
- `io/files.js` → `CO.files.take(files, { source, driveId, origin })`: THE way files come in (first-use gate once per
  batch, accept rules, one `CO.process.add`). `open()` (picker), `sample()`, `fromDrive(rec, extra)` (Drive and ?drive=),
  `init()` (SlopDrop on `#isoDrop`, targets `#workspace` and `#queue`; paste through shared/intake; all call `take`).
- `io/sample.js` → `CO.sample.make()` → Promise<File>: a busy gradient background with a goo blob ("Sloppo" goo
  shape, lime with ink outline) drawn on canvas; PNG, name `sloppo-sample.png`.
- `render/view.js` → `CO.view`: `init()` (sizes canvas `#view` to `#stage` with devicePixelRatio, listens to resize),
  `draw()`, `fit()`, `geom()` → `{scale, ox, oy}` (screen = image * scale + offset), `toImage(sx, sy)` → `{x, y}`,
  `zoomAt(factor, sx, sy)`, `panBy(dx, dy)`, `zoomPct()`. Draws per `S.view`: 'result' (C.render, checkerboard
  behind transparent results), 'before' (original bitmap), 'split' (original left of `S.split`, result right; also
  moves `#split` element), 'mask' (C.maskCanvas). Redraws on `active`, `look`, `view`, `history`, `item`. Shows
  empty state via `#app[data-mode]` = 'empty' when no active (data-mode 'work' otherwise). Caches the composed canvas
  per `(act.rev, JSON(look))`.
- `ui/pointer.js` → `CO.pointer.init()`: pointer handling on `#stage`: pan tool or middle/space drag → panBy;
  keep/remove tools → brush strokes in image px via `CO.brush` (r = size/2/geom.scale, hardness = S.brush.hardness),
  stroke end → H.push + `CO.process.refresh(it)` immediately; during a stroke call `CO.process.refreshSoon(it)`
  every move; wheel → zoomAt; drag `#split` knob when S.view === 'split' (sets S.split). Moves `#brushCursor`
  (class keep|remove, size = S.brush.size px) over the stage. Pinch optional.
- `ui/ctxbar.js` → `CO.ctxbar.init()`: fills `#ctxbar`: tool buttons (pan, keep, remove) with labels, brush size and
  hardness sliders (CO.kit.slider + S.setBrush), view seg (Result, Before/after, Mask), zoom out/in/fit buttons and
  `#statusZoom`/`.tb-zoom` text. Tool buttons use `aria-pressed`/class `on`. Hides brush controls unless tool is keep/remove.
- `ui/kit.js` → `CO.kit`: `section(title, ...children)` (class `pp-sec` with `pp-h`), `slider({label, min, max, step,
  value, fmt, onInput, onCommit})` (row class `pp-row`; onInput live, onCommit on change — the caller handles
  history with snapLook/pushLook), `select({label, options:[[value,text]], value, onChange})`, `seg({options, value,
  onChange})` (class `seg`/`seg-b`), `color({label, value, onInput, onCommit})`, `check({label, checked, onChange})`,
  `swatches({colors, value, onChange})`, `note(text)` (`pp-note`). Every control's `sync(v, mixed)` shows "Mixed" when the
  selected pictures differ. `look(label, path)` → `{input, commit, once}` through `CO.edit` on `S.targets()`.
- `ui/panel.js` → `CO.panel.init()`: fills `#props`. Sections: Model (radio list `.models`/`.model` for fast, quality,
  portrait with `.m-size` sizes from the model info and `.cached` when cached, from `SlopCutout.cached()`; a change
  sets `S.model` and calls `CO.process.followModel()`), Edges (threshold, softness, feather, decontaminate, refine — each a look change with
  snapLook/pushLook, `CO.emit('look', it)` on input), Export (format seg png/webp/jpg, quality slider for webp/jpg,
  jpg background colour, `.no-wm` note "No watermarks, ever", Export button → `CO.export.one(it)`, batch button →
  `CO.export.all()`). The panel refreshes its values on `activeItem` and `active`. Disabled (`data-off="1"`) when no item.
- `ui/panel-look.js` → `CO.panelLook.build()` returns an array of section elements for Background (seg: transparent,
  colour, gradient, blur; colour pickers, blur slider, gradient colours + angle), Shadow (on check, opacity, blur,
  x, y, colour) and Crop (seg: original / subject; pad slider). Panel.js appends them.
- `ui/queue.js` → `CO.queue.init()`: fills `#queue`: a header `.q-head` (Select all / none, "N selected"), one `button.q-item` per item
  (a `.q-chk` checkbox, the result thumbnail `.q-res` from `render/thumbs.js` once done) (img = item.url, `data-status`,
  `.q-badge` shows status text or progress %, `.on` for active, `.q-x` remove button), plus a `button.q-add` "+" that
  calls `CO.files.open()`. Click selects via `CO.process.select(it)` after `S.activeId = it.id` and emits
  `activeItem`. Re-renders on `list`, `item`, `progress`, `activeItem`.
- `ui/menus.js` → `CO.menus.init()`: fills `#menus` with File (Open…, Sample image, Export…, Export all…), Edit
  (Undo, Redo, Clear brush edits), View (Result, Before/after, Mask, Fit, Zoom in, Zoom out), Help (keyboard shortcuts)
  as buttons that open `SlopUI.menu(items, x, y)`. Also `#btnMore` opens a menu with Theme choice (pro, light, classic:
  save it with `SlopTheme.set` (shared/theme/theme.js), which paints `data-slop-theme` and the --sl-* tokens), Send to (skip if no hub),
  and About. Binds `#btnUndo`, `#btnRedo` (disabled state from CO.history.can), `#btnDownload`, `#btnPanel`
  (toggles `.no-panel`/hidden on `#props`), `#emptyOpen`, `#emptySample`.
- `ui/commands.js` → `CO.commands.init()`: registers every action with `window.SlopCmd` (guard
  `if (!window.SlopCmd) return`), ids `co.*` (e.g. `co.file-open`, `co.undo`, `co.tool-keep`), titles and default keys
  (Mod+Z undo, Shift+Mod+Z redo, K keep, R remove, H pan, Mod+S export, Mod+O open, 0 fit, +/- zoom). Use the same
  object shape as photoslop/js/app/commands.js: `{id, title, group, keys, keywords, when, checked, run}` via
  `SlopCmd.register(...)` — check shared/commands/commands.js for the actual register call and follow it.
- `ui/main.js` → on DOMContentLoaded: `CO.view.init(); CO.pointer.init(); CO.ctxbar.init(); CO.panel.init();
  CO.queue.init(); CO.menus.init(); CO.commands.init(); CO.files.init();` set `#app` data-mode, status bar text
  (`#statusLeft`: item name and size, `#statusMsg`), busy overlay `#busy` (on `busy` / model progress), toasts via
  `SlopUI.toast`, `SlopHub.register('cutout')`, `SlopHub.consumeLaunch()` → add the file, `SlopGuard` unsaved state
  if available, and the `#btnDownload` label. Handles `CO.on('activeItem')` for `data-mode` and the download button.

## Rules for every agent
- You own ONLY the files listed for you. Do not edit other files; if you need a change elsewhere, say so in your report.
- Do NOT git commit or push. Do not run `npm test`. The lead integrates and runs tests.
- Keep every file ≤300 lines. Match the existing code style (2-space, single quotes, terse comments).
- Check your JS parses: `node --check <file>`.
- Final message: list files written, exported functions, anything you could not finish, and any contract change needed.
