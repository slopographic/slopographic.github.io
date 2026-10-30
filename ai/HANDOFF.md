# Slop AI: handoff

Chat with a language model that runs entirely on the person's device, in the browser, with WebGPU (WebLLM 0.2.86,
vendored in `vendor/web-llm/`). Registry id `ai` in `shared/apps.js` (icon `spark`).

**Recommended status: beta.** Everything works end to end with the fake engine and the real WebLLM path is wired and
reaches the network only after consent (checked in Chromium: the click → consent → fetch from huggingface.co). It has
not run a real model here because huggingface.co is blocked in this container: someone should load one model on a
real GPU (for example Qwen2.5 1.5B) and chat, use Control apps, and build a mini-app before calling it live.

## What the person sees
Four tabs (`#chat`, `#build`, `#models`, `#sys` in the URL hash):

1. **Can my PC run it?** (`js/ui/sysview.js`, `shared/ai/sysinfo.js`, `shared/ai/bench.js`): WebGPU yes/no/software,
   adapter vendor/architecture/description, `maxBufferSize`, `maxStorageBufferBindingSize`, shader-f16, RAM
   (`deviceMemory`, capped at 8 by browsers), threads, browser/OS (UA-CH), storage estimate/persisted ("Ask to keep it"),
   a ~1 s WebGPU benchmark (GFLOPS + GB/s), then a verdict per model: ✅ runs well ~X tok/s, ⚠️ slow, ❌ won't fit, with
   the reason. When WebGPU is missing: per-browser instructions and a "Try the demo engine" button. **Spec card**:
   a 1200×675 PNG (`js/ui/speccard.js`) to download, save to Slop Drive or share (Web Share with files when available).
2. **Models** (`js/ui/models.js`): the catalog (`shared/ai/catalog.js`: Qwen2.5 0.5/1.5/3/7B, Qwen2.5 Coder 1.5/7B,
   Llama 3.2 1/3B, Phi-3.5 mini, Gemma 2 2B; exact WebLLM ids) with download size, GPU memory, context, licence
   (link + commercial use), strengths, Recommended / Best for code badges, verdict badge. Download asks for consent
   ("downloads about N MB from huggingface.co … once … your chats never leave your device", licence line), then shows
   progress with **Pause** (aborts; finished shards stay cached so it resumes), **Cancel** (aborts and deletes the
   partial files), **Delete**, **Set default** (the default loads by itself on the next visit, but only if it is already
   downloaded), disk usage per model and in total. GPUs without shader-f16 get the `q4f32` build automatically.
   **Load from disk…**: pick an MLC model folder (`showDirectoryPicker`, falling back to `<input webkitdirectory>`);
   it is copied into WebLLM's caches under a private URL (`shared/ai/webllm.js importFolder`). No GGUF/wllama fallback.
3. **Chat** (`js/ui/chatlist.js`, `chat.js`, `messages.js`, `settings.js`): streaming Markdown (safe renderer
   `shared/ai/md.js`), code blocks with Copy (and Preview for HTML, which opens it in Build), conversations in IndexedDB
   (`slop-ai` → `convs`) with a sidebar (open, rename, delete, export), export to Slop Drive or download as `.md`/`.json`,
   import `.json`, persona/system-prompt editor (Helpful, Sloppo, Code helper, Writing coach, Custom), temperature,
   max tokens, Stop, Regenerate, attach text files from disk or Slop Drive (first 24k characters each; images are
   refused with a message), drag-and-drop files, tokens · tok/s · time to first token under every reply.
   "Send to Slop AI" from another app (`?drive=<id>`) attaches the text file.
4. **Build** (`js/ui/builder.js`, `builder-prompts.js`): the model writes one HTML file; it runs in an iframe with
   `sandbox="allow-scripts"` (no same-origin, no pop-ups, no forms, no top navigation) plus a CSP meta
   (`default-src 'none'`, inline script/style only) so it cannot read the page, storage or the network. Iterate by
   chatting (every reply with a complete ```html block replaces the preview), switch Preview/Code, restart, save to
   Slop Drive, download. Templates: Game (Catch the Slop), Calculator, Landing page. The builder system prompt
   (`AI.BUILDER_SYSTEM`) is written for small models (one file, no CDNs, define before use, whole file every time).

**Control apps** (toggle in the chat bar): the model gets `list_apps`, `open_app`, `save_to_drive`, `list_files`
(`shared/ai/apptools.js`). In other apps the side panel (`shared/ai/panel.js`) also gives it that app's
`SlopCmd.list()` as `list_commands` / `run_command`; destructive commands always ask first. Tool calls are
prompt-based (`<tool_call>{…}</tool_call>`, `shared/ai/tools.js`) so they work with every model, not only Hermes.

**Sloppo** sits in the top bar (shared painter `shared/sloppo/`). With a model loaded he is "AI powered": aura,
sparkles, star eyes and a brain hat (`shared/ai/powerup.js`). Click him: "Ask Sloppo" streams his reply through
`window.SlopAI.ask` (persona: "SLURP. I am the slop. ask me anything."). The API for the buddy is documented in
`shared/ai/HANDOFF.md`.

**Engines**: `?engine=fake` (or ⋯ ▸ "Use the demo engine") swaps WebLLM for the fake engine (canned streamed replies,
tool calls, HTML apps, simulated downloads in localStorage `slop-ai.fake-cache`). A model loaded here is shared with
other tabs (BroadcastChannel bridge); if another tab already has one, this tab borrows it ("(other tab)" in the chip).

Also: SlopCmd commands (`js/ui/commands.js`, ids `ai.*`; a small private key map when SlopCmd is missing), three
themes (Pro / Light / Classic 98 via the shared token block and `--sui-*`), `shared/guard.js`, `SlopHub.register('ai')`,
`SlopGuard.setUnsaved` while a reply streams.

## Code map
`index.html` loads the shared kit, `shared/ai/*.js`, then classic scripts sharing `window.AI`:
- `js/core/util.js` (prefs `slop-ai.prefs`, icons, bus `AI.on/emit`), `store.js` (IndexedDB, Markdown/JSON export;
  `?db=` overrides the database name for tests), `engine.js` (`AI.E`: load/consent/pause/cancel/unload/status/remove,
  borrowing from other tabs).
- `js/ui/`: `shell.js` (tabs, theme, chip, ⋯ menu), `sysview.js`, `speccard.js`, `models.js`, `chatlist.js`,
  `messages.js`, `chat.js` (`AI.ChatPanel`, used by Chat and Build), `settings.js`, `builder-prompts.js`, `builder.js`,
  `sloppo.js`, `commands.js`. `js/app/main.js` boots.
- `css/`: `base.css` (tokens, top bar), `chat.css`, `models.css`, `build.css`, `mobile.css` (≤ 760 px: icon tabs,
  the chat list is a drawer from the left below the top bar, Build shows chat first with a Preview button). The drawer is
  `SlopSheet` (`shared/ui/sheet.js`, `side: 'start'`, `AI.chatsUI`, attached in `js/ui/chatlist.js`): the Chats button
  (made once, so the bar's redraw keeps it) opens and closes it, and the shared ×, Escape, a tap outside, a swipe left,
  opening a chat or New chat close it. There is no scrim or `side-open` class any more.

## Tests
`node tests/run.mjs ai` → 64 tests on 8 pages, all green:

| Page | Covers |
|---|---|
| `sysinfo.test.html` | verdicts with mocked adapters (no WebGPU, 8 GB laptop, discrete GPU, no shader-f16 → q4f32, 128 MB binding limit, software adapter), speed estimates, recommendations (never the research-only licence), WebGPU help per browser, real `collect()` shape, the benchmark (when the runner has WebGPU) |
| `catalog.test.html` | requested families, licences, every id and f32 id exists in the vendored `prebuiltAppConfig` with the same memory figures, the WebLLM API the adapter uses |
| `tools.test.html` | tool-call parsing (tags, lenient JSON, fenced/bare JSON, unknown names), `prepare`, dispatch (destructive confirm), fake engine streaming/max_tokens/abort, the agent loop and its step limit, Control apps tools with a stub SlopCmd, save_to_drive, the cross-tab bridge (two iframes) |
| `store.test.html` | IndexedDB conversations, personas/system prompts, Markdown/JSON export and import, sidebar open/rename/delete, export to Slop Drive |
| `sandbox.test.html` | preview iframe attributes, a probe app cannot read the parent, storage, cookies or the network, CSP injection, `extractHtml`, templates, save, iterating by chat |
| `ui.test.html` | smoke with the fake engine: models (badges, pause/cancel, download, default), chat (markdown, copy, stats, stop, regenerate, attachments, Control apps → open_app, settings dialog), Ask Sloppo, system check + spec card, SlopCmd registration, themes, no sideways scroll |
| `panel.test.html` | `window.SlopAI` offline fallback, discovering a model loaded in Slop AI, Sloppo persona over the bridge, `comment()`, the panel running a page's SlopCmd commands with a confirm for destructive ones, going offline on unload |
| `mobile.test.html` | 390×844: every tab fits, the chat drawer (Chats opens and closes it, ×, Escape, outside tap, New chat), chatting, Build preview toggle |

Helpers: `tests/ai/util.js` (`AT.app()` opens the app with the fake engine and its own database; `AT.SYS` mocked
snapshots), `bridge-frame.html`, `panel-page.html` (a pretend app with a stub SlopCmd and the panel).

## Known limits / next steps
- Not yet verified with a real model on a real GPU (blocked network here). Check: consent → download progress →
  Pause/Resume → chat speed → Control apps with Qwen2.5 1.5B/3B → mini-app with a Coder model.
- Disk usage per model reads `content-length` of cached responses; WebLLM's own `cacheBackend` must stay `'cache'`
  (the default), the IndexedDB backend is not counted.
- "Load from disk" needs the model's `.wasm` in the folder unless the folder name is a known prebuilt id. GGUF
  (wllama) is not supported.
- The side panel is ready (`shared/ai/panel.js`) but no app includes it yet: adding the one tag is up to each app.
- Chat history sent to the model is not trimmed to the context window (4k tokens for most models); very long chats
  will error, and the error shows in the chat. A sliding window would be a good next step.

## Slop Drive (shared storage)

- **Save chat to Slop Drive (Ctrl+S)** writes the conversation JSON (the Import format) back to the Drive file it was opened from (`conv.driveId`, via `SlopHub.update`). The first save asks for a folder. `More ▸ Open a chat from Slop Drive…` opens a JSON chat and links it. Attach ▸ From Slop Drive and the `?drive=` launch (text attached to a chat) are unchanged. Code: `js/ui/drive.js`.

## Workspace (apps beside the chat)

Control apps can open a Slopographic app in a **panel beside the chat** (`js/ui/workspace.js`, `css/workspace.css`,
`window.SlopWorkspace`). The chat is the left column; each open app gets a tab (switch, × to close, "Open in new tab ↗").
Hiding the panel (×) keeps the frames loaded. On a phone (≤ 760 px) the panel covers the chat. The panel is mounted by
`js/app/main.js`, and the chat's tool set gets it through `AI.toolsFor` (`settings.js`). Without it (other callers of
`K.appTools.build`) `open_app` opens a new tab as before.

**Tools** (`shared/ai/apptools.js`, with `env.workspace`):
- `open_app(id)`: opens the app in a frame, or focuses it. Only registry apps of kind `app`, same origin, and not Slop AI
  itself are framed. A web address (`https://…`) as the id opens a new tab and is never framed. With `file`, the app
  opens that Slop Drive file in a new tab, as before (frames do not take files).
- `app_search(appId, query)`: up to ten commands of the app matching the words: `{ id, title, group, enabled }`.
- `app_command(appId, commandId, args?)`: runs one command with `SlopCmd.run(id, { source: 'ai', args })` in the frame.
  Returns `Ran “…” in …` or an error. `SlopCmd.run` returns only whether the command ran, not its own return value, and
  SlopCmd catches errors inside a command (a toast in the frame), so a reply says "ran", not what it produced.
- `app_state(appId)`: title, `drivable`, command count, and `state` when the app exposes the documented hook
  `window.SlopAppState()` (it must return a plain object, e.g. `{ document: 'poster.svg', selection: 3 }`). No app
  implements the hook yet, so the state is the title and command count, and the reply says so.

**Guards**: unknown app → error. App not open → error ("call open_app first"). Frame still loading, or the app has no
SlopCmd registry → wait up to 5 s, then error. Unknown command → error listing the nearest ids. Disabled command
(its `when()` is false) → error. The model never gets a way to run JavaScript in a frame, and there is no DOM read.

**Permissions**: the first command in each app asks once per page session (`SlopUI.confirm`, "Allow"). The answer is
kept in memory only, so a reload asks again. Commands whose id or title contains delete, remove, clear, empty, reset,
overwrite, purge, discard, erase or wipe always ask (the tool's `destructive` flag, through `K.tools.dispatch`).

**Drivable apps** (checked at runtime: `SlopCmd.list()` without SlopCmd's own `cmd.*` entries): photoslop 236, vector 129,
pdf 79, label 100, cutout 21, docs 27, tables 29, slides 37, press 154, slopedit 79, drive 48, contacts 26 commands.
Every registry app except Slop AI itself can be driven. An app with no SlopCmd is only opened, and the reply says so.

**Limits**
- Cross-origin pages cannot be scripted. Websites are only opened in a new tab, never framed or driven.
- Frames are same origin and have no `sandbox`, so the app runs as it does on its own page. The workspace does not add
  a sandbox because the registry apps need same-origin access to their SlopCmd.
- Apps without SlopCmd can only be opened, not driven. Adding a `window.SlopAppState` hook to an app gives the
  assistant its document name and selection count without other changes.
- Not yet: state summaries for the apps (no hook is implemented), files handed into a frame, a typed address bar in
  the panel (the assistant opens websites for the person).

**Tests**: `tests/ai/workspace.test.html` with `workspace.spec.js` (11 tests): the registry path for a frame, websites
in a new tab and never framed (`window.open` stubbed), unknown apps rejected, a real command on Drive and its result,
the first-command permission asked once, a no that is not remembered, the nearest ids for an unknown command, a
destructive command asking every time (and not running on no), app_search and app_state, and a frame with no registry
failing after the wait. `tests/ai/ui.test.html` now expects the Control apps tool to open the frame beside the chat.
