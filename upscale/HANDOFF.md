# Slop Upscale (upscale/)

Enlarges pictures 2× or 4× and short videos (up to 15 s), on the device. Nothing is uploaded. The AI runs in
ONNX Runtime Web (WebAssembly, one thread) inside a worker. Without a model the picture is enlarged with Lanczos
resampling, and the page says so. Originals are never changed; results are copies: downloaded, or saved to
Slop Drive in a "Slop Upscale" folder.

## Files (all ≤300 lines)
| File | What it does |
|---|---|
| `index.html` | Markup and load order. Shared: slopui, apps, hub, guard, frame (SlopFrame), sheet, menubutton, zip. Vendored: mp4-muxer, webm-muxer. |
| `css/upscale.css` | Tokens (dark, light), the files list, the view column, the slider. The three columns and the phone sheet are shared/frame/frame.css. |
| `js/core/tiling.js` | Pure: `plan(W, H, {tile, overlap})` gives the cores and padded source rectangles; `cropRGBA`, `placeRGBA`, `scaleRect`. |
| `js/core/lanczos.js` | Pure: Lanczos-3, separable, on RGBA. Used for the fallback and the colour of the Fast model. |
| `js/core/models.js` | The model registry: path, size, SHA-256, scale, channels, licence, whether it is bundled. |
| `js/engine/engine.js` | Page side: starts the worker, one request per tile, `cancel()` terminates the worker at once. |
| `js/engine/worker.js` | Worker: ONNX Runtime Web (`ort.wasm.min.mjs`, WebAssembly only), sessions, per-tile inference. |
| `js/engine/pipeline.js` | Page side: `run(canvas, {scale, model, bytes})` tiles the picture and paints each core into the output canvas. Size limit: 64 MP, 16384 px a side. |
| `js/app/io.js` | Decode (createImageBitmap, `<img>` fallback), encode (PNG, JPEG, WebP; refuses a silent PNG fallback), file names. |
| `js/app/slider.js` | Before and after: the result clipped at a range input (mouse, touch, keys). |
| `js/app/drive.js` | Slop Drive: the "Slop Upscale" folder (tagged `app: upscale`), save, pick. |
| `js/video/run.js` | Video: seek each frame in a muted `<video>`, upscale it, `VideoEncoder`, mux to MP4 (H.264) or WebM (VP9). |
| `js/app/main.js` | Controller: the files (each opened file joins the list), open, drop, Drive, `?drive=<id>` from Resize, run (one, or every file not done), progress, cancel, Get more. |
| `js/app/layout.js` | The page as SlopFrame's List · View · Panel: files left (two or more), picture centre, settings + Result actions in the right panel, Upscale / Upscale N pictures / Cancel in the panel's footer. |
| `js/app/output.js` | Download, Download all (ZIP), Save to Slop Drive, Open in… (SlopOuttake items). Files (Open, drops, Drive, ?drive=) come in through shared/intake (spec `upscale`, up to 50, each joins the list). |

Layout (the suite rule, shared/frame/HANDOFF.md): the header holds only Open… and From Slop Drive… (plus the shared
buttons and SlopFrame's "Settings" show/hide button). Everything else is in the right panel: Size, Model, Output, Result
(Download, Download all (ZIP) with two or more done, Save to Slop Drive, Open in…, Remove/Clear) and, stuck to its foot,
the main button. Phones (≤900 px): the list is the page, the panel is a bottom sheet; while closed it still shows its foot
(Settings + Upscale). Keys: Ctrl+Enter upscales, Esc cancels a run.

Tests: `tests/upscale/panel.test.html` (the panel on the right at 1280, a real 2× Fast and 4× Lanczos run from the
panel's button, two files, Ctrl+Enter and Esc, the phone sheet at 390), `tests/node/upscale-tiling.test.mjs` (tiling, stitching, Lanczos; no browser) and
`tests/upscale/upscale.test.html` (2× of a generated 100 × 100 picture to 200 × 200 with the Lanczos fallback and
with the bundled Fast model; the opt-in Real-ESRGAN file passed as bytes, 4×; cancel; the size limit; the registry
against `vendor/models/upscale/index.json`). Run: `node tests/run.mjs upscale`.

## Models
Converted to ONNX by the scripts in `vendor/models/tools/` from the official weights. Each conversion is checked
against its source framework before the file is written. The list, hashes and sources are in
`vendor/models/upscale/index.json`. Licence texts sit next to each model.

| Model | Scale | Bundled | Size | Licence | Source |
|---|---|---|---|---|---|
| FSRCNN x2 (Fast) | 2× | yes | 35 KB | Apache-2.0 | Saafke/FSRCNN_Tensorflow `models/FSRCNN_x2.pb` (checked against TensorFlow: error 7e-7) |
| FSRCNN x4 (Fast) | 4× | yes | 38 KB | Apache-2.0 | Saafke/FSRCNN_Tensorflow `models/FSRCNN_x4.pb` (error 7e-7) |
| Real-ESRGAN x4plus (Quality) | 4× | no, opt-in | 64 MB | BSD-3-Clause | xinntao/Real-ESRGAN `RealESRGAN_x4plus.pth` (v0.1.0, `params_ema`; error 1e-6) |

- Sizes: `bytes` in `js/core/models.js` is the one source. The page's Quality size (`#up-quality-size`) and the first-use
  notice both write it with `SlopFirstRun.size` (1 MB = 1024 × 1024 bytes, as Get more does), so they always agree.
- FSRCNN works on Y only. Colour comes from Lanczos, and only the luminance is replaced by the network's output.
- Real-ESRGAN: the code is BSD-3-Clause. The weights are published in the same repository under that licence;
  no separate weights licence is given (noted in `index.json`). Its training data (DF2K, OST) is not redistributed.
- FSRCNN weights from yjn870/FSRCNN-pytorch were not used: that repository has no licence file, and its weights
  sit on a file host this build cannot reach.
- Quality is 4× only. At 2× the Quality option is disabled. Fast has both scales.

### Opt-in Real-ESRGAN (Get more)
`shared/library/packs.json` has one model pack, `realesrgan-x4plus` (kind `model`), with its licence, size, URL and
SHA-256. Get more shows them before anything downloads. The file is stored in the library database
(`slop-library`), and the worker checks its size and SHA-256 again before it loads it. The worker never fetches a
model that is not bundled.

The file is `models/upscale/realesrgan-x4plus.onnx` in the cdn repository (`"cdn"` in packs.json). At 64 MB it is over
jsDelivr's 20 MB limit, so it comes from `raw.githubusercontent.com` at the release tag until the Hugging Face copy exists
(see shared/cdn/HANDOFF.md). The cdn repository uses no Git LFS (jsDelivr would serve the pointer).

## How a run works
1. The picture is decoded to a canvas. `plan()` cuts it into 128 px cores, each read with 16 px of context on every
   side (clamped to the picture, so the edges are real edges).
2. For each tile, the page reads the padded pixels and sends them to the worker. The worker returns the tile at
   scale. The page keeps only the core and paints it into the output canvas, so memory stays bounded by the tile and
   the output canvas, not by the model.
3. Progress is per tile. Cancel terminates the worker, rejects the waiting tile, and the next run starts a new one.
4. Without a model (Lanczos only, or Quality not installed) the same tiling runs with Lanczos in the worker. The status
   line names the fallback.

Video: frames are read at 24 or 30 fps by seeking, each frame goes through the same pipeline, and the frames are
encoded in order. Sound is not copied (said in the UI). Clips over 15 s are refused.

## Resize and Slop Drive
- Slop Resize: each row has an "Upscale…" button. It sends the result if the row is done, otherwise the original,
  via `SlopHub.sendTo('upscale', …)`. Upscale opens on the file through `?drive=<id>`.
- Upscale saves results to Drive in the "Slop Upscale" folder (tagged `app: upscale`).
- The registry entry for Upscale is in `shared/apps.js` (accepts `image/*` and `video/*`).

## Limits and known gaps
- The Fast model is quick. Quality (Real-ESRGAN) runs on the CPU and is slow: the page does not estimate time. Video
  with Quality is very slow.
- Tile seams: the 16 px overlap is a default. Real-ESRGAN's receptive field is larger than that, so seams can show on
  fine texture. Raising `overlap` in `pipeline.js` trades speed for fewer seams.
- MP4 output needs an H.264 encoder. The headless test browser has none, so the MP4 branch was not run here. WebM
  (VP9) was run end to end.
- WebGPU is not used. The model runs single-threaded WebAssembly, because the site has no SharedArrayBuffer.
- Files run one after the other (no parallel runs). While a run goes, other files cannot be selected.
- The service worker (`service-worker.js`) was not changed, so the new files are not precached and Upscale will not
  work offline until the precache list is updated.
- Model files are served from the site. Only the bundled ones are loaded by default; the Real-ESRGAN file is in the
  repository, but the page loads it only from the library after Get more.

## Rebuilding the models
```
python3 -I vendor/models/tools/upscale-fsrcnn.py FSRCNN_x2.pb fsrcnn-x2.onnx FSRCNN_x4.pb fsrcnn-x4.onnx   # needs tensorflow-cpu, onnx, onnxruntime
python3 -I vendor/models/tools/upscale-realesrgan.py RealESRGAN_x4plus.pth realesrgan-x4plus/model.onnx   # needs torch (CPU), onnx, onnxruntime
```
Run them from a scratch directory, never inside the repository. Afterwards update the sizes and SHA-256 in
`js/core/models.js`, `vendor/models/upscale/index.json` and `shared/library/packs.json` together, or the registry test fails.

## Commands and the assistant (`js/app/commands.js`, `js/app/ai-commands.js`)
The page now loads SlopCmd: `up.open`, `up.drive`, `up.run`, `up.download`, `up.save`, `up.clear` press the page's own
buttons. `SlopCmd.prepare()` loads `ai-commands.js`: `new_upscale` (clear; destructive), `add_file` (`file` from Slop Drive or
`url` on this site, through `open()`, so the first-use notice still asks), `set_upscale` (scale, model, format, quality, fps),
`upscale` (runs and waits), `save_result` (`to` drive | download | both), with `state` and a settings checkpoint. Test:
`tests/upscale/ai-commands.test.html`.
