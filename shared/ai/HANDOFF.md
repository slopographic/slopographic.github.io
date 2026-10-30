# shared/ai: the local-AI kit (and the API for the Sloppo buddy)

Everything here is a classic script that adds to `window.SlopAIKit` (`K`), except `slopai.js` (`window.SlopAI`) and
`panel.js` (`window.SlopAIPanel`). No build step; WebLLM is vendored in `vendor/web-llm/` and imported only when a
real model loads. The app that uses all of it is `ai/` (Slop AI, see `ai/HANDOFF.md`).

## For the Sloppo buddy (shared/buddy/): `window.SlopAI`

Include one tag. It loads `engines.js`, `tools.js`, `bridge.js` and `powerup.js` from its own folder:

```html
<script src="../shared/ai/slopai.js"></script>   <!-- path relative to the page -->
```

| Member | What |
|---|---|
| `SlopAI.ready` | `true` when a model is loaded in this page **or in any other open tab of the site** (normally the Slop AI tab). |
| `SlopAI.model` | `{ id, name, kind }` (`kind: 'remote'` when borrowed from another tab), or `null`. |
| `SlopAI.loaded` | Promise: resolves once the kit is loaded and other tabs have been asked (≈300 ms). Read `ready` after it. |
| `SlopAI.ask(prompt, opts)` | Returns a **stream**. `opts`: `persona: 'sloppo'` (default) or `'plain'`, `system` (overrides the persona), `history` (`[{role, content}]`), `temperature` (Sloppo 0.9), `max_tokens` (Sloppo 120), `signal`. |
| stream | `for await (const piece of stream) bubble.textContent += piece;` · `await stream.text` (the whole reply) · `stream.abort()` · `stream.offline` (true when no model: it then yields one canned "SLURP… load a model in Slop AI" line instead of failing). |
| `SlopAI.comment(what, opts)` | Sloppo reacts to something in one short line: `SlopAI.comment('the user just exported a PDF')`. Same stream; `max_tokens` 60. |
| `SlopAI.on(evt, fn)` | `'ready'` (became ready), `'unready'`, `'change'` (any change, incl. another model). Returns `off()`. |
| `SlopAI.look` | `{ hat: 'brain', aura: 'ai', sparkle: true }` while ready, else `null`. Merge it into his look. |
| `SlopAI.powerUp` | The drawing helpers below (`SlopAIKit.powerUp`), once loaded. |
| `SlopAI.SLOPPO`, `SlopAI.GREETING` | The persona text and his catchphrase "SLURP. I am the slop. ask me anything." |

### The "AI powered" look
`SlopAIKit.powerUp` (`powerup.js`) draws on a 2D canvas and matches the shared painter (`shared/sloppo/`):

```js
import { drawSloppo, HATS } from '../shared/sloppo/index.js';
await SlopAI.loaded;
SlopAI.powerUp.install(HATS);          // adds HATS.brain, so look.hat = 'brain' works in drawSloppo
function frame(g, W, H, look, t) {
  if (SlopAI.ready) SlopAI.powerUp.draw(g, W, H, look, t, drawSloppo);   // aura + Sloppo + brain hat + sparkles
  else drawSloppo(g, W, H, look, t);
}
// or piece by piece: powerUp.aura(g, cx, cy, r, t) before him, powerUp.sparkles(g, cx, cy, r, t) after,
// powerUp.brain(g, H, t) with the painter's head box H = { x, top, w, h, s, eyeY, base }.
```
A CSS glow also works for a DOM-positioned buddy: `filter: drop-shadow(0 0 8px rgba(212,255,58,.6))`.

### Suggested buddy behaviour
- Speech bubble: stream `SlopAI.ask(question)` into it; show `stream.offline` lines as-is (they are in character).
- "Ask Sloppo": an input in the bubble → `SlopAI.ask(text)`.
- Commenting: call `SlopAI.comment(...)` rarely (e.g. at most once a minute, on real events), and never while the
  person is typing; small models are slow on weak GPUs. Abort the previous stream before starting a new one.
- Listen to `SlopAI.on('ready'|'unready', …)` to switch the power-up look on and off.

## Files

| File | Adds | What |
|---|---|---|
| `catalog.js` | `K.catalog` | The models: WebLLM ids (checked against the vendored `prebuiltAppConfig` by a test), download size, `vramMB`/`vram32`, `lowResource`, licence (name, URL, commercial use), strengths, blurb, `f32Id` for GPUs without shader-f16. `byId`, `idFor(m, sys)`, `custom(id)`. |
| `sysinfo.js` | `K.sysinfo` | `collect({ bench })` snapshot (adapter info, limits, f16, deviceMemory, cores, UA-CH browser/OS, storage estimate/persisted); pure `verdict(sys, model)` → `{ level: good/slow/no, tps, id, vram, reason }`, `recommend(sys, list, 'chat'/'code')`, `help(sys)` (WebGPU how-to per browser), `budgetMB`, `bandwidth`. |
| `bench.js` | `K.bench` | WebGPU micro-benchmark: tiled f32 matmul (GFLOPS) and a storage-buffer copy (GB/s). Starts at 128² / 8 MB and scales up only on fast GPUs (~1 s; ~3 s on SwiftShader). |
| `engines.js` | `K.Engine`, `K.FakeEngine` | The engine interface `{ load(model, onProgress, {signal}), chat(messages, {tools, stream, temperature, max_tokens, signal}), unload(), info() }`. `chat` streams `{type:'delta', text}` then `{type:'done', text, raw, toolCalls, usage:{tokens, tps, ttft, ms}}`. The fake engine streams canned replies, emits tool calls for "open <app>", "run <cmd.id>", "save", writes an HTML app for "build/make … app", and takes scripted `replies`. |
| `tools.js` | `K.tools` | Prompt-based tool calling for any model: `<tool_call>{"name":…,"arguments":…}</tool_call>` (also fenced or bare JSON, lenient quotes); `prepare` (one system message, merged roles, tool results as `TOOL RESULT (name): …`), `parse`, `dispatch` (asks before destructive tools), `run` (the agent loop, max 4 steps). |
| `apptools.js` | `K.appTools` | "Control apps": `list_apps`, `open_app`, `save_to_drive`, `list_files`, plus `list_commands`/`run_command` when the page has `window.SlopCmd`. Commands whose id/title says delete/clear/close/reset/new/… are destructive and confirmed. |
| `webllm.js` | `K.WebLLMEngine`, `K.models` | The real engine (MLCEngine; Pause/Cancel abort `reload`, finished shards stay cached). Cache helpers that never load the library: `status(id)` → none/partial/ready + bytes, `remove(id)`, `importFolder(files)` for "Load from disk" (an MLC folder goes into the same caches under a private URL; needs the `.wasm` in the folder unless the folder name is a known prebuilt id). |
| `bridge.js` | `K.bridge`, `K.RemoteEngine` | BroadcastChannel `slop-ai-bridge`: a page with a loaded model hosts it; other tabs stream through it. Tools run in the asking page. |
| `slopai.js` | `window.SlopAI`, `K.load` | The API above; `SlopAI.use(engine)` is how a page that loaded a model shares it. |
| `powerup.js` | `K.powerUp` | Brain hat, aura, sparkles. |
| `md.js` | `K.md` | Safe Markdown for chat (escape first; http(s) links only; code blocks with Copy/Preview buttons; works on half-streamed text). |
| `panel.js` + `panel.css` | `window.SlopAIPanel` | The embeddable side panel (below). |
| `panel-run.js` | `K.panel.send` … | The panel's run: tool loop, steps, Stop, "Undo all AI changes". |
| `picker.js` | `K.picker` | The model choice (WebGPU check with a plain fallback message, models good at app control first, download/use with progress and Cancel) and the download notice (`consent`, the shared first-use notice `shared/firstrun/notice.js` with the real size and licence). Slop AI's own downloads use the same notice. |
| `cmdtools.js` | `K.cmdTools` | An app's SlopCmd commands as tools: one tool per command with an `args` schema (JSON schema in `definitions(cmd)`), `app_state`, `list_commands`, `run_command`; arguments are checked and clamped (SlopCmd.exec) before a command runs. A command's `readOnly` is never asked; `sends` (e.g. SlopCut's `look_at_frame`) is asked every time with "Send a copy to <who>?" (the same hook as look_at_file), its `{ text, media }` value goes to engines that can see, and it is left out for models that cannot; the run's signal reaches the command as `ctx.signal`. `specs(cmd, env)` / `neutral(tool)` (any tool of the list): the same tools provider-neutral (`inputSchema`, `readOnly`, `sends`, `mayDestroy`), for cloud engines and WebMCP (`shared/agent/HANDOFF.md`). |

## The AI button and app control (2026-10)
- Every app page with the shell header has an **AI** button (`shell/header.js`, `.sh-ai`, same look as Convert…). Nothing
  of the AI loads before the first click; then it injects `shared/ai/panel.js` (`data-button="false"`) and opens the
  panel. On Slop AI itself there is no button. When the header is full the button becomes an icon and stays (`data-hbtn-keep`):
  Theme, the bell, Drive, Tutorial and Apps fold into a More (⋯) menu first (`shared/ui/hbtn.js`, SlopMenuButton); only a
  header with no room at all puts it in More as "Ask Slop AI…" (two taps). It is also "Ask Slop AI…" in the command
  palette (`shell.ai`). Tests: `tests/ai/phone-panel.test.html` (PhotoSlop, Slop PDF, Convert at 390 × 844).
- Layout: above 900 px the page narrows by the panel's width (`html.sap-beside body { margin-inline-end }`, plus a
  resize event so canvases refit); 641–900 px it overlays on the right; ≤640 px it is a full-height bottom sheet (`SlopSheet`,
  `shared/ui/sheet.js`: opaque, swipe down, ×, Escape, tap outside; with the keyboard up it ends above it, so the composer
  shows and the chat scrolls, `shared/input/keyboard.js`; its fields are 16 px so iOS does not zoom into them).
- No model: the panel shows `picker.js`. Without WebGPU it says so plainly and what still works. A model loaded in
  another tab (Slop AI) is used through the bridge.
- "Control <app>" on: before each request the panel calls `SlopCmd.prepare()` (the app's AI commands load), builds the
  tools from the commands (`cmdtools.js`) and takes `SlopCmd.checkpoint()`. Each tool call is a step
  ("Gaussian blur, radius 8 ✓", ✗ with the error). Stop (the send button while running) ends the run between actions.
  Limits: 6 model turns and 12 actions per request (`MAX_STEPS`, `MAX_CALLS` in `panel-run.js`). Destructive commands
  ask (`destructive: true`, or the word rule). After a request that changed something, **Undo all AI changes (n)** calls
  the checkpoint's rollback.
- How an app joins: `shared/commands/HANDOFF.md` ▸ "Arguments and app state". Wired: PhotoSlop
  (`photoslop/js/app/ai-*.js`, 33 commands), plus Slop Tables, Slop Docs and Slop Resize (see their HANDOFFs).
- Slop AI's workspace (`ai/js/ui/workspace.js`) uses the same pieces for framed apps: `prepare()` before listing,
  `exec` for `app_command` (arguments checked), `SlopCmd.state()` for `app_state` (falls back to `window.SlopAppState`).
- Which models drive apps well enough: tool calling is prompt-based (`tools.js`), so any model can try. Qwen2.5 1.5B
  (the default) follows the tool format and picks the right single tool reliably, and usually manages 2–3 step plans
  such as "blur the background"; Llama 3.2 3B, Qwen2.5 3B and 7B plan longer chains better. Qwen2.5 0.5B and Llama 3.2
  1B often answer in prose instead of calling a tool or invent argument names, so the panel's picker lists only the four
  (`picker.FIT`); the others stay in Slop AI's Models page. These are observations from the prompt design, not a benchmark: the browser tests use the
  scripted fake engine.

## The side panel (`panel.js`)
Any app can add it later with one tag: `<script src="../shared/ai/panel.js" defer></script>` (after `shared/apps.js`,
`slopui.js`, `hub.js` and, if it has one, `shared/commands/commands.js`). Attributes: `data-button="false"` hides the
floating button (call `SlopAIPanel.open()` from a menu instead); `data-app="photoslop"` names the app if
`SlopHub.register` was not called. It themes itself with the page's `--sui-*` tokens.

**Model sharing, as built:** a BroadcastChannel bridge, not a SharedWorker. WebGPU memory belongs to one tab, and a
SharedWorker cannot be relied on to have WebGPU, so the model lives in the tab that loaded it (normally Slop AI) and
other tabs stream through it. If that tab closes, clients see `ready = false`. "Load here" in the panel loads an
already-downloaded model into the current page instead (a second copy in GPU memory), and that page then hosts it for
others. Nothing is downloaded from the panel; downloads happen in Slop AI, after consent.

## Your own AI account (shared/ai/cloud/, 2026-10)
People connect their own key (Claude, ChatGPT/OpenAI, Gemini, OpenRouter, Ollama or LM Studio on their computer, or any
OpenAI-compatible address) in the panel's model choice ("Use your own AI account", also shown without WebGPU). The
browser calls the provider directly; there is no server. A provider is **just another engine** (`K.CloudEngine`,
`cloud/engine.js`) behind the same interface, so the one loop (`tools.run`), the one tool list (`appTools.build` +
`cmdTools`) and the one panel drive it. Tool calling is **native**: each tool goes out as JSON Schema
(`cmdTools.inputSchema(tool)`, the one schema maker; `cmdTools.specs(cmd)` gives the provider-neutral definitions that
WebMCP uses too), calls come back structured with ids, and each provider's own reply (`done.native`: Claude's thinking
blocks with signatures, OpenAI's reasoning items, Gemini's parts with `thoughtSignature`, OpenRouter's
`reasoning_details`) is sent back unchanged.

| File | What |
|---|---|
| `cloud/net.js` | `K.cloud`: `sse(body)` (Server-Sent Events), `call(url, init, { secret, provider })` (every failure a `CloudError` with a plain message: key, rate (Retry-After), money, cors (with local-server help), network, model, request, server, refusal), `redact` (no key in any message), `seal` (calls that never ran get "Not run" before the next turn). |
| `cloud/anthropic.js` | Messages API, `anthropic-version: 2026-10-21`, `anthropic-dangerous-direct-browser-access: true`; no temperature (that version refuses it); effort medium on 4.6+/5.x; `fallbacks: "default"` + `anthropic-beta: server-side-fallback-2026-07-01` on Opus/Sonnet/Fable 5.x (not Haiku). |
| `cloud/openai.js` | Responses API (`/v1/responses`, OpenAI's recommended API for tools), `store: false`, output items passed back. |
| `cloud/compat.js` | Chat Completions for OpenRouter, Ollama, LM Studio and custom addresses (tool_calls deltas by index; pictures as a user message after the tool messages). |
| `cloud/gemini.js` | `streamGenerateContent?alt=sse`, key in `x-goog-api-key`, `functionDeclarations` with `parametersJsonSchema`. |
| `cloud/providers.js` | The list in plain words, default models (Claude Opus/Sonnet/Haiku 5.5; others from the fetched list by pattern), Anthropic prices and OpenRouter's from its list, `checkBase` (https, or http only for localhost), `localHelp` (OLLAMA_ORIGINS, LM Studio's Enable CORS, Chrome's local network prompt). |
| `cloud/keys.js` | Keys: IndexedDB `slop-ai-keys` when "Remember on this device" is on, else this tab only (memory + sessionStorage). Settings (`slop-ai.cloud` in localStorage) never hold a key. `shared/backup/core.js` and `central.js` leave the database out. |
| `cloud/meter.js` | Tokens per reply and this visit (sessionStorage), cost when the price is known, the cap, and the one-time notice per provider (`slop-firstrun:ai-cloud:<id>`). |
| `cloud/connect.js` | The form: provider, address, key (password field, autocomplete off), Test connection, Forget key, model, cap, steps, Use; `restore()` brings the last provider back on the next page when its key is still here. |
| `cloud/signin.js` | `K.cloud.signin`: "Sign in with OpenRouter" (a catalog entry's `signin: { auth, keys, manage }`), OAuth PKCE with the one helper `shared/sync/pkce.js`. `start` keeps the verifier and state in this tab (sessionStorage `slop-ai.signin`) and goes to the consent page with this page's own address as `callback_url` (so white-label origins work); back with `?code=`, the script takes the code out of the address at once (`replaceState`; `shell/header.js` loads it first and opens the panel, `panel.js` shows the model choice); `finish` checks the state (CSRF), POSTs code + verifier straight to OpenRouter, stores the key like a pasted one (keys.js) and connect.js runs Test connection. Denied, wrong state, a used or expired code (403), offline, network and other errors each say so. The picker's "Sign in" badge and the free guide point at it. |
| `filetools.js` | `look_at_file`: asks every time ("Send a copy to Anthropic?"), sends a picture scaled to 1024 px (JPEG) or the first 8,000 characters of a text. |
| `optools.js` | `list_operations`, `run_operation`, `run_workflow` from `shared/ops/registry.js` and the one runner (`workflows/js/core/plan.js`); results saved to Slop Drive. |
| `toolbox.js` | `K.toolbox`: what the panel sends stays small (below, "Token budget"): `arrange` (core tools + `find_tools`, the rest deferred), `visible`, `loaded`, `compact` (schemas), `summarize` (results), `trim` (earlier requests' results). |
| `prompt.js` | `K.prompt.system(tools, eng, { appName, capable })`: the panel's system prompt (the hand-over rule, the apps in a line each, the tools to load by name). |

The panel: the header names the provider and model (click it to change), the foot says where requests go; before
the first request to a provider, the notice; cloud runs get `look`, `ops` and up to `steps` model turns (12 by default,
1–30); after each reply a line with its tokens and this visit's total; the cap stops the loop after the turn that reaches
it and refuses new requests; Stop aborts the request in flight. A key-based engine is never shared with other tabs.

## Permissions, handoff, model menu (2026-10, wip/ai-permissions)
- **One permission module**, `permissions.js` (`window.SlopAIPermissions`, also CommonJS) + `permissions-ui.js` (the
  question and the settings view). `tools.dispatch` asks through `env.permit(req)` (the panel passes
  `SlopAIPermissions.ask`); a tool says which approval it needs with `kind(args)`: `change` (marked app changes: crop,
  flatten, merge…), `delete` (delete, clear, close, overwrite…, `kindOf(text)` is the one word rule), `send` (a copy of a
  file or a picture of the work goes to the provider: `look_at_file`, `look_at_canvas`). Modes: Ask each time (default),
  Allow app changes (never covers `send` or `delete`), Allow everything (with a warning). Answers: Allow once · for this
  request (ends with the reply: `startRequest`/`endRequest`) · for this visit (sessionStorage) · Always in this app (a rule,
  listed in ⚙ AI permissions with Remove) · Deny. Reading and ordinary edits never ask; Undo all works in every mode.
  WebMCP (shared/agent/) should call `SlopAIPermissions.ask({ kind, app, appName, action, detail })` the same way.
  The Slop AI app page (`ai/js/ui/chat.js`) still uses its plain confirm.
- **Prompt caching**: Anthropic requests carry a cache breakpoint on the system prompt (tools come first, so they are
  cached too) plus top-level automatic caching; usage reports `cacheRead`/`cacheWrite`, the cost prices them (reads
  0.1× or the listed price, writes 1.25×). OpenAI gets `prompt_cache_key`; Gemini and OpenRouter cache on their own and
  report cached tokens. Measured live (Haiku 5.5, 5 steps, 34 tools): 42,898 tokens either way; cost $0.0044 → $0.0014
  (Sonnet 5.5 prices: $0.088 → $0.028); `tests/node/ai-permissions.test.mjs` keeps those numbers.
- **The site in the prompt**: own-key models get `appTools.catalog(SLOP_APPS)` (each app: what it is, what it makes and
  opens), "be resourceful" and "never refuse because this app cannot: run_operation here, or open_app with a task".
  What each app makes is generated, not written by hand: `node tools/ai-coverage.mjs` (also the pre-commit hook) writes
  `shared/ai/app-skills.js` (`SlopAIKit.appSkills`: per app its create tools, up to 8 add tools and its operations) from
  the same scan as `shared/commands/AI-COVERAGE.md`; `appTools.catalog` adds "Tools there: …" and "Operations: …" to each
  app's line. Own-key models, the fake engine and capable local models get it.
- **One task through several apps** (`handoff.js`), in this tab: file in → file out jobs run on any page
  (`run_operation`); editing that needs an app moves there with `open_in_app({ app, files, task })`, which sends the files
  the way "Open in…" does (SlopOuttake items now carry `to`; an app's own handover first, e.g. SlopIsolate → PhotoSlop as
  a layer with its mask; `SlopHub.sameTab` makes `sendTo` stay in this tab). `open_app({ id, task })` moves without files.
  The record (conversation, task, the line "Continuing in PhotoSlop with photo.png.", chain id and hop) is in
  sessionStorage; on arrival the shell header opens the panel, which shows the line and sends the task as soon as a model
  is there. Stop ends the chain in every app (`cancel`); at most 8 hops. Setting (⚙): "When a task uses other apps" —
  Stay on this page when possible (default) / Show me in each app; the prompt honours "do it here" / "show me".
  `tests/ai/chain.test.html`: Drive → PhotoSlop (stay) and Drive → SlopIsolate → PhotoSlop → export (show), real pages.
- **look_at_canvas** (`filetools.js`): `SlopCmd.snapshot()` when the app provides one (`SlopCmd.provide({ snapshot })`),
  else the file the app hands to Convert; scaled to 1024 px, kind `send`, a thumbnail in the chat.
- **Model menu** (`model-menu.js`): the header's model name is a SlopMenuButton: the connected providers' models (hint
  per model), AI settings…, AI permissions…, Disconnect. A pick is remembered for that app (`lastByApp`). With a
  provider in use, the full model choice shows it first and the local models under "Models on this device".
- Steps show the app's answer as a dimmed line; more than 3 steps in a row fold into "9 steps ✓" (open to see them).

## Token budget (2026-10, wip/ai-tokens)
Measured with `node tools/ai-tokens.mjs [apps] [--count]` (real app pages in Chromium, the panel's own run, a fake fetch
per provider, `tests/ai/token-probe.js`; `--count` asks Anthropic's count_tokens with `ANTHROPIC_API_KEY` to calibrate
the estimate, about 2.4 characters a token). First request, Claude Haiku 5.5 (count_tokens): before PhotoSlop 17,535,
Slop PDF 11,059, SlopCut 20,724, Workflows 9,744, Slides 12,651 (each of the 12 steps of a task paid that again); after
about 4,600–4,750 on each, a local model about 2,000. `tests/node/ai-tokens.test.mjs` fails above `BUDGET` (7,000 cloud,
3,500 local) and checks that later turns keep the cached prefix.
- **Progressive tool disclosure** (`toolbox.js`, applied by `panel-run.js` only: WebMCP and Slop AI keep the full list):
  when a page has 16 tools or more, only the core goes in full (app_state, find_tools, run_command, run_operation,
  open_in_app, open_app, look_at_canvas, look_at_file, list_files, read_file, save_to_drive); the prompt names the others
  ("More tools here …"). `find_tools({ query | names })` loads them (strong matches only), and also lists matching
  operations (`opTools.search`) and other apps' tools (`app-skills.js`). A deferred tool can always be called; called
  with arguments it does not take (a guess before loading it, seen live with Haiku), it does not run and the error gives
  its signature. Live, Claude Haiku 5.5, PhotoSlop, "blur the picture a little": app_state + find_tools({ names }), then
  gaussian_blur({ radius: 3 }), then the answer: 4,757 + 5,178 + 5,246 input tokens, 9,929 of them from the cache.
  Claude 4.5+ (`anthropic.defers`): every tool is sent, deferred ones with `defer_loading: true`; find_tools answers with
  a tool_result of `tool_reference` blocks only (the documented custom tool search; the API refuses text beside them, so
  the rest of the answer follows the results as a text block). The tool list never changes, so the cache and the thinking
  blocks stay valid. Other providers and local models: the loaded tools join the end of later turns (`visible`).
- **Compact schemas** (cloud `toolDef`): huge bounds (≥ 10,000), maxLength/maxItems, additionalProperties: false and
  empty required are left out; the app checks and clamps arguments anyway. Shorter core descriptions.
- **Prompt** (`prompt.js`): the apps in a line each (what it is, what it makes) for cloud models, by name for local ones;
  tools and operations per app come from find_tools.
- **Results**: data results go through `summarize` (lists 25 items, strings 400 characters, valid JSON); `app_state` is a
  summary (8 items, 160 characters) unless `detail: true`; `list_operations` gives ids only unless filtered (options for
  the 6 best matches).
- **History**: other providers and local models get tool results of earlier requests (before the last user message) cut
  to 200 characters, pictures left out (`trim`); the current request is never changed. Claude: context editing
  (`clear_tool_uses_20250919`, beta `context-management-2025-06-27`: from 30,000 input tokens, keep 4, at least 5,000,
  never find_tools), since editing earlier turns would invalidate thinking blocks.
- **Usage**: the tokens line under a reply has the breakdown on hover (`meter.detail`): "This request used N tokens
  (M cached): … over n model turns", then each turn.
- Tests: `tests/node/ai-deferred.test.mjs` (request building per provider, find_tools, trim, summarize, prompt, meter),
  `tests/ai/deferred.test.html` (PhotoSlop blur with Claude, Workflows add_step + run_workflow with OpenAI, Slides
  build_presentation with the local fake engine, each through find_tools).

## GPUs that cannot compile a model (2026-10)
- WebLLM is 0.2.86 (model libraries `v0_2_86/base`, rebuilt by MLC with current compilers); `vendor/web-llm/README.md`.
- `WebLLMEngine.load`: a shader or pipeline validation error on the f16 build ("Invalid ShaderModule … index_kernel")
  loads the model's q4f32 build once, and `catalog.markF16Broken(adapter)` remembers it (localStorage
  `slop-ai.f16-broken`, by vendor/architecture/description), so `catalog.idFor` and later loads go straight to f32. A
  failure carries `err.tried` and `err.shader`; the model choice then shows `gpu-help.js`: what was tried, browser and
  GPU (sysinfo), Copy details, Try a smaller model, Use your own AI account. `tests/ai/shader.test.html`.
- Real WebGPU: `tools/webgpu-check.mjs` + `.github/workflows/webgpu.yml` (nightly, by hand, on WebLLM changes): Chromium
  with WebGPU on SwiftShader (`--enable-unsafe-webgpu --enable-features=Vulkan --use-webgpu-adapter=swiftshader`, page on
  http://localhost) loads Qwen2.5 0.5B q4f32 and generates 8 tokens (about 3.5 minutes with a cold cache; the model is
  kept in the Actions cache). SwiftShader has no shader-f16, so the q4f16 build is reported as not testable there. The
  tokens SwiftShader produces are gibberish: the check is that every shader compiles and generation runs.

Pictures (`generate_image`, `edit_image`, PhotoSlop's Generate Image…): `imagegen/HANDOFF.md`. They join the one tool
list through `K.toolSets` (a function env → tools that `apptools.js build` adds), loaded by the panel as `imagegen/index`. They ask through the permission module as kind `spend-image`.

## Tests
`node tests/run.mjs ai` covers all of this; see `ai/HANDOFF.md`. Own keys: `tests/node/ai-cloud-formats.test.mjs`
(request building, streams from documented SSE fixtures, conversion both ways), `tests/node/ai-cloud-engine.test.mjs`
(the loop per provider, errors, cap, redaction, settings), `tests/ai/cloud.test.html`, `tests/ai/cloud-keys.test.html`
and `tests/photoslop/ai-cloud.test.html` (a fake fetch per provider, `tests/ai/cloud-util.js`). Sign in with OpenRouter: `tests/ai/cloud-signin.test.html` (the auth URL's S256 challenge and state, the exchange, the key stored, the address cleaned, a wrong state, a denied consent, a used code, offline).

## The provider catalog (shared/ai/cloud/catalog/, 2026-10)
About fifty providers, as data. One file per group, each pushing entries into `K.cloud.catalog`: `main.js` (Claude,
OpenAI, Gemini, OpenRouter; the entry fields are documented at its top), `open.js` (fast inference: Groq, Cerebras,
SambaNova; open models: Together, Fireworks, DeepInfra, Hyperbolic, Novita, Nebius, Hugging Face), `cloud.js` (RunPod
Serverless, Azure OpenAI v1 and classic, Bedrock with an API key, Bedrock IAM, Cloudflare, Vertex), `more.js` (Mistral,
xAI, DeepSeek, Perplexity, Cohere, AI21, Kimi, Qwen, Z.ai, Zhipu), `local.js` (Ollama, LM Studio, vLLM, llama.cpp, Jan,
LocalAI, KoboldCpp, text-generation-webui, Any address) and `images.js` (fal, Together images, Stability, Recraft, RunPod
image endpoints; Replicate, BFL, Ideogram need a proxy). `providers.js` normalizes them (`needsKey` from `auth`, `who`,
`short`, `usable`, `chat`, `test` from `testPath`) and serves `providers`, `byId`, `search`, `resolve`/`baseFor` (address
templates such as `https://api.runpod.ai/v2/{endpointId}/openai/v1`; a query like `?api-version={apiVersion}` stays at the
end, `endpoint(base, path)`), `authHeaders` (Bearer, or `{ header: 'api-key' }` for Azure).
- **One code path per format.** `format` is `anthropic`, `openai-responses` (openai.js), `openai-chat` (compat.js) or
  `gemini`; `C.formats['openai-chat']` is an alias of `compat`. A new OpenAI-compatible provider is one catalog entry.
  Picture formats (`fal`, `openai-images`, `stability`, `recraft`, `runpod-sync`, …) are listed in `IMAGE_FORMATS` and
  belong to `shared/ai/imagegen` (on wip/imagegen: register one file per format there; `keyOf` says when a picture entry
  uses another entry's key, e.g. Together images → `together`). The chat form only keeps their key ("Save key").
- **CORS** is `verified` only when a browser preflight from https://slopographic.com is allowed. Re-check by hand:
  `node tools/check-ai-cors.mjs [ids]` (not in CI); it prints the table and marks entries that changed. `needs-proxy`
  entries show greyed with "Can't be used straight from a browser" and their `corsNote`; `blocker: 'auth'` marks those
  held back by sign-in (Vertex's one-hour tokens, Bedrock IAM signing) rather than by CORS. GitHub Models was retired on
  2026-07-30 and is not listed.
- **Picker** (`cloud/pick.js`): a button and an inline list (search box; Main open, other groups collapsible; badges tools /
  vision / images / browser OK / needs a proxy / on this computer). It drives the hidden `.sap-cloud-provider` select, so
  the form keeps one value. `fields(p)` renders the template's fields; `models(select, p)` adds "Recently used"
  (`slop-ai.cloud.recent`, ids only) and a search box over long lists.
- **Local servers** (`cloud/local.js`, `local-ui.js`): Test connection diagnoses `mixed` (http to another machine from an
  https page: needs Tailscale Serve, Caddy or a tunnel), `permission` (Chrome's local network permission denied, asked
  only after a failed request from a public page), `cors` (a no-cors request reaches it), `down`, `path` (suggests /v1),
  `key`, `none` (no models), each with that server's fix. "Find servers on this computer" asks the presets' default ports
  (and llama.cpp's newer 9931) only after the click.
- Tests: `tests/node/ai-catalog.test.mjs` (well-formed entries, templates, requests, search, the CORS tool's probes),
  `tests/node/ai-local.test.mjs` (each diagnosis, the port probe), `tests/ai/cloud-picker.test.html` (search, groups,
  needs-proxy rows, fields per provider, a chat through RunPod and Groq with a fake fetch, models, Find servers, 390 px).

## Free AI (2026-10, wip/free-ai)
- **The data**: a `free` field on catalog entries (fields in `catalog/main.js`), read from each provider's own pricing or
  limits page on 2026-10-25: Gemini `free` (Flash, Flash-Lite, 2.5 Pro and Gemma 4 are free of charge; prompts may train
  Google's products except in the EEA, Switzerland and the UK; daily limits reset at midnight Pacific), Groq `free`
  (gpt-oss 120B / Qwen 3.8 27B: 30 rpm, 1,000/day, 8K tpm), OpenRouter `free-models` (`:free` ids: 20 rpm, 50/day, 1,000/day
  after $10 of credits), Mistral `free` (Free mode, no card, low limits; which models and whether it trains: not stated on
  the pages read), Cerebras `free-trial` ($5 for 30 days after a verified payment method, 5 rpm), Hugging Face `none` (no
  credits for free accounts; PRO $2/month), servers on this computer `free`. Re-check them by hand; change `verified`.
- **`cloud/free.js`** (`K.cloud.free`, no DOM): `tier`, `label` (Free / Free models / Free trial), `priced` (an OpenRouter
  list entry: `:free` or every price 0; `compat.js` sets `m.free`), `model(p, m)` (true / false / null = not known), `known`,
  `others` (free providers with tools, for suggestions), `rate(p, model, secs)` (the words a 429 gets), `wait`.
- **UI**: a Free badge on picker rows and the provider button, a "Free" chip in the picker; "· Free" on free models in the
  form and the header model menu (and "· Free models" on the provider's heading); "Show only free models" over the model
  field (with "Control <app>" on: only free models that can use tools; the panel passes `tools: () => P.toolsBox.checked`);
  "Get a free key in 2 minutes" (`cloud/free-guide.js`): Gemini, Groq, OpenRouter, sign-up links, limits and data notes
  from the catalog, "Choose <provider>".
- **429** (`net.js`): the retry time from Retry-After, Gemini's `retryDelay`, Groq's `x-ratelimit-reset-*` or OpenRouter's
  `X-RateLimit-Reset` (`C.retryIn`); at a free provider the message adds its limits, "Try again in about N seconds" (or the
  daily reset) and another free provider or a model on this device. Gemini's free-tier "quota … billing" 429 counts as a
  rate limit, not as no credit.
- Tests: `tests/node/ai-free.test.mjs` (shape, OpenRouter fixture `tests/node/ai-openrouter-models.json` from its public
  /models, which models are free, the 429 words), `tests/ai/cloud-free.test.html` (badges, chip, guide links, only free
  models, the model menu, a 429 from Groq).

## Ready-made prompts (shared/ai/quick/, 2026-10)
One tap sends a common request from the AI panel. Three ways in: chips on an empty chat (recent first, then the app's
own), the ⚡ button beside the message box (the whole list, grouped: Recent, the app, Understand, Write, Translate,
Ideas, Help), and "/" at the start of the box (filters as you type; ↑ ↓, Enter runs, Esc closes). A prompt with
something to choose shows a small form above the box (a select or a text field), starting on the last value used.
- `quick/engine.js` (`K.quick.create`): the format, `when` conditions, variables (`context`, `choice`, `text`,
  `number`; named sets language/tone/length/audience/period), filling, the "/" filter, recent and remembered values
  (localStorage `slop-ai.quick`). `quick/context.js`: the selection (kept while the focus is in the panel), the app's
  name and language, and whatever the app reports with `SlopCmd.provide({ context })` (Slop Tables: document, sheet,
  range, the selected cells; Slop Docs: document, selection). `quick/ui.js`: the panel's part.
- The lists: `quick/shared.js` (19 prompts every app gets) and `quick/apps/<app id>.js` (one per page with the AI
  button; `skip` leaves shared prompts or groups out). The words: the `prompts.*` tables in `shared/ai/i18n/<code>/`,
  shipped in English and Swedish only (`index.js` langs), so other languages read English until translated; the text
  sent to the model is translated too, so it answers in the person's language.
- Tests: `tests/node/ai-quick.test.mjs` (engine; every list: keys, variables, labels, 5–12 prompts per app),
  `tests/ai/quick-prompts.test.html` (Slop Tables at 1280 and 390 px).
