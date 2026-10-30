// The MCP tools: the bridge's own (connect, status, use_tab, send_file_to_app, save_result, disconnect) and the connected
// tab's tools, proxied under stable names "slop_<name>" (the page's own tool list: shared/agent/toolset.js).
//   createTools({ bridge, site, open, root, clientName }) → { list(), call(name, args, ctx) }
//   proxyName(pageName, taken) → 'slop_…' (letters, digits, _ and -, at most MAX_NAME characters, unique)
import { resolvePath, readLocal, writeLocal } from './files.mjs';

// Claude Code names a plugin tool mcp__plugin_<plugin>_<server>__<tool>: with the plugin "slopographic" and the server
// "app" that is 30 characters, and 30 + 34 stays within the 64 that model APIs allow for a tool name.
export const MAX_NAME = 34;
export const PREFIX = 'slop_';
const LOCAL = new Set(['connect', 'status', 'use_tab', 'send_file_to_app', 'save_result', 'disconnect']);

export function proxyName(name, taken = new Set()) {
  let base = PREFIX + String(name).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  base = base.slice(0, MAX_NAME);
  let n = base, i = 1;
  while (taken.has(n) || LOCAL.has(n)) { const s = '_' + (++i); n = base.slice(0, MAX_NAME - s.length) + s; }
  taken.add(n);
  return n;
}
const sleep = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true }); });
const APP = /^[a-z0-9][a-z0-9-]{0,40}$/;

const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const LOCAL_TOOLS = [
  { name: 'connect', title: 'Connect to Slopographic',
    description: 'Start connecting to Slopographic in the browser. Returns a pairing code that the person types into the Slopographic tab; show the code to the person exactly as given. Opens the site in the default browser (at the app given, e.g. "photoslop", "workflows", "pdf") when no tab is connected, or when open is true. Then call status with wait_seconds to wait for the tab.',
    inputSchema: obj({ app: { type: 'string', description: 'app to open, e.g. "photoslop", "workflows", "pdf", "convert" (optional)' }, open: { type: 'boolean', description: 'open a new tab even when one is connected' } }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
  { name: 'status', title: 'Connection status',
    description: 'Show whether a Slopographic tab is connected, which tabs there are (the active one gets the slop_ tools) and the bridge port. With wait_seconds, waits up to that long (at most 180) for a tab to connect.',
    inputSchema: obj({ wait_seconds: { type: 'number', description: 'wait this long for a tab to connect (0–180)' } }),
    annotations: { readOnlyHint: true } },
  { name: 'use_tab', title: 'Choose the tab', description: 'Make another connected Slopographic tab the active one (ids from status). The slop_ tools change to that tab\'s tools.',
    inputSchema: obj({ tab: { type: 'string', description: 'tab id from status, e.g. "t2"' } }, ['tab']), annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'send_file_to_app', title: 'Send a local file to the app',
    description: 'Read a file on this computer and open it in the active Slopographic tab (into: "app", the way the app opens files) or put it in Slop Drive (into: "drive", then the slop_ tools can use it by name). Paths are relative to the working folder; a path outside it needs allow_outside: true and only when the person named that path.',
    inputSchema: obj({ path: { type: 'string', description: 'file path' }, into: { type: 'string', enum: ['app', 'drive'], description: 'app (default) or drive' },
      mode: { type: 'string', enum: ['add', 'new'], description: 'when the app has a document open: add to it or start a new one (the app asks when not given)' },
      allow_outside: { type: 'boolean', description: 'the person explicitly named a path outside the working folder' } }, ['path']),
    annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: 'save_result', title: 'Save a result to a local file',
    description: 'Save a file from the active Slopographic tab to this computer: a Slop Drive file (name or id from slop_list_files) or "open" for what the app has open. Will not replace an existing file unless overwrite is true. A path ending in / or naming a folder keeps the file\'s own name.',
    inputSchema: obj({ file: { type: 'string', description: 'Slop Drive file name or id, or "open"' }, path: { type: 'string', description: 'where to write it' },
      overwrite: { type: 'boolean', description: 'replace an existing file' }, allow_outside: { type: 'boolean', description: 'the person explicitly named a path outside the working folder' } }, ['file', 'path']),
    annotations: { readOnlyHint: false, destructiveHint: true } },
  { name: 'disconnect', title: 'Disconnect', description: 'Disconnect the Slopographic tabs (or one tab), so this AI app can no longer use them until the person pairs again.',
    inputSchema: obj({ tab: { type: 'string', description: 'only this tab (id from status)' } }), annotations: { readOnlyHint: false, destructiveHint: false } },
];

export function createTools({ bridge, site = 'https://slopographic.com', open = async () => false, root, clientName = () => 'your AI app' }) {
  let map = new Map(), sig = '';   // proxied name → page name, for the active tab
  function proxied() {
    const tab = bridge.active();
    if (!tab) { map = new Map(); return []; }
    const taken = new Set(), next = new Map(), out = [];
    for (const t of tab.tools) {
      const name = proxyName(t.name, taken);
      next.set(name, t.name);
      const a = t.annotations || {};
      out.push({ name, title: t.title || undefined, description: `${String(t.description || t.name).slice(0, 1000)} (In ${tab.appName}.)`,
        inputSchema: t.inputSchema && t.inputSchema.type === 'object' ? t.inputSchema : { type: 'object', properties: {} },
        annotations: { readOnlyHint: !!a.readOnlyHint, destructiveHint: !!a.destructiveHint, openWorldHint: false } });
    }
    map = next;
    return out;
  }
  const need = () => { const t = bridge.active(); if (!t) throw new Error('No Slopographic tab is connected. Call connect first.'); return t; };
  function describe() {
    const tabs = bridge.tabs();
    if (!tabs.length) return { connected: false, port: bridge.port(), codeWaiting: bridge.codeWaiting(), say: 'No Slopographic tab is connected. Call connect.' };
    return { connected: true, port: bridge.port(), tabs, active: (tabs.find((t) => t.active) || {}).id, say: `Connected to ${tabs.length} tab${tabs.length > 1 ? 's' : ''}. The slop_ tools act in the active one.` };
  }

  const run = {
    async connect(a) {
      const code = bridge.newCode();
      const app = a.app && APP.test(String(a.app)) ? String(a.app) : '';
      const url = `${site.replace(/\/$/, '')}/${app ? app + '/' : ''}?connect=1&port=${bridge.port()}`;
      const opened = !bridge.tabs().length || a.open ? await open(url) : false;
      return [`Pairing code: ${code}`, '',
        opened ? 'Slopographic is opening in the browser. In that tab, type the code where it asks for it.'
          : `In a Slopographic tab, open the command palette (Ctrl+K or ⌘K), choose “Connect an AI app…” and type the code. Or open ${url}`,
        'Chrome may ask to let the site use apps and services on this device: choose Allow. That lets the page reach this computer only (127.0.0.1).',
        `The code works once, for 10 minutes. Then call status with wait_seconds: 120 to wait for the tab.`].join('\n');
    },
    async status(a, { signal }) {
      const wait = Math.max(0, Math.min(180, Number(a.wait_seconds) || 0));
      const until = Date.now() + wait * 1000;
      while (!bridge.tabs().length && Date.now() < until && !(signal && signal.aborted)) await sleep(250, signal);
      return describe();
    },
    use_tab: (a) => ({ active: bridge.use(String(a.tab)) }),
    async send_file_to_app(a, { signal }) {
      const tab = need();
      const abs = await resolvePath(a.path, { root, outside: !!a.allow_outside });
      const f = await readLocal(abs);
      return bridge.sendFile(tab, f, { into: a.into === 'drive' ? 'drive' : 'app', mode: a.mode === 'add' || a.mode === 'new' ? a.mode : null, signal });
    },
    async save_result(a, { signal }) {
      const tab = need();
      const abs = (await resolvePath(a.path, { root, outside: !!a.allow_outside })) + (/[\\/]$/.test(String(a.path)) ? '/' : '');
      const f = await bridge.getFile(tab, String(a.file), { signal });
      const wrote = await writeLocal(abs, f.bytes, { overwrite: !!a.overwrite, name: f.name });
      return `Saved ${f.name} (${f.bytes.length} bytes) to ${wrote}.`;
    },
    disconnect(a) { bridge.disconnect(a.tab ? String(a.tab) : null); return 'Disconnected.'; },
  };

  return {
    list() {
      const all = [...LOCAL_TOOLS, ...proxied()];
      return all;
    },
    changed() { const s = JSON.stringify(proxied().map((t) => [t.name, t.description, t.inputSchema, t.annotations])); if (s === sig) return false; sig = s; return true; },
    async call(name, args, ctx = {}) {
      if (run[name]) return run[name](args || {}, ctx);
      const page = map.get(name);
      if (!page) throw new Error(`Unknown tool ${name}. The tab may have changed; list the tools again.`);
      const { result } = await bridge.call(need(), page, args, { signal: ctx.signal });
      return result;
    },
    clientName,
  };
}
