# Slop AI Tools: handoff

`aitools/` is a hub of five on-device AI tools. Each model is optional: nothing downloads until a person presses
**Get more…** and then **Download** in the dialog, which shows the model's licence, upstream project, source host
and size before anything is fetched. Nothing is uploaded: files are read in the page and handed to a worker.

App entry: `shared/apps.js` (`aitools`, "Slop AI Tools", group `creative`). Service worker: not updated, so the new
pages are not precached for offline use yet (`service-worker.js` lists its files by hand).

## Files

| File | What it does |
|---|---|
| `index.html`, `hub.js`, `aitools.css` | The hub: tool cards with status, and the model list with Get more and Remove |
| `model-registry.js` | The model index: licence, upstream, source, files, SHA-256, sizes; the tool list. Node-testable |
| `models.js` | The model manager (`window.SlopAIManager`): status, install, remove, read. IndexedDB `slop-aitools` |
| `get-more.js` | The licence dialog (`window.SlopAIGetMore`). Opening it fetches nothing |
| `support.js` | Device checks with plain reasons (`window.SlopAISupport`) |
| `common.js` | Worker client, model loading, gating, file helpers, Slop Drive and Slop Docs hand-off |
| `workers/infer.worker.js` | The inference worker. Every model runs here |
| `workers/ort.js`, `ocr-engine.js`, `speech-engine.js`, `classify-engine.js` | ONNX Runtime loader and the three engines |
| `workers/whisper-logits.js`, `whisper-quality.js`, `whisper-decode.js`, `whisper-longform.js` | Whisper's long-form algorithm, pure and Node-tested: logit rules, quality fallback, no-speech skip, seek |
| `speech-models.js` | The speech models (a family of the shared chooser, `shared/models/`), files on slopographic/cdn |
| `download.js` | One model file, or its parts joined, with every hash checked; progress and cancel |
| `ocr/`, `speech/`, `denoise/`, `tags/`, `portrait/` | The five tool pages |
| `denoise/filters.js` | Median and bilateral filters (classic, no model) |
| `tests/node/aitools-models.test.mjs` | Node test of the model index (licence, hash format, URLs, tools) |
| `tests/aitools/hub.test.html` | Browser test: five tools with status, no download on open, licence before download, a download needs a click, a bad file stores nothing |

## Models

Every remote file is downloaded from its `url` only after a click, must match its byte length and SHA-256 exactly,
and is stored in IndexedDB (`slop-aitools`) in one transaction with its model record. Remote hosts are limited to
`huggingface.co` and its storage hosts (`HOSTS` in `model-registry.js`), checked on the final URL after redirects.
Bundled files are read from `vendor/models/` and checked against the same index.

| Model (id) | Used by | Licence | Source | File | Bytes | SHA-256 |
|---|---|---|---|---|---|---|
| Speech models (`whisper-tiny`, `whisper-base`, `whisper-small`, `whisper-base-en`, `whisper-small-en`, `kb-whisper-base`, `kb-whisper-small`, `nb-whisper-base`, `nb-whisper-small`) | Speech to text, Slop Transcribe | MIT (OpenAI Whisper) or Apache-2.0 (KB-Whisper by KBLab, NB-Whisper by NbAiLab) | slopographic/cdn `models/whisper/<id>/` at the commit pinned in `speech-models.js`, each folder with its licence, SOURCE.md (Hugging Face repo and revision) and manifest.json | int8 encoder and merged decoder, vocab, added tokens, config, generation config | see `speech-models.js` | per file there; files over 95 MB in 90 MiB parts |
| PP-OCRv4 mobile (`ppocr-v4`) | OCR | Apache-2.0 (PaddleOCR, github.com/PaddlePaddle/PaddleOCR) | huggingface.co/SWHL/RapidOCR, `PP-OCRv4/` (ONNX export) | `ch_PP-OCRv4_det_infer.onnx` | 4 745 517 | `d2a7720d45a54257208b1e13e36a8479894cb74155a5efe29462512d42f49da9` |
| | | | | `ch_PP-OCRv4_rec_infer.onnx` | 10 857 958 | `48fc40f24f6d2a207a2b1091d3437eb3cc3eb6b676dc3ef9c37384005483683b` |
| | | | Bundled: `vendor/models/ppocr_keys_v1.txt` (PaddleOCR `ppocr/utils/ppocr_keys_v1.txt`) | `ppocr_keys_v1.txt` | 26 249 | `28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7` |
| OCR per script (`ppocr-v6-small`, `ppocr-v5-cyrillic`, `-arabic`, `-devanagari`, `-korean`, `-greek`, `-thai`, `-tamil`, `-telugu`) | OCR | Apache-2.0 (PaddleOCR) | slopographic/cdn `models/ocr/<id>/` (from the RapidOCR hub on ModelScope, tag v3.10.0), listed with sizes and SHA-256 in `aitools/ocr-models.js` | detector, recogniser, dictionary | | |
| Tesseract per language (`tesseract-<code>`: `tesseract-eng`, `tesseract-swe` ... 95 languages) | OCR (engine `tesseract`, shared/ocr/engines.js) | Apache-2.0 (tessdata_best, github.com/tesseract-ocr/tessdata_best) | slopographic/cdn `models/ocr/tesseract-4.0.0-best-int/` (the @tesseract.js-data npm packages 1.0.0), listed with sizes and SHA-256 in `aitools/ocr-tesseract.js`; read by tesseract.js 7.0.0 (`vendor/tesseract`) | `<code>.traineddata.gz` | | |
| MobileNetV3 Large 100 (`mobilenetv3-l100`) | Auto tags | Apache-2.0 (timm weights, github.com/huggingface/pytorch-image-models) | huggingface.co/onnxmodelzoo/mobilenetv3_large_100_Opset17 (ONNX, opset 17) | `mobilenetv3_large_100_Opset17.onnx` | 21 919 274 | `b0b785f44a068dee4ff35bd88b114d4fd17a8bd635816f8f0ee46fa8b196c29f` |
| | | | Bundled: `vendor/models/imagenet-labels.json` (1000 ImageNet names from torchvision `_meta.py`) | `imagenet-labels.json` | 13 489 | `0507e07632759ad025d035ba6115d3bbae65dd4d83e01c0b294ad26bffb32979` |
| MODNet portrait (`modnet-portrait`) | Portrait blur (shared with Slop Isolate) | Apache-2.0 (github.com/ZHKKKe/MODNet) | Bundled: `vendor/models/modnet-portrait.onnx` (same file as `shared/cutout`) | `modnet-portrait.onnx` | 25 888 640 | `07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9` |

Denoise has no model: median and bilateral filters (`denoise/filters.js`).

Licence notes: the Whisper ONNX export and the PP-OCR export are tagged Apache-2.0 on their hosts; the upstream
weights are MIT (Whisper) and Apache-2.0 (PaddleOCR). The ImageNet label names come from torchvision, which is
BSD-3-Clause. The licence names shown to the person come from `LICENCES` in `model-registry.js`.
Hashes were computed from the files as downloaded on 2026-10-11. A changed file on the host will fail the check,
so the index must be updated with the new bytes and hash, not the check relaxed.

## Behaviour

- **Status** per tool: *Ready*, *Needs download* (a model is missing), or *Not supported on this device* with the
  reason (no WebAssembly, no audio decoding, no IndexedDB or secure context for the model checks, under 2 GB
  reported memory). Denoise needs only canvas and is always ready. Portrait blur uses the bundled model and is ready
  where WebAssembly runs.
- **Workers**: one inference worker per page loads ONNX Runtime Web from `vendor/onnxruntime-web/` on the
  WebAssembly backend with one thread (no COOP/COEP, so no SharedArrayBuffer). Models are read from IndexedDB in
  the page and transferred to the worker once per page.
- **OCR**: DB detection (long side 960, threshold 0.3, unclip 1.6), boxes merged into lines, then CTC greedy reading
  at height 48. Works on images and on one chosen PDF page (rendered at about 200 dpi with vendored pdf.js).
  Output: copy, `.txt` download, or Save to Slop Drive and open in Slop Docs.
- **Speech to text**: any of the speech models (the Language and model dialog), log-mel features as Whisper computes them
  (Slaney filters, 80 bins), openai/whisper's long-form algorithm: per step suppress_tokens / begin_suppress and the
  timestamp rules; per window the compression ratio (over 2.4) and average log-probability (under -1) checks with
  temperature fallback 0.2 to 1.0 (seeded sampling) and a loop guard; the no-speech skip (over 0.6 with an unsure
  decode); the next window starts at the end of the last complete segment; no previous-text prompt by default. The
  language is found by the quick model (`detect`). Export `.srt` and `.txt`. Audio up to 2 hours.
- **Auto tags**: MobileNetV3 with timm preprocessing (256 short side, 224 centre crop). Suggestions are buttons; accepted
  tags go to the Drive record's `meta.tags` through `shared/tags/tags.js` (`SlopTags`). An uploaded photo is put in
  Slop Drive only when the tags are saved.
- **Portrait blur**: `SlopCutout.removeBackground(file, { model: 'portrait' })` gives the mask once; the strength
  slider only re-composites (blurred background, sharp person through the mask).

## Verified and not verified

- Verified in headless Chromium with the real model files (served through a Playwright route, hashes checked by the
  page): all three downloads install and verify; OCR reads a rendered test page ("Slop Al Tools reads text /
  Invoice 2026-0042 total 1,250.00", the same lines as the reference RapidOCR pipeline); tags return labels; speech
  runs end to end; portrait and denoise run; Slop Docs and tag saving write to Drive.
- Not verified: speech accuracy on real speech (no speech sample was available in the environment), long-file
  boundaries between 30-second windows (windows do not overlap, so a word on a boundary can split), and portrait
  quality on people (no portrait photo in the repo).

## Limits and follow-ups

- The model downloads come from Hugging Face; a host change needs a new `HOSTS` entry and a new hash.
- Speech decodes greedily with the merged decoder's key/value cache (decoder_model_merged): each step reads one new token.
  Measured on one minute of the Spoken Wikipedia sample: 22 s with the cache against 106 s with the plain decoder. An
  install from before the change shows as needing a download (status compares the stored files with the registry), and
  the engine still runs the plain decoder if that is what it is given.
- OCR reads horizontal lines only; rotated text is not corrected.
- Add the new `aitools/` files to `service-worker.js` (not done here) so the tools work offline.
- `shared/library` (Get more for fonts) was not changed: its `packs.json` format is for fonts, so the model dialog lives
  in `aitools/get-more.js` and follows the same rules (licence first, click to download, hash before storing).
