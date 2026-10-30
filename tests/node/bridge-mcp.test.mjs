// The MCP stdio layer of the Slopographic MCP server, with a fake client on a pair of streams: the legacy handshake
// (initialize, the client's version when known), the modern per-request version (2026-07-28: server/discover,
// resultType, -32022, subscriptions/listen), tools/list and tools/call round trips, tool errors as isError results,
// protocol errors, cancellation, and tools/list_changed to both kinds of client.
// Run: node --test tests/node/bridge-mcp.test.mjs
// Covers: tools/claude-plugin/server/mcp.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createServer, VERSIONS, ERR } from '../../tools/claude-plugin/server/mcp.mjs';
import { mcpClient } from './bridge-env.mjs';

const M = 'io.modelcontextprotocol/';
const modern = (extra = {}) => ({ _meta: { [M + 'protocolVersion']: '2026-07-28', [M + 'clientInfo']: { name: 'codex', version: '1' }, [M + 'clientCapabilities']: {} }, ...extra });

function setup() {
  const input = new PassThrough(), output = new PassThrough();
  let gate = null;
  const tools = {
    list: () => [{ name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: { s: { type: 'string' } } } },
      { name: 'boom', description: 'fails', inputSchema: { type: 'object' } }, { name: 'slow', description: 'waits', inputSchema: { type: 'object' } }],
    async call(name, args, ctx) {
      if (name === 'echo') return 'you said ' + args.s;
      if (name === 'boom') throw new Error('it broke');
      return new Promise((res) => { gate = res; ctx.signal.addEventListener('abort', () => res('aborted')); });
    },
  };
  const server = createServer({ info: { name: 'slopographic', version: '9.9.9' }, instructions: 'hi', tools }, { input, output, log: () => {} });
  return { server, client: mcpClient(input, output), release: (v) => gate && gate(v) };
}

test('legacy: initialize answers the client\'s version (or the newest legacy one), then tools/list and tools/call', async () => {
  const { server, client } = setup();
  const init = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '2' } });
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.deepEqual(init.result.capabilities, { tools: { listChanged: true } });
  assert.equal(init.result.serverInfo.version, '9.9.9');
  assert.equal(init.result.instructions, 'hi');
  assert.equal(init.result.resultType, undefined, 'legacy results have no resultType');
  client.notify('notifications/initialized');
  assert.equal(server.client().name, 'claude-code');
  const list = await client.request('tools/list');
  assert.deepEqual(list.result.tools.map((t) => t.name), ['echo', 'boom', 'slow']);
  const r = await client.request('tools/call', { name: 'echo', arguments: { s: 'hello' } });
  assert.deepEqual(r.result, { content: [{ type: 'text', text: 'you said hello' }] });
  const bad = await client.request('tools/call', { name: 'boom', arguments: {} });
  assert.equal(bad.result.isError, true, 'a failing tool is a result with isError, not a protocol error');
  assert.match(bad.result.content[0].text, /it broke/);
  const unknown = await client.request('tools/call', { name: 'nope' });
  assert.equal(unknown.error.code, ERR.params);
  assert.equal((await client.request('no/such')).error.code, ERR.method);
  assert.deepEqual((await client.request('ping')).result, {});
  const other = setup();
  assert.equal((await other.client.request('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-11-25');
  server.notifyToolsChanged();
  await client.next((m) => m.method === 'notifications/tools/list_changed');
});

test('modern (2026-07-28): discover, resultType, per-request version, unsupported versions', async () => {
  const { server, client } = setup();
  const d = await client.request('server/discover', modern());
  assert.equal(d.result.resultType, 'complete');
  assert.deepEqual(d.result.supportedVersions, VERSIONS);
  assert.equal(d.result._meta[M + 'serverInfo'].name, 'slopographic');
  assert.ok(d.result.capabilities.tools);
  const list = await client.request('tools/list', modern());
  assert.equal(list.result.resultType, 'complete');
  assert.equal(list.result.tools.length, 3);
  const r = await client.request('tools/call', modern({ name: 'echo', arguments: { s: 'x' } }));
  assert.equal(r.result.resultType, 'complete');
  assert.equal(r.result.content[0].text, 'you said x');
  assert.equal(server.client().name, 'codex');
  const old = await client.request('tools/list', { _meta: { [M + 'protocolVersion']: '1900-01-01' } });
  assert.equal(old.error.code, -32022);
  assert.deepEqual(old.error.data, { supported: VERSIONS, requested: '1900-01-01' });
});

test('modern: subscriptions/listen acknowledges, then carries tools/list_changed with its id', async () => {
  const { server, client } = setup();
  client.send({ jsonrpc: '2.0', id: 'sub-1', method: 'subscriptions/listen', params: modern({ notifications: { toolsListChanged: true, promptsListChanged: true } }) });
  const ack = await client.next((m) => m.method === 'notifications/subscriptions/acknowledged');
  assert.equal(ack.params._meta[M + 'subscriptionId'], 'sub-1');
  assert.deepEqual(ack.params.notifications, { toolsListChanged: true }, 'only what the server will send');
  server.notifyToolsChanged();
  const n = await client.next((m) => m.method === 'notifications/tools/list_changed');
  assert.equal(n.params._meta[M + 'subscriptionId'], 'sub-1');
  client.notify('notifications/cancelled', { requestId: 'sub-1' });
  await new Promise((r) => setTimeout(r, 50));
  server.notifyToolsChanged();
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!client.raw.some((m) => m.method === 'notifications/tools/list_changed'), 'nothing after the client cancelled');
});

test('cancellation stops waiting for a call; malformed input gets JSON-RPC errors', async () => {
  const { client } = setup();
  await client.request('initialize', { protocolVersion: '2025-11-25', capabilities: {} });
  client.send({ jsonrpc: '2.0', id: 77, method: 'tools/call', params: { name: 'slow', arguments: {} } });
  await new Promise((r) => setTimeout(r, 30));
  client.notify('notifications/cancelled', { requestId: 77, reason: 'user' });
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!client.raw.some((m) => m.id === 77), 'no answer to a cancelled request');
  client.send('{not json');
  assert.equal((await client.next((m) => m.error && m.error.code === ERR.parse)).id, null);
  client.send({ jsonrpc: '1.0', id: 5, method: 'ping' });
  assert.equal((await client.next((m) => m.id === 5)).error.code, ERR.invalid);
  client.send([{ jsonrpc: '2.0', id: 6, method: 'ping' }]);
  await client.next((m) => m.error && m.error.code === ERR.invalid && m.id === null);
});
