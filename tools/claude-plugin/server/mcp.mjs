// MCP over stdio (JSON-RPC 2.0, one message per line; nothing but protocol messages on stdout, logs on stderr), dual-era
// as the 2026-07-28 revision allows (basic/versioning ▸ Backward Compatibility):
//   modern (2026-07-28): no handshake; every request names its version in params._meta; server/discover; results carry
//     resultType "complete"; tool-list changes go to clients that opened subscriptions/listen { toolsListChanged }.
//   legacy (2025-11-25 and earlier): initialize (the server answers the client's version when it knows it, else its
//     newest), notifications/initialized, then unsolicited notifications/tools/list_changed.
// Only a tools server: ping, tools/list, tools/call, notifications/cancelled. No dependencies.
//   createServer({ info, instructions, tools: { list() → [tool], call(name, args, { signal, client }) → result } },
//                { input, output, log }) → { notifyToolsChanged(), client(), close(), done }
// A result: { content: [...], isError? }; a string or value is wrapped as text; a thrown error is an isError result.
import { createInterface } from 'node:readline';

export const MODERN = ['2026-07-28'];
export const LEGACY = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export const VERSIONS = [...MODERN, ...LEGACY];
export const ERR = { parse: -32700, invalid: -32600, method: -32601, params: -32602, internal: -32603, version: -32022 };
const M = 'io.modelcontextprotocol/';

export function textResult(v, isError) {
  if (v && typeof v === 'object' && Array.isArray(v.content)) return isError && !v.isError ? { ...v, isError: true } : v;
  const text = typeof v === 'string' ? v : v === undefined ? 'Done.' : JSON.stringify(v, null, 1);
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] };
}

export function createServer({ info, instructions, tools }, { input = process.stdin, output = process.stdout, log = (...a) => console.error(...a) } = {}) {
  let legacy = false, clientInfo = null, closed = false;
  const running = new Map();   // request id → AbortController
  const subs = new Set();      // ids of modern subscriptions/listen requests with toolsListChanged
  const write = (msg) => { if (!closed) output.write(JSON.stringify(msg) + '\n'); };
  const fail = (id, code, message, data) => write({ jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } });

  async function request(msg) {
    const { id, method } = msg, params = msg.params && typeof msg.params === 'object' ? msg.params : {};
    const meta = params._meta && typeof params._meta === 'object' ? params._meta : null;
    const asked = meta ? meta[M + 'protocolVersion'] : undefined;
    const modern = asked !== undefined;
    if (modern) {
      if (!MODERN.includes(asked)) return fail(id, ERR.version, 'Unsupported protocol version', { supported: VERSIONS, requested: asked });
      if (meta[M + 'clientInfo']) clientInfo = { ...meta[M + 'clientInfo'], capabilities: meta[M + 'clientCapabilities'] || {} };
    }
    const reply = (result) => write({ jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...result } : result });

    if (method === 'initialize' && !modern) {
      legacy = true;
      const v = params.protocolVersion;
      clientInfo = { ...(params.clientInfo || {}), capabilities: params.capabilities || {} };
      return reply({ protocolVersion: LEGACY.includes(v) ? v : LEGACY[0], capabilities: { tools: { listChanged: true } }, serverInfo: info, ...(instructions ? { instructions } : {}) });
    }
    if (method === 'server/discover') {
      return reply({ supportedVersions: VERSIONS, capabilities: { tools: { listChanged: true } }, _meta: { [M + 'serverInfo']: info }, ...(instructions ? { instructions } : {}) });
    }
    if (method === 'subscriptions/listen' && modern) {
      const want = params.notifications || {};
      if (want.toolsListChanged) subs.add(id);
      write({ jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged', params: { _meta: { [M + 'subscriptionId']: id }, notifications: want.toolsListChanged ? { toolsListChanged: true } : {} } });
      if (!want.toolsListChanged) reply({ _meta: { [M + 'subscriptionId']: id } });   // nothing we can send on it
      return;   // the stream stays open until the client cancels it
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: await tools.list() });
    if (method === 'tools/call') {
      if (typeof params.name !== 'string') return fail(id, ERR.params, 'tools/call needs a tool name');
      if (!(await tools.list()).some((t) => t.name === params.name)) return fail(id, ERR.params, `Unknown tool: ${params.name}`);
      const ctrl = new AbortController();
      running.set(id, ctrl);
      try {
        const r = await tools.call(params.name, params.arguments && typeof params.arguments === 'object' ? params.arguments : {}, { signal: ctrl.signal, client: clientInfo });
        if (!ctrl.signal.aborted) reply(textResult(r));
      } catch (e) {
        if (!ctrl.signal.aborted) reply(textResult(String((e && e.message) || e), true));
      } finally { running.delete(id); }
      return;
    }
    return fail(id, ERR.method, `Method not found: ${method}`);
  }

  function notification(msg) {
    if (msg.method === 'notifications/initialized') return;
    if (msg.method === 'notifications/cancelled') {
      const rid = msg.params && msg.params.requestId;
      if (subs.delete(rid)) return;
      const c = running.get(rid);
      if (c) c.abort(new Error((msg.params && msg.params.reason) || 'cancelled'));
    }
    // other notifications are ignored, as the spec allows
  }

  function handle(line) {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { return fail(null, ERR.parse, 'Parse error'); }
    if (Array.isArray(msg)) return fail(null, ERR.invalid, 'Batches are not supported');
    if (!msg || msg.jsonrpc !== '2.0') return fail(msg && msg.id != null ? msg.id : null, ERR.invalid, 'Invalid Request');
    if (msg.method === undefined) return;   // a response: this server sends no requests
    if (msg.id === undefined || msg.id === null) return notification(msg);
    request(msg).catch((e) => { log('slopographic-mcp:', e); fail(msg.id, ERR.internal, String((e && e.message) || e)); });
  }

  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', handle);
  const done = new Promise((res) => rl.on('close', () => { closed = true; for (const c of running.values()) c.abort(); res(); }));

  return {
    notifyToolsChanged() {
      if (legacy) write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
      for (const id of subs) write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed', params: { _meta: { [M + 'subscriptionId']: id } } });
    },
    client: () => clientInfo,
    close: () => { closed = true; rl.close(); },
    done,
  };
}
