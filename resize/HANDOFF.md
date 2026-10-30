# Slop Resize (resize/)

Resizes pictures and videos to a target size, percentage, long edge or file size limit, in the browser. Nothing is
uploaded. Originals are never changed; results are copies, downloaded or saved to Slop Drive.

## Files (all ≤300 lines)
| File | What it does |
|---|---|
| `index.html` | Markup and the load order. Shared: slopui, apps, hub, zip, commands, shell. Vendored: mp4-muxer, webm-muxer. |
| `css/resize.css` | Tokens (dark, light), the queue rows, the settings' own controls. The view and the right panel (a bottom sheet on phones) are shared/frame/frame.css. |
| `js/core/size.js` | Pure geometry: `SlopResize.size.dims(src, spec, opts)`, `normalize`, the size presets. No DOM. |
| `js/core/format.js` | Kind of a file (picture or video), output names, byte sizes, which image types the browser writes. |
| `js/image/image.js` | Pictures: decode, draw (halving steps for big reductions, high smoothing), encode, file size search. |
| `js/video/probe.js` | Video: WebCodecs and muxer support (probed for real), a muted `<video>` element, frame seeking, duration. |
| `js/video/audio.js` | Keeps the audio: decodes the first audio track, resamples to 48 kHz stereo (OfflineAudioContext). |
| `js/video/encode.js` | Encoder and muxer choice: H.264, VP9, VP8, AV1 for video; AAC or Opus for audio; the muxers. |
| `js/video/run.js` | Video pipeline: seek each frame, draw it at the placement, encode, feed audio, mux. Cancellable. |
| `js/app/queue.js` | The batch: items, one run at a time, a settings snapshot per run, progress, cancel. |
| `js/app/settings.js` | The panel ⇄ settings object, saved-settings checks, `toRun`, which rows show for each mode. |
| `js/app/drive.js` | Slop Drive: the "Slop Resize" folder, saving results, opening from Drive, the presets file. |
| `js/app/presets.js` | Saved settings (Drive, or localStorage without Drive) and their panel buttons. |
| `js/app/list.js` | The queue rows: thumbnail, before and after (pixels and bytes), progress, status, actions. |
| `js/app/commands.js` | SlopCmd commands (`rs.*`), with their keys. Settings commands use the panel's own controls. `SlopCmd.prepare()` loads ai-commands.js. |
| `js/app/ai-commands.js` | Assistant commands with arguments (hidden from the palette): `set_size`, `set_output_format`, `resize_all`; `SlopCmd.state()` summary and the settings checkpoint. Loaded on demand. Test: `tests/resize/ai-commands.test.html`. |
| `js/app/main.js` | Controller: open, drop, Drive, run, cancel, download (one file or zip), save, engine checks, boot. |
| `js/app/layout.js` | The page as SlopFrame's View · Panel: the queue in the middle; Size, Output, Saved settings and Results (Download / Download all (ZIP), Save to Slop Drive, Open in…, Clear) in the right panel; Resize / Resize N files / Cancel at its foot (the suite rule, shared/frame/HANDOFF.md). The header keeps Open… and From Slop Drive…. Test: `tests/resize/panel.test.html`. |

## Settings and geometry
A spec (`size.normalize`) has `mode` (`size` box, `bytes` box + file limit, `scale` %, `long` edge), `w`, `h`
(0 = follow the picture), `keepRatio`, `fill` (`fit` letterbox, `cover` crop, `stretch`, `within` = fit inside with
no padding), `anchor` (where a crop or letterbox sits), `bg` (`#rrggbb` or `transparent`; video treats transparent
as black, JPEG as white), `even` (round to even sides; always on for video), `maxBytes` (images only).
`size.dims` returns `{ w, h, x, y, dw, dh, fill }`: the output size and where the picture is drawn in it.
Rules: keepRatio off stretches; keepRatio with one side derives the other; `within` never grows past the box.
Sizes over 16384 px a side, 100 MP, or 8192 px for video are refused with a message.

## Images
Decoded with `createImageBitmap` (`imageOrientation: 'from-image'`), an `<img>` as the fallback. Output: JPEG, PNG,
WebP or AVIF, only the types `format.imageSupport()` confirms (it checks the MIME type that comes back). A file
size limit binary-searches the quality (0.05 to the chosen quality, 7 steps) for JPEG, WebP and AVIF; PNG cannot
be made smaller by quality, so the note says so.
Shrinking halves in steps (each step 2×2 averaged) until the drawn size is within 2×, then one smooth draw. The
Resampling choice 'nearest' skips the steps and keeps hard pixels (pixel art). Transparency: PNG, WebP and AVIF keep
it (nothing is painted behind the picture unless a background colour is chosen). JPEG has no alpha, so Transparent
is switched off and explained in the panel; the transparent parts are filled with the Background colour (white by
default), and a note says so when the picture really had transparency.
Keep aspect ratio: with Fill = Fit or Cover the box (a preset, or a typed width and height) is kept exactly; the
picture keeps its shape inside it (letterbox or crop), and adding a picture never rewrites the box (`size.locksBox`).
With Fit inside or Stretch the other side follows the first picture in the list (its real width ÷ height), derived
from the typed value only (settings.js `follow`, geometry in size.js `lockSide`), so editing does not drift. A side
left at 0 follows the picture in any fill. Without a picture there is no ratio, and the lock does nothing.
Tests: `tests/resize/box.test.html` (presets and typed boxes, Fit, Cover, Fit inside, a 0 side) and the
lock cases in `resize-fixes.test.html`.

## Videos
Needs WebCodecs (`VideoEncoder`, `VideoFrame`, `AudioEncoder`) and the vendored muxers. Without them the panel
says so, video rows fail with that reason, and images still work. MP4 needs an H.264 or VP9 encoder; WebM needs
VP9, VP8 or AV1. The format select disables what the browser cannot write and picks the other one. Frames are
read by seeking a `<video>` element (no demuxer is needed, so any container the browser plays works), at the chosen
frame rate (24, 25, 30, 50, 60). Bitrate is pixels × fps × bits per pixel (low 0.05, medium 0.1, high 0.17).
Audio: decoded by the browser (AAC, Opus, MP3 and so on); if it cannot be decoded, the output has no sound and the
row says so.

## Queue, Drive and presets
- The queue runs one file at a time with the settings taken at the start of the run. Cancel stops after the current
  step; the rest become "cancelled".
- Download all: one file for one result, a zip (shared `SlopZip`) for more. Names are `<name>-<W>x<H>.<ext>`, with
  " (2)" added to a duplicate.
- Slop Drive: results go to a root folder named "Slop Resize" (tagged `app: 'resize'`), created on first use. Opening
  from Drive uses the picker; `?drive=<id>` (from another app's "Send to") is read on load and added to the queue.
- Presets: the shared `SlopPresets` only holds effect and motion presets, so they are not used. Saved settings are
  one JSON file, `Resize presets.json`, in the Slop Resize folder (meta type `resize-presets`). Without `SlopHub`
  on the page they are kept in localStorage (`slop.resize.presets`).

## Keys and commands
`Mod+O` open, `Shift+Mod+O` from Drive, `Mod+Enter` resize all, `Esc` cancel, `Mod+S` zip, `Shift+Mod+S` save to
Drive, `Shift+Mod+P` save settings as a preset. SlopCmd also lists the size presets (`rs.target.*`), the modes
(`rs.mode.*`) and the fill modes (`rs.fill.*`).

## Registry entry (not added here: shared/apps.js and service-worker.js are not part of this app)
Add to `window.SLOP_APPS` in `shared/apps.js`:
```js
A('resize', 'app', 'Slop Resize', 'resize/', 'Resize pictures and videos to a size, a percentage or a file limit. Nothing uploaded.', { group: 'creative',
  accepts: ['image/*', 'video/*'],
  features: ['Presets for social, email and 4K sizes', 'Fit, cover, stretch and fit-inside, with an anchor', 'Pictures to a file size limit', 'Video to MP4 or WebM with the audio kept'],
  icon: 'film', status: 'beta' }),
```
Without it, "Send to" from other apps cannot open this app. The Slop Resize folder in Drive works either way.
Offline: `service-worker.js` precaches each app's files explicitly, so the `resize/` files (and `vendor/mp4-muxer`,
`vendor/webm-muxer`) need adding there for offline use.

## Tests
- `tests/node/resize-size.test.mjs` (`node --test`): fit, cover (with anchors), stretch, within, one-side ratios,
  scale, long edge, even rounding (video), within never growing, limits, normalize, presets, names.
- `tests/resize/resize-fixes.test.html` (browser): shrinking is smooth (and nearest is hard, so the check can fail),
  enlargement, PNG/WebP transparency kept, JPEG filled white or with the chosen colour and noted, the aspect lock in
  the real panel (in an iframe), and the output of a locked width.
- `tests/resize/resize.test.html` (browser): a generated 1000×500 PNG to 500×500 cover is 500×500, the left of the
  output is the red half and the right the blue (cover crops the middle); JPEG; probe; the file limit; the format
  and video probes; the queue end to end; a non-picture file is an error.
- Run: `node tests/run.mjs resize`.
- Checked by hand in headless Chromium (not in the suite): a batch PNG run, the Drive folder and presets, a short
  WebM video resized to 320×180 with its result, the phone width without horizontal scroll. Headless Chromium here
  has no H.264 encoder, so the MP4 path has not been run.

## Limits and follow-ups
- Video is read by seeking, one seek per output frame, so it is not real time. Speed was only checked on a 1.5 s
  clip; time a long clip before relying on it.
- Rotated phone videos are used at the size the browser reports for them.
- No EXIF is copied to results (the canvas output has none). SlopClean removes metadata; Slop Resize does not add it.
- Send-to menus in the other apps need the registry entry above.

## Camera RAW (uses `shared/raw/`)
`format.kind` treats RAW extensions as images; `image.probe` measures a RAW from its embedded preview (and gives the list a preview thumbnail) with no engine; `image.load` develops it in full with the camera's white balance (`SlopRaw.image` mode full), or uses the preview and sets `note` when the engine cannot run or is declined. Test: `tests/resize/raw.test.html`.

## Assistant: batches (`js/app/ai-files.js`)
Loaded by `SlopCmd.prepare()` after `ai-commands.js` (with `shared/commands/sources.js`): `new_batch` (empties the list;
destructive), `add_files` (`files[]` Slop Drive names or ids, `urls[]` same-site pictures, through `SlopIntake.take` like a
drop) and `save_results` (`to` drive | download | both: the app's own Save to Slop Drive and Download all). Test:
`tests/resize/ai-files.test.html`.
