---
name: slop-connect
description: Connect Claude Code to the Slopographic apps open in the browser (pairing code, browser tab). Use when the person wants to use Slopographic, PhotoSlop, Slop PDF, SlopCut, Workflows or File convert from here.
argument-hint: "[app, e.g. photoslop, workflows, pdf]"
allowed-tools: mcp__plugin_slopographic_app__connect mcp__plugin_slopographic_app__status
---

Connect to Slopographic in the browser.

1. Call the `connect` tool of the Slopographic MCP server (`mcp__plugin_slopographic_app__connect`), with `app` set to "$ARGUMENTS" when it names an app (for example `photoslop`, `workflows`, `pdf`, `convert`, `slopcut`); leave `app` out otherwise.
2. Show the person the pairing code from the result on a line of its own, in bold, exactly as given, and tell them in plain words:
   - type it in the Slopographic tab where it asks for the code (or Ctrl+K / ⌘K, "Connect an AI app…");
   - Chrome may ask to let the site use apps and services on this device: choose Allow (it lets the page reach this computer only);
   - the code works once, for 10 minutes.
3. Call `status` with `wait_seconds: 120`. When it says connected, name the app and say what you can now do there (the `slop_` tools). If it is still not connected, say so and offer to try again; never guess a code.
