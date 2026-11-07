# SlopCut — handoff

In-browser video editor at `/slopcut/` (registry id `slopedit`). Premiere/DaVinci-lite: media bin, multi-track
timeline, real-time preview, transitions, titles, colour, audio mixing, WebCodecs export. Nothing is uploaded.
No SharedArrayBuffer, no ffmpeg.wasm (GitHub Pages cannot send COOP/COEP headers).

## What works
1. **Media bin** (`js/ui/bin.js`, `js/media/*`): import video/audio/images by picker (Ctrl+I), drag and drop anywhere,
   File ▸ Import from Slop Drive, `?drive=<id>` launch. Thumbnails (filmstrip), duration, waveform peaks, sound
   detection (decodeAudioData). Blobs live in IndexedDB `slopedit` › `media`; the first import into an empty project
   sets the sequence size and puts the clips on the timeline. Rename, remove, download original, save to Drive.
2. **Timeline** (`js/timeline/*`, model in `js/core/*`): video tracks (V1 bottom) and audio tracks, add/rename/delete
   tracks, hide/mute/solo/lock. Drag from bin or Effects tab, move across tracks (overwrite semantics), trim
   (normal, ripple with the B tool or Ctrl-drag), razor (C), split at playhead (S / Shift+S all tracks), Q/W ripple
   trim to playhead, ripple delete, snapping (N) to clip edges/markers/playhead, zoom (wheel+Ctrl, pinch, slider,
   `\` fit), scrub in the ruler, J/K/L shuttle (±1/2/4/8×), markers lane (M, drag, rename), in/out (I/O),
   clipboard, nudge, linked audio/video (Ctrl+L), undo/redo (snapshot history, drags are one step), fades handles,
   transition length handles, volume rubber band with keyframes (Ctrl/Alt-click), context menus.
3. **Preview** (`js/render/*`): Canvas2D compositor (`compositor.js`) with fit, position, scale, rotation, opacity,
   crop, fades; colour grade on the GPU (`grade.js`, WebGL, with a Canvas2D filter fallback). Video comes from a
   `<video>` pool (`vpool.js`) synced to the WebAudio clock (`player.js` + `audiomix.js`). Safe-area overlay ('),
   half-quality toggle, level meter, on-canvas move/scale/rotate handles (`preview-input.js`).
4. **Effects**: transitions (the library below), titles (fonts, size, colour, outline, box, bold/italic/shadow, align,
   entrance and exit animations, see Text below), graphics (the library below), colour mattes, brightness/
   contrast/saturation/temperature + looks, speed (10–1600 %, later clips ripple), video fades, audio volume,
   keyframes and fades. Effects tab supports click-to-apply and drag onto the timeline.
5. **Export** (`js/io/encode.js`, `js/ui/export-dialog.js`): WebCodecs VideoEncoder/AudioEncoder → MP4 (mp4-muxer)
   or WebM (webm-muxer). MP4 tries H.264 (level picked from size/fps) then VP9/AV1; audio AAC then Opus. Size is a
   frame preset (Phone 1080×1920, Square, Landscape 1920×1080, 4K, Portrait 4:5) or custom width and height; the chosen size
   becomes the sequence size. 24–60 fps, quality presets, whole sequence or in/out, progress with Cancel, result
   dialog with preview, Download, Save to Slop Drive. Frames come from `js/media/frames.js`: a hand-written MP4
   demuxer (`demux.js`) + VideoDecoder (frame-exact), falling back to seeking a private `<video>` (rVFC).
   Without WebCodecs: real-time WebM via MediaRecorder (`recorder.js`). GIF (`gif.js`, median-cut palette, LZW,
   ≤15 s). Snapshot frame to PNG (Shift+E), Send frame to PhotoSlop. `.slopedit` project files = store-only zip
   (`core/zip.js`) with project.json + media (`io/project.js`). Autosave of the project to IndexedDB (`io/session.js`).
6. **Polish**: themes Pro/Light/Classic 98 (`--sui-*` tokens), phone layout ≤760 px (monitor on top, bottom tabs
   Media/Effects/Inspector/Timeline, + buttons on bin items), sample project generated on the device
   (`io/synth.js`, `io/sample.js`), File ▸ Download app (offline .html, `io/build.js`), every action is a SlopCmd
   command (`js/ui/commands.js`; Help ▸ Search commands ⌘K, Keyboard shortcuts). `cmd-fallback.js` is a small
   built-in dispatcher/palette used only if SlopCmd is missing.

## Selecting clips (`js/core/pick.js` rules, `js/timeline/input.js`)

- Mouse: a click selects the clip (and its linked clips) alone; a press on a clip of a multi-selection drags them all, and
  selects that clip alone if it lifts without moving. Shift-click adds, Ctrl/Cmd-click toggles. A drag from empty space
  draws a selection box that takes every clip it touches, across tracks (Shift adds). Ctrl/Cmd+A selects all, Escape clears.
- Finger: a tap selects one clip (a tap on empty space clears); a drag on a clip not selected scrolls the timeline, on a
  selected one moves the selection. **Select mode** (toolbar "Select several", `tool.multi`, `TL.multi`) is the touch
  multi-select: a long press on a clip turns it on with that clip; then taps add and remove clips and a drag from empty
  space draws a selection box (not a scroll). A long press in Select mode opens the menu. Escape or the button ends it.
  Chosen over long-press-then-drag for the box: the long press already means "menu", and a mode is visible on screen.
- A selection moves together (same time shift, tracks kept, `E.move`), a plain trim of a selected clip trims the same
  edge of each selected clip by as much (ripple trims one clip), Delete removes them all; each is one undo step.
- Commands: `select_clips` (ids, replace/add/remove), `select_all` (`js/ai/cmd-clips.js`).

## Placing a picture (`js/core/fit.js`)

Scale: the number field takes 1 % to 100 000 %, the slider is logarithmic from 1 % to 2000 % (`SE.fit.toSlider`).
**Fill frame** / **Fit frame** (under Scale in the Inspector; `fit_frame` for the AI) cover or fit the frame with the
visible, cropped picture, centred, aspect kept (`SE.fit.frame`). `set_transform` takes scale up to 1000 (100 000 %).

## Templates and random edit

**Templates** (`shared/video/templates.js` and `grid.js` data, `slots.js` slot maths, `js/core/layout.js` operations,
`js/ui/templates-panel.js`, `js/render/cells.js`): a Templates tab in the bin (Shift+G, or Sequence ▸ Templates panel).
The picker is labelled columns × rows (3×1 is three columns, 1×3 three rows): 1×2 (two rows), 2×1 (two columns),
3×1 (three columns), 1×3 (three rows), 2×2, 3×3, Picture-in-picture (layered), Title + 2 (a title band over two clips),
1×1, Vertical 9:16 reel, and Custom… (columns and rows 1 to 4). Shared ids: `split-v`, `split-h`, `three-up`, `grid-3x1`,
`grid2`, `grid3`, `pip`, `title-two`, `single`, `reel`, `grid-RxC` (rows × columns). Clips go to the monitor as transforms
(fitted, letterboxed into the region) and to the timeline as slots: slot i is video track V(i+1) (linked sound on A(i+1)),
all starting at the layout's start for its length.
- Apply: select clips on the timeline (Ctrl/Shift-click for several) and pick a template; with no clips selected, the media
  picked in the bin is added at the playhead; with nothing picked, an **empty layout** is made at the playhead. Either way
  every slot gets its own track row (V1…Vn) and a cell in the monitor; an empty slot shows as a dashed box on the timeline
  and a numbered outline in the monitor. Clips beyond the slot count stay on the timeline.
- Fill: drag a bin item into a panel slot, or drop it on a monitor cell (the cell under the pointer, `SlopVideo.slots.cellAt`).
  Either makes a clip at the layout's start for its length (`L.placeMedia`). Dragging a timeline clip into a slot still works.
- Swap and clear: drag a filled slot onto another to swap (reorder); drag it onto the clip list to clear it (the clip stays).
  The per-slot selects (choose a clip, swap with a slot, free the slot) and Clear layout still work.
- Re-flow: with a layout on, choosing another template keeps the clips and re-flows them (extra clips leave the layout).
- Project field `layout = { tpl, start, dur, slots[] }`. Undo covers every step.
- Slot maths (`shared/video/slots.js`, pure): `count`, `rects`, `empty`, `cellAt` (layered: top-most wins), `resize`, `fill`
  (a clip already in another slot swaps), `swap`, `free`, `filled`. `js/core/layout.js` writes them into the project.

**Transitions** (`js/render/transitions.js` = `SE.transitions`, `js/ui/tr-preview.js`): fourteen transitions, ids stored in
projects: `cross` (cross dissolve), `blur` (blur dissolve), `black` and `white` (dip), `wipe` (wipe right), `wipe-left`,
`wipe-up`, `wipe-down`, `slide`, `push`, `zoom-in`, `zoom-out`, `spin`, `glitch` (bands shift until the cut). `TR.params(type,
role, q, w, h, solo)` gives the terms for one side at progress q; the compositor (preview and export) and the transition preview
both draw from it, so they match. Glitch draws the layer in bands (`slices`). Length: `SE.transitions.dur` (0.2 to 3 s, the
slider at the top of the Effects tab, remembered in the browser). Click a tile to add it at the cut (the preview replays),
or drag it onto a cut. Titles still take a per-title entrance (`anim`) and exit (`out`: as in, none, fade, slide up, shrink,
blur out); `out` is missing in older projects, which means "as in".

**Text** (`js/render/text.js`, Inspector ▸ Text in `js/ui/insp-clip.js`, presets in `js/ui/effects.js`): Titles list has
Headline, Lower third, Caption, Subtitle, Typewriter, Handwritten and Outline. Text takes a box (background colour), outline,
shadow, alignment and an entrance and an exit. The Font list is the standard fonts plus the bundled and downloaded families of
`shared/fonts/picker.js` (loaded when picked; the picker is not in the offline build, so the offline app has the standard list).

**Graphics** (`shared/graphics/icons.js` = `window.SlopGraphics`, `js/render/graphics.js` = `SE.gfx`, `js/ui/graphics-panel.js`,
`js/ui/insp-graphic.js`): a clip of kind `graphic` with `gfx = { id, color, size, anim, value }`. Shapes: arrow, circle
highlight, box outline, underline, number counter, check mark, speech bubble, star burst (SVG path data in a 100 box). Motions:
draw on, pulse, bounce, pop, none. Size is a fraction of the frame height. The Effects tab has the library (colour, size and
motion above the grid; click adds at the playhead, drag onto the timeline). The Inspector ▸ Graphic edits a placed one.
Graphics are drawn on a frame-sized canvas like titles, so keyframes, masks, transitions and export work unchanged.

**Random edit** (the pure plan and seed are `shared/video/random-edit.js` and `seed.js`; `js/core/random-edit.js` writes the plan into the project; `js/ui/random-dialog.js`): Shift+R or Sequence ▸ Random edit…
- Options: target length (1–600 s), pace (fast 0.6–1.4 s cuts, medium 1.5–3 s, slow 3–6 s), frame size (a preset; sets the
  sequence size), layout (none = one clip after another; a template or grid = beats of n simultaneous cuts, one per slot; Random grid from the list draws one grid by seed). Random switch points change the layout over time (see the Layout lane below).
- Clips: the bin items picked, else every ready video and still image. Shorter sources are skipped (under 0.2 s).
- Seed: mulberry32, shown as 8 hex digits in the dialog, the status line and the Templates tab. Any text typed as the seed is
  hashed. The same seed, options and clips always give the same cuts (`SE.random.plan` is pure). Reshuffle draws a new seed;
  Sequence ▸ Reshuffle random edit (no shortcut) rebuilds with the last options and a new seed.
- The random edit is ordinary timeline clips (video or still, plus linked sound). Build replaces the timeline clips in one
  undo step. `project.random` records seed, target, pace, aspect, template, cut count and length.
- Clips are drawn from a shuffled deck: no clip repeats until every clip has been used (when there are enough clips).

Limits: cuts are straight cuts (no transitions; `shared/motion` transitions are CSS-slide keyframes, not compositor
transitions, so they are not used); no audio ducking; no beat detection; each cut keeps its own sound, so sound changes
abruptly at cuts; templates fit by contain (letterbox, no crop); the random build ignores track locks and replaces every
timeline clip; with fewer clips than slots, clips repeat inside one cut; drag works between panel chips and slots only
(timeline clips cannot be dragged into a slot from the monitor; bin items can be dropped on monitor cells).
`io/reel.js` (Slop Gallery reels) calls `SE.random.plan` / `build` and `SE.layout`: keep those signatures.

## Layout lane, presets and the shared core

- The shared video core (layout geometry, presets, grids, templates, the segment model, the pure plan and the lane widget)
  is in `shared/video/` with its own HANDOFF. This app keeps the project operations: `js/core/layout.js` (single layout),
  `js/core/lane.js` (switches), `js/core/random-edit.js` (writes a plan into the project).
- **Layout lane** (Templates tab, under the layouts): switches `{ start, layout }` are kept in `project.segments`. Choose a
  layout and press "Switch at playhead"; drag a marker to move it (snaps to 0.1 s); select it and press Delete (or the
  Delete switch button) to remove it; arrow keys nudge the selected one (Shift for 1 s). Each change is one undo step.
  Each band holds one layout until the next switch. `applyLane` refits every video clip to the slot region of the layout
  active at its start: a clip on track V(i+1) takes slot i, and a clip past that layout's slot count is left alone.
- The single-layout path is unchanged: a layout from the Templates tab (`project.layout`) works as before when there are
  no switches.
- Random edit: Layout is none, a template, or Random grid from the list (1x2, 2x2, 1x3, 2x3, 3x3). "Switch layouts at random
  points" draws the switch points over the checked grids. The options (size, layouts, switches) are kept in `project.random`,
  so Reshuffle keeps them.
- Export: the Size list is the presets plus Custom width and height. Export first applies the chosen size to the sequence, so
  the layout and the file use the same frame.
- Timeline: the middle mouse button drags the timeline (horizontally and vertically) and does not select or move clips;
  left-drag is unchanged. Test: "a middle-button drag changes the timeline scroll position and does not move a clip".
- Reel Remix sends a manifest with a `remix` object of the same plan options; `io/reel.js` replays it with `SE.random.plan`.

## Limits of the grid, transitions, text and graphics round
- The monitor takes bin items on cells only; timeline clips still go in through the panel. Empty layouts do not reserve time
  past the layout's length. Transitions are not applied between layout cells (each cell is its own clip).
- Template ids keep the shared rows × columns notation (`grid-3x1` is three rows); the picker labels are columns × rows.
- Reel Remix lists `title-two` automatically (it reads `SlopVideo.templates.list`); its random plan uses grid ids only.
- Glitch and blur are approximations (bands and a canvas blur), not frame-exact effects. Graphic counters count to a whole number.

## Keyframes and the random effect layer

- **Keyframes** (`js/core/anim.js`, inspector section "Animation" in `js/ui/insp-anim.js`): `clip.anim = { x, y, scale, rot,
  opacity }`, each a `shared/motion/track` of `{ t, value, ease }` (t in seconds from the clip start). X, Y and rotation keys
  add to the clip's own transform; scale and opacity keys multiply it, so the neutral key is 0 / 0 / 1 / 0 / 1 and a key past
  the last one holds its value. Easing per key (linear, ease in, ease out, ease in-out: the segment that starts at the key).
  Key at playhead (one key per property, at its current value), drag a diamond along its track, click the lane to move the
  playhead, edit value/time/easing of the selected key, delete it. Animate-in presets (fade in, slide from left/right/top/bottom,
  zoom in) write keys over the first 0.5 s. Reset keyframes clears them.
- The compositor (`js/render/compositor.js`) reads keys through `SE.anim.combine` for layers, the monitor overlay and the
  hit-test (`CMP.bounds(p, c, t)`); export and preview use the same `CMP.render`, so both show them.
- **Random effect layer**: a clip of kind `effect` on a video track (Timeline ▸ Add random effect layer, Effects tab, or
  `tl.effect` in the palette). It applies to the tracks below its own track; put it above the clips it should affect.
  `fx = { seed, every, intensity, types }`: `every` is the change interval (0 = one effect for the whole layer), `intensity`
  0–100 %, `types` the enabled effects of grain, colour shift, glitch, zoom pulse and vignette. Each cut draws one effect
  with `SlopVideo.seed` (`js/core/fx-random.js`, pure: the same seed, cut and settings always give the same pick). Drawing
  (`js/render/fx-draw.js`) works on a copy of the frame drawn so far; grain and glitch use the seed and the time.
  New layers get a random seed; New seed reshuffles; Reset effect restores the defaults (seed 1, all five, 60 %, every 1 s).
- **Reset all** (`clip.reset`) restores a clip's transform, crop, colour, fades, transition, volume, keyframes and effect
  settings to their defaults. It keeps media, timing, speed, title text, colour matte colour and links.
- Colour shift uses `ctx.filter`; where the browser has none it is skipped (the other effects still draw).
- Tests: `tests/node/slopcut-core.test.mjs` (interpolation, easing, presets, seeded pick); `tests/slopcut/slopedit.spec-anim.js`
  (adds, moves, edits and resets a key in the inspector; presets; Reset all; the effect layer's pixels, seed rule and reset; a
  decoded MP4 export that has a key and a vignette).

## Clip masks

A clip can have one mask (`clip.mask`, `null` when none). It is saved with the project and each change is one undo
step (`SE.change`; slider drags coalesce per field). The mask is in clip space: project pixels from the clip's centre at
scale 1, so it moves, scales and rotates with the clip (keyframed masks are not done).

- **Shapes:** rectangle, ellipse, rounded rectangle (`r`), or a path of anchors with bezier handles (`pts`: `x, y` plus
  handle offsets `ix, iy` in and `ox, oy` out). Freehand strokes are simplified (Ramer–Douglas–Peucker) to anchors with no handles.
- **Fields:** `feather` (px, soft edge, 0–500), `expand` (px, + grows / − shrinks), `invert` (keep outside instead).
- **Geometry** (`js/core/mask.js`, no DOM): `ops` (outline), `flatten`, `inside`, `dist`, `covered` (expansion applied
  as distance to the outline, then invert), `bounds`, `clean` (sanitises loaded values), `simplify`.
- **Raster** (`js/render/mask-draw.js`): the compositor (`compositor.js`, `drawLayer`) draws a masked clip into a scratch
  layer, then keeps the covered pixels (destination-in). Coverage is the shape with a canvas stroke for expansion and a
  blur for feather. Preview, snapshot, export, GIF and the recorder all call the same compositor, so they match.
- **Monitor** (`js/render/mask-view.js` draws the outline and handles; `js/render/mask-input.js` is the pointer side):
  the selected clip's mask outline shows in the monitor (dashed when inverted). Edit shape shows handles: corners resize
  (opposite corner fixed), the round handle sets the corner radius, path anchors and handles drag, and dragging inside
  moves the mask. Draw tools (`SE.maskInput.setTool`, Clip ▸ Mask ▸ Freehand / Bezier path): freehand drags a path; pen
  clicks anchors (drag for a curve), closes on the first point, on double-click or Enter; Esc cancels. A new mask opens
  in edit mode.
- **UI:** Inspector ▸ Mask (shape, centre, size, radius, feather, expansion, Keep inside / outside, Edit shape, Remove);
  Clip menu ▸ Mask and the timeline clip context menu ▸ Mask (`SE.maskMenu()`); commands `mask.add.rect|ellipse|rrect`,
  `mask.draw.free|pen`, `mask.remove`, `mask.invert`, `mask.edit` (SlopCmd, rebindable).
- **Limits:** no keyframes on masks; no mask on effect layers, audio or nested clips; a path needs three points; the
  raster feather is a canvas blur (its profile is not the geometric one that `covered` uses, which ignores feather).
- **Tests:** `tests/node/slopcut-mask.test.mjs` (geometry, expansion, invert, clean, simplify) and
  `tests/slopcut/slopedit.spec-mask.js` (a mask changes the frame pixels, feather and expansion pixels, one undo step per
  change, saved with the project, the inspector section, the draw tool and the corner-handle drag, all through pointer events).

## Tests
`node tests/run.mjs slopcut` runs the Slop Cut pages and the node files. `tests/node/slopcut-grid.test.mjs` (slot rectangles for
each template, fill, swap, free, cell hit tests, the graphics data), `tests/node/slopcut-library.test.mjs` (transition terms,
duration clamp, title exits). `tests/slopcut/slopedit.spec-grid.js` (in the slopedit page): a 3×1 template gives three slots
and tracks; a bin item dropped on the middle slot is in the middle column (pixels checked); a monitor cell drop fills that
cell; slots swap and clear by dragging; the picker labels; a 1×3 layout; a wipe-left renders from the right edge; the Effects
tab shows the transition and graphics libraries; a box graphic renders in its colour.
`node tests/run.mjs slopedit` → `tests/slopcut/slopedit.test.html` (63 tests with the node file, all green, ~40 s). `slopedit.spec-video.js` covers the Layout lane (a 1x1 then 1x3 switch, add/move/delete with undo), the middle-button pan and export presets. `tests/node/slopedit-video-core.test.mjs` tests `shared/video` in Node. `slopedit.spec-tpl.js`
covers templates (region data, apply, re-flow, swap, drop) and the random edit (seeded plan, length, slots, no repeats,
build, reproducibility, reshuffle, one undo, dialog, menu and keyboard). App runs in
iframes (1280×760 and 390×844); `slopedit.helpers.js` exposes `window.ST`. Specs: model (split/trim/ripple/move/
overwrite/snap/links/undo/timecode), render (compositor pixels for layers, crop, rotation, fades, every transition,
GPU vs CPU grade, titles; live preview), media (import + waveform, synthetic video encoded in the page with
VideoEncoder, demux + frame-exact decode incl. backwards seek, MP4 export re-demuxed for frame count/duration/audio,
WebM, cancel, GIF, project round trip, autosave across reload), ui (S/Delete/Ctrl+Z/M/arrows/Home/L/K via keydown,
menus, palette, keymap, inspector, sample project, phone tabs/no overflow, `?drive=` launch, offline build boots,
SlopCmd rebinding, no script errors). Encoder tests skip themselves if VideoEncoder is missing.
Note: Playwright's Chromium has no H.264/AAC, so tests exercise VP9/Opus in MP4; real Chrome/Edge/Safari pick H.264.

## Known limitations / next steps
- Audio is decoded whole into memory (≈380 KB per second of footage); very long files (> ~40 min) are heavy.
- Preview playback relies on `<video>` seeking/playing; reverse shuttle is silent; speed changes pitch the sound.
- Only MP4/MOV get the frame-exact decoder path (fragmented MP4 and WebM inputs use the seek fallback).
- No nested sequences, multicam, LUTs or audio effects beyond volume. Keys cover position, scale, rotation and opacity only (not crop or colour).
- The MediaRecorder fallback could not be verified in headless Chromium (canvas captureStream records 0 bytes
  there); it is only used when WebCodecs is missing (old Firefox/Safari). Check it by hand in such a browser.
- Offline .html has no Slop Drive (by design) and uses fallback fonts (shared/fonts is stripped like other apps).

## Recommended registry status
`beta` (feature-complete and tested; real-world codec/hardware coverage still needs field testing).

Vendored: `vendor/mp4-muxer` (mp4-muxer 5.2.2, MIT), `vendor/webm-muxer` (webm-muxer 5.1.4, MIT), both by Vanilagy.
Every source file is ≤ 300 lines.

## Slop Drive (shared storage)

- **Save project (Ctrl+S)** writes the `.slopedit` back to the Drive file the project came from (`PJ.driveId`, set by `PJ.openFile(file, driveId)` for Drive projects, cleared by New project). The first save asks for a folder. `File ▸ Download project (.slopedit)` downloads; offline builds download on Save.
- Opening a `.slopedit` from Drive (picker or `?drive=`) opens it as a project; media files still import into the bin.

## Remove background (send to SlopIsolate) — `js/io/cutout.js`
- Clip menu ▸ "Remove background (send to Isolate)" (video clips): the clip's media goes to Slop Drive with the clip id and
  SlopIsolate opens on it. Isolate returns a matte pair (colour video + grey matte video). The result is a **new** clip on the
  video track above the source clip, same start, with `clip.matteMedia` = the matte media id. The source clip is kept.
- Arrival: over the Slop Hub bus (`cutout-result`) when Cut is open, or with `?drive=` (session.js `S.launch`, `meta.matteId`).
- `js/render/matte-pair.js` (`SE.matteDraw`): the compositor draws colour × matte (matte's red channel as alpha) in
  `compositor.js` → `CMP.render`, for preview and export. The frame provider (`media/frames.js` `prepare`) primes the matte
  under the id `<clip id>:matte` (`SE.matteDraw.clipOf`), and prunes readers by the base clip id.
- Test: `node tests/run.mjs slopcut/matte-pair` (alpha from the matte: opaque white, transparent black, partial grey).
- Not tested end to end: the Isolate → Cut return path has no browser test. Expect a check of the bus message and the
  `?drive=` path on a real pair before release.

## AI commands, the edit list and the hidden copy (js/ai/, 2026-10)

Every editing action is a SlopCmd command with arguments (the one list the Slop AI panel, WebMCP and the Claude Code bridge
read through `shared/ai/cmdtools.js`; macros record them; Ctrl+K opens a form for them, `shared/commands/argform.js`). They
edit through `SE.change` and `core/edit.js`, so each is one undo step and "Undo all AI changes" works
(`SlopCmd.provide({ state, checkpoint })` in `js/ai/core.js`).

| Tool (command id) | Key arguments |
|---|---|
| `list_clips` (`cut.list`, read-only) | sequence, tracks, clips with id/track/start/end/in/out, media with ids |
| `new_project` (`cut.newProject`, destructive) | aspect 16:9/9:16/1:1/4:5 or width/height, fps, name |
| `set_sequence` (`cut.sequence`) | aspect or width/height, fps, background, name |
| `import_media` (`cut.import`) | source (Slop Drive id or name), timeline |
| `add_clip` (`cut.addClip`) | media (bin or Drive), track V1…/A1…, start, in, out |
| `move_clip`, `trim_clip`, `set_source_range` | clip, start/track; start/end edges + ripple; source in/out |
| `split_clip`, `delete_clips` (destructive), `duplicate_clip` | time (+clip); clips list/"all", ripple; clip, start |
| `set_speed`, `set_volume`, `set_track` | speed 0.1–16; volume, fade_in/out, mute; track mute/solo/hide/lock |
| `set_transform`, `picture_in_picture`, `set_colour` | x/y/scale/rotation/opacity/crop; corner/scale/margin; look or brightness/contrast/saturation/temperature |
| `add_transition` | clip (incoming), type (the 14 transitions or none), duration |
| `add_title`, `edit_title` | text, start, duration, style (the title presets), font, size (fraction of height), color, background, outline, position, x/y, animation, exit |
| `add_captions` | srt text, source (Drive .srt/.vtt) or transcribe (a clip id, or "timeline": the edit's own mixed sound) + language, size, position, colour |
| `add_graphic`, `add_effect_layer` | shape/start/duration/colour/size/motion; effects/intensity/every/seed |
| `reframe` | aspect (e.g. 9:16), focus_x/focus_y, clips: pictures cover the new frame, titles keep their place |
| `add_music` | media, start, in, duration, volume, duck (level under other sound: volume keys), fades, track |
| `add_marker`, `set_in_out` | time/name/colour; in/out/clear |
| `random_edit` (`cut.randomEdit`) | Reel Remix's plan: target, pace, aspect or size, layout, switches, seed, or its whole `options` |
| `build_from_edit_list` (`cut.build`), `check_edit_list` | an edit decision list (JSON, `shared/video/edl.js`): clips, titles, transitions, captions, music with ducking, markers, reframe |
| `export_video` (`cut.export`) | format mp4/webm, aspect or width/height, fps, quality, range all/io, audio, name, save_to_drive, download |
| `look_at_frame` (`cut.look`, sends) | time, max_size: a JPEG of the frame; asked every time (cmdtools' `sends`) |

Long commands (`export_video`, `build_from_edit_list`, transcription) show the progress dialog with Cancel and stop on the
caller's AbortSignal (`ctx.signal`: the panel's Stop, a workflow's cancel). Changing the export size (`AI.resize`) scales
positions and text with it. Macros: `shared/macros` is loaded, so Ctrl+K has Record a macro / Macros…; with
`?macro-host=1` the page is the hidden copy (`js/ai/host.js`: memory instead of IndexedDB, no restore, no launch) that
`shared/ops/video.js` (Edit list → video, Reframe video, Add captions to video, Remix to reel) and SlopCut macro steps in
Slop Workflows run in. Fixed on the way: `SE.edit.setSpeed` gave the linked sound a one-frame length when the picture came
first in the group. Tests: `tests/slopcut/ai-edit.test.html`, `ai-panel.test.html` (fake engine: a 15-second vertical reel
with captions), `ai-ops.test.html`, `tests/node/video-edl.test.mjs`. Not done: playing a clip backwards (reverse), beat
detection; captions from a single clip map the clip's own source time.
