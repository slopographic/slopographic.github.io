# Reel Remix (remix/)

Registry id `remix` (`shared/apps.js`, status `building`, group `creative`). Drop or pick clips and photos, press Remix,
and get a random edit with a chosen grid or template, a target length, a pace, a seed, an export preset, a fill, per-slot
timing, locked slots and a sound. Preview it, reshuffle, edit the Layout lane, export it from the page, or send it to
SlopCut. Local only: nothing is fetched or uploaded (`grep -rn "fetch\|XMLHttpRequest\|http" remix shared/video` finds nothing).

## Files

- `index.html`: the page. Bin (left), stage (centre: canvas, transport with Play, Export and Send to SlopCut, the slot
  lock row, the Layout lane, the cut list), options (right).
- `js/core.js`: state (`RM.state`), `RM.options()` (every option of the plan), `RM.remix()`, `RM.reshuffle()`,
  `RM.resetAll()`, `RM.setEffect()`, `RM.manifest(ids)`, `RM.setCutFill`, `RM.replaceSlot`, `RM.toggleLock`, `RM.toggleCutLock`, `RM.setMusic`.
- `js/keys.js`: keyframes of the selected slot (`RM.keys`: `current`, `addAtPlayhead`, `move`, `remove`, `setEase`, `animateIn`, `reset`).
- `js/fx.js`: the effect layer's drawing (`RM.layer.apply`), called by the preview for every frame.
- `js/panel.js`: the keyframe row, the effect controls, Reset all (`RM.panel`: `renderKeys`, `effectRow`, `sync`, `init`).
- `js/items.js`: the bin. Files become items (images, videos with their duration and size); `RM.addFiles`, `RM.removeItem`.
- `js/preview.js`: the preview (`RM.preview`): draws the plan at time t, fill modes, scrubbing, play, music and original sound.
- `js/drop.js`: bin clips dragged onto a slot of the preview or a cut (see below). Files from the desktop are not here: they
  go through SlopDrop (`shared/drop`, see its HANDOFF), wired in `js/ui.js` (`wireDrop`).
- `js/export.js`: Export (`RM.exporter.run`): records the plan at the preset size, with its sound.
- `js/audio.js`: the reel's sound (`RM.audio`): music track, fade, routing for the export.
- `js/send.js`: Send to SlopCut through Slop Drive (clips and manifest stored, then `SlopHub.sendTo('slopedit', …)`).
- `js/ui.js`: the page wiring. `RM.remixNow`, `RM.reshuffleNow` are the entry points the tests use.
- `css/remix.css`: layout (the stage is the widest column; the canvas fills its width, max-height 70vh), tokens.
- Shared (`shared/video`, see its HANDOFF): `keys.js` (the keyframe maths, on `SlopMotion.track`) and `effects.js` (the effect
  picks, seeded).

## How it plans

Remix never copies the logic: it fills in options and calls `SlopVideo.random.plan` (see `shared/video/HANDOFF.md`).
Every option is in `RM.options()`, so the manifest records the whole edit.

- Layout: the base select (none, a template, a grid, or a random grid from the checked list) and the Layout lane.
  Random on: Remix draws switch points. Grids are chosen by orientation: grids whose cells suit the clips' shapes (see
  `shared/video/orient.js`). Orientation is chosen per layout span (not per cut), from the whole clip set.
- Fill (Options, and per cut in the cut list): Auto (cover; blur background when the clips' orientations are mixed),
  Cover (crop), Fit (letterbox), Stretch (distort), Blur background. The per-cut choice is kept until the next Remix.
- Timing (Options): Same time (all slots switch together); Stagger (each slot starts a random offset up to "Stagger up to",
  and ends with the cut); Random length (each slot plays its own length between Min and Max, never past the cut).
  A slot keeps its clip until its own next clip. Video in cells: Play through (from the clip's start) or Random length
  (a random point in the clip). The cut list shows each slot's start and end when timing is not "Same time".
- Locks: lock a cut (the lock button in the cut list) or a slot (the slot row under the preview, for the cut at the
  playhead). Locked slots keep their clip and in point through Reshuffle and Remix; the others change. Locks are by cut
  number: a plan with fewer cuts drops the locks it cannot place.
- Audio (Options): Off; Original (each video's own sound, playing while its cut is on screen); Music (one track under the
  whole reel, fading out over the last 2 s). Music is a bin video's sound (Random picks one with the seed, so the same seed
  gives the same track), or a music file picked with "Pick music file" (kept out of the bin).
- Export preset: sets the sequence size (`RM.size()`). Presets: Phone vertical 1080×1920, Square, Landscape 1920×1080,
  4K 3840×2160, Portrait 1080×1350, and Custom.
- Seed: shown as 8 hex digits. Remix repeats the seed shown; Reshuffle draws a new one. The same seed, options and clips give
  the same edit, the same timing and the same music.

## Keyframes

Each slot of a cut can have keys for position (`x`, `y`, as fractions of the cell from its centre), scale, rotation (degrees)
and opacity. A key is a whole pose at a time, from the slot's start (its window: start to hold), with an ease for the
segment that starts at it: Linear, Ease in, Ease out or Ease in-out (SlopMotion's quad easings). Keys are stored in
`state.keys` per cut and slot (`{ cut, slot, keys }`), so they stay through Reshuffle and Remix like locks; a key list for a cut
the new plan does not have is dropped.

- The keyframe row sits under the slot row, for the slot chosen in "Keys for" (the cut at the playhead). Add key at playhead
  stores the pose the slot has there, so adding a key changes nothing on screen. Drag a marker (or Left and Right keys) to move
  it, Delete removes the selected key, and Ease sets the selected key's segment.
- Animate in writes the chosen preset (fade in, slide in from left, right, top or bottom, zoom in) for the first 0.5 s of the
  slot: its keys in that window are replaced, later keys are kept. A slot shorter than 0.5 s ends at its end.
- Keys are drawn in `drawFrame` (`js/preview.js`): a keyed slot is clipped to its cell, then faded, moved, scaled and rotated
  about the cell's centre. Export uses the same frame function, so it shows the keys.

## Effect layer

One layer over the whole reel, in the plan as `plan.effect` (`{ kind, intensity, change, picks }`, `picks` one per cut, `{ kind,
seed }`). Choose None, Random, Film grain, Colour shift, Glitch, Zoom pulse or Vignette. Intensity (0 to 100 %) scales each
effect; intensity 0 draws nothing. Random chooses from the five effects: per cut ("Changes at every cut", the default) or once
for the whole reel. The cut list ends with the effect layer's row, and each cut shows its pick ("fx …").

- Seed: the picks come from the seed with their own generator (not the cuts' one), so the same seed gives the same effects, and
  changing the effect never changes the cuts. Changing the effect redraws its picks in place (`RM.setEffect`); the cuts stay.
- Drawing (`js/fx.js`): film grain is a seeded noise tile moved 24 times a second; colour shift lays a seeded hue over in colour
  mode; glitch shifts slices of the frame on about half the frames (12 a second); zoom pulse punches in at each cut and settles
  over 0.6 s; vignette darkens the corners. The effect is drawn after the cuts, in the preview and in the export.

## Reset

- Reset slot keys (the keyframe row): removes the keys of the selected slot.
- Reset effect layer (Options): the effect goes back to None, intensity 50 %, changes at every cut.
- Reset all (Options): the plan's options go back to their defaults (target 30 s, medium pace, no base layout, Random on with
  every grid, no manual layout switches, fill Auto, timing Same time, video Play through, lengths 1 to 3 s, stagger 1 s, locks,
  keys, effect and audio off). The clips, the export preset and the seed are kept, and the plan is drawn again with that seed.

## Editing on the stage

- Drag files from the desktop onto the bin or the stage: SlopDrop (`shared/drop`) outlines both while the drag is over the
  window, shows each file's progress in the bin's drop zone, adds them through `RM.addFiles` (the Add files path), and
  toasts the result ("Added 2 files, 1 skipped: notes.txt is not a picture or video"). The new clip is scrolled into view.
- Drag a clip from the bin onto a slot in the preview: it replaces that slot's clip in the cut showing at the playhead.
  Drag it onto a span in the cut list: it replaces that slot's clip in that cut. The clip keeps the cut's length; a clip
  shorter than its slot holds its last frame. Replaced clips stay until the next Remix or Reshuffle, which plans again.
- Scrubbing (the playhead slider, a click or a drag on the Layout lane's track) paints the frame at once, even when paused.
  Play continues from the scrubbed time.
- Export records the plan in real time (MediaRecorder on the canvas, WebM or MP4 where the browser records it). Keep the tab
  visible. Stop export saves what has been drawn. Browsers without MediaRecorder: use Send to SlopCut.

## Moving clips and cuts (js/moves.js)

- Swap: drag a clip on the preview from one slot onto another slot of the cut at the playhead. The target slot lights up
  while you drag; releasing swaps the clips (with their in point, fill and pan). Timing stays with each slot.
- Pan: drag a clip within its own slot to pan it inside its cell (cover fill). The position is kept on the slot;
  Reset position (the slot row under the preview) clears it for that cut.
- Reorder: drag a cut in the cut list up or down. Only cuts of the same layout span with the same slot count can change
  places; the times are reassigned and the locks follow their cuts.
- A ghost of the dragged clip follows the pointer.

## Clip settings (Options: Photos and Video)

- Photos: How long each shows (the cut length, fixed seconds, or a random range drawn from the seed), From and To (the window in
  the reel; To 0 = the end), and Enter and Exit (none, fade or slide, 0.5 s each).
- Video: Play the full video, Start and stop points, a set speed, or Loop until the slot ends.
- Per slot or per clip: the slot row has Settings buttons that give that slot (or clip) the current Options values, and
  Clear. Overrides apply on the next Remix. Clip settings are in the plan options (`photo`, `clipVideo`, `overrides`).

## Send to SlopCut

The manifest is a Drive record of type `application/x-slop-reel+json`: `format: 'slop-reel'`, `version: 2`,
`from: 'remix'`, the clip ids in play order, and `remix`: the options used (including timing, locks, audio and the effect layer),
and `keys` (the keyframes per cut and slot, recorded for reference). SlopCut's
reel loader (`slopcut/js/io/reel.js`) runs `SE.random.plan` with those options, so the same clips give the same cuts.
Limits: SlopCut reads durations from its own import, so a clip whose length differs there can change the plan; manual cell
replacements are not in the manifest (SlopCut replays the plan from the options), and SlopCut does not play the music, does not draw the keyframes or the effect layer.

## Auto remix, the Remix button, Randomise (js/auto.js, js/fab.js, js/randomise.js)

- Auto remix: SlopDrop's `done` (ui.js) calls `RM.auto.batchDone`, which makes the batch's clips pending
  (`state.pending`). After a short wait a banner ("Remixing N clips…", with Cancel) runs one remix with the current
  settings. Any plan (`RM.onPlan` hooks, run after `RM.remix`) clears the pending list, so remixed clips never trigger again.
  Cancel leaves them pending. The switch is `RM.auto.setEnabled` (localStorage `slop.remix.prefs`, read and written in a
  try/catch; memory when storage is blocked), in the Settings dialog (header button, the palette command "Remix settings",
  or a long press on the floating button).
- Floating Remix button (`#rm-fab`, bottom right): pulses (CSS keyframe on its ring) while clips are pending or no plan
  exists; it stops after a plan. A click remixes. Reduced motion: a steady ring, no animation. Phone width: a smaller button
  and bottom padding so the page's end scrolls clear of it.
- Randomise: a seed (the one typed into Seed since the last plan, else a new one) drives every random choice: the order
  (the plan), Random length within Min and Max (timing "random"), each photo's Enter and Exit, and the effect layer (one of
  the five effects, a random change). The same seed and clips give the same result. Undo puts back the previous plan,
  seed and options (one step).
- The seed is in the URL as `rm.seed` (SlopUrlState, `shared/urlstate`) on each plan; a link with it fills the Seed field.
  Remix repeats the seed shown, as before.
- Styles in `css/remix-auto.css` use `--sl-*` tokens mapped to the page's `--rm-*` colours.

## Tests

`node tests/run.mjs remix` runs `tests/node/remix-orient.test.mjs` (orientation, grid choice, cell order, fill),
`tests/node/remix-edit.test.mjs` (timing, locks surviving a reshuffle, audio choice) and the browser pages
`tests/remix/remix.test.html` (the edit, presets, lane) and `tests/remix/remix-stage.test.html` (stage size, drop on the stage,
drop onto a cut, scrubbing paints a frame and Play carries on, export records a file) and `tests/remix/remix-keys.test.html`
(adding a key at the playhead shows in the row, and Reset slot keys removes it) and `tests/remix/remix-drop.test.html` (the drop
zone, the drag label over the window, a dropped picture shows a progress row and then the clip in the bin, a refused file is named
in the toast). The accept and refuse rules are `tests/node/drop-rules.test.mjs`.
`tests/remix/remix-auto.test.html` (a finished upload batch is remixed once, the banner, Cancel, the switch),
`tests/remix/remix-fab.test.html` (the button pulses only while a remix is pending, and the reduced-motion ring) and
`tests/remix/remix-randomise.test.html` (the same seed gives the same order, the seed in the URL, the limits, Undo).
`node tests/run.mjs video` runs `tests/node/video-keys.test.mjs` (interpolation through SlopMotion, each ease, the hold at both
ends, the key edits, the Animate in presets) and `tests/node/video-effects.test.mjs` (the seeded choice of effects, Random by
cut or by reel, the same seed gives the same effects, effects never change the cuts).

## Not done

Audio in the export of Original mode follows real time (the clips play with their cut); transitions; cut-outs; per-cut
timing beyond the slot offsets; a lock on a single slot that is in a cut with a different slot count after Remix. Keys are per
cut and slot, so after Remix a slot keeps its keys only when the new plan has the same cut and slot. Keyframes cover position,
scale, rotation and opacity only (no key on colour or the clip's in point); the effect layer has no per-effect settings beyond
intensity and change.

## AI commands (js/ai-commands.js, js/ai-spec.js, 2026-10)

Every operation is a SlopCmd command with arguments (the Slop AI panel's and WebMCP's tools; Ctrl+K opens a form):
`remix_state` (read-only: clips with ids, options, each cut's slots), `add_from_drive` (source), `remove_clip` (destructive),
`set_options` (target, pace, aspect/preset or width+height, layout, switches, grids, fill, timing, video, min, max, stagger,
audio, music, effect, intensity, effect_change, photo_show, photo_seconds, photo_enter, photo_exit, seed; then plans),
`remix` (seed or "new"), `set_cut_fill`, `replace_slot`, `swap_slots`, `move_cut`, `lock_cut`, `reset_options`
(destructive), `export_reel` (engine slopcut, SlopCut's frame-exact render in its hidden copy, or record, the real-time
export; format, name, save_to_drive, download), `send_to_slopcut`, and `remix_from_spec` (one call: { sources: [Slop Drive
ids or names], …options, export: {…} }, the bin replaced unless replace: false). They set `RM.state` and the controls,
then plan with `RM.remixNow`, so the page shows what was done. `SlopCmd.provide`: state, and a checkpoint of the options.
Not done: beat sync and captions (Remix has neither; the "Remix to reel" operation, `shared/ops/video.js`, adds captions in
SlopCut). Test: `tests/remix/ai-commands.test.html`.
