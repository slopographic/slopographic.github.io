// Own-key AI providers: how each provider's request is built (address, headers, tools in its own format, the history
// with tool results and the model's own reply sent back), and how each stream is read back into the loop's shape.
// Covers: shared/ai/cloud/net.js, shared/ai/cloud/anthropic.js, shared/ai/cloud/openai.js, shared/ai/cloud/compat.js,
//   shared/ai/cloud/gemini.js, shared/ai/cloud/providers.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kit, sseResponse } from './ai-cloud-env.mjs';
import * as FX from './ai-cloud-fixtures.mjs';

const w = kit(), C = w.SlopAIKit.cloud;
const J = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x))), eq = (a, b, m) => assert.deepEqual(J(a), J(b), m);   // values from the vm's realm
const TOOLS = [{ name: 'run_command', description: 'Run a command', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }];
const PIC = { mime: 'image/jpeg', data: 'AAAA', name: 'cat.jpg' };
/** A conversation after one tool round: the call (with the provider's own reply), its result with a picture. */
const history = (native, callId = 'c1') => [
  { role: 'system', content: 'You are Slop AI.' },
  { role: 'user', content: 'make it bold' },
  { role: 'assistant', content: 'I will.', toolCalls: [{ id: callId, name: 'run_command', arguments: { id: 'demo.bold' } }], native },
  { role: 'tool', name: 'run_command', callId, content: 'Done: Bold.', ok: true, media: [PIC] },
];
async function read(format, text) {
  const p = C.formats[format].parser(), pieces = [];
  for await (const ev of C.sse(sseResponse(text).body)) pieces.push(...p.push(ev));
  return { pieces, r: p.done() };
}

test('Anthropic: browser headers, API version 2026-10-21, native tools, no temperature, fallbacks only where they exist', () => {
  const { url, init } = C.formats.anthropic.request({ key: 'sk-ant-k1', model: 'claude-opus-5-5' }, history(null), TOOLS, {});
  assert.equal(url, 'https://api.anthropic.com/v1/messages');
  assert.equal(init.headers['x-api-key'], 'sk-ant-k1');
  assert.equal(init.headers['anthropic-version'], '2026-10-21');
  assert.equal(init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01,context-management-2025-06-27');   // with tools: old results cleared server-side
  const b = JSON.parse(init.body);
  assert.equal(b.stream, true); assert.equal(b.fallbacks, 'default'); assert.equal(b.temperature, undefined);
  // prompt caching: a breakpoint on the system prompt (tools render before it, so they are cached too) + automatic for the tail
  eq(b.system, [{ type: 'text', text: 'You are Slop AI.', cache_control: { type: 'ephemeral' } }]);
  eq(b.cache_control, { type: 'ephemeral' });
  eq(b.tools[0], { name: 'run_command', description: 'Run a command', input_schema: TOOLS[0].inputSchema });
  eq(b.output_config, { effort: 'medium' });
  const haiku = JSON.parse(C.formats.anthropic.request({ key: 'k', model: 'claude-haiku-5-5' }, history(null), [], {}).init.body);
  assert.equal(haiku.fallbacks, undefined); assert.equal(haiku.tools, undefined);
  // no system prompt: the breakpoint goes on the last tool
  const bare = JSON.parse(C.formats.anthropic.request({ key: 'k', model: 'claude-haiku-5-5' }, [{ role: 'user', content: 'hi' }], TOOLS, {}).init.body);
  eq(bare.tools[0].cache_control, { type: 'ephemeral' }); assert.equal(bare.system, undefined);
});

test('Anthropic: the reply goes back whole (thinking signature, tool_use), results in one user turn with the picture', () => {
  const native = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'I will.' }, { type: 'tool_use', id: 'c1', name: 'run_command', input: { id: 'demo.bold' } }];
  const { messages } = C.formats.anthropic.convert(history(native));
  eq(messages.map((m) => m.role), ['user', 'assistant', 'user']);
  eq(messages[1].content, native);
  const r = messages[2].content[0];
  assert.equal(r.type, 'tool_result'); assert.equal(r.tool_use_id, 'c1');
  eq(r.content[1], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
  // after a server-side fallback, the declined attempt's thinking and call are not sent back
  const echoed = C.formats.anthropic.echo([{ type: 'thinking', signature: 'a' }, { type: 'tool_use', id: 'x' }, { type: 'text', text: 'partial' }, { type: 'fallback' }, { type: 'text', text: 'ok' }, { type: 'server_thing' }]);
  eq(echoed.map((b) => b.type), ['text', 'fallback', 'text']);
});

test('Anthropic stream: text deltas, the signature, a call whose JSON came in pieces, usage with the cache', async () => {
  const { pieces, r } = await read('anthropic', FX.ANTHROPIC_TOOL);
  assert.equal(pieces.join(''), 'I will blur it.');
  eq(r.calls, [{ id: 'toolu_01A', name: 'run_command', arguments: { id: 'demo.bold' } }]);
  assert.equal(r.native[0].signature, 'EqQBCkYIBxgCKkDsig');
  eq(r.usage, { input: 912, output: 64, cacheRead: 100, cacheWrite: 0 });
  assert.equal((await read('anthropic', FX.ANTHROPIC_REFUSAL)).r.stop, 'refusal');
  const fb = (await read('anthropic', FX.ANTHROPIC_FALLBACK)).r;
  eq(fb.calls, []); assert.equal(fb.text, 'Here you go.');
  await assert.rejects(read('anthropic', FX.ANTHROPIC_OVERLOADED), (e) => e.kind === 'server');
});

test('OpenAI Responses: store false, function tools, items passed back, function_call_output with an input_image', () => {
  const native = [{ id: 'rs_1', type: 'reasoning', encrypted_content: 'enc' }, { id: 'fc_1', type: 'function_call', call_id: 'c1', name: 'run_command', arguments: '{"id":"demo.bold"}' }];
  const { url, init } = C.formats.openai.request({ key: 'sk-o1', model: 'gpt-6-astra' }, history(native), TOOLS, {});
  assert.equal(url, 'https://api.openai.com/v1/responses');
  assert.equal(init.headers.authorization, 'Bearer sk-o1');
  const b = JSON.parse(init.body);
  assert.equal(b.store, false); assert.equal(b.stream, true); assert.equal(b.prompt_cache_key, 'slopographic-ai-panel'); assert.equal(b.instructions, 'You are Slop AI.'); assert.equal(b.temperature, undefined);
  eq(b.tools[0], { type: 'function', name: 'run_command', description: 'Run a command', parameters: TOOLS[0].inputSchema, strict: false });
  eq(b.input[0], { role: 'user', content: 'make it bold' });
  eq(b.input.slice(1, 3), native);
  assert.equal(b.input[3].type, 'function_call_output'); assert.equal(b.input[3].call_id, 'c1');
  eq(b.input[3].output[1], { type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' });
});

test('OpenAI stream: the completed response gives the calls, the reasoning item and the usage', async () => {
  const { r } = await read('openai', FX.OPENAI_TOOL);
  eq(r.calls, [{ id: 'call_abc', name: 'run_command', arguments: { id: 'demo.bold' } }]);
  assert.equal(r.native[0].encrypted_content, 'gAAAAenc');
  eq(r.usage, { input: 400, output: 30, cacheRead: 0 });
  const t = await read('openai', FX.OPENAI_TEXT);
  assert.equal(t.pieces.join(''), 'Made it bold.'); assert.equal(t.r.text, 'Made it bold.');
  await assert.rejects(read('openai', FX.OPENAI_FAILED), /did not accept the request: The model failed/);
});

test('Chat Completions (OpenRouter, Ollama, LM Studio): tools, tool messages, pictures after them, usage option', () => {
  const p = C.byId('openrouter');
  const native = { content: 'I will.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_command', arguments: '{"id":"demo.bold"}' } }], reasoning_details: [{ type: 'reasoning.encrypted', data: 'x' }] };
  const { url, init } = C.formats.compat.request({ key: 'sk-or-1', model: 'anthropic/claude-sonnet-5.5', base: p.base, provider: p }, history(native), TOOLS, {});
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.authorization, 'Bearer sk-or-1'); assert.equal(init.headers['X-OpenRouter-Title'], 'Slopographic');
  const b = JSON.parse(init.body);
  eq(b.stream_options, { include_usage: true }); assert.equal(b.max_tokens, 16000);
  eq(b.tools[0], { type: 'function', function: { name: 'run_command', description: 'Run a command', parameters: TOOLS[0].inputSchema } });
  eq(b.messages.map((m) => m.role), ['system', 'user', 'assistant', 'tool', 'user']);
  eq(b.messages[2].reasoning_details, native.reasoning_details);
  assert.equal(b.messages[3].tool_call_id, 'c1');
  assert.equal(b.messages[4].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  // a local server: no key, no Authorization header; LM Studio without the usage option
  const lm = C.byId('lmstudio'), r = C.formats.compat.request({ key: '', model: 'qwen', base: lm.base, provider: lm }, history(null), [], {});
  assert.equal(r.url, 'http://localhost:1234/v1/chat/completions'); assert.equal(r.init.headers.authorization, undefined);
  assert.equal(JSON.parse(r.init.body).stream_options, undefined);
});

test('Chat Completions stream: comments skipped, two calls joined by index, usage in the last chunk, errors in a chunk', async () => {
  const { pieces, r } = await read('compat', FX.COMPAT_TOOL);
  assert.equal(pieces.join(''), 'On it. ');
  eq(r.calls, [{ id: 'call_1', name: 'run_command', arguments: { id: 'demo.bold' } }, { id: 'call_2', name: 'list_apps', arguments: {} }]);
  eq(r.usage, { input: 300, output: 25, cacheRead: 0 });
  assert.equal(r.native.tool_calls.length, 2);
  await assert.rejects(read('compat', FX.COMPAT_ERROR), (e) => e.kind === 'rate' && /too many requests/.test(e.message));
});

test('Gemini: key header, functionDeclarations with JSON Schema, parts sent back with their thought signature', () => {
  const native = [{ text: 'I will.' }, { functionCall: { name: 'run_command', args: { id: 'demo.bold' } }, thoughtSignature: 'SIG' }];
  const { url, init } = C.formats.gemini.request({ key: 'AIzaKEY', model: 'gemini-3.8-flash' }, history(native, 'gem:1'), TOOLS, {});
  assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
  assert.equal(init.headers['x-goog-api-key'], 'AIzaKEY'); assert.ok(!url.includes('AIza'));
  const b = JSON.parse(init.body);
  eq(b.systemInstruction, { parts: [{ text: 'You are Slop AI.' }] });
  eq(b.tools, [{ functionDeclarations: [{ name: 'run_command', description: 'Run a command', parametersJsonSchema: TOOLS[0].inputSchema }] }]);
  eq(b.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.equal(b.contents[1].parts[1].thoughtSignature, 'SIG');
  eq(b.contents[2].parts[0], { functionResponse: { name: 'run_command', response: { result: 'Done: Bold.' } } });   // our own id is not sent
  eq(b.contents[2].parts[1], { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
});

test('Gemini stream: text, a call with its signature kept, thinking tokens counted as output, safety stop', async () => {
  const { pieces, r } = await read('gemini', FX.GEMINI_TOOL);
  assert.equal(pieces.join(''), 'Blurring now.');
  assert.equal(r.calls[0].name, 'run_command'); eq(r.calls[0].arguments, { id: 'demo.bold' }); assert.match(r.calls[0].id, /^gem:/);
  assert.equal(r.native[1].thoughtSignature, 'CiQBVKhc7sig');
  eq(r.usage, { input: 500, output: 60, cacheRead: 0 });
  assert.equal((await read('gemini', FX.GEMINI_SAFETY)).r.stop, 'refusal');
});

test('SSE reader: events split across reads, CRLF lines, comments, a last event without a blank line', async () => {
  const text = ': keep-alive\r\n\r\nevent: a\r\ndata: {"x":1}\r\n\r\ndata: line1\ndata: line2\n\ndata: tail';
  const got = [];
  for await (const ev of C.sse(sseResponse(text, { n: 3 }).body)) got.push(ev);
  eq(got, [{ event: 'a', data: '{"x":1}' }, { event: 'message', data: 'line1\nline2' }, { event: 'message', data: 'tail' }]);
});

test('providers: suggested models from a fetched list, prices, addresses that may be used', () => {
  const p = C.byId('openrouter');
  const list = [{ id: 'x/new', tools: true }, { id: 'anthropic/claude-sonnet-5.5', tools: true, price: { input: 2, output: 10 } }, { id: 'openai/gpt-6-astra', tools: true }, { id: 'anthropic/claude-haiku-5.5', tools: false }];
  eq(C.suggested(p, list).map((m) => m.id), ['anthropic/claude-sonnet-5.5', 'openai/gpt-6-astra']);
  eq(C.price(C.byId('anthropic'), 'claude-opus-5-5'), { input: 4, output: 20, cacheRead: 0.2 });
  // cached input at the cache price, writes at 1.25×: 100k plain + 800k read + 100k written + 10k out on Sonnet 5.5
  assert.equal(Math.round(C.cost({ input: 1e6, cacheRead: 8e5, cacheWrite: 1e5, output: 1e4 }, C.price(C.byId('anthropic'), 'claude-sonnet-5-5')) * 1e4) / 1e4, 0.71);
  assert.equal(C.price(C.byId('openai'), 'gpt-6-astra'), null);
  assert.equal(C.cost({ input: 1e6, output: 1e5 }, { input: 4, output: 20 }), 6);
  assert.equal(C.checkBase('http://localhost:11434/v1'), '');
  assert.equal(C.checkBase('https://llm.example.org/v1'), '');
  assert.match(C.checkBase('http://192.168.1.4:8080/v1'), /https/);
  assert.match(C.localHelp(C.byId('ollama')).join(' '), /OLLAMA_ORIGINS to https:\/\/slopographic\.com/);
});

test('a reply in several text blocks (progress notes between) keeps its line breaks, so a Markdown list stays a list', async () => {
  const { sse } = await import('./ai-cloud-env.mjs');
  const text = sse([
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Done:' } }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: '', signature: 's' } }],
    ['content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'text_delta', text: '- I filled it red\n- I added a layer' } }],
  ]);
  const { pieces, r } = await read('anthropic', text);
  assert.equal(r.text, 'Done:\n\n- I filled it red\n- I added a layer');
  assert.equal(pieces.join(''), r.text, 'what streams is what stays');
  const vm = await import('node:vm'), { readFileSync } = await import('node:fs');
  vm.runInContext(readFileSync(new URL('../../shared/ai/md.js', import.meta.url), 'utf8'), vm.createContext(w));
  assert.equal(w.SlopAIKit.md.render(r.text), '<p>Done:</p><ul><li>I filled it red</li><li>I added a layer</li></ul>');
});
