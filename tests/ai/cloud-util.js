/* Helpers for the own-key AI tests (after tests/harness.js): a fake fetch per provider, put into an app frame, that
 * answers the model lists and key checks and streams scripted replies in each provider's documented SSE format. No real
 * key, no network. window.CU = { install(win, provider), anthropic: { text, call }, openai, compat, gemini }.
 *   const f = CU.install(win, 'anthropic'); f.replies.push(CU.anthropic.call('run_command', { id: 'demo.bold' }), CU.anthropic.text('Done'));
 *   f.requests: [{ url, headers, body }]; f.fail = { status, body, headers } answers the next request with that error.
 *   Sign in with OpenRouter: POST openrouter.ai/api/v1/auth/keys answers f.keys ({ status, body }; default a key). */
window.CU = (function () {
  'use strict';
  const ev = (list) => list.map((e) => (Array.isArray(e) ? `event: ${e[0]}\ndata: ${JSON.stringify(e[1])}\n\n` : `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`)).join('');
  let n = 0;
  const anthropic = {
    text: (t, usage = { input: 900, output: 12 }) => ev([['message_start', { type: 'message_start', message: { id: 'msg_' + (++n), model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: usage.input, output_tokens: 1 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ...String(t).split(/(?<= )/).map((p) => ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } }]),
      ['content_block_stop', { type: 'content_block_stop', index: 0 }], ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output } }], ['message_stop', { type: 'message_stop' }]]),
    /** One or more tool calls: call(name, args) or call([[name, args], …]). */
    call: (name, args, usage = { input: 800, output: 40 }) => {
      const calls = Array.isArray(name) ? name : [[name, args]];
      return ev([['message_start', { type: 'message_start', message: { id: 'msg_' + (++n), model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: usage.input, output_tokens: 1 } } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' + n } }], ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ...calls.flatMap(([nm, a], i) => [['content_block_start', { type: 'content_block_start', index: i + 1, content_block: { type: 'tool_use', id: `toolu_${n}_${i}`, name: nm, input: {} } }],
          ['content_block_delta', { type: 'content_block_delta', index: i + 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(a) } }], ['content_block_stop', { type: 'content_block_stop', index: i + 1 }]]),
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: usage.output } }], ['message_stop', { type: 'message_stop' }]]);
    },
  };
  const openai = {
    text: (t) => ev([['response.output_text.delta', { type: 'response.output_text.delta', delta: t }], ['response.completed', { type: 'response.completed', response: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: t }] }], usage: { input_tokens: 300, output_tokens: 8 } } }]]),
    call: (name, args) => ev([['response.completed', { type: 'response.completed', response: { output: [{ id: 'fc_' + (++n), type: 'function_call', call_id: 'call_' + n, name, arguments: JSON.stringify(args) }], usage: { input_tokens: 300, output_tokens: 20 } } }]]),
  };
  const compat = {
    text: (t) => ev([{ choices: [{ index: 0, delta: { content: t }, finish_reason: 'stop' }] }, { choices: [], usage: { prompt_tokens: 200, completion_tokens: 6 } }, '[DONE]']),
    call: (name, args) => ev([{ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_' + (++n), type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] }, { choices: [], usage: { prompt_tokens: 200, completion_tokens: 10 } }, '[DONE]']),
  };
  const gemini = {
    text: (t) => ev([{ candidates: [{ content: { role: 'model', parts: [{ text: t }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 5 } }]),
    call: (name, args) => ev([{ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args }, thoughtSignature: 'gsig' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 9 } }]),
  };
  const MODELS = {
    anthropic: { data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }] },
    openai: { data: [{ id: 'gpt-6-astra' }, { id: 'gpt-5.6-terra' }, { id: 'text-embedding-3-large' }, { id: 'gpt-realtime' }, { id: 'dall-e-3' }] },
    gemini: { models: [{ name: 'models/gemini-3.8-pro', displayName: 'Gemini 3.8 Pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-005', supportedGenerationMethods: ['embedContent'] }] },
    openrouter: { data: [{ id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', pricing: { prompt: '0.000002', completion: '0.00001' }, supported_parameters: ['tools'] }, { id: 'openai/gpt-6-astra', name: 'OpenAI: GPT-6 Astra', pricing: { prompt: '0.000003', completion: '0.000015' }, supported_parameters: ['tools'] }] },
    ollama: { data: [{ id: 'qwen3:8b' }, { id: 'llama3.2:3b' }] },
  };

  function stream(text) {
    const bytes = new TextEncoder().encode(text);
    let i = 0;
    return new Response(new ReadableStream({ pull(c) { if (i >= bytes.length) return c.close(); c.enqueue(bytes.slice(i, i + 40)); i += 40; } }), { headers: { 'content-type': 'text/event-stream' } });
  }
  const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'content-type': 'application/json' }, headers) });

  function install(win, provider) {
    const f = { provider, replies: [], requests: [], fail: null, offline: false, keys: { status: 200, body: { key: 'sk-or-v1-SIGNEDIN0123456789abcdef', user_id: 'user_test' } } };
    win.fetch = async (url, init = {}) => {
      url = String(url);
      const body = init.body ? JSON.parse(init.body) : null;
      f.requests.push({ url, headers: Object.assign({}, init.headers || {}), body, method: init.method || 'GET' });
      if (f.offline) throw new TypeError('Failed to fetch');
      if (f.fail) { const x = f.fail; f.fail = null; return json(x.body, x.status, x.headers); }
      if (/^https:\/\/openrouter\.ai\/api\/v1\/auth\/keys$/.test(url)) return json(f.keys.body, f.keys.status);
      if (/\/models(\?|$)/.test(url)) return json(MODELS[provider] || { data: [] });
      if (/openrouter\.ai\/api\/v1\/key$/.test(url)) return json({ data: { label: 'test', usage: 0 } });
      if (!f.replies.length) throw new Error('fake fetch: no reply queued for ' + url);
      return stream(f.replies.shift());
    };
    return f;
  }
  return { install, anthropic, openai, compat, gemini, ev, MODELS };
})();
