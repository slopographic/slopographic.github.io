# shared/cdn: where Slopographic's own files are served from

The apps' optional downloads (AI models, WebAssembly engines, the ffmpeg core, font packs) live in the public
repository [github.com/slopographic/cdn](https://github.com/slopographic/cdn). `shared/cdn/assets.js` is the only file
that knows how they are served. Everything else names a file by its **path in that repository**
(`models/ocr/ppocr-det-v4/ch_PP-OCRv4_det_infer.onnx`) and asks the module for URLs.

| Place, in order | URL | Used for |
|---|---|---|
| jsDelivr | `https://cdn.jsdelivr.net/gh/slopographic/cdn@<TAG>/<path>` | every file up to 20 MB |
| Hugging Face (not set up yet: `HF = null`) | `https://huggingface.co/<HF.repo>/resolve/<HF.rev>/<path>` | the files over 20 MB, first, once set |
| GitHub | `https://raw.githubusercontent.com/slopographic/cdn/<TAG>/<path>` | the fallback for everything; the only place for files over 20 MB today |

## The API (window.SlopCdn, or `require('shared/cdn/assets.js')` in Node; ES modules `import` it and use `globalThis.SlopCdn`)

- `urls(path)`: the places, best first. `url(path)`: the first one (what model lists store and what a test cache keys on).
- `candidates(url)`: every place of a cdn URL at the current tag; any other URL alone.
- `isCdnUrl(url)`: https, this repository only, on jsDelivr, GitHub or the HF copy (any ref). The model index
  (`aitools/model-registry.js`) and the pack installer (`shared/library/install.js`) use it for the host check.
- `fetchVerified(target, want, deps)`: the one download path. Tries each place in order; a network error, an HTTP
  error, a redirect off the allowed hosts, a wrong length or a wrong SHA-256 moves on to the next place, and
  `onBytes` starts from 0 again. A cancel (`deps.signal`) never falls through. Used by `aitools/download.js` (models,
  with progress and file parts), `shared/library/install.js` (font packs, the HEIC and RAW engines, Upscale and depth
  models), `shared/3d-io/decoders.js` and `convert/js/core/ffmpeg-engine.js`.
- Data files: `shared/library/packs.json` files name `"cdn": "<path>"` instead of a URL; `manifest.js` turns it into
  `url` (the first place) and keeps `cdn` for the installer.

Pages that load `aitools/speech-models.js` or `aitools/ocr-models.js` load `shared/cdn/assets.js` first (before
`shared/models/catalog.js`). `install.js`, `aitools/models.js` and `shared/ocr/choose.js` load it themselves when a page has not.
The service worker only handles same-origin requests, so it never touches these downloads; the files are kept in IndexedDB
by the installers (and the ffmpeg core in the HTTP cache).

## Limits (checked 2026-10-24)

- jsDelivr, GitHub files: **20 MB per file** (`File size exceeded the configured limit of 20 MB.`, HTTP 403, seen for
  21 234 383 bytes; a 16 631 306-byte file is served). Packages over 150 MB "are not supported by default", but for
  `/gh/` single files are served from this 1.6 GB repository without trouble (all 348 files under the limit answer 200).
  Source: [jsDelivr README, Restrictions and Caching](https://github.com/jsdelivr/jsdelivr#readme).
- Caching: a fixed version or a commit is cached "effectively forever" (`cache-control: max-age=31536000, immutable`), and
  jsDelivr keeps its own permanent copy; branches are cached 12 hours and version aliases (`@latest`, ranges) 7 days.
  So the site always uses a fixed tag: a published tag can never be changed, only replaced by a new one.
- Git LFS: the cdn repository uses none (every file is a normal Git blob, the big ones split into parts under 95 MB,
  since GitHub refuses files over 100 MB). jsDelivr would serve an LFS pointer, not the file, so keep it that way.
- raw.githubusercontent.com: about 5 minutes of caching, rate limits, slow for big files. It stays the fallback.

## The files over jsDelivr's limit (served from GitHub until the Hugging Face copy exists)

They are `OVER` in `assets.js`, with their sizes; `tests/node/cdn-assets.test.mjs` fails if a file over 20 MB is missing
from it or an entry is stale. On 2026-10-24 (v2026.10.24), 25 files, 1 476.8 MB:

| File | Bytes |
|---|---|
| engines/ffmpeg/0.12.10/ffmpeg-core.wasm | 32 232 419 |
| models/depth/depth-anything-v2-small.onnx | 27 258 801 |
| models/ocr/ppocr-v6-small/PP-OCRv6_rec_small.onnx | 21 234 383 |
| models/upscale/realesrgan-x4plus.onnx | 67 051 618 |
| models/whisper/whisper-tiny/decoder_model_merged_quantized.onnx | 30 727 765 |
| models/whisper/{whisper-base, whisper-base-en, kb-whisper-base, nb-whisper-base}/encoder_model_quantized.onnx | 23.1 to 23.2 MB each |
| models/whisper/{whisper-base, whisper-base-en, kb-whisper-base, nb-whisper-base}/decoder_model_merged_quantized.onnx | 52.7 to 53.7 MB each |
| models/whisper/{whisper-small, whisper-small-en, kb-whisper-small, nb-whisper-small}/encoder_model_quantized.onnx | 92.2 to 92.3 MB each |
| models/whisper/{…-small}/decoder_model_merged_quantized.onnx.part1 and .part2 | 94.4 MB and 60.8 to 62.4 MB each |

Everything else (348 files, 218.5 MB: the font packs, the OCR models, the Whisper vocabularies and configs, the
whisper-tiny encoder, the HEIC, RAW, Draco, meshopt and Basis engines, ffmpeg-core.js) comes from jsDelivr.

## Publishing a new asset version

1. Add or change the files in the cdn repository (`/mnt/nvme4tb/dev/slopographic/cdn`), with their manifest.json,
   licence and SOURCE.md, commit and push to `main`. Never change a file in place that a released tag already has
   under the same path if old site versions might still ask for it; add a new folder (`v2/`) instead.
2. Tag the commit with the date: `git tag -a vYYYY.MM.DD -m "…" && git push origin vYYYY.MM.DD` (the test requires
   `v<year>.<month>.<day>`; for a second release on one day, use the next day's date). Never move or delete a tag.
3. In this repository, change `TAG` in `shared/cdn/assets.js` (the one place), add the new paths, sizes and SHA-256 to the
   file that uses them (a model list, `packs.json` with `"cdn": "<path>"`, an engine's FILES), and list any new file over
   20 MB in `OVER` with its size.
4. `node tools/check-cdn.mjs` (CI runs it in the check job) HEADs every first place and checks status 200, jsDelivr's
   `x-jsd-version` and the size; `--all` checks the GitHub fallbacks too. A file jsDelivr compresses has no length in
   its answer; its size is then read from the GitHub copy at the same tag.

## The Hugging Face move (later; HF_TOKEN will be in the workspace .env)

Upload the repository (or only the `OVER` files) to a Hugging Face repo, at a revision named like the tag, then set
`HF = { repo: 'datasets/slopographic/cdn', rev: TAG }` (or `slopographic/cdn` for a model repo). The `OVER` files then
come from Hugging Face first and GitHub second; `HOSTS` gains `huggingface.co`, and Hugging Face's storage redirects
(`*.hf.co`, `*.xethub.hf.co`) are already allowed by the model index. Also allow them in `install.js` (its host check is
`packs.json` hosts or `isCdnUrl`, which does not know the storage hosts) before moving the Upscale and depth packs. Update
the tests' `HF` expectations and `tools/check-cdn.mjs` (Hugging Face answers HEAD with a redirect and `x-linked-size`).
