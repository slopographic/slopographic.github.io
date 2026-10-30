# ChatGPT: what it would take (design note, nothing built)

Checked 2026-10-24 against OpenAI's documentation:
[Connect from ChatGPT](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt),
[Submit your app](https://developers.openai.com/apps-sdk/deploy/submission),
[Secure MCP tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels),
[MCP in the Responses API](https://developers.openai.com/api/docs/guides/tools-connectors-mcp).

## The finding

- **ChatGPT chats (web, phone, desktop) connect only to remote MCP servers**: a public `https://…/mcp` address
  (Streamable HTTP), added in developer mode as a custom server ("Plugins" ▸ Add custom MCP server). There is no way to
  point a ChatGPT chat at a program on the person's computer, so the local server here cannot be used from a chat.
- **Codex** (the CLI, the IDE extension, and Codex inside the ChatGPT desktop app) runs local stdio servers from
  `~/.codex/config.toml`. That works today with this server; the setup is in `shared/agent/clients.js` and the README.
- OpenAI's **Secure MCP Tunnel** (`tunnel-client --mcp-command "node …/server/index.mjs"`) can carry a local stdio
  server to ChatGPT, but it is made for organisations: it needs an OpenAI Platform organisation with tunnel
  permission linked to a ChatGPT workspace, an admin who allows custom servers, and the tunnel client running. Not
  something to ask of an ordinary visitor.
- Developer mode is on paid plans only (OpenAI's pricing pages list it for Plus, Pro, Business, Enterprise and Edu;
  the help centre could not be read to confirm which plans get full write access).
- The ChatGPT app directory takes only hosted servers: a stable public HTTPS endpoint, OAuth (no API keys or fixed
  headers), domain verification, verified organisation, website, support, privacy and terms URLs, a test account
  without MFA, 5 positive and 3 negative test cases, a video walkthrough and release notes, then OpenAI's review.

## What a remote relay would need

A hosted MCP endpoint that ChatGPT calls, relaying each call to the person's open Slopographic tab:

```
ChatGPT ──HTTPS (Streamable HTTP, OAuth)──▶ relay (e.g. a Cloudflare Worker + Durable Object per pairing)
                                               ▲
the Slopographic tab ──WSS (outbound, paired)──┘   (shared/agent/bridge.js speaking the same wire format)
```

- **Endpoint**: `https://mcp.slopographic.com/mcp`, the same tools as `server/tools.mjs`, minus the local-file tools
  (`send_file_to_app` and `save_result` have no local disk to use; files would come from ChatGPT attachments or stay
  in Slop Drive).
- **Pairing and auth**: OAuth 2.1 for ChatGPT (the directory requires it). The authorise page is a Slopographic page
  that shows a code; the person's tab joins the same Durable Object by typing it (the flow the local bridge has now).
  Tokens per pairing, short-lived, revocable from the page ("Disconnect").
- **What passes through the relay**: tool calls and their results only (text and JSON, the same content ChatGPT
  already sees). Files stay in the tab; a file the person sends from ChatGPT would pass through once, never stored.
  No logs of content; only counts for abuse limits.
- **The page**: `bridge.js` would connect to `wss://mcp.slopographic.com/tab` instead of `ws://127.0.0.1`, no local
  network prompt. The same `toolset.js` and permission checks.
- **Cost and accounts**: a Cloudflare account (Workers Paid plan, about USD 5 a month, Durable Objects with WebSocket
  hibernation; the free plan may do for a start), a DNS record on slopographic.com, an OpenAI organisation verified for
  app submission. No user accounts at Slopographic: the OAuth "account" is the pairing itself.
- **Review**: the directory checklist above; the privacy policy must describe the relay (it would no longer be
  "everything stays on your computer": calls and results pass through Slopographic's relay).

Recommendation: keep ChatGPT out of scope until the owner wants to run a hosted service; point ChatGPT desktop users
to Codex, which works with the local server today.
