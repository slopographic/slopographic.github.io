// The AI provider catalog: every entry well-formed (required fields, a known format, https docs, templates that
// resolve), search, and request building through templated addresses (RunPod's endpoint id, Cloudflare's account id,
// Azure's api-version and api-key header). No real key, no network.
// Covers: shared/ai/cloud/catalog/main.js, shared/ai/cloud/catalog/open.js, shared/ai/cloud/catalog/cloud.js,
//   shared/ai/cloud/catalog/more.js, shared/ai/cloud/catalog/local.js, shared/ai/cloud/catalog/images.js,
//   shared/ai/cloud/providers.js, shared/ai/cloud/compat.js, shared/ai/cloud/engine.js, tools/check-ai-cors.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit, jsonResponse } from './ai-cloud-env.mjs';
import { catalog, probe } from '../../tools/check-ai-cors.mjs';

const w = kit(), C = w.SlopAIKit.cloud;
const GROUPS = new Set(['main', 'fast', 'open-models', 'cloud', 'local', 'images', 'other']);
const user = [{ role: 'user', content: 'hi' }];

test('every catalog entry has the required fields, a known format and group, https docs and key pages', () => {
  const ids = new Set();
  assert.ok(C.providers.length >= 45, 'about fifty providers: ' + C.providers.length);
  for (const p of C.providers) {
    const at = p.id + ': ';
    assert.match(p.id, /^[a-z0-9-]+$/, at + 'id'); assert.ok(!ids.has(p.id), at + 'unique id'); ids.add(p.id);
    for (const k of ['name', 'who', 'short', 'group', 'format', 'cors', 'docs']) assert.ok(typeof p[k] === 'string' && p[k], at + k);
    assert.ok(GROUPS.has(p.group), at + 'group ' + p.group);
    assert.ok(C.FORMATS[p.format] || C.IMAGE_FORMATS.includes(p.format), at + 'format ' + p.format);
    if (p.chat) assert.ok(C.formats[p.format] && typeof C.formats[p.format].request === 'function', at + 'the format is loaded');
    assert.ok(['verified', 'needs-proxy', 'unknown'].includes(p.cors), at + 'cors');
    if (p.cors === 'needs-proxy') { assert.ok(p.corsNote && p.corsNote.length > 20, at + 'says why it needs a proxy'); assert.equal(p.usable, false); }
    assert.match(p.docs, /^https:\/\//, at + 'docs https');
    if (p.keyUrl) assert.match(p.keyUrl, /^https:\/\//, at + 'key page https');
    if (p.needsKey && p.usable && !p.keyOf) assert.ok(p.keyUrl, at + 'where to get a key');
    if (p.base) assert.match(p.base, p.local ? /^http:\/\/(localhost|127\.0\.0\.1):\d+\/v1$/ : /^https:\/\//, at + 'base');
    assert.equal(typeof p.caps, 'object', at + 'caps');
    for (const c of Object.keys(p.caps)) assert.ok(['tools', 'vision', 'images', 'streaming'].includes(c), at + 'cap ' + c);
    for (const m of p.models) assert.ok(m.id && m.name, at + 'model ' + JSON.stringify(m));
    if (p.keyOf) assert.ok(C.byId(p.keyOf), at + 'keyOf names an entry');
    if (p.local) assert.ok(p.port && p.setup && p.setup.length, at + 'a local server has its port and setup help');
    assert.notEqual(p.modelsEndpoint, undefined, at + 'modelsEndpoint (a path or false)');
    if (p.chat && p.usable && p.modelsEndpoint === false) assert.ok(p.models.length, at + 'no model list, so default models');
  }
  // Main keeps today's four, in order, then the local ones
  assert.deepEqual([...C.providers.filter((p) => p.group === 'main').map((p) => p.id)], ['anthropic', 'openai', 'gemini', 'openrouter']);
  for (const id of ['ollama', 'lmstudio', 'vllm', 'llamacpp', 'jan', 'localai', 'koboldcpp', 'textgen', 'custom']) assert.equal(C.byId(id).group, 'local', id);
  for (const id of ['runpod', 'groq', 'together', 'fireworks', 'deepinfra', 'mistral', 'xai', 'deepseek', 'cerebras', 'sambanova', 'perplexity', 'nebius', 'novita',
    'hyperbolic', 'huggingface', 'cloudflare', 'azure', 'azure-classic', 'cohere', 'ai21', 'moonshot', 'qwen', 'zai', 'bedrock', 'vertex', 'fal', 'replicate',
    'together-images', 'stability', 'bfl', 'ideogram', 'recraft', 'runpod-images']) assert.ok(C.byId(id), id);
});

test('URL templates: every {field} has its field, and resolves when filled', () => {
  for (const p of C.providers) {
    const keys = [...String(p.base || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    for (const k of keys) assert.ok((p.fields || []).some((f) => f.id === k), `${p.id}: a field for {${k}}`);
    const vals = Object.fromEntries((p.fields || []).map((f) => [f.id, 'x1']));
    const r = C.resolve(p, vals);
    assert.deepEqual([...r.missing], [], p.id); assert.doesNotMatch(r.url, /[{}]/, p.id);
    if (p.base && !p.local) assert.doesNotThrow(() => new w.URL(r.url), p.id);
  }
  const rp = C.byId('runpod');
  assert.deepEqual([...C.resolve(rp, {}).missing], ['Endpoint ID']);
  assert.equal(C.resolve(rp, { endpointId: 'a b/c' }).url, 'https://api.runpod.ai/v2/a%20b%2Fc/openai/v1', 'values are URL-encoded');
  assert.equal(C.baseFor(rp, { fields: { endpointId: 'ep42' } }), 'https://api.runpod.ai/v2/ep42/openai/v1');
  assert.equal(C.baseFor(C.byId('ollama'), { base: 'http://127.0.0.1:11434/v1' }), 'http://127.0.0.1:11434/v1');
  assert.equal(C.resolve(C.byId('azure-classic'), { resource: 'r', deployment: 'd' }).url, 'https://r.openai.azure.com/openai/deployments/d?api-version=2024-10-21', 'a default fills its field');
});

test('requests through templated addresses: RunPod endpoint id, Cloudflare account id, Azure api-version and api-key', () => {
  const req = (id, fields, key = 'k-123456') => { const p = C.byId(id); return C.formats[p.format].request({ key, model: 'm', base: C.baseFor(p, { fields }), provider: p }, user, [], {}); };
  let r = req('runpod', { endpointId: 'ep42' });
  assert.equal(r.url, 'https://api.runpod.ai/v2/ep42/openai/v1/chat/completions'); assert.equal(r.init.headers.authorization, 'Bearer k-123456');
  r = req('cloudflare', { accountId: 'acc9' });
  assert.equal(r.url, 'https://api.cloudflare.com/client/v4/accounts/acc9/ai/v1/chat/completions');
  r = req('azure-classic', { resource: 'myres', deployment: 'gpt4o', apiVersion: '2024-10-21' });
  assert.equal(r.url, 'https://myres.openai.azure.com/openai/deployments/gpt4o/chat/completions?api-version=2024-10-21');
  assert.equal(r.init.headers['api-key'], 'k-123456'); assert.equal(r.init.headers.authorization, undefined, 'Azure takes api-key, not Bearer');
  r = req('azure', { resource: 'myres' });
  assert.equal(r.url, 'https://myres.openai.azure.com/openai/v1/chat/completions');
  r = req('bedrock', { region: 'eu-west-1' });
  assert.equal(r.url, 'https://bedrock-mantle.eu-west-1.api.aws/v1/chat/completions');
  r = req('groq', {});
  assert.equal(r.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(C.endpoint('https://h/x?api-version=1', '/models'), 'https://h/x/models?api-version=1');
});

test('model lists through a template, without the embedding and picture models; providers with no list', async () => {
  const p = C.byId('runpod'), cfg = { key: 'k-1', base: C.baseFor(p, { fields: { endpointId: 'ep42' } }), provider: p };
  w.answers.push(jsonResponse({ data: [{ id: 'Qwen/Qwen3-8B' }, { id: 'BAAI/bge-embed-large' }, { id: 'flux', type: 'image' }] }));
  assert.deepEqual((await C.formats[p.format].models(cfg)).map((m) => m.id), ['Qwen/Qwen3-8B']);
  assert.equal(w.requests.pop().url, 'https://api.runpod.ai/v2/ep42/openai/v1/models');
  const az = new w.SlopAIKit.CloudEngine({ provider: 'azure-classic', model: 'deployment', base: 'https://r.openai.azure.com/openai/deployments/d?api-version=2024-10-21', key: async () => 'k-1' });
  const n = w.requests.length;
  assert.deepEqual([...(await az.test())], []); assert.equal(w.requests.length, n, 'no model list: nothing sent');
});

test('search: names, aliases and model names; needs-proxy entries are found but not usable', () => {
  const ids = (q) => C.search(q).map((p) => p.id);
  assert.equal(ids('runpod')[0], 'runpod'); assert.ok(ids('runpod').includes('runpod-images'));
  assert.equal(ids('grok')[0], 'xai');
  assert.equal(ids('kimi')[0], 'moonshot');
  assert.ok(ids('oobabooga').includes('textgen'));
  assert.ok(ids('gpt-oss').includes('groq'), 'a model name finds its hosts');
  assert.ok(ids('aws').includes('bedrock'));
  assert.equal(C.byId('cloudflare').usable, false); assert.equal(C.byId('vertex').usable, false);
  assert.equal(ids('zzzz-nothing').length, 0);
  assert.equal(C.search('').length, C.providers.length);
});

test('local help: each server its own setting, this website filled in', () => {
  const help = (id) => C.localHelp(C.byId(id)).join(' ');
  assert.match(help('ollama'), /OLLAMA_ORIGINS to https:\/\/slopographic\.com/);
  assert.match(help('lmstudio'), /Enable CORS/);
  assert.match(help('vllm'), /--allowed-origins '\["https:\/\/slopographic\.com"\]'/);
  assert.match(help('llamacpp'), /--cors-origins/);
  assert.match(help('localai'), /LOCALAI_CORS_ALLOW_ORIGINS=https:\/\/slopographic\.com/);
  assert.match(help('textgen'), /--api/);
  for (const id of ['ollama', 'jan', 'koboldcpp']) assert.match(help(id), /Apps on device/);
});

test('tools/check-ai-cors.mjs asks each provider about the request it really sends (no network here)', () => {
  const K = catalog('https://slopographic.com'), at = (id) => probe(K.byId(id));
  assert.deepEqual(at('anthropic'), { url: 'https://api.anthropic.com/v1/messages', headers: ['anthropic-dangerous-direct-browser-access', 'anthropic-version', 'content-type', 'x-api-key'] });
  assert.equal(at('runpod').url, 'https://api.runpod.ai/v2/probe1/openai/v1/chat/completions');
  assert.deepEqual(at('azure').headers, ['api-key', 'content-type']); assert.equal(at('azure').url, 'https://example.openai.azure.com/openai/v1/chat/completions');
  assert.match(at('azure-classic').url, /\/openai\/deployments\/probe1\/chat\/completions\?api-version=2024-10-21$/);
  assert.deepEqual(at('openrouter').headers, ['authorization', 'content-type', 'http-referer', 'x-openrouter-title']);
  assert.equal(at('gemini').url, 'https://generativelanguage.googleapis.com/v1beta/models/x:streamGenerateContent');
  assert.equal(at('fal').url, 'https://queue.fal.run/fal-ai/flux/schnell');
});
