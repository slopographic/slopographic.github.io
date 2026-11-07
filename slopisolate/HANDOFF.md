# SlopIsolate — handoff

On-device AI background removal. Engine in `shared/cutout/` (reusable by any app), app in `slopisolate/`,
models in `vendor/models/`, ONNX Runtime Web in `vendor/onnxruntime-web/`. Module contract: `js/CONTRACT.md`.

## Status
- The app runs end to end: sample, open, Slop Drive, queue, Keep / Remove / Clear brush edits, undo and redo,
  look (edges, background, shadow, crop), export (PNG, WebP, JPG, zip). Registry status stays **beta**.
- Tests: `node tests/run.mjs slopisolate` (engine, inference, app, sample, saved session) and
  `node tests/run.mjs mask-transfer` (node). PhotoSlop round trip: `node tests/run.mjs isolate-roundtrip`.

## Older iOS: the AI out of memory (Oct 2026)
- **Cause (confirmed on the iPad, iPadOS 17.7, and the iOS 16.4 simulator).** onnxruntime-web 1.30 ships only the threaded
  build; its glue makes a 4 GB *shared* WebAssembly memory. WebKit on iOS 16/17 reserves a shared memory's whole maximum at
  once and refuses: `no available backend found. ERR: [wasm] RangeError: Out of memory`, before any model or photo is read
  (inputs were already at the model size). Probe in Safari 16.4: shared 64k/48k/32k pages fail, a plain memory of 64k works.
- **Fix.** `shared/cutout/memory.js` plans the start (iOS, or a failed 4 GB shared probe → plain memory, 1 thread, WebAssembly;
  desktop unchanged: shared memory, WebGPU when usable) and patches a copy of the glue (unshared memory, no SharedArrayBuffer
  stand-in, no mailbox waitAsync) and of the wasm (memory import flag). `shared/cutout/runtime.js` retries a failed session
  in a fresh ORT copy with the light setup, then with the Fast model; a pass out of memory restarts light. On the iPad the
  sample is now cut out by the AI (Fast, about 8 s).
- **When nothing runs** (code `low-memory`, or `unavailable`: ORT 1.30 cannot build a session in iOS 16.4's engine at all,
  "Could not find OrtValue with name ..." with any memory or optimisation level) the image opens uncut with a toast and
  status line in words (shared/cutout/i18n, en + sv), and Keep / Remove brushing, look and export work by hand.
- Tests: `tests/node/cutout-memory.test.mjs`, `tests/node/cutout-runtime.test.mjs` (fake ORT), `tests/slopisolate/lowmem.test.html`.

## Batches: one model for all, one way in, a pool (Oct 2026)
- **Why a batch looked worse.** The Model panel changed only the image on screen (`it.model = id; rerun(it)`); every
  other image kept the model it was given when it was added. Dropping several photos, seeing the first and choosing
  Quality left the rest of the batch on Fast, while photos uploaded one at a time after that choice all got Quality.
  Measured with 4 generated photos (sample + 3 scenes): batch vs one-at-a-time alpha mean difference 1.7 to 4.8 of 255
  (max 198 to 253), soft edge pixels 2 to 3 times as many, edge gradient 100 to 122 against 180. Everything else was
  checked and is the same both ways: input size per model, full resolution (no downscale; `U.decode` only shrinks the
  display bitmap over 50 MP), guided refinement and decontamination (the worker does both for every item), settings.
- **Fix.** An image has no model of its own (`it.model = null`) and runs with `S.modelOf(it)` = the app's model, read when
  its run starts. The panel sets `S.model` and `CO.process.followModel()` re-runs every image that follows it and was
  made (or is being made) with another. Only the bulk bar's Re-run model pins a model on an image. After: MAD 0, max 0.
  Saved work keeps `model` (null or pinned) and `modelUsed`; older saves restore as following the app's model.
- **One way in.** `CO.files.take(files, { source, driveId, origin })` is the only caller of `CO.process.add`: the picker,
  the drop zone and the queue sidebar (SlopDrop targets `#workspace` and `#queue`), paste (SlopDrop registers it with
  shared/intake), the sample, Open from Slop Drive (File menu and Drive) and a file another app sent (?drive=). One
  first-use gate per batch (`F.gate`, shared while open), one accept rule (`F.ACCEPT`), one batch into the pool. SlopDrop's
  `begin(files)` hands the whole drop to take() at once; `process(file)` only reports that file's progress. Shaped like
  the suite intake (accept, gate, process, after) so moving to SlopIntake.take is a swap. Removed: the drop path's own
  gate and per-file add, files.js's own paste listener (it added a paste a second time after shared/intake took it),
  the queue's own drop listener (a drop there also got the "Drop files on the highlighted area" warning).
- **Pool.** `shared/cutout/cutout.js` runs `removeBackground` calls in up to `SlopCutout.poolSize()` workers at once, each
  with its own ONNX session (no COOP/COEP, so WebAssembly is single-threaded: separate workers are the only parallelism).
  poolSize: WebGPU 2 (the GPU serialises model passes; the second worker overlaps decode, refinement and
  decontamination), WebAssembly one per two cores up to 3, 2 under 4 GB, 1 on iOS or 2 GB. `configure({ workers })`
  overrides. A separate 'edit' worker holds `createJob` jobs (the image on screen, exports), so sliders and brush strokes
  never wait behind the batch. A worker runs one model pass at a time (`exclusive` in worker.js). `io/process.js` keeps
  the app's bounded queue (`running` map of AbortControllers): remove and re-run cancel a running image (the worker
  finishes the pass, the result is dropped), a failed image does not stop the rest. Queue tiles show the phase
  (Loading, Starting, Cutting out, Edges); the busy bar shows only for a download. Dropping the image on screen also
  closes its decoded bitmap. poolSize learns the real backend from the first pass (WebGPU that falls back to WebAssembly
  on a software adapter then gets the WebAssembly size).
- **Timings, 10 photos (0.4 to 1.6 MP) dropped at once, Fast, WebAssembly, headless Chromium on a 44-core machine:**
  before (one at a time, the drop zone waiting on each) 71.8 s, first ready 7.9 s; after: pool 1 60.5 s, pool 2 33.5 s,
  pool 3 24.9 s, pool 4 20.5 s; first ready about 6.2 s in every case. Main thread: longest stall 60 to 200 ms, a click
  handled within 1 ms. Quality model, same 10 photos: 297.4 s before, 128.0 s after (auto pool 3; first ready 26 s before,
  31 s after, as three passes share the CPU). WebAssembly capped at 3 workers for memory (each holds its own session; Quality is the big one).
  Bench script: tests are in the repo; the timing script was a scratch Playwright run (drop 10, wait for all done).
- Tests: `tests/slopisolate/batch.test.html` (batch vs one at a time after a model change, pinned model kept; pool of 2:
  never more than 2 running, all finish, a click runs meanwhile, the image on screen edits while others run; a broken file
  fails alone; remove mid-run and queued), `tests/slopisolate/intake.test.html` (every route ends in one take and one add
  of the whole batch, one notice per batch, a notice shared by concurrent batches, a video follows the app's model, no
  other script calls `process.add` or listens for drop or paste).

## Manual editing (checked in a browser)
- Keep / Remove strokes: the brush cursor follows the pointer, the edit map and the result change, the view does not
  move (zoom and pan stay put), undo / redo restore exactly, Clear brush edits is one undo step, export carries the edits.
- Fixed: the pointer capture on `#stage` swallowed clicks on the empty-state buttons ("Choose images", "Try a sample"),
  so the sample button did nothing (this also broke the sample test). `ui/pointer.js` now leaves button clicks alone.
- Fixed: a stroke end ran the full refresh twice (history push and a direct call). Now one.
- Cost: the full result (`SlopCutout.finish`, with colour decontamination) takes several seconds at 1200×900,
  mostly `P.decontaminate`. During a stroke the picture follows the brush through `CO.process.live` (main thread,
  matte + brush only); the full result arrives after the stroke. Speeding up decontaminate is the next engine task.

## PhotoSlop integration (Isolate Subject, and back)
- PhotoSlop: `photoslop/js/io/isolate.js`. Layer ▸ Isolate Subject… and the layer right-click item put the layer's
  pixels in Slop Drive with `meta: { requestId, intent: 'mask' }` and open SlopIsolate on it (`SlopHub.sendTo`).
  The tab remembers `requestId → { docId, layerId, x, y, hadMask }` in memory.
- SlopIsolate: the file gets `item.request`. **Send back to PhotoSlop** (`#btnSendBack`, or More ▸ Send mask back)
  emits `slopisolate:mask` {requestId, w, h, mask} on the Slop Hub bus. PhotoSlop applies it to that layer as a layer
  mask (alpha = how much shows, one history step "Isolate Subject") and answers `photoslop:mask-ack`.
- A layer that already has a mask asks first (before anything is sent). The mask is never added as a new layer.
- **Send to PhotoSlop as a new layer** (More ▸ …): `slopisolate:layer` {requestId, blob, name} is added as a layer
  named "Cut-out" at the source layer's position (`photoslop:layer-ack`).
- No reply within 3 s: the mask is saved to Slop Drive as a grey PNG; the cut-out opens in a new PhotoSlop tab.
- Mask transfer helpers: `shared/cutout/mask-transfer.js` (`SlopMaskTransfer`: fromAlpha, toAlpha, toGrey,
  fromGrey, applyAlpha). Covered by `tests/node/mask-transfer.test.mjs`.

## Not done / next
- Decontaminate speed (see above); a live preview that includes it.
- The send path uses the bus, so it needs the PhotoSlop tab open in the same browser profile to apply the mask
  directly; otherwise the Drive fallback applies.

## Video, Drive, bulk, Open in, saved work
- **Video** (`js/video/`): up to 30 s (10 s on phones), frames scaled to 720p; the matte runs per frame at 384 px on the long
  side, in the worker, and is smoothed over time (`smooth.js`, weight 0.35, first frame kept as it is). MP4/MOV is decoded
  with WebCodecs using Slop Cut's demuxer (`slopcut/js/media/demux.js`, loaded on demand); other formats use a `<video>`
  element and seeks. Player on the stage: Play, scrub, Cut-out / Original, Cancel. Export: WebM with alpha
  (VP9 `alpha: 'keep'`, our EBML writer) or a PNG-frame zip when the browser cannot encode alpha (the UI says so);
  MP4 on a chosen background colour (H.264 or VP9). Unverified here: WebM with alpha (headless Chromium lacks alpha 'keep').
- **Drive** (`js/io/drive.js`): processed items are saved into the Drive folder "Slop Isolate": images as
  `-original`, `-mask.png`, `-result.png`; videos as `-original` and `-matte.mp4`, results on export. Open from Drive: images and videos.
- **Bulk editing** (Oct 2026). One editor: the settings panel. With two or more pictures selected it edits all of them
  (`S.targets()`), the header says "Editing 4 pictures" and a line says brush edits stay with each picture.
  - Selecting (`js/ui/bulk.js`, `js/ui/queue.js`): a checkbox on each tile (on hover; always on touch screens and while
    something is selected), Select all / none and "4 selected" in the queue header, Ctrl/Cmd-click (starts from the image
    on screen), Shift-click, Ctrl+A, Escape clears (after a menu or the phone sheet closes on its own Escape). Touch: a long
    press starts selecting (its browser menu is suppressed), then a tap adds or removes. Ticking a picture that is not on
    screen puts it on screen, so the live preview is always on an edited picture. A plain click on a selected picture
    opens it and keeps the selection.
  - Settings as data (`js/core/settings.js`, pure, node-tested): paths (`s.threshold`, `bg.color`, `model`, …), `merge`
    (shared value or mixed), `copy`/`patchOf`, `agreed`, `needsModel` (only `model` and `s.refine` run the model again).
  - One write path (`js/ui/edit.js`): the panel controls (`K.look(label, path)`), Paste settings and Apply these settings
    to all all go through `CO.edit`. A look change emits `look` (the image on screen re-finishes in the worker); refinement
    re-runs the model for those pictures; a model change pins it on the selected pictures only (`P.pin`, only those made
    with another model re-run; the app's model stays). Mixed values show as an empty slider thumb and "Mixed", an
    indeterminate checkbox, a segmented control with nothing pressed; touching one sets it on all.
  - Undo: one entry per picture with a shared `group` (`H.group()`); undo/redo on any of them does the whole group
    (`js/core/history.js`). Undoing a refinement change re-runs the model.
  - The other pictures' results: each tile shows the finished picture (`js/render/thumbs.js`), redrawn in the background
    on the main thread at tile size with the same matte maths (`C.alphaFn`, also used by the live brush) and compositor;
    feather and decontamination are left out at that size. Full-size results are built in the worker on export.
  - The panel menu (⋯, `js/ui/panel-head.js` + `js/ui/bulk-act.js`): Copy settings, Paste settings, Apply these settings
    to all; with a selection: Export N (ZIP), Open in ▸ (each item for every selected picture), Save N to Slop Drive,
    Run a workflow… (the selected finished pictures as PNGs; Ctrl+K's Run a workflow… gets them too through
    `slop:convert-files`), Add to a workflow… (the settings they share, a differing one from the picture on screen), Clear
    brush edits (one undo step), Remove, Select none. The queue's right-click menu on a selected picture is the same menu.
    Commands: `co.copy-settings`, `co.paste-settings`, `co.apply-all`, `co.select-all`, `co.select-none`,
    `co.bulk-clear-edits`, `co.bulk-export`, `co.bulk-drive`, `co.bulk-workflow`, `co.bulk-remove` (macros can record them).
  - Saved work keeps each picture's settings and pinned model (the look and model fields; nothing new to save).
  - Tests: `tests/node/slopisolate-settings.test.mjs`, `tests/slopisolate/bulk.test.html` (3 pictures: mixed, threshold +
    colour + shadow on all with pixel checks and no model run, undo, copy/paste, model on the selection only, workflow,
    saved work), `bulk-phone.test.html` (390 px, touch), `openin.test.html`.
  - Not done: a background picture (`bg.image`) is not a panel setting, so it is not bulk-editable; the model choice is
    not an undo step (as before).
- **Open in** (`js/ui/openin.js`): through the shared outbound builder (`SlopOuttake.items`, shared/intake/outtake.js): the
  toolbar's Open in…, More ▸ Open in and the queue's right-click menu are the same list: every app that takes the output
  (Slop Upscale, Slop Vector, …), Run a workflow… / Add to a workflow…, Save to Slop Drive…, and two handovers
  (`SlopOuttake.handover`): PhotoSlop as a layer with its mask (`CO.send.layer`), Slop Cut as a colour + matte pair. An
  image's output is its finished picture (PNG, as exported); a video's is its cut-out MP4 on the export colour. With a
  selection, `O.bulkItems()` does each item for every selected picture. Test: `tests/slopisolate/openin.test.html`.
- **Right-drag brush resize** (Keep/Remove): across = size, down = hardness, live readout; a drag never opens the menu.
  Maths in `shared/brush/resize.js`; PhotoSlop still has its own copy (`photoslop/js/core/brush-resize.js`).
- **Live brush**: `CO.process.live(it, rect)` updates the matte and cut-out on the main thread every stroke step; the
  view tints the removed part. Test: `tests/slopisolate/live.test.html`.
- **Saved work** (`js/ui/view-state.js`, SlopSession, IndexedDB): finished images (file, model, look, edits, base mask) and
  finished videos (file and matte) come back without running the model. Unfinished items are not saved and not restarted.
  Settings apply to the image on screen, or to every selected picture; brush edits to the image on screen. Toolbar button "Clear saved work".
  Test: `tests/slopisolate/persist.test.html`.
- Tests: `tests/node/slopisolate-smooth.test.mjs`; `tests/slopisolate/video.test.html` (2-second generated MP4: frames, model
  per frame, cancel, WebM or PNG export, MP4 background); `live.test.html`; `persist.test.html`.

## Phone layout (SlopSheet)
Under 900 px the settings panel (`#props`) is a bottom sheet: `CO.sheet = SlopSheet.attach(...)` in `js/ui/menus.js`
(`shared/ui/sheet.js`, see `shared/ui/HANDOFF.md`). The panel button (and View ▸ panel, `act.panel`) opens and closes it; the
shared ×, Escape, a tap outside and a swipe down close it. Before this the CSS had a `.sheet-open` sheet that nothing ever
opened, so the settings were out of reach on a phone; that CSS and the unused `.sheet-grip` are gone. On a wide screen the
button still hides the panel (`no-panel`). Test: `tests/slopisolate/phone-sheet.test.html`.

## Assistant: batches (`js/ui/ai-commands.js`)
`SlopCmd.prepare()` (ui/commands.js, not in the offline build) loads it with `shared/commands/sources.js`: `new_batch`
(removes every image; destructive), `add_images` (`files[]`, `urls[]`, through `SlopIntake.take` like a drop; the queue cuts
them out), `save_cutouts` (waits for the queue, then `CO.export.encode` each to Slop Drive and/or `CO.export.all` as a ZIP;
`format` png | webp | jpg). The look stays `co.look` (ui/macros.js); `CO.lookArgs` gives it to the state. Test:
`tests/slopisolate/ai-commands.test.html`.
