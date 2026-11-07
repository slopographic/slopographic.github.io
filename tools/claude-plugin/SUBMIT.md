# For reviewers: Slopographic (Claude Code plugin and Claude Desktop extension)

## What it does

Slopographic (https://slopographic.com) is a set of free web apps that run in the browser: photo editing (PhotoSlop),
PDF (Slop PDF), video (SlopCut), file conversion (File convert), batch workflows (Slop Workflows) and more. This plugin
lets Claude use the app the person has open in their browser, through that app's own commands, and move files between
the person's computer and the app.

- Plugin: `slopographic` in the marketplace `slopographic` (repository slopographic/claude-plugin). One MCP server
  (`app`, stdio, `node ${CLAUDE_PLUGIN_ROOT}/server/index.mjs`), two skills (`slop-connect`, `slop-edit`).
- Desktop extension: `slopographic.mcpb` (MCPB 0.3, `server.type: node`, Claude Desktop's own Node).
- Source of truth: https://github.com/slopographic/apps, `tools/claude-plugin/` (server, manifest, skills) and
  `shared/agent/` (the page side). MIT licence. No dependencies; Node 20+.

## Data flow

```
Claude Code / Claude Desktop ──stdio (MCP)──▶ server/index.mjs ──ws://127.0.0.1:47821──▶ the Slopographic tab
```

- **All local.** The server listens on 127.0.0.1 only (ports 47821–47830). It makes no outbound network request.
  It may open the person's default browser at https://slopographic.com/<app>/?connect=1 when asked to connect.
- **Who may connect.** The WebSocket handshake is refused unless the `Origin` is https://slopographic.com,
  https://www.slopographic.com or https://slopographic.github.io, and the `Host` is 127.0.0.1 or localhost on the
  bridge's port (DNS rebinding). Frames must be masked; messages are capped at 4 MB.
- **Pairing.** The `connect` tool returns a 6-character code (30 bits, single use, 10 minutes, 5 wrong tries end it).
  Until the page sends that code, it can only say hello: it gets no calls and offers no tools. After pairing the tab
  holds a random 256-bit token (sessionStorage) so a reload stays paired; the person disconnects in the page.
- **What leaves the computer.** Nothing, from this plugin. Claude sends the tool calls and results to Anthropic as part
  of the conversation, as with any MCP tool. Files are read from or written to the working folder only (a path outside
  it needs `allow_outside: true`, meant for paths the person named); existing files are not overwritten unless asked.
- **Consent in the page.** The page shows "Claude Code is connected · Disconnect" while paired. Destructive app actions
  (delete, clear, replace…) are confirmed by the person in the page, following the site's AI permission settings.
- **Chrome.** The first connection triggers Chrome's local network access prompt ("apps and services on this device").

## Tools

`connect`, `status`, `use_tab`, `send_file_to_app`, `save_result` (destructiveHint: it writes a file), `disconnect`,
and the active tab's tools as `slop_<name>`, generated from the app's command registry (readOnlyHint and
destructiveHint passed through). The list changes when the tab changes (notifications/tools/list_changed; the server is
dual-era MCP: 2026-07-28 and the initialize-based 2025-11-25 … 2024-11-05).

## How to test

1. `/plugin marketplace add slopographic/claude-plugin`, `/plugin install slopographic@slopographic`.
2. `/slopographic:slop-connect workflows`. The browser opens; type the code shown. The page shows the indicator.
3. Ask: "Put ./test.png in Slop Drive and resize it to 200 px wide with a workflow, then save it as ./small.png".
4. Press Disconnect in the page: the `slop_` tools disappear; `status` says not connected.

Automated: `node --test tests/node/bridge-*.test.mjs tests/node/claude-plugin-*.test.mjs` in the apps repository
(MCP round trips, WebSocket framing, origin and pairing, files, the published tree, and a real browser end to end).

## Privacy policy

https://slopographic.com/how-it-works/#ai-apps (the site's audit page: every request the apps make, what is stored).
Support: https://github.com/slopographic/claude-plugin/issues
