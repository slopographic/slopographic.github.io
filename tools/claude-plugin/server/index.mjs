#!/usr/bin/env node
// Slopographic MCP: lets an AI app on this computer (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Claude Desktop…)
// use the Slopographic apps open in the browser. MCP over stdio to the AI app (mcp.mjs), a WebSocket on 127.0.0.1 to the
// page (bridge.mjs, ws.mjs), pairing with a code before any tool of the page is offered (tools.mjs), local files in and
// out (files.mjs). Node 20 or newer, no dependencies.
// Environment: SLOPOGRAPHIC_PORT (first port to try; the next 9 are the fallback), SLOPOGRAPHIC_SITE (default
// https://slopographic.com), SLOPOGRAPHIC_ROOT (working folder for relative paths; default the cwd),
// SLOPOGRAPHIC_ORIGINS (more allowed page origins, comma-separated; "http://localhost" admits local test servers),
// SLOPOGRAPHIC_NO_OPEN=1 (never open a browser).
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from './mcp.mjs';
import { createBridge, ORIGINS, DEFAULT_PORT } from './bridge.mjs';
import { createTools } from './tools.mjs';
import { workRoot } from './files.mjs';
import { openUrl } from './open.mjs';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

/** A friendly name for the AI app, from its MCP clientInfo. */
export function clientLabel(c) {
  const s = `${(c && c.name) || ''} ${(c && c.title) || ''}`.toLowerCase();
  const known = [[/claude-code|claude code/, 'Claude Code'], [/claude-ai|claude desktop|claude-desktop/, 'Claude Desktop'], [/codex/, 'Codex'],
    [/gemini/, 'Gemini CLI'], [/antigravity/, 'Antigravity'], [/cursor/, 'Cursor'], [/windsurf|devin|cascade/, 'Windsurf'],
    [/visual studio code|vscode|copilot/, 'VS Code']];
  for (const [re, label] of known) if (re.test(s)) return label;
  return (c && (c.title || c.name)) || 'your AI app';
}

export async function main(env = process.env) {
  const log = (...a) => console.error('[slopographic]', ...a);
  const first = Number(env.SLOPOGRAPHIC_PORT) || DEFAULT_PORT;
  const extra = String(env.SLOPOGRAPHIC_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  let mcp = null;
  const clientName = () => clientLabel(mcp && mcp.client());
  const bridge = createBridge({ ports: Array.from({ length: 10 }, (_, i) => first + i), origins: [...ORIGINS, ...extra], log, clientName });
  const port = await bridge.listen();
  log(`listening on 127.0.0.1:${port}`);
  const tools = createTools({ bridge, site: env.SLOPOGRAPHIC_SITE || 'https://slopographic.com', open: (u) => openUrl(u, { env }), root: workRoot(env), clientName });
  mcp = createServer({
    info: { name: 'slopographic', title: 'Slopographic', version: VERSION },
    instructions: 'Slopographic apps (photo editing, PDF, video, conversions, workflows) run in the person\'s browser. Call connect, show the pairing code to the person, then status with wait_seconds. The slop_ tools act in the connected tab; files go in with send_file_to_app and come out with save_result. Destructive actions are confirmed by the person in the page.',
    tools,
  }, { log });
  let named = '';
  bridge.on('change', () => {
    if (tools.changed()) mcp.notifyToolsChanged();
    if (clientName() !== named) { named = clientName(); bridge.notifyClient(named); }
  });
  const stop = () => { bridge.close(); process.exit(0); };
  mcp.done.then(stop);
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return { bridge, mcp, port };
}

/** Run when started as a program (node server/index.mjs, or the npx bin, a symlink to this file), not when imported. */
function isMain() { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { return false; } }
if (isMain()) main().catch((e) => { console.error('[slopographic]', e.message || e); process.exit(1); });
