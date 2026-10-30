# shared/agent: AI agents use the apps through WebMCP

WebMCP lets a page offer tools to an AI agent in the browser. Here every app page offers what it already has, generated,
never written per app. The files stay in the browser: tools refer to them by ids and run in the page.

## The API this targets (checked 2026-10-24)

- Spec: W3C Web Machine Learning CG draft, https://webmachinelearning.github.io/webmcp/ (source:
  github.com/webmachinelearning/webmcp `index.bs`). Entry point **`document.modelContext`**. `navigator.modelContext`
  was the first name: Chrome 146–149 have only that, 150–151 both, 152+ only `document`. `boot.js api()` tries both.
- `registerTool(tool, { signal })` (a Promise from Chrome 151). There is no unregister call: aborting the signal removes
  the tool. `provideContext`, `clearContext` and `unregisterTool` were removed from the draft. `webmcp.js` uses
  `unregisterTool` and `provideContext` only on older builds that have them.
- A tool: `{ name, title?, description, inputSchema (JSON Schema), execute(input, { signal }), annotations }`. The
  annotations are `readOnlyHint`, `untrustedContentHint` and `consequentialHint`. MCP's `destructiveHint` is set as well,
  for MCP-B and desktop clients. Names are 1–128 characters of `A–Z a–z 0–9 _ - .` (`tools.js` keeps them to 64).
- `execute` may return any JSON value. Ours return MCP's `{ content: [{ type: 'text', text }], isError? }`, which MCP-B
  also reads.
- There is no confirmation hook in the current draft (`requestUserInteraction` was dropped from the drafts and is now
  only an open proposal). A destructive call asks with the app's own `SlopUI.confirm`. When an agent passes
  `requestUserInteraction` (older builds and some polyfills do), the dialog runs inside it.
- Chrome: origin trial "WebMCP", Chrome 149 to 156 (chromestatus 5117755740913664; an extension to 162 was asked for).
  Without a token, use `chrome://flags/#enable-webmcp-testing` or `--enable-features=WebMCP`. Edge: behind a flag (and its
  own trial from Edge 150; we have no Edge token). Firefox and Safari: no. Playwright 1.64's Chromium (156) has it with the
  flag, and `tests/node/agent-real.test.mjs` runs against it.
- MCP-B (`@mcp-b/global`) wraps `document.modelContext` (the native one, or its polyfill where there is none). Desktop
  agents reach the tools through an extension that injects it, or the MCP-B local relay. The site does not include the
  polyfill or the relay script: agents need a browser that has WebMCP, or an extension.

## Files

| File | What |
|---|---|
| `boot.js` | `window.SlopAgents`, loaded by `shell/shell.js` after load (idle). The setting (`localStorage 'slop.agents'`, only "off" is stored, on by default), `api()`, `start()`, `about()`, the Help command `agents.about` ("AI agents…"), and a fallback that adds the page's own origin token when the head has none. |
| `tools.js` | The pure converter (window + CommonJS): `unique` names, `checkSchema`, `toWebMCP` (annotations, the confirmation for destructive calls, MCP-style results). |
| `workspace.js` | The two tools the one list lacks: `open_file` (a Slop Drive file into this app through `SlopIntake.take`; only where the app registered an intake spec) and `download`. |
| `toolset.js` | `window.SlopAgentToolset`: the page's agent tools for every way in (WebMCP and the local bridge): `defs()` (the one list, `when()` and open dialogs applied), `tools()` (WebMCP-shaped, asking first when destructive), `signature`, `confirm` (the site's AI permissions, `SlopAIPermissions.ask`, when the page has them; else `SlopUI.confirm`), `onChange(fn)` (SlopCmd change/run/open/close, a command's `when()`, an app dialog opening or closing, files coming in, checked every 3 s while visible), `ready`. |
| `webmcp.js` | `window.SlopWebMCP`: registers the toolset's tools with the browser, again when the set changes, withdraws them when the setting goes off. `refresh()`, `stop()`, `tools()`, `definitions()`, `ready`. |
| `bridge.js` | `window.SlopBridge`: the tab's link to an AI app on this computer through the Slopographic MCP server (`tools/claude-plugin/`): `connect({ port })` (ws://127.0.0.1, ports 47821–47830), `pair(code)`, `disconnect()`, `state()`, `client()`, `on(fn)`. Sends the toolset's tools (again on change), runs calls, takes files in (`SlopIntake.take` with source `api`, or Slop Drive) and sends files out (`SlopAgentWorkspace.file`), 256 KB chunks. sessionStorage `slop.bridge` keeps the port and token so a reload stays paired. |
| `bridge-ui.js` | `window.SlopBridgeUI`: the "Connect an AI app" dialog (the code, Chrome's local network prompt in plain words) and the "Claude Code is connected · Disconnect" indicator. |
| `clients.js` | `SlopAgentClients` (window + CommonJS): every AI app's setup (Claude Code plugin, Claude Desktop .mcpb and config, Codex, Gemini CLI, Cursor, VS Code, Windsurf, ChatGPT's limit), `REPO`, and `PUBLISHED`, the one "coming soon" flag. |
| `clients-help.js` | Renders `clients.js` into how-it-works#ai-apps (`data-slop-ai-clients`, `data-slop-ai-soon`). |
| `about.js` | The Help note and the setting toggle (`open()`, `note()`, `LINES`); Settings shows the same note (`data-slop-agents-note`). |
| `trial-tokens.json` | The origin trial tokens, one per origin, with their expiry. |

**One tool list.** The tools are the Slop AI panel's and the cloud engines' (`shared/ai/HANDOFF.md`):
`SlopAIKit.appTools.build({ cmd: SlopCmd, ops: true, appId })` gives `list_apps`, `open_app`, `save_to_drive` (text),
`list_files` (Slop Drive, with ids), `read_file`, the operations (`shared/ai/optools.js`: `list_operations`,
`run_operation`, `run_workflow` over `shared/ops/all.js` and `workflows/js/core/plan.js`; the new files go to Slop Drive)
and the page's commands (`shared/ai/cmdtools.js`: one tool per command with `args`, `ai: false` left out, `app_state`,
`list_commands`, `run_command`). `cmdTools.neutral(tool)` (added for this; `cmdTools.specs` uses it) makes each one
provider-neutral with `inputSchema` (`cmdTools.inputSchema`), `readOnly`, `untrusted`, `mayDestroy`. `webmcp.js` adds
`workspace.js`'s two tools, leaves out commands whose `when()` is false, and while a SlopUI dialog of the app is open
withdraws the command tools (the app is waiting on the person); the file tools stay.

Help: the command `agents.about` is in Ctrl+K on every page with SlopCmd and at the end of every `SlopMenuBar` Help menu;
PhotoSlop, Slop PDF and SlopCut have "AI agents…" in their own Help menus. Settings has an "AI agents" section.

## The origin trial: what the owner does

The tokens are public by design (they are in every page). One build serves both origins: main is slopographic.com and
testing is slopographic.github.io. Every page head carries both tokens on one line in the SEO block, and Chrome ignores
a token made for another origin.

1. Sign in at https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241 (the WebMCP trial; blog: https://developer.chrome.com/blog/ai-webmcp-origin-trial).
2. Web origin `https://slopographic.com`. Leave "third-party matching" and "subdomains" off. Expected usage: the
   default. Submit, then copy the token.
3. Register again for `https://slopographic.github.io` (the preview).
4. Paste each token into `shared/agent/trial-tokens.json` under its `origin`, with `expires` (YYYY-MM-DD, shown on the
   trial page and inside the token).
5. Run `node tools/seo/write.mjs`, which writes `<meta http-equiv="origin-trial" content="…">` into every page head,
   then commit.
6. Renewal: `tests/node/agent-trial.test.mjs` warns within 30 days of an expiry and fails after it. When Chrome
   extends the trial, renew on the same page (My registrations ▸ Renew) and paste the new token. When the trial ends
   and WebMCP ships, delete the tokens (keep `"tokens": []`).

Current tokens: slopographic.com and slopographic.github.io, both expiring 2027-03-30.

## Tests

- `tests/node/agent-tools.test.mjs`: the one list (commands, operations, files) gives valid JSON Schema tools, `ai: false`
  is skipped, names are unique and valid, destructive tools are flagged and ask first, read-only ones say so.
- `tests/node/agent-trial.test.mjs`: the tokens (origin, feature, expiry), the heads, the renewal warning.
- `tests/node/agent-real.test.mjs`: the real API in Playwright's Chromium with `--enable-features=WebMCP`. It covers
  registration, `getTools`, `executeTool`, withdrawal with the setting off, and registering again.
- `tests/agent/apps.test.html` (with the fake context `tests/agent/fake.js`): tools on PhotoSlop, Slop PDF, SlopCut,
  Workflows and File convert; the setting off, then on and off again from the Help note.
- `tests/agent/run.test.html`: `run_workflow` on a generated picture in Slop Drive → a new resized file there, then
  `run_operation` by name and `download`. SlopCut ripple trim through `run_command`. The confirmation for New project, and
  Cancel changing nothing. Registering again after a state change, and a dialog opening.

## Limits

- No tool hands an agent the bytes of a file; agents act on ids and names (`read_file` gives the first 4000 characters
  of a text file). `look_at_file` (a small copy for a cloud model) is left out of WebMCP.
- `photoslop/classic/` and `sheetview/` load SlopCmd without the shell, so they offer no tools.
- The confirmation is the app's own dialog, meant for the person at the screen.

## AI apps on the computer: the local bridge (Claude Code, Codex, Cursor, VS Code, Claude Desktop…)

`tools/claude-plugin/` is the Slopographic MCP server (Node 20+, no dependencies) and the Claude Code plugin around it;
`tools/claude-plugin/SUBMIT.md` has the data flow and security model for reviewers, `CHATGPT.md` why ChatGPT chats need
a hosted relay. The page side is `bridge.js` + `bridge-ui.js` above; the tools are the toolset's, so the bridge offers
exactly what WebMCP offers (as `slop_<name>`), plus the server's own `connect`, `status`, `use_tab`, `send_file_to_app`,
`save_result` and `disconnect`.

How a tab connects: "Connect an AI app…" (Help, Ctrl+K, the AI agents note), `?connect=1&port=N` (the server's
`connect` tool opens that), or a paired tab reloading. PhotoSlop's first-run tour waits on `?connect=1`.
Connecting turns the "Let AI agents use this app" setting on (it is the person's own choice); turning it off disconnects.

Publishing (the coordinator): `node tools/claude-plugin/publish.mjs <folder>` writes the whole public repository
(plugin, marketplace, npm package, MCPB manifest, README with every AI app's setup) and `slopographic-<version>.mcpb`
beside it. Copy the folder into slopographic/claude-plugin, commit, push, tag `v<version>`, and attach the .mcpb to the
GitHub release as `slopographic.mcpb`. Then set `PUBLISHED = true` in `clients.js`. A version bump is
`tools/claude-plugin/package.json` and `.claude-plugin/plugin.json` together (a test checks they match).

Tests: `tests/node/bridge-ws.test.mjs` (RFC 6455), `bridge-mcp.test.mjs` (MCP stdio, both eras), `bridge-pairing.test.mjs`
(origins, pairing, proxying, files, paths), `claude-plugin-tree.test.mjs` (the published tree, manifests, the .mcpb;
`claude plugin validate --strict` where the CLI is installed) and `bridge-e2e.test.mjs` (the server as a child process
and the Workflows page in Chromium: pair, a file in, a workflow, the result out, Disconnect).
