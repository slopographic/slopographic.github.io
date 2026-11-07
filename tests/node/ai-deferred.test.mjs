// Progressive tool disclosure (shared/ai/toolbox.js) and how each provider gets it: a small core list, find_tools,
// Claude's native deferred tools (defer_loading + tool_reference, context editing) and, for the others and local models,
// the loaded tools added to later turns; compact schemas, summarized results, earlier results shortened, the system
// prompt (shared/ai/prompt.js) and the per-request usage line (meter.detail).
// Covers: shared/ai/toolbox.js, shared/ai/prompt.js, shared/ai/cloud/anthropic.js, shared/ai/cloud/engine.js, shared/ai/tools.js,
//   shared/ai/cmdtools.js, shared/ai/optools.js, shared/ai/apptools.js, shared/ai/cloud/meter.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { kit, sseResponse, sse } from './ai-cloud-env.mjs';

const J = (x) => JSON.parse(JSON.stringify(x));
function fresh() {
  const w = kit();
  // made-up names and taglines: the prompt is about the registry's shape, not this site's app names
  w.SLOP_APPS = [{ id: 'photoslop', name: 'Pixo', kind: 'app', tagline: 'Pixel editing, rebuilt for the browser.' },
    { id: 'slides', name: 'Deckard', kind: 'app', tagline: 'Decks and talks, rebuilt for the browser.', creates: [{ label: 'Presentation', ext: 'sslide' }] }];
  const ctx = vm.createContext(w);
  for (const f of ['shared/ai/filetools.js', 'shared/ai/toolbox.js', 'shared/ai/prompt.js']) vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), ctx, { filename: f });
  w.SlopAIKit.appSkills = { slides: { create: ['build_presentation'], add: ['add_slide'], ops: [] } };
  return w;
}
/** A page with many commands with argument schemas (like PhotoSlop): blur, motion blur, shapes, text, … */
function page(w) {
  const ran = [], A = w.SlopCmdArgs;
  const mk = (id, title, args, description) => ({ id, title, args, description });
  const list = [mk('ps.gaussian-blur', 'Gaussian blur', [['radius', 'number', { min: 0.1, max: 250, default: 4, description: 'px' }]], 'Blur the active layer.'),
    mk('ps.motion-blur', 'Motion blur', [['distance', 'number', { min: 1, max: 999 }]], 'Blur along a direction.'),
    mk('ps.draw-shape', 'Draw shape', [['x', 'number', { min: -16384, max: 16384 }], ['path', 'string', { maxLength: 100000, description: 'SVG path' }], ['blur', 'number', { min: 0, max: 500 }]], 'Draw a shape into a new layer.'),
    ...Array.from({ length: 16 }, (_, i) => mk(`ps.ai.tool-${i}`, `Tool ${i}`, [['amount', 'number', { min: 0, max: 100 }]], `Adjust thing ${i}.`))];
  for (const c of list) c.args = c.args.map(([name, type, o]) => Object.assign({ name, type }, o));
  const cmd = { list: () => list, exec: async (id, args) => { ran.push([id, args]); return { ok: true, args, notes: [] }; },
    state: () => ({ document: 'Poster', layers: Array.from({ length: 30 }, (_, i) => ({ name: 'Layer ' + i, note: 'x'.repeat(400) })) }) };
  assert.ok(A, 'args.js is in the kit');
  const env = { cmd, appId: 'photoslop', appName: 'Pixo', apps: () => w.SLOP_APPS, hub: null, look: true };
  const tools = w.SlopAIKit.toolbox.arrange(w.SlopAIKit.appTools.build(env), env);
  return { ran, tools, cmd };
}
const call = { anthropic: (name, args, n = 1) => sse([['message_start', { type: 'message_start', message: { id: 'm' + n, model: 'claude-haiku-5-5', content: [], usage: { input_tokens: 500, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_' + n, name, input: {} } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(args) } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } }], ['message_stop', { type: 'message_stop' }]]),
openai: (name, args, n = 1) => sse([['response.completed', { type: 'response.completed', response: { output: [{ id: 'fc_' + n, type: 'function_call', call_id: 'call_' + n, name, arguments: JSON.stringify(args) }], usage: { input_tokens: 300, output_tokens: 20 } } }]]),
compat: (name, args, n = 1) => sse([{ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_' + n, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }, { choices: [], usage: { prompt_tokens: 200, completion_tokens: 10 } }, '[DONE]']),
gemini: (name, args) => sse([{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 9 } }]) };
const text = { anthropic: sse([['message_start', { type: 'message_start', message: { id: 'mt', content: [], usage: { input_tokens: 600, output_tokens: 1, cache_read_input_tokens: 400 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Done.' } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }]]),
openai: sse([['response.completed', { type: 'response.completed', response: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done.' }] }], usage: { input_tokens: 300, output_tokens: 2 } } }]]),
compat: sse([{ choices: [{ index: 0, delta: { content: 'Done.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 2 } }, '[DONE]']),
gemini: sse([{ candidates: [{ content: { role: 'model', parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 2 } }]) };
const names = (b) => J((b.tools || [{}]).flatMap((t) => (t.functionDeclarations ? t.functionDeclarations.map((f) => f.name) : [t.name || (t.function && t.function.name)])));

test('arrange: a long list gets find_tools after app_state and defers everything outside the core; a short one is left alone', () => {
  const w = fresh(), { tools } = page(w);
  const at = tools.findIndex((t) => t.name === 'app_state');
  assert.equal(tools[at + 1].name, 'find_tools');
  const core = J(tools.filter((t) => !t.deferred).map((t) => t.name));
  for (const n of ['app_state', 'find_tools', 'run_command', 'list_files', 'look_at_file', 'look_at_canvas']) assert.ok(core.includes(n), n);
  for (const n of ['gaussian_blur', 'motion_blur', 'draw_shape', 'list_commands', 'list_apps']) assert.equal(tools.find((t) => t.name === n).deferred, true, n);
  const short = [{ name: 'a' }, { name: 'b' }];
  assert.equal(w.SlopAIKit.toolbox.arrange(short, {}), short);
  assert.equal(w.SlopAIKit.toolbox.arrange(tools, {}), tools, 'twice is once');
});

test('find_tools: by words (strong matches only) or by name; other apps that make it; the calls run whether loaded or not', async () => {
  const w = fresh(), { tools, ran } = page(w), T = w.SlopAIKit.tools;
  const r = await T.dispatch({ name: 'find_tools', arguments: { query: 'blur' } }, tools);
  assert.deepEqual(J(r.load), ['gaussian_blur', 'motion_blur'], 'draw_shape has only an argument called blur');
  assert.match(r.result, /^Loaded: gaussian_blur, motion_blur\. Call them directly\./);
  const byName = await T.dispatch({ name: 'find_tools', arguments: { names: ['draw_shape'], query: 'presentation' } }, tools);
  assert.deepEqual(J(byName.load), ['draw_shape']);
  assert.match(byName.result, /In other apps \(open_in_app\):\n- slides \(Deckard\): build_presentation, add_slide/);
  const res = await T.run({ chat: async function* () { yield { type: 'done', text: '', raw: '', toolCalls: [] }; } }, [], { tools });   // no calls: nothing loaded
  assert.equal(res.messages.length, 1);
  await T.dispatch({ name: 'gaussian_blur', arguments: { radius: 8 } }, tools);
  assert.deepEqual(J(ran), [['ps.gaussian-blur', { radius: 8 }]], 'a deferred tool runs even before it is loaded');
  // a guess at its arguments (seen live: Claude Haiku 5.5 sent { args: { radius: 3 } } before loading it) does not run
  const guess = await T.dispatch({ name: 'gaussian_blur', arguments: { args: { radius: 3 } } }, tools);
  assert.equal(guess.ok, false); assert.match(guess.error, /^gaussian_blur does not take args\. It takes: gaussian_blur\(radius\?: number 0\.1–250 =4\): Blur the active layer\./);
  assert.equal(ran.length, 1);
});

test('Claude: every tool sent, deferred ones with defer_loading; find_tools answers with tool_reference blocks only; context editing', async () => {
  const w = fresh(), { tools } = page(w), K = w.SlopAIKit;
  const eng = new K.CloudEngine({ provider: 'anthropic', model: 'claude-haiku-5-5', key: async () => 'sk-ant-test-0123456789' });
  await eng.load();
  w.answers.push(sseResponse(call.anthropic('find_tools', { query: 'blur' })), sseResponse(call.anthropic('gaussian_blur', { radius: 8 }, 2)), sseResponse(text.anthropic));
  await K.tools.run(eng, [{ role: 'system', content: 'sys' }, { role: 'user', content: 'blur it' }], { tools, maxSteps: 6 });
  const [b1, b2, b3] = w.requests.map((r) => r.body);
  assert.equal(b1.tools.length, tools.length, 'the list never changes: cache and thinking blocks stay valid');
  assert.deepEqual(J(b3.tools), J(b1.tools));
  const blur = b1.tools.find((t) => t.name === 'gaussian_blur');
  assert.equal(blur.defer_loading, true); assert.equal(b1.tools.find((t) => t.name === 'find_tools').defer_loading, undefined);
  assert.ok(!b1.tools.some((t) => t.defer_loading && t.cache_control), 'a deferred tool carries no cache breakpoint');
  const shape = b1.tools.find((t) => t.name === 'draw_shape').input_schema.properties;
  assert.deepEqual(J(shape.x), { type: 'number' }, 'huge bounds left out (the app clamps)'); assert.equal(shape.path.maxLength, undefined);
  assert.deepEqual(J(blur.input_schema.properties.radius), { type: 'number', minimum: 0.1, maximum: 250, description: 'px', default: 4 });
  const res = b2.messages[b2.messages.length - 1].content;
  assert.deepEqual(J(res), [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'tool_reference', tool_name: 'gaussian_blur' }, { type: 'tool_reference', tool_name: 'motion_blur' }] }]);
  assert.equal(b1.context_management.edits[0].type, 'clear_tool_uses_20250919'); assert.deepEqual(J(b1.context_management.edits[0].exclude_tools), ['find_tools']);
  assert.match(w.requests[0].headers['anthropic-beta'], /context-management-2025-06-27/);
  // an older Claude without tool search: only the shown tools, no references
  const old = K.cloud.formats.anthropic;
  assert.equal(old.defers('claude-3-5-haiku-latest'), false); assert.equal(old.defers('claude-opus-4-5'), true);
});

test('Claude: other text of a find_tools answer follows the tool results; a reference to a tool not sent is left out', () => {
  const w = fresh(), F = w.SlopAIKit.cloud.formats.anthropic;
  const msgs = [{ role: 'user', content: 'go' }, { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'find_tools' }, { id: 't2', name: 'app_state' }],
    native: [{ type: 'tool_use', id: 't1', name: 'find_tools', input: {} }, { type: 'tool_use', id: 't2', name: 'app_state', input: {} }] },
  { role: 'tool', name: 'find_tools', callId: 't1', content: 'Loaded: blur, gone. Call them directly.\nIn other apps (open_in_app):\n- slides', load: ['blur', 'gone'] },
  { role: 'tool', name: 'app_state', callId: 't2', content: '{}' }];
  const b = JSON.parse(F.request({ key: 'k', model: 'claude-haiku-5-5' }, msgs, [{ name: 'find_tools', inputSchema: {} }, { name: 'blur', inputSchema: {}, deferred: true }]).init.body);
  const last = b.messages[b.messages.length - 1].content;
  assert.deepEqual(last.map((c) => c.type), ['tool_result', 'tool_result', 'text']);
  assert.deepEqual(J(last[0].content), [{ type: 'tool_reference', tool_name: 'blur' }]);
  assert.equal(last[2].text, 'In other apps (open_in_app):\n- slides');
});

for (const [provider, model, fmt] of [['openai', 'gpt-6-astra', 'openai'], ['openrouter', 'anthropic/claude-sonnet-5.5', 'compat'], ['gemini', 'gemini-3.8-flash', 'gemini']]) {
  test(`${provider}: the core tools first; loaded tools join at the end of later turns; earlier requests' results shortened`, async () => {
    const w = fresh(), { tools } = page(w), K = w.SlopAIKit;
    const eng = new K.CloudEngine({ provider, model, key: async () => 'sk-test-0123456789' });
    await eng.load();
    const before = [{ role: 'user', content: 'what is open?' }, { role: 'assistant', content: '', toolCalls: [{ id: 'c0', name: 'app_state', arguments: {} }] },
      { role: 'tool', name: 'app_state', callId: 'c0', content: 'y'.repeat(3000), ok: true, media: [{ mime: 'image/jpeg', data: 'AAAA', name: 'x' }] }, { role: 'assistant', content: 'A poster.' }];
    w.answers.push(sseResponse(call[fmt]('find_tools', { query: 'blur' })), sseResponse(text[fmt]));
    await K.tools.run(eng, [{ role: 'system', content: 'sys' }, ...before, { role: 'user', content: 'blur it' }], { tools, maxSteps: 6 });
    const [b1, b2] = w.requests.map((r) => r.body), core = J(tools.filter((t) => !t.deferred).map((t) => t.name));
    assert.deepEqual(names(b1), core);
    assert.deepEqual(names(b2), [...core, 'gaussian_blur', 'motion_blur'], 'the earlier part of the list stays as it was');
    const all = JSON.stringify(b1);
    assert.ok(!all.includes('y'.repeat(300)), 'an earlier request\'s long result is cut'); assert.match(all, /earlier result, 3000 characters, shortened/);
    assert.ok(!all.includes('AAAA'), 'its picture is left out');
  });
}

test('local models: only the shown tools are described; the loaded ones once found; history shortened the same way', () => {
  const w = fresh(), { tools } = page(w), T = w.SlopAIKit.tools;
  const sys = T.prepare([{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }], tools)[0].content;
  assert.match(sys, /- find_tools\(/); assert.doesNotMatch(sys, /- gaussian_blur\(/);
  const later = T.prepare([{ role: 'system', content: 'sys' }, { role: 'user', content: 'blur' }, { role: 'assistant', content: '' }, { role: 'tool', name: 'find_tools', content: 'Loaded: gaussian_blur.', load: ['gaussian_blur'] }], tools)[0].content;
  assert.match(later, /- gaussian_blur\(radius\?: number/);
});

test('results stay small: app_state summarized (detail for all of it), data lists cut, valid JSON', async () => {
  const w = fresh(), { tools } = page(w), T = w.SlopAIKit.tools;
  const s = JSON.parse((await T.dispatch({ name: 'app_state', arguments: {} }, tools)).result);
  assert.equal(s.layers.length, 9); assert.equal(s.layers[8], '… 22 more'); assert.match(s.layers[0].note, /… \(240 more characters\)$/);
  const full = await T.dispatch({ name: 'app_state', arguments: { detail: true } }, tools);
  assert.ok(full.result.length >= 6000, 'detail: everything, up to the hard limit');
  const big = { name: 'list_things', run: () => Array.from({ length: 100 }, (_, i) => ({ i })) };
  const r = JSON.parse((await T.dispatch({ name: 'list_things', arguments: {} }, [big])).result);
  assert.equal(r.length, 26); assert.equal(r[25], '… 75 more');
});

test('the system prompt: short, names the tools to load, the apps in a line each (brief) for cloud, by name for local', () => {
  const w = fresh(), { tools } = page(w), K = w.SlopAIKit;
  const cloud = K.prompt.system(tools, { kind: 'cloud' }, { appName: 'Pixo' });
  assert.match(cloud, /More tools here, not loaded yet \(.*find_tools.*\): .*gaussian_blur, motion_blur, draw_shape/);
  assert.match(cloud, /- slides: Deckard, Decks and talks\. Makes: Presentation \(\.sslide\)\./);
  assert.doesNotMatch(cloud, /Tools there|rebuilt for the browser/);
  assert.match(cloud, /run_operation does it on this page/); assert.match(cloud, /Be resourceful/);
  const local = K.prompt.system(tools, { kind: 'webllm' }, { appName: 'Pixo', capable: true });
  assert.match(local, /Apps \(open_in_app\): photoslop \(Pixo\), slides \(Deckard\)\./);
  assert.ok(local.length < cloud.length);
  // no tools, no tool lines (the site's own address may hold the word: tools.example.com)
  assert.equal(K.prompt.system([], { kind: 'cloud' }, { appName: 'X' }).replace(/\b[\w-]+(\.[\w-]+)+\b/g, '').includes('tools'), false);
});

test('the usage line on hover: this request, how much was cached, each model turn', () => {
  const w = fresh(), M = w.SlopAIKit.cloud.meter;
  const d = M.detail([{ input: 4800, output: 40, cacheRead: 0, cacheWrite: 4700 }, { input: 5100, output: 12, cacheRead: 4700 }]);
  assert.equal(d.split('\n')[0], 'This request used 9,952 tokens (4,700 cached): 9,900 in, 52 out, 4,700 written to the cache, over 2 model turns.');
  assert.equal(d.split('\n')[2], 'Turn 2: 5,100 in (4,700 cached), 12 out');
});
