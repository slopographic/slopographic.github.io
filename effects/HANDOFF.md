# Slop Effects (effects/)

A motion design tool in the spirit of After Effects, in the browser. No build, no CDN. Layers, keyframes with easing and a
graph editor, an ordered effect stack per layer, seeded random motion, a frame-accurate preview, and renders to a PNG
sequence (zip), WebM, or MP4 where the browser can record it. Projects save to Slop Drive and export as config.

## Files (each under 300 lines)

| File | What it is |
| --- | --- |
| `index.html`, `css/effects.css` | The page. Phone width (under 760 px) stacks preview, properties and timeline in one column. |
| `js/model/defs.js` | Layer types, shapes, social comp sizes, eases, animatable properties, the effect list with parameter ranges. |
| `js/model/core.js` | The document, composition clamping, ids (`l1`, `e2`), frame times, new layers. |
| `js/model/values.js` | Values at a time (keys sampled through `SlopMotion.track`), the 2D matrices, parent chains (`frameState`). |
| `js/model/layers.js` | Layer and effect operations: add, remove, duplicate, reorder, parent (loop-checked), base values, source, effect stack. |
| `js/model/keys.js` | Keys: set, delete, move (snapped to frames), ease (named or bezier), copy and paste payloads. |
| `js/model/motion.js` | Animate in and out (`fade-in`, `slide-up`, `pop`, `spin-in` from `SlopMotion.presets`), seeded Random motion. |
| `js/model/history.js` | Undo and redo as whole-document snapshots (200 steps). |
| `js/model/project.js` | The one format: `toData`/`fromData`, `problems` (cross references), the config schema, Drive file text. |
| `js/render/fx.js` | Effect passes: blur, drop shadow, glow, colour, grain, vignette, glitch. A small canvas pool. |
| `js/render/draw.js` | `drawFrame(ctx, doc, t, {media})`. The one draw function for the preview and for the render. |
| `js/render/media.js` | The session's media bin; video seeking (`prepare`) so each frame is the right frame. |
| `js/render/export.js` | PNG sequence zip (`shared/office/zip.js`) and MediaRecorder video (real time). |
| `js/app/state.js` | The store: one `edit()` is one undo step; `live()`/`commitLive()` make a drag one step. |
| `js/app/actions.js`, `actions-keys.js` | What the UI and the commands call. Copy and paste go through `SlopBuffer` too. |
| `js/app/io.js` | Slop Drive save and open (kind `effects`, `meta.kind`), media from computer and Drive, relink, config kind. |
| `js/app/cmd.js` | Keyboard shortcuts and SlopCmd palette entries. |
| `js/app/ai-commands.js`, `ai-ops.js` | Commands with arguments (`fx.ai.*`) for the Slop AI panel, WebMCP and macros: new project, composition, add/edit/duplicate/reorder/delete layer, set property, add keyframe, add/set/remove effect (clamped to `defs`), animate in and out, random motion, media from Drive, render to Drive (progress in `#fx-status`, stops on `ctx.signal`), go to time. Each is one undo step; `SlopCmd.provide({ state, checkpoint })`. Test: `tests/effects/ai-commands.test.html`. |
| `js/ui/*.js` | Preview, transport, timeline (and key dragging), graph editor, layer panel, effects and motion panels, menus, render dialog. |
| `js/main.js` | Boot and wiring. `window.SlopEffects.app` exposes the store and actions for tests. |

Namespace: `window.SlopEffects` (`defs`, `core`, `values`, `layers`, `keys`, `motion`, `history`, `project`, `fx`, `draw`,
`media`, `render`, `state`, `actions`, `actionsKeys`, `io`, `cmd`, `ui` parts).

## The document

Plain JSON, from `core.newDoc()`:

- `comp`: `{ width, height, fps, duration, background }` (`background` is `#rrggbb` or `transparent`).
- `layers`: index 0 is the top of the stack. Each layer has `id`, `name`, `type`, `hidden`, `parent` (a layer id or null),
  `base` (static `position`, `anchor`, `scale` in %, `rotation` in degrees, `opacity` in %), `source` (type fields) and
  `effects` (in the order they are applied: `{ id, kind, on, seed, params }`).
- `tl`: a `SlopMotion` timeline. Targets are layer ids. Properties are `position`, `anchor`, `scale`, `rotation`,
  `opacity`, and `fx.<effect id>.<number parameter>`. A property with keys is animated; without keys it is the base value.
- `media`: the bin records this project uses (`id`, `name`, `kind`, `w`, `h`, `dur`, `size`, `driveId`). Files are not embedded.

Rows for Drive and config (`project.toData`): keys become `{ layer, prop, t, x, y, ease }` rows because the shared config
schema has no free-form values. Ease is a name (`linear`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `hold`) or
`bez:x1,y1,x2,y2`.

## Files and sharing

- Slop Drive: a JSON file `{ format: "slop-effects", version: 1, name, data }` with `meta.kind = 'effects'` and a name
  ending `.effects.json`. Open checks it through `SlopConfig.validate` (kind `effects-project`, app `effects`) and
  `project.problems`.
- Config: kind `effects-project`, app `effects`, registered at boot in `app/io.js` (`registerConfig`). Export is
  `SlopConfigDialog` ▸ File ▸ Config.
- Media: a project lists its media by name, size and Drive id. On open, matched media is bound to the bin; the rest is
  listed in a "Missing media" dialog, keeps its layers, and can be relinked from the layer panel.

## Reuse

- `shared/motion`: easing, track sampling, timeline format, playback (play, loop, and play range by seeking back),
  presets (animate in and out map their `translate`, `scale`, `rotate` and `opacity` tracks onto layer properties).
- `shared/video/seed.js`: `rng`, `hash`, `parse`, `make`, `hex` (Random motion, grain, glitch, effect seeds).
- `shared/buffer`: key copy and paste (`clipboard` kind, source `effects`, `system: false`).
- `shared/fonts/picker.js`: the text font list and "Get more". `SlopFonts.stack` is used by the draw.
- `shared/config`: validation, export and import of the `effects-project` kind.
- `shared/hub.js`, `shared/drive/picker.js`: Slop Drive save, open and media pickers.
- `shared/commands`: palette, shortcut keys and the search button.
- `shared/theme`, `shared/slopui`: theme tokens, dialogs, menus, toasts.
- `shared/office/zip.js`: the PNG sequence zip.
- Not reused: `shared/presets` does not exist yet, so the effect list lives in `js/model/defs.js`. The effect drawing
  (grain tile, glitch slices, vignette) follows `remix/js/fx.js`, which is not under `shared/`; the same ideas are written
  again in `js/render/fx.js`. Moving that drawing into `shared/video` would let both use one copy.

## Tests

- `node tests/run.mjs effects` runs `tests/node/effects-model.test.mjs` (keyframe interpolation through the shared engine,
  easing, hold, parenting maths, loop refusal, seeded random motion and its bounds, animate in and out, copy and paste,
  undo and redo, duplicate, the config round trip with `SlopConfig` validation, `problems`, Drive file text) and
  `tests/effects/effects.test.html` (the real store and actions add a layer and a keyframe, and the real draw renders a
  frame whose pixels are checked; colour correction; seeded motion through the actions; copy and paste across layers).
  The runner's name filter also matches `photoslop/effects`, so its PhotoSlop tests run too.
- Verified by hand in headless Chromium (not automated): the Layer, Effects, Motion and Graph panels, the stopwatch,
  dragging a key (one undo step), the Render dialog (PNG zip download), the config import and export round trip, the
  missing-media dialog, and the phone layout with no horizontal scroll.

## Shortcuts

Ctrl/⌘+Z undo, Shift+Z redo, Ctrl+C and Ctrl+V keys (when a key is selected, and at the playhead on the selected layer),
Delete removes the selected keys or the layer, Space play or pause, Home and End, Left and Right step a frame (Shift for
ten), Alt+Left and Alt+Right nudge the selected keys a frame, `[` and `]` move the layer down and up, Ctrl+D duplicates,
Ctrl+Shift+N solid, Ctrl+Shift+T text, I and O set the play range, Alt+X clears it, L toggles loop, Ctrl+E render,
Ctrl+S save to Drive, Ctrl+O open from Drive, Ctrl+K command search.

## Limits and what is left

- Expressions are out of scope for version one (the UI says so).
- Not yet: layer in and out points, colour and text keyframes, multi-key selection with a marquee, keyframe velocity
  editing, masks, track mattes, audio, 3D, auto-save (a project lives in the tab until saved to Drive), undo history across
  a reload, a per-layer effect preview, and a bounding-box handle to drag layers on the preview (the layer outline is shown).
- Blur and colour use `ctx.filter`. Browsers without it (Safari before the flag) skip those two effects; drop shadow and
  glow use the canvas shadow and still work.
- A video is recorded in real time (MediaRecorder paces the frames), so a 10 s comp takes about 10 s. The PNG sequence
  runs as fast as it can draw and keeps transparency. The whole sequence is held in memory before the zip is written, so
  long renders at 4K need a lot of memory; split long comps.
- Media: video layers use the clip's own time (no in point). Large files load fully into memory.
- The page is not in the service worker's precache, and is not in `shared/apps.js` (see below), so it is not offline yet.

## Needed outside this folder (not done here)

1. `shared/apps.js`: add the registry entry. Until it is there, config import and export, and Slop Drive open (which validates
   through `shared/config`), refuse the `effects` app with "not an app in the registry". Saving to Drive works without it.
   Suggested entry:
   `A('effects', 'app', 'Slop Effects', 'effects/', 'Motion design in the browser. Nothing uploaded.', { group: 'creative', accepts: ['application/json', 'image/*', 'video/*'], features: ['Layers, keyframes and easing', 'Graph editor and seeded random motion', 'Blur, glow, shadow, colour, grain, vignette, glitch', 'WebM, MP4 and PNG sequence'], icon: 'film', status: 'beta' })`
2. `service-worker.js`: add `effects/` to the precache list so the app works offline.

## Phone layout (SlopSheet)
Under 760 px the Properties side panel (Layer, Effects, Motion) is a bottom sheet, `SlopSheet.attach` from
`shared/ui/sheet.js` (see `shared/ui/HANDOFF.md`) in `js/main.js` (`SlopEffects.app.sheet`). The Properties button in the
toolbar (phone only) opens and closes it; the shared ×, Escape, a tap outside and a swipe down close it; Motion from a
command opens it on that tab. The preview and the timeline share the page; before, the panel sat between them in a long
scrolling page. Test: `tests/effects/phone.test.html`.
