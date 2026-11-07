// AI pictures with the person's own key (shared/ai/imagegen/): each provider's request as its documentation shows it,
// its answer read back, errors in plain words (401, 403 verification, 429, content rules), the price before and the
// cost after, and the visit's spending cap. Fixtures follow the documented formats (OpenAI Image API, Gemini
// Interactions, OpenRouter Image API, checked 2026-10-24). No real key, no network.
// Covers: shared/ai/imagegen/core.js, shared/ai/imagegen/openai.js, shared/ai/imagegen/gemini.js,
//   shared/ai/imagegen/openrouter.js, shared/ai/imagegen/run.js, shared/ai/imagegen/tools.js, shared/ai/cloud/keys.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kit, jsonResponse } from './ai-cloud-env.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MORE = ['shared/ai/cloud/keys.js', 'shared/ai/imagegen/core.js', 'shared/ai/imagegen/openai.js', 'shared/ai/imagegen/gemini.js', 'shared/ai/imagegen/openrouter.js', 'shared/ai/imagegen/run.js', 'shared/ai/imagegen/tools.js'];
const J = (x) => JSON.parse(JSON.stringify(x));

/** The kit plus the picture files, with a fetch that routes by address: routes = [[regex, Response | fn]]. */
function env(keys = { openai: 'sk-proj-TESTKEY0123456789' }) {
  const w = kit();
  w.FormData = FormData; w.Blob = Blob;
  for (const f of MORE) vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), w, { filename: f });
  for (const [p, k] of Object.entries(keys)) w.sessionStorage.setItem('slop-ai.cloud.key:' + p, k);
  w.routes = []; w.requests = [];
  w.fetch = async (url, init = {}) => {
    url = String(url);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body || null;
    w.requests.push({ url, init, body, headers: init.headers || {} });
    const r = w.routes.find(([re]) => re.test(url));
    if (!r) throw new Error('no route for ' + url);
    return typeof r[1] === 'function' ? r[1](url, init) : r[1].clone();
  };
  return { w, G: w.SlopAIKit.imageGen, C: w.SlopAIKit.cloud, T: w.SlopAIKit.imageTools };
}
const oaiImage = (n = 1) => ({ created: 1792000000, background: 'opaque', output_format: 'png', quality: 'medium', size: '1536x1024', data: Array.from({ length: n }, () => ({ b64_json: PNG })),
  usage: { input_tokens: 50, input_tokens_details: { text_tokens: 50, image_tokens: 0 }, output_tokens: 1568, total_tokens: 1618 } });

test('sizes: the three standard OpenAI sizes exactly, others in multiples of 16 inside the pixel and edge limits', () => {
  const { G } = env();
  assert.deepEqual(J(G.size('1:1', '1K')), { w: 1024, h: 1024 });
  assert.deepEqual(J(G.size('3:2', '1K')), { w: 1536, h: 1024 });
  assert.deepEqual(J(G.size('2:3', '1K')), { w: 1024, h: 1536 });
  assert.deepEqual(J(G.size('16:9', '1K')), { w: 1536, h: 864 });
  assert.deepEqual(J(G.size('16:9', '4K')), { w: 3840, h: 2160 });
  for (const a of G.ASPECTS) for (const r of G.RESOLUTIONS) {
    const { w, h } = G.size(a, r);
    assert.equal(w % 16, 0, a + r); assert.equal(h % 16, 0, a + r);
    assert.ok(w * h >= 655360 && w * h <= 8294400, `${a} ${r}: ${w}x${h}`);
    assert.ok(Math.max(w, h) <= 3840 && Math.max(w, h) / Math.min(w, h) <= 3, `${a} ${r}`);
  }
});

test('OpenAI: generation request (JSON, size, quality, transparent PNG) and the answer with its token cost', async () => {
  const { w, G, C } = env();
  w.routes.push([/\/v1\/images\/generations$/, jsonResponse(oaiImage(2))]);
  const out = await G.generate({ provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'a red fox in snow', aspect: '3:2', resolution: '1K', quality: 'high', n: 2, transparent: true, style: 'photo' });
  const rq = w.requests[0];
  assert.equal(rq.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(rq.headers.authorization, 'Bearer sk-proj-TESTKEY0123456789');
  assert.deepEqual(J(rq.body), { model: 'gpt-image-2.5-flare', prompt: 'a red fox in snow\n\nStyle: a realistic photograph.', n: 2, quality: 'high', background: 'transparent', output_format: 'png', size: '1536x1024' });
  assert.equal(out.images.length, 2); assert.equal(out.images[0].mime, 'image/png'); assert.ok(out.images[0].blob.size > 60);
  assert.equal(Math.round(out.cost * 1e6), 50 * 5 + 1568 * 30);   // $5 per million text tokens in, $30 per million picture tokens out
  const t = C.meter.total();
  assert.equal(t.tokens, 1618); assert.equal(Math.round(t.cost * 1e6), 47290);
});

test('OpenAI: an edit goes as multipart with the picture and the mask, size auto, no JSON content type', () => {
  const { G } = env();
  const req = { model: 'gpt-image-2.5-sunburst', prompt: 'a pool with a flamingo', image: { blob: new Blob(['x'], { type: 'image/png' }), width: 1536, height: 1024 }, mask: { blob: new Blob(['m'], { type: 'image/png' }) } };
  const { url, init } = G.formats.openai.build(req, { key: 'k' });
  assert.equal(url, 'https://api.openai.com/v1/images/edits');
  assert.equal(init.headers['content-type'], undefined);
  const fd = init.body;
  assert.equal(fd.get('size'), 'auto'); assert.equal(fd.get('model'), 'gpt-image-2.5-sunburst');
  assert.ok(fd.get('image[]') instanceof Blob); assert.equal(fd.get('mask').name, 'mask.png');
  assert.equal(fd.get('response_format'), null);   // GPT Image models refuse it
  // an OpenAI-compatible server gets response_format and the picture's own size
  const local = G.formats.openai.build(Object.assign({}, req, { mask: null }), { key: '', base: 'http://localhost:8000/v1' });
  assert.equal(local.url, 'http://localhost:8000/v1/images/edits');
  assert.equal(local.init.body.get('response_format'), 'b64_json'); assert.equal(local.init.body.get('size'), '1536x1024');
  assert.equal(local.init.headers.authorization, undefined);
});

test('errors in plain words: wrong key, organization not verified, rate limit, content rules; no key in any message', async () => {
  const { w, G } = env();
  const err = (status, body, headers) => [/images\/generations$/, jsonResponse(body, status, headers)];
  const tryIt = async () => { try { await G.generate({ provider: 'openai', model: 'gpt-image-2', prompt: 'x' }); } catch (e) { return e; } assert.fail('no error'); };
  w.routes = [err(401, { error: { message: 'Incorrect API key provided: sk-proj-TESTKEY0123456789.', type: 'invalid_request_error', code: 'invalid_api_key' } })];
  let e = await tryIt();
  assert.equal(e.kind, 'key'); assert.match(e.message, /did not accept the key/); assert.doesNotMatch(e.message + e.detail, /TESTKEY/);
  w.routes = [err(403, { error: { message: 'Your organization must be verified to use the model `gpt-image-2`. Please go to: https://platform.openai.com/settings/organization/general and click on Verify Organization.', type: 'invalid_request_error' } })];
  e = await tryIt(); assert.equal(e.kind, 'key'); assert.match(e.message, /verify your organization/);
  w.routes = [err(429, { error: { message: 'Rate limit reached for images per minute', type: 'requests' } }, { 'retry-after': '20' })];
  e = await tryIt(); assert.equal(e.kind, 'rate'); assert.match(e.message, /about 20 seconds/);
  w.routes = [err(400, { error: { message: 'Your request was rejected as a result of our safety system. Your request may contain content that is not allowed by our safety system.', type: 'image_generation_user_error', code: 'moderation_blocked' } })];
  e = await tryIt(); assert.equal(e.kind, 'refusal'); assert.match(e.message, /OpenAI declined to make this picture under its content rules/);
  w.routes = [err(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota' } })];
  e = await tryIt(); assert.equal(e.kind, 'money');
});

test('Gemini: the Interactions request (store off, aspect and uppercase size), the picture from the model_output step', async () => {
  const { w, G } = env({ gemini: 'AIzaSyTESTKEY0123456789' });
  w.routes.push([/\/v1beta\/interactions$/, jsonResponse({ id: 'v1_1', status: 'completed', model: 'gemini-nano-banana-2.1',
    steps: [{ type: 'user_input', content: [{ type: 'text', text: 'x' }] }, { type: 'thought', signature: 'sig' }, { type: 'model_output', content: [{ type: 'text', text: 'Here it is.' }, { type: 'image', mime_type: 'image/png', data: PNG }] }],
    usage: { total_input_tokens: 12, total_output_tokens: 1290, output_tokens_by_modality: [{ modality: 'image', tokens: 1120 }] } })]);
  const out = await G.generate({ provider: 'gemini', model: 'gemini-nano-banana-2.1', prompt: 'a lake', aspect: '16:9', resolution: '2k', n: 2 });
  assert.equal(w.requests.length, 2);   // one picture per request
  const rq = w.requests[0];
  assert.equal(rq.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(rq.headers['x-goog-api-key'], 'AIzaSyTESTKEY0123456789');
  assert.deepEqual(J(rq.body), { model: 'gemini-nano-banana-2.1', input: [{ type: 'text', text: 'a lake' }], response_format: { type: 'image', image_size: '2K', aspect_ratio: '16:9' }, store: false });
  assert.equal(out.images.length, 2);
  assert.equal(Math.round(out.cost * 1e4), Math.round((2 * 0.0504 + (24 * 1.5) / 1e6) * 1e4));
  // an edit sends the picture as an image block; Flash-Lite only makes 1K
  const ed = G.formats.gemini.build({ model: 'gemini-3.1-flash-lite-image', prompt: 'warmer', resolution: '4K', image: { mime: 'image/png', data: PNG } }, { key: 'k' });
  const b = JSON.parse(ed.init.body);
  assert.deepEqual(b.input[1], { type: 'image', mime_type: 'image/png', data: PNG }); assert.equal(b.response_format.image_size, '1K');
});

test('Gemini: no picture in the answer is a refusal with what the model said; a bad key is a key error', async () => {
  const { w, G } = env({ gemini: 'AIzaSyTESTKEY0123456789' });
  w.routes = [[/interactions$/, jsonResponse({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'I can’t create images of that.' }] }], usage: {} })]];
  await assert.rejects(G.generate({ provider: 'gemini', model: 'gemini-nano-banana-2.1', prompt: 'x' }), (e) => e.kind === 'refusal' && /Google did not make a picture: “I can’t create images of that\.”/.test(e.message));
  w.routes = [[/interactions$/, jsonResponse({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }, 400)]];
  await assert.rejects(G.generate({ provider: 'gemini', model: 'gemini-nano-banana-2.1', prompt: 'x' }), (e) => e.kind === 'key');
});

test('OpenRouter: the Image API request fitted to the model, the reported cost, and a model list with prices', async () => {
  const { w, G, C } = env({ openrouter: 'sk-or-v1-TESTKEY0123456789' });
  w.routes.push([/\/images\/models$/, jsonResponse({ data: [{ id: 'black-forest-labs/flux-3-image', name: 'FLUX 3 Image', supported_parameters: { resolution: { type: 'enum', values: ['1K', '2K'] }, aspect_ratio: { type: 'enum', values: ['1:1', '16:9'] }, n: { type: 'range', min: 1, max: 1 }, input_references: { type: 'range', min: 0, max: 10 } } },
    { id: 'krea/k3-edit', name: 'K3 Edit', supported_parameters: { input_references: { type: 'range', min: 1, max: 8 } } }] })]);
  w.routes.push([/\/models\?output_modalities=image$/, jsonResponse({ data: [{ id: 'black-forest-labs/flux-3-image', pricing: { image: '0.02' } }] })]);
  w.routes.push([/\/api\/v1\/images$/, jsonResponse({ created: 1, data: [{ b64_json: PNG, media_type: 'image/png' }], usage: { prompt_tokens: 0, completion_tokens: 4175, total_tokens: 4175, cost: 0.04 } })]);
  const out = await G.generate({ provider: 'openrouter', model: 'black-forest-labs/flux-3-image', prompt: 'a lighthouse', aspect: '3:2', resolution: '4K', n: 3, transparent: true });
  const rq = w.requests.find((r) => /\/images$/.test(r.url));
  assert.equal(rq.headers.authorization, 'Bearer sk-or-v1-TESTKEY0123456789'); assert.equal(rq.headers['X-OpenRouter-Title'], 'Slopographic');
  assert.deepEqual(J(rq.body), { model: 'black-forest-labs/flux-3-image', prompt: 'a lighthouse', n: 1, aspect_ratio: '1:1', resolution: '1K' });
  assert.ok(out.notes.some((n) => /no 3:2/.test(n))); assert.ok(out.notes.some((n) => /transparent/.test(n)));
  assert.equal(out.cost, 0.04);
  const ms = await G.formats.openrouter.models();
  assert.deepEqual(J(ms.map((m) => [m.id, m.generates, m.edits, m.price])), [['black-forest-labs/flux-3-image', true, true, { image: 0.02 }], ['krea/k3-edit', false, true, null]]);
  assert.deepEqual(J(G.estimate({ provider: 'openrouter', model: 'black-forest-labs/flux-3-image', n: 2 }, ms)), { perImage: 0.02, total: 0.04, exact: true, note: '' });
  assert.equal(C.meter.total().cost, 0.04);
});

test('prices before: GPT Image 2 from OpenAI’s table, Gemini by size, GPT Image 2.5 billed by tokens (not known before)', () => {
  const { G } = env();
  assert.equal(G.estimate({ provider: 'openai', model: 'gpt-image-2', quality: 'medium', aspect: '1:1', resolution: '1K' }).perImage, 0.053);
  assert.equal(G.estimate({ provider: 'openai', model: 'gpt-image-2', quality: 'high', aspect: '3:2', resolution: '1K', n: 2 }).total, 0.33);
  const flare = G.estimate({ provider: 'openai', model: 'gpt-image-2.5-flare', quality: 'medium', aspect: '1:1' });
  assert.equal(flare.perImage, null); assert.match(flare.note, /tokens/);
  assert.equal(G.estimate({ provider: 'gemini', model: 'gemini-3-pro-image', resolution: '4K' }).perImage, 0.24);
  assert.equal(G.estimate({ provider: 'ollama', model: 'x' }).perImage, 0);
});

test('the spending cap: a request after the visit reached it is refused before anything is sent', async () => {
  const { w, G, C } = env();
  C.keys.save({ cap: 1000 });
  w.routes.push([/images\/generations$/, jsonResponse(oaiImage(1))]);
  await G.generate({ provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'one' });
  const sent = w.requests.length;
  await assert.rejects(G.generate({ provider: 'openai', model: 'gpt-image-2.5-flare', prompt: 'two' }), (e) => e.kind === 'cap' && /spending cap of 1,000 tokens/.test(e.message));
  assert.equal(w.requests.length, sent);
});

test('the tool: offered when a picture provider has a key; asks first with provider and price; no key → how to add one', async () => {
  const { w, G, T } = env();
  await G.choose();
  assert.deepEqual(J(G.available.map((p) => p.id)), ['openai']);
  const [gen, edit] = T.build({});
  assert.equal(gen.name, 'generate_image'); assert.equal(edit.name, 'edit_image');
  assert.equal(gen.permission.kind, 'spend-image');
  assert.deepEqual(J(gen.schema.required), ['prompt']); assert.ok(gen.schema.properties.aspect.enum.includes('16:9'));
  const asked = [];
  const saved = [];
  const hub = { put: async (blob, o) => { saved.push(o); return 'id1'; } };
  w.routes.push([/images\/generations$/, jsonResponse(oaiImage(1))]);
  const tools = T.build({ hub, sink: null });
  // the question comes from the one permission module (tools.dispatch → env.permit), kind 'spend-image'
  const no = await w.SlopAIKit.tools.dispatch({ name: 'generate_image', arguments: { prompt: 'a cat' } }, tools, { permit: async (req) => { asked.push([req.title, req.detail, req.kind]); return false; } });
  assert.match(no.error, /said no/);
  assert.equal(w.requests.length, 0);
  assert.equal(asked[0][0], 'Spend on image generation?'); assert.equal(asked[0][2], 'spend-image');
  assert.match(asked[0][1], /1 picture with OpenAI \(GPT Image 2\.5 Flare, 1024 × 1024 px\): price not known before/);
  assert.match(asked[0][1], /goes to OpenAI, which makes the picture and charges your account\. OpenAI’s terms and content rules apply\./);
  const text = (await w.SlopAIKit.tools.dispatch({ name: 'generate_image', arguments: { prompt: 'a cat on a sofa' } }, tools, { permit: async () => true })).result;
  assert.match(text, /^Made 1 picture with OpenAI gpt-image-2\.5-flare \(1024 × 1024 px\) · about \$0\.05\. Saved “ai-a-cat-on-a-sofa\.png” to Slop Drive/);
  assert.deepEqual(J(saved), [{ name: 'ai-a-cat-on-a-sofa.png', from: 'ai' }]);
  // nothing connected: a model on this device gets no tool; a cloud chat model gets one that explains
  const none = env({});
  await none.G.choose();
  assert.equal(none.T.build({}).length, 0);
  await assert.rejects(none.T.build({ look: true })[0].run({ prompt: 'x' }, { confirm: async () => true }), /No picture provider is connected/);
});
