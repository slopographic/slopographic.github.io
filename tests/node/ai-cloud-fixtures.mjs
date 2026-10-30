// Recorded-style streams for the own-key providers, written from each provider's documented event format (no real key
// was used): Anthropic Messages streaming, OpenAI Responses streaming events, Chat Completions chunks (OpenRouter style,
// with its ": OPENROUTER PROCESSING" comments), Gemini streamGenerateContent?alt=sse. Each one calls a tool, the way a
// model controlling an app would, and the *_TEXT ones answer after the tool result.
import { sse } from './ai-cloud-env.mjs';

export const ANTHROPIC_TOOL = sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: 812, cache_read_input_tokens: 100, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'EqQBCkYIBxgCKkDsig' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'I will blur ' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'it.' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 1 }],
  ['content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_01A', name: 'run_command', input: {} } }],
  ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"id": "demo.' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: 'bold"}' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 2 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 64 } }],
  ['message_stop', { type: 'message_stop' }],
]);
export const ANTHROPIC_TEXT = sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_2', model: 'claude-sonnet-5-5', content: [], usage: { input_tokens: 900, output_tokens: 1 } } }],
  ['ping', { type: 'ping' }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Done: bold.' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 6 } }],
  ['message_stop', { type: 'message_stop' }],
]);
export const ANTHROPIC_REFUSAL = sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_3', model: 'claude-opus-5-5', content: [], usage: { input_tokens: 50, output_tokens: 0 } } }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } }],
  ['message_stop', { type: 'message_stop' }],
]);
/** A mid-output decline with a server-side fallback: the declined attempt's thinking and call come before the marker. */
export const ANTHROPIC_FALLBACK = sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_4', model: 'claude-opus-5-5', content: [], usage: { input_tokens: 70, output_tokens: 0 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: 'sigA' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_old', name: 'list_apps', input: {} } }],
  ['content_block_stop', { type: 'content_block_stop', index: 1 }],
  ['content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } } }],
  ['content_block_stop', { type: 'content_block_stop', index: 2 }],
  ['content_block_start', { type: 'content_block_start', index: 3, content_block: { type: 'text', text: 'Here you go.' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 3 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 9 } }],
]);
export const ANTHROPIC_OVERLOADED = sse([
  ['message_start', { type: 'message_start', message: { id: 'msg_5', content: [], usage: { input_tokens: 5, output_tokens: 0 } } }],
  ['error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }],
]);

export const OPENAI_TOOL = sse([
  ['response.created', { type: 'response.created', response: { id: 'resp_1', status: 'in_progress', output: [] }, sequence_number: 0 }],
  ['response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { id: 'rs_1', type: 'reasoning', summary: [] }, sequence_number: 1 }],
  ['response.output_item.done', { type: 'response.output_item.done', output_index: 0, item: { id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'gAAAAenc' }, sequence_number: 2 }],
  ['response.output_item.added', { type: 'response.output_item.added', output_index: 1, item: { id: 'fc_1', type: 'function_call', call_id: 'call_abc', name: 'run_command', arguments: '', status: 'in_progress' }, sequence_number: 3 }],
  ['response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 1, delta: '{"id":"demo', sequence_number: 4 }],
  ['response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 1, delta: '.bold"}', sequence_number: 5 }],
  ['response.function_call_arguments.done', { type: 'response.function_call_arguments.done', item_id: 'fc_1', output_index: 1, arguments: '{"id":"demo.bold"}', sequence_number: 6 }],
  ['response.output_item.done', { type: 'response.output_item.done', output_index: 1, item: { id: 'fc_1', type: 'function_call', call_id: 'call_abc', name: 'run_command', arguments: '{"id":"demo.bold"}', status: 'completed' }, sequence_number: 7 }],
  ['response.completed', { type: 'response.completed', sequence_number: 8, response: { id: 'resp_1', status: 'completed', model: 'gpt-6-astra',
    output: [{ id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'gAAAAenc' }, { id: 'fc_1', type: 'function_call', call_id: 'call_abc', name: 'run_command', arguments: '{"id":"demo.bold"}', status: 'completed' }],
    usage: { input_tokens: 400, output_tokens: 30, output_tokens_details: { reasoning_tokens: 12 }, total_tokens: 430 } } }],
]);
export const OPENAI_TEXT = sse([
  ['response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'Made it ', sequence_number: 1 }],
  ['response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'bold.', sequence_number: 2 }],
  ['response.completed', { type: 'response.completed', sequence_number: 3, response: { id: 'resp_2', status: 'completed', output: [{ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Made it bold.', annotations: [] }], status: 'completed' }], usage: { input_tokens: 450, output_tokens: 5 } } }],
]);
export const OPENAI_FAILED = sse([['response.failed', { type: 'response.failed', response: { id: 'resp_3', status: 'failed', error: { code: 'server_error', message: 'The model failed to generate a response.' } } }]]);

export const COMPAT_TOOL = ': OPENROUTER PROCESSING\n\n' + sse([
  { id: 'gen-1', model: 'anthropic/claude-sonnet-5.5', choices: [{ index: 0, delta: { role: 'assistant', content: 'On it. ' } }] },
  { id: 'gen-1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'run_command', arguments: '' } }] } }] },
  { id: 'gen-1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"id":' } }] } }] },
  { id: 'gen-1', choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"demo.bold"}' } }, { index: 1, id: 'call_2', type: 'function', function: { name: 'list_apps', arguments: '{}' } }] } }] },
  { id: 'gen-1', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
  { id: 'gen-1', choices: [], usage: { prompt_tokens: 300, completion_tokens: 25, total_tokens: 325 } },
  '[DONE]',
]);
export const COMPAT_TEXT = sse([{ choices: [{ index: 0, delta: { content: 'All done.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 350, completion_tokens: 3 } }, '[DONE]']);
export const COMPAT_ERROR = sse([{ id: 'gen-2', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }], error: { code: 429, message: 'Rate limit exceeded: free-models-per-min' } }]);

export const GEMINI_TOOL = sse([
  { candidates: [{ content: { role: 'model', parts: [{ text: 'Blurring now.' }] } }], modelVersion: 'gemini-3.8-flash' },
  { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'run_command', args: { id: 'demo.bold' } }, thoughtSignature: 'CiQBVKhc7sig' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 20, thoughtsTokenCount: 40, totalTokenCount: 560 } },
]);
export const GEMINI_TEXT = sse([{ candidates: [{ content: { role: 'model', parts: [{ text: 'Bold is on.' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 4 } }]);
export const GEMINI_SAFETY = sse([{ candidates: [{ finishReason: 'SAFETY' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 } }]);

/** The real error bodies these providers send for a bad key (captured with a made-up key, 2026-10-24). */
export const BAD_KEY = {
  anthropic: [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' }, request_id: 'req_011' }],
  openai: [401, { error: { message: 'Incorrect API key provided: sk-bad-1234567890. You can find your API key at https://platform.openai.com/account/api-keys.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }],
  gemini: [400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }] } }],
  openrouter: [401, { error: { message: 'Missing Authentication header', code: 401 } }],
};
