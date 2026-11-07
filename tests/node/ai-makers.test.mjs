// Which AI models the site offers (shared/ai/makers.js, the brand profile's "ai"): every model id in every catalog has a
// maker, the Chinese makers' ids are known by their ids, and hiding them (hideOrigins CN, or by maker, id pattern or
// provider) takes them out of every list: the providers, their suggested and fetched models, a local server's list, the
// models on this device (and the default falls back to Llama), the picture models, and a saved choice (it falls back too).
// Covers: shared/ai/makers.js, shared/ai/catalog.js, shared/ai/cloud/providers.js, shared/ai/cloud/keys.js,
//   shared/ai/cloud/engine.js, shared/ai/cloud/local.js, shared/ai/cloud/connect.js, shared/ai/imagegen/core.js,
//   shared/ai/imagegen/run.js, shared/ai/imagegen/index.js, shared/ai/picker.js, shared/ai/panel.js, ai/js/app/main.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kit, jsonResponse } from './ai-cloud-env.mjs';
import { FACTS } from '../brand-facts.mjs';

const MORE = ['shared/ai/catalog.js', 'shared/ai/cloud/keys.js', 'shared/ai/cloud/connect.js', 'shared/ai/imagegen/core.js', 'shared/ai/imagegen/run.js'];
const J = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x))), eq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
const read = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
function env(hide = {}) {
  const w = kit({ hide });
  for (const f of MORE) vm.runInContext(read(f), w, { filename: f });
  const K = w.SlopAIKit;
  return { w, K, C: K.cloud, M: K.makers, G: K.imageGen };
}
const CN = { hideOrigins: ['CN'] };
const LIVE = ['deepseek/deepseek-r1', 'qwen/qwen3-235b-a22b', 'z-ai/glm-4.6', 'moonshotai/kimi-k2', 'minimax/minimax-m2', 'baidu/ernie-4.5-300b-a47b',
  'tencent/hunyuan-a13b-instruct', 'bytedance-seed/seed-oss-36b-instruct', 'stepfun-ai/step3', 'thudm/glm-4-32b', '01-ai/yi-large', 'internlm/internlm3-8b-instruct',
  'baichuan-inc/baichuan2-13b-chat', 'meituan/longcat-flash-chat', 'xiaomi/mimo-v2-flash', 'inclusionai/ling-1t', 'openbmb/minicpm-v-4', 'deepseek-r1-distill-llama-70b'];
const KEEP = ['anthropic/claude-sonnet-5.5', 'openai/gpt-oss-120b', 'google/gemma-4-31b-it:free', 'meta-llama/llama-3.3-70b-instruct', 'mistralai/mistral-large',
  'x-ai/grok-4', 'microsoft/phi-4', 'cohere/command-a', 'nvidia/nemotron-3.5-content-safety:free', 'ai21/jamba-large-1.7', 'perplexity/sonar', 'amazon/nova-pro-v1',
  'nousresearch/hermes-4-405b', 'ibm-granite/granite-4.0-h-small', 'llama3.2:3b', 'mistral:7b', 'gpt-oss:20b', 'gemma3:12b', 'phi4-mini'];

test('every model id in every catalog has a maker, so a new model cannot slip past unlabelled', () => {
  const { K, C, M, G } = env();
  const miss = [];
  for (const p of C.providers) for (const m of p._models) if (!M.of(m, p.id).length) miss.push(`${p.id}: ${m.id}`);
  for (const m of K.catalog.all) for (const id of [m.id, m.f32Id]) if (!M.of(id).length) miss.push('on this device: ' + id);
  for (const p of G.providers) for (const m of p.models) if (!M.of(m, p.id).length) miss.push(`pictures ${p.id}: ${m.id}`);
  for (const p of C.providers) for (const x of (p.free && Array.isArray(p.free.models) ? p.free.models : [])) if (typeof x === 'string' && !M.of(x, p.id).length) miss.push(`free ${p.id}: ${x}`);
  eq(miss, []);
  // the table: unique ids, a country (or '*' for a router), a pattern; providers named are catalog entries
  const ids = M.MAKERS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of M.MAKERS) { assert.match(x.origin, /^([A-Z]{2}|\*)$/, x.id); assert.equal(typeof x.match.test, 'function', x.id); for (const pid of x.providers) assert.ok(C.byId(pid), x.id + ' ' + pid); }
});

test('the Chinese makers are known by their model ids; the others are not taken for them', () => {
  const { M } = env();
  const cn = (id) => M.of(id).some((x) => x.origin === 'CN');
  for (const id of LIVE) assert.ok(cn(id), id);
  for (const id of KEEP) assert.ok(!cn(id), id + ': ' + M.of(id).map((x) => x.id));
  const of = (id) => M.of(id).map((x) => x.id);
  eq(of('deepseek-r1-distill-llama-70b'), ['deepseek', 'meta'], 'a fine-tune names its base too');
  eq([of('qwen3:8b'), of('Qwen2.5-1.5B-Instruct-q4f16_1-MLC'), of('glm-5.3'), of('accounts/fireworks/models/kimi-k3')], [['qwen'], ['qwen'], ['zhipu'], ['moonshot']]);
  for (const [pid, maker] of [['deepseek', 'deepseek'], ['qwen', 'qwen'], ['moonshot', 'moonshot'], ['zai', 'zhipu'], ['bigmodel', 'zhipu']]) assert.ok(M.of('any-model', pid).some((x) => x.id === maker), pid);
  for (const x of ['qwen', 'deepseek', 'zhipu', 'moonshot', 'minimax', 'baichuan', '01ai', 'internlm', 'tencent', 'baidu', 'bytedance', 'stepfun']) assert.equal(M.byId(x).origin, 'CN', x);
});

test('nothing hidden by default: every provider and model as before', () => {
  const { K, C, M } = env();
  assert.equal(M.active(), false);
  for (const id of ['deepseek', 'qwen', 'moonshot', 'zai', 'hyperbolic']) assert.ok(C.byId(id), id);
  assert.equal(K.catalog.DEFAULT, 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC');
  assert.equal(K.catalog.list.length, K.catalog.all.length);
  eq(M.filter(LIVE).length, LIVE.length);
});

test('hideOrigins CN: the makers\' own providers go, every list loses their models, the local default falls back to Llama', () => {
  const { K, C, M, G } = env(CN);
  for (const id of ['deepseek', 'qwen', 'moonshot', 'zai', 'bigmodel']) { assert.equal(C.byId(id), null, id); assert.ok(!C.providers.some((p) => p.id === id), id); }
  assert.ok(!C.search('kimi').some((p) => p.id === 'moonshot'));
  for (const p of C.providers) for (const m of [...p.models, ...C.suggested(p, [])]) assert.ok(!M.of(m, p.id).some((x) => x.origin === 'CN'), `${p.id}: ${m.id}`);
  eq(C.byId('cerebras').models.map((m) => m.id), ['gpt-oss-120b']);
  eq(C.byId('hyperbolic').models, [], 'a host with a list keeps its place; its list is filtered when it comes');
  // a fetched list: suggestions from the allowed ones only
  const fetched = [...LIVE, ...KEEP].map((id) => ({ id, name: id }));
  const sug = C.suggested(C.byId('together'), fetched).map((m) => m.id);
  assert.ok(sug.length && sug.every((id) => KEEP.includes(id)), sug.join());
  eq(C.offered(C.byId('openrouter'), fetched).map((m) => m.id), KEEP.filter((id) => M.allowed(id)));
  assert.equal(M.allowed('openrouter/auto'), false, 'a router may pick any maker');
  // the models on this device
  assert.ok(K.catalog.list.length >= 4 && K.catalog.list.every((m) => !/qwen/i.test(m.id)));
  assert.equal(K.catalog.byId('Qwen2.5-1.5B-Instruct-q4f16_1-MLC'), null, 'a saved local choice of a hidden model finds nothing');
  assert.equal(K.catalog.DEFAULT, 'Llama-3.2-3B-Instruct-q4f16_1-MLC');
  assert.ok(K.catalog.byId(K.catalog.DEFAULT));
  // pictures: no Chinese maker among them; the providers stay
  eq(G.providers.map((p) => p.id), ['openai', 'gemini', 'openrouter', 'ollama', 'lmstudio', 'custom']);
});

test('a live model list is filtered: Test connection at OpenRouter, and a server on this computer', async () => {
  const { w, C } = env(CN);
  w.answers.push(jsonResponse({ data: { label: 'k' } }), jsonResponse({ data: [...LIVE, ...KEEP].map((id) => ({ id, name: id })) }));
  const list = await new w.SlopAIKit.CloudEngine({ provider: 'openrouter', model: 'x', key: async () => 'sk-or-v1-0123456789abcdef' }).test();
  assert.ok(list.length > 5 && list.every((m) => KEEP.includes(m.id)), list.map((m) => m.id).join());
  w.answers.push(jsonResponse({ object: 'list', data: [{ id: 'qwen3:8b' }, { id: 'deepseek-r1:8b' }, { id: 'llama3.2:3b' }] }));
  const r = await C.local.diagnose(C.byId('ollama'), 'http://localhost:11434/v1');
  assert.equal(r.ok, true); eq(r.models.map((m) => m.id), ['llama3.2:3b']);
});

test('hideMakers, hideModels (* patterns), hideProviders and onlyMakers', () => {
  let { C, M, G } = env({ hideMakers: ['deepseek'], hideModels: ['*-preview', 'grok-4.6'], hideProviders: ['groq', 'Qwen'] });
  assert.equal(C.byId('deepseek'), null); assert.ok(C.byId('moonshot'), 'only the maker named');
  assert.equal(C.byId('groq'), null); assert.equal(C.byId('qwen'), null);
  assert.equal(M.allowed('gemini-3-flash-preview'), false); assert.equal(M.allowed('gemini-3.8-flash'), true);
  eq(C.byId('xai').models.map((m) => m.id), ['grok-4.7']);
  eq(C.byId('sambanova').models.map((m) => m.id), ['Meta-Llama-3.3-70B-Instruct']);
  ({ C, M, G } = env({ hideMakers: ['bfl'] }));
  assert.equal(C.byId('fal'), null, 'every model of its own hidden, and no list to fetch: gone');
  assert.equal(C.byId('runpod-images'), null);
  assert.ok(!G.models('openrouter').some((m) => /flux/i.test(m.id)));
  ({ C, M } = env({ onlyMakers: ['anthropic', 'openai', 'google', 'mistral', 'meta'] }));
  eq(C.providers.filter((p) => p.group === 'main').map((p) => p.id), ['anthropic', 'openai', 'gemini', 'openrouter']);
  assert.equal(C.byId('xai'), null); assert.equal(C.byId('cohere'), null);
  assert.equal(M.allowed('some-unknown-model'), false, 'with onlyMakers, a model of no known maker is hidden');
  assert.equal(env({ hideOrigins: ['CN'] }).M.allowed('some-unknown-model'), true, 'otherwise it is offered');
});

test('regression: a saved choice of a now-hidden model or provider falls back to an allowed one', async () => {
  const { w, C, G } = env(CN);
  w.localStorage.setItem('slop-ai.cloud', JSON.stringify({ active: 'deepseek', providers: { deepseek: { model: 'deepseek-v4-pro' },
    groq: { model: 'qwen/qwen3-32b', modelName: 'Qwen3 32B' }, anthropic: { model: 'claude-opus-5-5' } },
  lastByApp: { photoslop: { provider: 'groq', model: 'qwen/qwen3-32b' }, pdf: { provider: 'anthropic', model: 'claude-opus-5-5' } } }));
  const s = C.keys.settings();
  assert.equal(s.active, ''); assert.equal(s.providers.deepseek, undefined);
  assert.equal(s.providers.groq.model, undefined); assert.equal(s.providers.anthropic.model, 'claude-opus-5-5');
  eq(Object.keys(s.lastByApp), ['pdf']);
  assert.equal(C.connect.engineFor('groq').model.id, 'openai/gpt-oss-120b', 'the provider\'s first allowed suggestion instead');
  w.sessionStorage.setItem('slop-ai.cloud.key:groq', 'gsk_0123456789abcdef');
  assert.equal(await C.connect.restore('photoslop'), null, 'nothing restored from a hidden provider');
  // pictures: a saved or asked-for hidden model is not used
  w.sessionStorage.setItem('slop-ai.cloud.key:openrouter', 'sk-or-v1-0123456789abcdef');
  w.localStorage.setItem('slop-ai.imagegen', JSON.stringify({ provider: 'openrouter', models: { openrouter: 'bytedance/seedream-4' } }));
  eq(JSON.parse(JSON.stringify(G.settings().models)), {});
  const cur = await G.choose({ provider: 'openrouter', model: 'qwen/qwen-image' });
  assert.equal(cur.model, 'google/gemini-nano-banana-2.1');
});

test('the build\'s own rules: makers.js starts with its profile\'s (the brand facts), and configure() goes back to them', () => {
  const { M } = env(null), want = M.config();
  const norm = (c) => ({ hideOrigins: c.hideOrigins || [], hideMakers: c.hideMakers || [], onlyMakers: c.onlyMakers || [], hideModels: c.hideModels || [], hideProviders: c.hideProviders || [] });
  eq(want, norm(JSON.parse(JSON.stringify(FACTS.aiModels))));
  M.configure(CN); assert.equal(M.active(), true);
  M.configure(); eq(M.config(), want);
  eq(M.configure({ hideOrigins: ['cn', 7], hideMakers: 'x' }), norm({ hideOrigins: ['CN'] }), 'malformed rules are read safely');
});

test('the loaders bring makers.js before the lists that read it', () => {
  assert.match(read('shared/ai/panel.js'), /'makers', 'catalog'/);
  assert.match(read('shared/ai/picker.js'), /K\.load\(\['makers', 'catalog', 'webllm'\]\)/);
  assert.match(read('shared/ai/picker.js'), /const CLOUD = \['makers', 'cloud\/net'/);
  assert.match(read('shared/ai/imagegen/index.js'), /const FILES = \['makers', 'cloud\/net'/);
  for (const f of ['ai/index.html']) assert.match(read(f), /shared\/ai\/makers\.js"><\/script>\s*<script src="\.\.\/shared\/ai\/catalog\.js"/);
  assert.match(read('ai/js/app/main.js'), /def && E\.modelFor\(def\)/, 'a hidden default model is not loaded at start');
});
