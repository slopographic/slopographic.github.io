/* SlopAIKit cloud format 'openai': OpenAI's Responses API (POST https://api.openai.com/v1/responses), the API OpenAI
 * recommends for tool calling (its newest models take tools only there). Classic script; adds SlopAIKit.cloud.formats.openai.
 *   request(cfg, messages, tools, opts) → { url, init }    parser() → { push(ev), done() }    models(cfg) → [{ id, name }]
 * store: false, so OpenAI keeps no copy of the conversation for later retrieval; the history is sent each turn, with the
 * model's own output items (reasoning with its encrypted content, function calls, messages) passed back as they came, as
 * OpenAI documents for stateless use. Tools: { type: 'function', name, description, parameters }. Results:
 * function_call_output items with the call_id (an image from look_at_file as an input_image part of the output). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {}); C.formats = C.formats || {};
  const BASE = 'https://api.openai.com/v1';
  const root = (cfg) => (cfg.base || BASE).replace(/\/+$/, '');
  const headers = (cfg) => ({ 'content-type': 'application/json', authorization: 'Bearer ' + cfg.key });

  function output(m) {
    const media = (m.media || []).filter((x) => /^image\//.test(x.mime));
    const text = String(m.content);
    return media.length ? [{ type: 'input_text', text }, ...media.map((x) => ({ type: 'input_image', image_url: `data:${x.mime};base64,${x.data}` }))] : text;
  }
  function convert(messages) {
    const sys = [], input = [];
    for (const m of messages) {
      if (m.role === 'system') { if (m.content) sys.push(String(m.content)); continue; }
      if (m.role === 'tool') {
        if (m.callId) input.push({ type: 'function_call_output', call_id: m.callId, output: output(m) });
        else input.push({ role: 'user', content: `Result of ${m.name || 'a tool'}: ${m.content}` });
        continue;
      }
      if (m.role === 'assistant') {
        if (Array.isArray(m.native) && m.native.length) { input.push(...m.native); continue; }
        const text = String(m.display != null ? m.display : m.content || '').trim();
        if (text) input.push({ role: 'assistant', content: text });
        continue;
      }
      const text = String(m.content == null ? '' : m.content);
      if (text) input.push({ role: 'user', content: text });
    }
    return { instructions: sys.join('\n\n'), input };
  }

  function request(cfg, messages, tools = [], opts = {}) {
    const { instructions, input } = convert(messages);
    // prompt_cache_key: OpenAI caches long repeated prefixes on its own; one key for the panel helps them land together
    const body = { model: cfg.model, input, stream: true, store: false, max_output_tokens: opts.maxTokens || 16000, prompt_cache_key: 'slopographic-ai-panel' };
    if (instructions) body.instructions = instructions;
    if (tools.length) body.tools = tools.map((t) => ({ type: 'function', name: t.name, description: t.description || t.name, parameters: t.inputSchema, strict: false }));
    return { url: root(cfg) + '/responses', init: { method: 'POST', headers: headers(cfg), body: JSON.stringify(body) } };
  }

  function parser() {
    const items = [], usage = { input: 0, output: 0 };
    let text = '', stop = null, final = null;
    const fail = (msg) => { const detail = C.redact(msg); throw new C.CloudError('request', C.plain('request', 'OpenAI', { detail }), { detail }); };
    return {
      push(ev) {
        const d = C.json(ev.data);
        if (!d) return [];
        switch (d.type) {
          case 'response.output_text.delta': case 'response.refusal.delta':
            text += d.delta || ''; return d.delta ? [d.delta] : [];
          case 'response.output_item.done': if (d.item) items[d.output_index != null ? d.output_index : items.length] = d.item; break;
          case 'response.completed': case 'response.incomplete': {
            final = d.response || {};
            const u = final.usage || {};
            usage.input = u.input_tokens || 0; usage.output = u.output_tokens || 0;
            usage.cacheRead = (u.input_tokens_details && u.input_tokens_details.cached_tokens) || 0;
            if (d.type === 'response.incomplete') stop = (final.incomplete_details && final.incomplete_details.reason) === 'content_filter' ? 'refusal' : 'length';
            break;
          }
          case 'response.failed': fail((d.response && d.response.error && d.response.error.message) || 'the response failed'); break;
          case 'error': {
            const kind = /rate/i.test(d.code || '') ? 'rate' : 'request';
            if (kind === 'rate') throw new C.CloudError('rate', C.plain('rate', 'OpenAI'));
            fail(d.message || d.code || 'error');
            break;
          }
          default: break;
        }
        return [];
      },
      done() {
        const list = (final && Array.isArray(final.output) && final.output.length ? final.output : items).filter(Boolean);
        const calls = list.filter((x) => x.type === 'function_call').map((x) => ({ id: x.call_id, name: x.name, arguments: (typeof x.arguments === 'string' ? C.json(x.arguments) : x.arguments) || {} }));
        if (!text) text = list.filter((x) => x.type === 'message').flatMap((x) => x.content || []).map((p) => p.text || p.refusal || '').join('');
        if (!stop && list.some((x) => x.type === 'message' && (x.content || []).some((p) => p.type === 'refusal'))) stop = 'refusal';
        return { text, calls, native: list, usage, stop, model: final && final.model };
      },
    };
  }

  /** Text models only: the list also has embeddings, speech, images, moderation… which cannot chat. */
  const CHAT = /^(gpt-|o\d|chatgpt-)/i, NOT = /(embedding|tts|whisper|transcribe|audio|realtime|image|dall-e|moderation|search|computer-use|instruct)/i;
  async function models(cfg) {
    const res = await C.call(root(cfg) + '/models', { headers: headers(cfg), signal: cfg.signal }, { secret: cfg.key, provider: cfg.provider });
    const j = await res.json();
    return (j.data || []).map((m) => m.id).filter((id) => CHAT.test(id) && !NOT.test(id)).sort().map((id) => ({ id, name: id }));
  }

  C.formats.openai = { request, parser, models, convert };
})();
