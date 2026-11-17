// Free AI: the catalog's `free` fields (shape; every free offer has its sign-up page, the page it was read from and the
// date), OpenRouter's free models found in a real (trimmed) copy of its public /models list, which models count as free
// per provider, and the plain rate-limit message of a free tier (when to retry, where else to go). No network.
// Covers: shared/ai/cloud/free.js, shared/ai/cloud/net.js, shared/ai/cloud/compat.js, shared/ai/cloud/engine.js,
//   shared/ai/cloud/catalog/main.js, shared/ai/cloud/catalog/open.js, shared/ai/cloud/catalog/more.js,
//   shared/ai/cloud/catalog/local.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kit, jsonResponse } from './ai-cloud-env.mjs';

const w = kit(), C = w.SlopAIKit.cloud, F = C.free;
const OR_MODELS = JSON.parse(readFileSync(new URL('./ai-openrouter-models.json', import.meta.url), 'utf8'));
const TIERS = ['free', 'free-models', 'free-trial', 'none'];

test('every free field is well-formed, and every free offer says where to sign up, where it was read and when', () => {
  let n = 0;
  for (const p of C.providers) {
    const f = p.free, at = p.id + ': ';
    if (!f) continue;
    n++;
    assert.ok(TIERS.includes(f.tier), at + 'tier ' + f.tier);
    assert.match(f.verified, /^\d{4}-\d{2}-\d{2}$/, at + 'verified date');
    assert.match(f.docs, /^https:\/\//, at + 'docs');
    assert.ok(typeof f.note === 'string' && f.note.length > 20, at + 'a note in plain words');
    if (f.tier === 'none') { assert.equal(F.tier(p), null, at + 'no free offer'); continue; }
    assert.ok(F.tier(p), at + 'a free offer');
    assert.match(f.signup, /^https:\/\//, at + 'signup');
    assert.ok(f.training === null || (typeof f.training === 'string' && f.training.length > 10), at + 'training: words or null');
    if (f.training === null) assert.ok(p.local, at + 'only a server on this computer sends nothing anywhere');
    if (f.models !== undefined) assert.ok(f.models === 'all' || Array.isArray(f.models), at + 'models');
    if (!p.local) assert.ok(f.limits, at + 'limits for the rate-limit message');
  }
  assert.ok(n >= 12, 'free fields: ' + n);
  const tier = (id) => (C.byId(id).free || {}).tier;
  assert.equal(tier('gemini'), 'free'); assert.equal(tier('groq'), 'free'); assert.equal(tier('openrouter'), 'free-models');
  assert.equal(tier('mistral'), 'free'); assert.equal(tier('cerebras'), 'free-trial'); assert.equal(tier('huggingface'), 'none');
  for (const id of ['ollama', 'lmstudio', 'llamacpp']) assert.equal(tier(id), 'free', id);
  assert.equal(C.byId('custom').free, undefined, 'any address: not known to be free');
  assert.equal(C.byId('anthropic').free, undefined);
  assert.match(C.byId('gemini').free.training, /EEA, Switzerland and the UK/);
  assert.deepEqual(['gemini', 'groq', 'openrouter', 'cerebras', 'huggingface'].map((id) => F.label(C.byId(id))), ['Free', 'Free', 'Free models', 'Free trial', '']);
});

test('OpenRouter: free models from its /models list (":free" ids and zero prices), with whether they use tools', async () => {
  w.answers.push(jsonResponse(OR_MODELS));
  const p = C.byId('openrouter');
  const list = await C.formats.compat.models({ base: p.base, key: 'sk-or-test', provider: p });
  const by = Object.fromEntries(list.map((m) => [m.id, m]));
  assert.equal(by['google/gemma-4-31b-it:free'].free, true);
  assert.equal(by['google/gemma-4-31b-it:free'].tools, true);
  assert.equal(by['nvidia/nemotron-3.5-content-safety:free'].free, true);
  assert.equal(by['nvidia/nemotron-3.5-content-safety:free'].tools, false, 'free, but cannot use tools');
  assert.equal(by['openrouter/free'].free, true, 'zero prices without ":free"');
  assert.equal(by['anthropic/claude-sonnet-5.5'].free, false);
  assert.equal(by['openai/gpt-6.1-sol-pro'].free, false, 'an overrides array is not a zero price');
  assert.equal(F.model(p, by['openrouter/free']), true); assert.equal(F.model(p, by['anthropic/claude-sonnet-5.5']), false);
  assert.equal(F.model(p, { id: 'meta/some-model:free' }), true, 'an id alone');
  assert.equal(F.known(p, list), true);
  assert.equal(F.priced({ id: 'x', pricing: { prompt: '0', completion: '0.000001' } }), false);
  assert.equal(F.priced({ id: 'x' }), false);
});

test('which models count as free: Gemini by its free list, Groq all, Mistral not known, local always', () => {
  const g = C.byId('gemini');
  assert.equal(F.model(g, { id: 'gemini-3.8-flash' }), true);
  assert.equal(F.model(g, { id: 'gemini-2.5-pro' }), true);
  assert.equal(F.model(g, { id: 'gemma-4-31b-it' }), true);
  assert.equal(F.model(g, { id: 'gemini-3.8-pro' }), false, 'not on the free tier');
  assert.equal(F.model(g, { id: 'gemini-4-argon' }), false);
  assert.equal(F.model(C.byId('groq'), { id: 'openai/gpt-oss-120b' }), true);
  assert.equal(F.model(C.byId('mistral'), { id: 'mistral-small-latest' }), null);
  assert.equal(F.known(C.byId('mistral'), [{ id: 'mistral-small-latest' }]), false);
  assert.equal(F.model(C.byId('ollama'), { id: 'qwen3:8b' }), true);
  assert.equal(F.model(C.byId('anthropic'), { id: 'claude-haiku-5-5' }), null);
  assert.deepEqual([...F.others(C.byId('gemini'))].slice(0, 2), ['Groq', 'OpenRouter']);
  assert.ok(!F.others(C.byId('groq')).includes('Cerebras'), 'a trial is not suggested');
  assert.equal(F.wait(40), 'about 40 seconds'); assert.equal(F.wait(200), 'about 3 minutes'); assert.equal(F.wait(7200), 'about 2 hours');
});

const rateErr = async (id, model, res) => {
  const p = C.byId(id);
  w.answers.push(res);
  return C.call(p.base + '/x', {}, { secret: 'k', provider: p, model }).then(() => null, (e) => e);
};

test('a free tier at its limit: when to retry and where else to go, in plain words', async () => {
  // Groq: Retry-After in seconds
  let e = await rateErr('groq', 'openai/gpt-oss-120b', jsonResponse({ error: { message: 'Rate limit reached for model' } }, 429, { 'retry-after': '7' }));
  assert.equal(e.kind, 'rate'); assert.equal(e.retryAfter, 7);
  assert.match(e.message, /Groq says too many requests/); assert.match(e.message, /about 30 requests a minute/);
  assert.match(e.message, /Try again in about 7 seconds/); assert.match(e.message, /another free provider \(Gemini or OpenRouter\)/);
  assert.match(e.message, /a model on this device/);
  // Gemini's free tier answers "quota … billing" with a retryDelay: a wait, not "no credit left"
  const body = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } };
  e = await rateErr('gemini', 'gemini-3.8-flash', jsonResponse([body], 429));
  assert.equal(e.kind, 'rate'); assert.equal(e.retryAfter, 37);
  assert.match(e.message, /Try again in about 37 seconds/); assert.match(e.message, /Groq or OpenRouter/);
  // without a time: the daily reset
  e = await rateErr('gemini', 'gemini-3.8-flash', jsonResponse({ error: { message: 'Resource has been exhausted (e.g. check quota). free_tier' } }, 429));
  assert.equal(e.kind, 'rate'); assert.match(e.message, /resets at midnight Pacific time/);
  // OpenRouter: a :free model gets the free words (reset time in the error's metadata, ms); a paid one the plain message
  const reset = Date.now() + 120000;
  e = await rateErr('openrouter', 'google/gemma-4-31b-it:free', jsonResponse({ error: { message: 'Rate limit exceeded: free-models-per-day', metadata: { headers: { 'X-RateLimit-Reset': String(reset) } } } }, 429));
  assert.match(e.message, /50 a day/); assert.match(e.message, /about 2 minutes/);
  e = await rateErr('openrouter', 'anthropic/claude-sonnet-5.5', jsonResponse({ error: { message: 'Rate limit exceeded' } }, 429));
  assert.doesNotMatch(e.message, /free/i); assert.match(e.message, /Wait a minute/);
  // Groq's reset header form, and a provider with no free tier stays as before
  assert.equal(C.retryIn(jsonResponse({}, 429, { 'x-ratelimit-reset-requests': '2m59.56s' }), ''), 180);
  e = await rateErr('anthropic', 'claude-haiku-5-5', jsonResponse({ error: { message: 'rate limited' } }, 429, { 'retry-after': '12' }));
  assert.match(e.message, /Try again in about 12 seconds\.$/); assert.doesNotMatch(e.message, /free/i);
  // a real money problem at a free provider stays money
  e = await rateErr('groq', 'x', jsonResponse({ error: { message: 'insufficient credit, check billing' } }, 429));
  assert.equal(e.kind, 'money');
});
