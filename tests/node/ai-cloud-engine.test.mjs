// Own-key AI providers through the one agent loop: the cloud engine with native tool calls driving a page's commands
// (the same tools a local model gets), plain errors (bad key, rate limit, CORS, a local server), the spending cap,
// the meter, and keys kept out of messages, errors and the stored settings.
// Covers: shared/ai/cloud/engine.js, shared/ai/cloud/net.js, shared/ai/cloud/meter.js, shared/ai/tools.js, shared/ai/apptools.js,
//   shared/ai/cmdtools.js, shared/ai/cloud/keys.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kit, sseResponse, jsonResponse, collect } from './ai-cloud-env.mjs';
import * as FX from './ai-cloud-fixtures.mjs';

const J = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x))), eq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
/** A page with two commands, like tests/ai/panel-page.html: Bold, and Clear canvas (destructive: it asks). */
function page(w) {
  const ran = [];
  const cmd = { list: () => [{ id: 'demo.bold', title: 'Bold' }, { id: 'demo.clear', title: 'Clear canvas' }], run: (id) => { ran.push(id); } };
  const asked = [];
  const tools = w.SlopAIKit.appTools.build({ cmd, appId: 'photoslop', apps: () => [{ id: 'photoslop', name: 'PhotoSlop' }], hub: null, confirm: async (t, m) => { asked.push([t, m]); return true; } });
  return { ran, asked, tools, env: { confirm: async (t, m) => { asked.push([t, m]); return true; } } };
}
const engine = (w, provider, model, key = 'sk-test-0123456789') => new w.SlopAIKit.CloudEngine({ provider, model, key: async () => key });

for (const [provider, model, call, after] of [
  ['anthropic', 'claude-sonnet-5-5', FX.ANTHROPIC_TOOL, FX.ANTHROPIC_TEXT],
  ['openai', 'gpt-6-astra', FX.OPENAI_TOOL, FX.OPENAI_TEXT],
  ['openrouter', 'anthropic/claude-sonnet-5.5', FX.COMPAT_TOOL, FX.COMPAT_TEXT],
  ['gemini', 'gemini-3.8-flash', FX.GEMINI_TOOL, FX.GEMINI_TEXT],
]) {
  test(`${provider}: a native tool call runs the page's command, its result goes back with the call's id, usage adds up`, async () => {
    const w = kit(), P = page(w), eng = engine(w, provider, model);
    await eng.load();
    w.answers.push(sseResponse(call), sseResponse(after));
    if (provider === 'openrouter') w.answers.splice(1, 0, sseResponse(after));   // its fixture also calls list_apps
    const res = await w.SlopAIKit.tools.run(eng, [{ role: 'system', content: 'sys' }, { role: 'user', content: 'make it bold' }], { tools: P.tools, env: P.env, maxSteps: 12 });
    assert.deepEqual([...P.ran], ['demo.bold']);
    const tool = res.messages.find((m) => m.role === 'tool' && m.name === 'run_command');
    assert.equal(tool.ok, true); assert.match(tool.content, /Ran “Bold”/);
    assert.ok(tool.callId, 'the result keeps the call id');
    const second = JSON.stringify(w.requests[1].body);
    if (provider === 'gemini') assert.match(second, /functionResponse/); else assert.ok(second.includes(tool.callId), 'the next request answers that call');
    if (provider === 'anthropic') assert.match(second, /"signature":"EqQBCkYIBxgCKkDsig"/);
    if (provider === 'gemini') assert.match(second, /"thoughtSignature":"CiQBVKhc7sig"/);
    if (provider === 'openai') assert.match(second, /"encrypted_content":"gAAAAenc"/);
    assert.ok(res.text.length > 3);
    assert.equal(w.requests.every((r) => r.body.temperature === undefined), true);
    assert.ok(!JSON.stringify(w.requests.map((r) => r.body)).includes('sk-test-0123456789'), 'the key is only in a header');
    eq(Object.keys(P.asked), []);
  });
}

test('a destructive command still asks first; a "no" goes back to the model as an error result', async () => {
  const w = kit(), ran = [];
  const cmd = { list: () => [{ id: 'demo.clear', title: 'Clear canvas' }], run: (id) => { ran.push(id); } };
  let asked = 0;
  const tools = w.SlopAIKit.appTools.build({ cmd, apps: () => [], hub: null });
  const eng = engine(w, 'anthropic', 'claude-haiku-5-5');
  w.answers.push(sseResponse(FX.ANTHROPIC_TOOL.replace('"partial_json":"bold', '"partial_json":"clear')), sseResponse(FX.ANTHROPIC_TEXT));
  const res = await w.SlopAIKit.tools.run(eng, [{ role: 'user', content: 'clear it' }], { tools, env: { confirm: async () => { asked++; return false; } } });
  assert.equal(asked, 1); assert.deepEqual([...ran], []);
  const r = w.requests[1].body.messages[2].content[0];
  assert.equal(r.type, 'tool_result'); assert.equal(r.is_error, true); assert.match(r.content, /said no/);
  assert.equal(res.messages.filter((m) => m.role === 'tool')[0].ok, false);
});

test('errors in plain words: bad key (per provider), rate limit with Retry-After, CORS, a local server, refusal', async () => {
  for (const [provider, [status, body]] of Object.entries(FX.BAD_KEY)) {
    const w = kit(), eng = engine(w, provider, 'm', 'sk-bad-1234567890');
    w.answers.push(jsonResponse(body, status));
    const e = await collect(eng.chat([{ role: 'user', content: 'hi' }])).catch((x) => x);
    assert.equal(e.kind, 'key', provider); assert.match(e.message, /did not accept the key/);
    assert.ok(!String(e.message + e.detail).includes('sk-bad-1234567890'), provider + ': the key is not in the error');
  }
  let w = kit(), eng = engine(w, 'anthropic', 'claude-opus-5-5');
  w.answers.push(jsonResponse({ type: 'error', error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit' } }, 429, { 'retry-after': '20' }));
  let e = await collect(eng.chat([{ role: 'user', content: 'hi' }])).catch((x) => x);
  assert.equal(e.kind, 'rate'); assert.match(e.message, /Try again in about 20 seconds/);
  w = kit(); eng = engine(w, 'openai', 'gpt-6-astra');
  w.answers.push(() => { throw new TypeError('Failed to fetch'); });
  e = await collect(eng.chat([{ role: 'user', content: 'hi' }])).catch((x) => x);
  assert.equal(e.kind, 'cors'); assert.match(e.message, /could not reach OpenAI/);
  w = kit(); eng = new w.SlopAIKit.CloudEngine({ provider: 'ollama', model: 'qwen3' });
  w.answers.push(() => { throw new TypeError('Failed to fetch'); });
  e = await collect(eng.chat([{ role: 'user', content: 'hi' }])).catch((x) => x);
  assert.equal(e.kind, 'cors'); assert.match(e.message, /on this computer.*allows this website.*Allow/s);
  w = kit(); eng = engine(w, 'anthropic', 'claude-opus-5-5');
  w.answers.push(sseResponse(FX.ANTHROPIC_REFUSAL));
  const { done } = await collect(eng.chat([{ role: 'user', content: 'hi' }]));
  assert.equal(done.stop, 'refusal'); assert.match(done.text, /declined/);
});

test('no key yet: a plain message, and no request is made', async () => {
  const w = kit(), eng = engine(w, 'gemini', 'gemini-3.8-flash', '');
  const e = await collect(eng.chat([{ role: 'user', content: 'hi' }])).catch((x) => x);
  assert.equal(e.kind, 'key'); assert.match(e.message, /paste your key/); assert.equal(w.requests.length, 0);
});

test('the spending cap stops the loop after the turn that reaches it; the unrun call is answered "not run" next time', async () => {
  const w = kit(), C = w.SlopAIKit.cloud, P = page(w), eng = engine(w, 'anthropic', 'claude-sonnet-5-5');
  C.meter.reset();
  w.answers.push(sseResponse(FX.ANTHROPIC_TOOL));
  const cap = 500;
  const res = await w.SlopAIKit.tools.run(eng, [{ role: 'user', content: 'bold' }], { tools: P.tools, env: P.env, maxSteps: 12,
    onUsage: (u) => { C.meter.add(u); return C.meter.over(cap) ? C.meter.capText(cap) : null; } });
  assert.deepEqual([...P.ran], [], 'nothing ran after the cap');
  assert.match(res.text, /spending cap of 500 tokens/);
  assert.equal(w.requests.length, 1);
  assert.equal(C.meter.total().tokens, 976); assert.equal(C.meter.over(cap), true);
  assert.equal(C.meter.totalLine(cap), 'This visit: 976 tokens · less than $0.01 (cap 500)');
  // the next request (after the person raises the cap) answers the call that never ran
  w.answers.push(sseResponse(FX.ANTHROPIC_TEXT));
  await collect(eng.chat([{ role: 'user', content: 'bold' }, ...res.messages, { role: 'user', content: 'go on' }]));
  const sent = w.requests[1].body.messages;
  assert.equal(sent[2].content[0].type, 'tool_result'); assert.match(sent[2].content[0].content, /Not run/);
});

test('Stop: an aborted request ends the stream without an error and runs no tool', async () => {
  const w = kit(), P = page(w), eng = engine(w, 'openai', 'gpt-6-astra'), ctl = new w.AbortController();
  ctl.abort();
  const res = await w.SlopAIKit.tools.run(eng, [{ role: 'user', content: 'bold' }], { tools: P.tools, env: P.env, signal: ctl.signal });
  assert.deepEqual([...P.ran], []); assert.equal(res.messages[0].role, 'assistant');
});

test('the meter: per reply, this visit, prices known or not', () => {
  const w = kit(), M = w.SlopAIKit.cloud.meter;
  M.reset();
  assert.equal(M.line({ input: 1000, output: 234, cost: 0.0123 }), '1,234 tokens · about $0.01');
  assert.equal(M.line({ input: 100, output: 10, cost: 0.0004 }), '110 tokens · less than $0.01');
  M.add({ input: 1000, output: 234, cost: 0.0123 }); M.add({ input: 10, output: 5, cost: null });
  assert.equal(M.total().tokens, 1249); assert.equal(M.total().cost, null);
  assert.match(M.totalLine(0), /price not known/);
  assert.equal(M.over(0), false); assert.equal(M.over(1000), true);
});

test('redact: keys never in text that leaves the network code', () => {
  const C = kit().SlopAIKit.cloud;
  assert.equal(C.redact('bad key sk-ant-api03-ABCDEFGH here', ''), 'bad key sk-… here');
  assert.equal(C.redact('Bearer abcdefghijklmnop1234', ''), 'Bearer …');
  assert.equal(C.redact('the key AIzaSyA1234567890abcdef was wrong', ''), 'the key AIz… was wrong');
  assert.equal(C.redact('my own secret-value appears', 'secret-value'), 'my own … appears');
});

test('stored settings never hold a key, even when one is passed in', () => {
  const w = kit();
  vm.runInContext(readFileSync(new URL('../../shared/ai/cloud/keys.js', import.meta.url), 'utf8'), vm.createContext(w));
  const K = w.SlopAIKit.cloud.keys;
  K.save({ active: 'anthropic', cap: 1000, providers: { anthropic: { model: 'claude-opus-5-5', apiKey: 'sk-ant-api03-SECRET', note: 'sk-ant-api03-SECRET2' } } });
  const raw = w.localStorage.getItem('slop-ai.cloud');
  assert.ok(!/SECRET/.test(raw), raw);
  assert.equal(K.settings().providers.anthropic.model, 'claude-opus-5-5');
});
