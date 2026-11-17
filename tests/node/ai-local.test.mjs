// Model servers on this computer: Test connection says which part failed (mixed content, the browser's local network
// permission, CORS, nothing running, a wrong path, a key, no models) with the fix for that server, and "Find servers"
// asks the presets' default ports. A fake fetch plays each server; nothing is sent anywhere.
// Covers: shared/ai/cloud/local.js, shared/ai/cloud/providers.js, shared/ai/cloud/catalog/local.js, shared/ai/cloud/compat.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit, jsonResponse } from './ai-cloud-env.mjs';

const J = (x) => JSON.parse(JSON.stringify(x));   // values from the vm's realm

/** A kit whose fetch answers per URL: servers = { 'http://localhost:11434': 'ok' | 'cors' | 'down' | 404 | 401 | 'empty' }. */
function env(servers, perm = '') {
  const w = kit(), C = w.SlopAIKit.cloud, seen = [];
  if (perm) w.navigator.permissions = { query: async ({ name }) => { if (name !== 'local-network-access') throw new TypeError('unknown'); return { state: perm }; } };
  w.fetch = async (url, init = {}) => {
    url = String(url); seen.push({ url, mode: init.mode || 'cors' });
    const s = servers[new URL(url).origin];
    if (s === undefined || s === 'down') throw new TypeError('Failed to fetch');
    if (init.mode === 'no-cors') return new Response(null, { status: 200 });   // opaque: a server is there
    if (s === 'cors') throw new TypeError('Failed to fetch');
    if (typeof s === 'number') return jsonResponse({ error: { message: 'nope' } }, s);
    return jsonResponse({ object: 'list', data: s === 'empty' ? [] : [{ id: 'qwen3:8b' }, { id: 'nomic-embed-text' }] });
  };
  return { w, C, seen, ollama: C.byId('ollama') };
}

test('mixed content: plain http to another machine is refused before anything is sent, with the https ways', async () => {
  const { C, seen, ollama } = env({});
  const r = await C.local.diagnose(ollama, 'http://192.168.1.20:11434/v1');
  assert.equal(r.kind, 'mixed'); assert.match(r.message, /mixed content/); assert.match(r.message, /https:\/\/ address, or http:\/\/localhost/);
  assert.match(r.fix.join(' '), /Tailscale/); assert.match(r.fix.join(' '), /cloudflared|ngrok/);
  assert.equal(seen.length, 0);
  assert.equal(C.local.where('http://127.0.0.1:1234/v1'), 'this-computer'); assert.equal(C.local.where('http://10.0.0.3:8000/v1'), 'network');
  assert.equal(C.local.where('https://gpu.example.org/v1'), 'internet');
  assert.equal((await C.local.diagnose(ollama, 'https://box.tail1234.ts.net/v1')).kind, 'down', 'https on the network is allowed and tried');
});

test('the local network permission blocked for this site', async () => {
  let { C, seen, ollama } = env({ 'http://localhost:11434': 'down' }, 'denied');
  let r = await C.local.diagnose(ollama, 'http://localhost:11434/v1');
  assert.equal(r.kind, 'permission'); assert.match(r.fix[0], /Site settings/); assert.equal(seen.length, 1, 'asked only after the request failed');
  ({ C, ollama } = env({ 'http://localhost:11434': 'ok' }, 'denied'));
  r = await C.local.diagnose(ollama, 'http://localhost:11434/v1');
  assert.equal(r.kind, 'ok', 'a browser that says denied but lets it through is not blocked');
});

test('CORS: it answers a no-cors request but refuses the real one, so the fix is that server’s setting', async () => {
  const { C, seen, ollama } = env({ 'http://localhost:11434': 'cors', 'http://localhost:8000': 'cors' });
  let r = await C.local.diagnose(ollama, 'http://localhost:11434/v1');
  assert.equal(r.kind, 'cors'); assert.match(r.fix.join(' '), /OLLAMA_ORIGINS to https:\/\/slopographic\.com/);
  assert.deepEqual(seen.map((s) => s.mode), ['cors', 'no-cors']);
  r = await C.local.diagnose(C.byId('vllm'), 'http://localhost:8000/v1');
  assert.equal(r.kind, 'cors'); assert.match(r.fix.join(' '), /--allowed-origins/);
});

test('nothing running, a wrong path, a key wanted, no models, and connected', async () => {
  const { C, ollama } = env({ 'http://localhost:1234': 404, 'http://localhost:8000': 401, 'http://localhost:11434': 'empty', 'http://localhost:5001': 'ok' });
  let r = await C.local.diagnose(ollama, 'http://localhost:9999/v1');
  assert.equal(r.kind, 'down'); assert.match(r.fix.join(' '), /running/); assert.match(r.fix.join(' '), /choose Allow/);
  r = await C.local.diagnose(C.byId('lmstudio'), 'http://localhost:1234');
  assert.equal(r.kind, 'path'); assert.equal(r.base, 'http://localhost:1234/v1'); assert.match(r.fix[0], /try http:\/\/localhost:1234\/v1/);
  r = await C.local.diagnose(C.byId('vllm'), 'http://localhost:8000/v1');
  assert.equal(r.kind, 'key'); assert.match(r.fix[0], /--api-key/);
  r = await C.local.diagnose(ollama, 'http://localhost:11434/v1');
  assert.equal(r.kind, 'none'); assert.match(r.fix[0], /ollama pull/);
  r = await C.local.diagnose(C.byId('koboldcpp'), 'http://localhost:5001/v1');
  assert.equal(r.ok, true); assert.equal(r.kind, 'ok'); assert.deepEqual(J(r.models.map((m) => m.id)), ['qwen3:8b'], 'the embedding model is left out');
});

test('Find servers: every preset port asked once, what answers listed, a CORS-blocked one marked', async () => {
  const { C, seen } = env({ 'http://localhost:11434': 'ok', 'http://localhost:1234': 'cors', 'http://localhost:8080': 'ok' });
  const found = await C.local.find();
  const ports = [...new Set(seen.filter((s) => s.mode === 'cors').map((s) => new URL(s.url).port))].sort();
  assert.deepEqual(ports, ['11434', '1234', '1337', '5000', '5001', '8000', '8080', '9931'].sort(), 'each default port once');
  const by = Object.fromEntries(found.map((f) => [f.port, f]));
  assert.deepEqual(Object.keys(by).map(Number).sort((a, b) => a - b), [1234, 8080, 11434]);
  assert.equal(by[11434].state, 'ok'); assert.deepEqual(J(by[11434].ids), ['ollama']); assert.equal(by[11434].base, 'http://localhost:11434/v1');
  assert.equal(by[1234].state, 'cors');
  assert.deepEqual(J(by[8080].ids).sort(), ['llamacpp', 'localai'], 'llama.cpp and LocalAI share 8080');
  assert.deepEqual(J(by[8080].models), ['qwen3:8b', 'nomic-embed-text']);
});
