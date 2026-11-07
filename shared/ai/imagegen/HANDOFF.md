# shared/ai/imagegen: pictures with the person's own AI key

The chat models (Claude among them) are text models: they cannot draw. Pictures come from image models at a provider the
person connects with their own key in the AI panel ("Use your own AI account", `shared/ai/cloud/`). The same keys are
used (`cloud/keys.js`); there is no second key store and nothing runs on our servers. The browser calls the provider.

| File | What |
|---|---|
| `index.js` | The one tag (`<script src="…/shared/ai/imagegen/index.js">`, or `K.load(['imagegen/index'])`): loads `cloud/net`, `providers`, `keys`, `meter` (unless already there) and this folder, then `imageGen.choose()`. `await SlopAIKit.imageGenReady`. |
| `core.js` | `K.imageGen`: the providers (by the cloud provider id whose key they use), models, `size(aspect, '1K'/'2K'/'4K')` (OpenAI's limits), `estimate(req)` (price before), `costOf(...)` (cost after), `settings()`/`save()` (`slop-ai.imagegen`, never a key), `register(p)` (the hook for more providers). |
| `openai.js` | OpenAI Image API: `POST /v1/images/generations` (JSON) and `/v1/images/edits` (multipart: `image[]`, `mask`). Also any OpenAI-compatible server (Ollama, LM Studio, a custom address): `response_format: b64_json` and the picture's own size there. |
| `gemini.js` | Gemini API Interactions: `POST /v1beta/interactions` with `response_format: { type: 'image', aspect_ratio, image_size }`, `store: false`; the picture from the `model_output` step. One picture per request. |
| `openrouter.js` | OpenRouter Image API: `POST /api/v1/images`, `input_references` for edits; `models()` reads `/api/v1/images/models` (what each model takes) and `/api/v1/models?output_modalities=image` (price per picture); `fit()` adjusts the request to the model. |
| `run.js` | `connected()`, `choose()`, `generate(req, { signal })`: key, spending cap, request(s), plain errors, blobs, cost into `cloud/meter.js` (counts toward the visit's totals and cap). |
| `pixels.js` | `prepare(source, { selection })` (a PNG copy at most 1536 px, and OpenAI's mask: transparent where it may change), `fit`, `keepInside` (the result only inside the selection, the original elsewhere). |
| `tools.js` | `generate_image`, `edit_image` for the one tool list (`K.toolSets`, read by `apptools.js build`), `make(req, …)` (one request start to finish), `deliver` (the page's sink, else Slop Drive). |
| `dialog.js` | `imageGen.dialog({ mode: 'generate' | 'edit', sink, args })`: prompt, provider, model, shape, size, quality, style, how many, transparent, where it goes; the price; who receives the prompt (and the picture) and that its terms apply. |

## Providers, models, endpoints (checked 2026-10-24 against the official docs)
- **OpenAI** (`openai` key): `gpt-image-2.5-flare` (default: fast), `gpt-image-2.5-sunburst` (precise edits), `gpt-image-2`
  (`gpt-image-1` was shut down 2026-10-23). Sizes `WxH` in multiples of 16, 655,360 to 8,294,400 px, ratio ≤ 3:1;
  quality low/medium/high (2.5 also xhigh/max, not offered); `background: transparent` with PNG (preview on gpt-image-2);
  masks: fully transparent pixels = the part to change, same size as the image, PNG. Prices: $8 / $30 per million image
  tokens in / out, $5 text in; GPT Image 2's published per-picture table (low $0.006/$0.005, medium $0.053/$0.041, high
  $0.211/$0.165, square / other). GPT Image 2.5 has no per-picture table, so the price shows after (from the reported
  tokens). Content rules: `400 moderation_blocked` → "declined … under its content rules". OpenAI may require
  Organization Verification (403) → said in plain words. CORS: `access-control-allow-origin: *` on both endpoints.
- **Google Gemini** (`gemini` key): `gemini-nano-banana-2.1` (Google's recommendation), `gemini-3.1-flash-lite-image`
  (1K only), `gemini-3-pro-image`. Aspect 1:1 … 21:9 (and 1:4, 4:1, 1:8, 8:1), size 512/1K/2K/4K (uppercase K). Prices
  per picture 1K/2K/4K: Nano Banana 2.1 $0.0336/$0.0504/$0.113; 3 Pro Image $0.134/$0.134/$0.24; Flash-Lite $0.0336.
  No mask: an edit inside a selection is put back inside it here. Every picture carries SynthID. CORS: the origin is
  echoed on `/v1beta/interactions`.
- **OpenRouter** (`openrouter` key): any model from its image list (61 on 2026-10-24); defaults Nano Banana 2.1, GPT Image
  2.5 Flare, FLUX 3 Image. The answer carries `usage.cost` ($), so the cost after is exact. No mask. CORS: `*`.
- **OpenAI-compatible** (Ollama, LM Studio, custom address, as set up in the AI panel): `/images/generations` and
  `/images/edits` at that address; a 404 says the server has no picture address. Local servers count as free.

Not verified: GPT Image 2.5's cost per picture (only token rates are published); whether Gemini's older
`generateContent` + `responseModalities` route still works for the new models (we use Interactions, the documented one);
which local servers really offer `/images/generations`; any live call (the only key in the dev `.env` is Anthropic's,
which has no image model).

## Permission and money
Each `generate_image` / `edit_image` call asks through the one permission module (`shared/ai/permissions.js`, kind
`spend-image`: never covered by "allow app changes"; allow once / for this request / for this visit / always in this
app apply): `tools.dispatch` runs the tool's `before()` (it picks the provider, so a key added after the panel opened is
used and named), then asks "Spend on image generation?" with the provider, model, size, price per picture (or why it is
not known) and that the provider receives the prompt (and a copy of the picture, at most 1536 px) and its terms apply.
`run()` itself no longer asks. A refused question sends nothing. The visit's spending cap (`cloud/meter.js`) refuses a request once
reached; every finished request adds its tokens and cost. In the dialogs, Generate is the go-ahead.

## Where pictures go
A page may set `window.SlopImageSink = { app, name, targets, place(images, { target, name }), source() }`. PhotoSlop does
(`photoslop/js/app/commands.js`, `js/app/imagegen.js`): a new layer (default), a new document, or Slop Drive; `source()`
is the active layer in document space and the selection's mask. Elsewhere pictures are saved to Slop Drive (`from: 'ai'`,
`ai-<prompt>.png`) and any app opens them through the intake (`open_app` with `file`).

## Local generation (no key): researched, not built
Checked 2026-10-24 for Chromium + WebGPU with onnxruntime-web (vendored 1.30.0):
- **SD-Turbo** ONNX (`schmuell/sd-turbo-ort-web`, the ORT WebGPU demo): text encoder 681 MB + UNet 1,733 MB + VAE decoder
  99 MB ≈ 2.5 GB, 512 × 512, one step, under a second on a fast GPU. The weights are under Stability AI's licence
  (the ONNX repo says non-commercial; the original card points to the Community Licence and a membership for commercial
  use), which our model index does not allow (`aitools/model-registry.js`: MIT, Apache-2.0, BSD-3-Clause only).
- **Janus-Pro-1B** ONNX (`onnx-community/Janus-Pro-1B-ONNX`, q4f16 ≈ 1.9 GB, 384 × 384, through transformers.js, which is
  not vendored): the weights are under the DeepSeek Model Licence (use restrictions), not on the allowed list either.
- **Z-Image-Turbo** (Apache-2.0) ONNX q4f16 ≈ 6.6 GB: over the ~2.5 GB limit.
So nothing qualifies yet. The hook: `SlopAIKit.imageGen.register({ id, name, who, short, local: true, maxN, generate(req,
{ signal }) → { images: [{ blob, mime }], usage: {}, cost: 0, notes: [], provider, model, who, short, request: req } })`.
A qualifying model goes through the model catalog and chooser (`shared/models/HANDOFF.md`, "Adding a family": its files
on the cdn with SHA-256, the size and licence shown, Download only after the person's OK), and its provider registers
itself here; `connected()` then lists it with no key.

## Tests
`tests/node/imagegen.test.mjs` (requests and answers per provider from the documented formats, errors, prices, cap, the
tool), `tests/photoslop/imagegen.test.html` (dialog → new layer / new document, edit with a mask, Gemini without one, the
panel's generate_image with the spend question and the cap), `tests/ai/imagegen.test.html` (another app: Slop Drive,
opened through the intake). Fake providers: `tests/ai/imagegen-util.js`.
