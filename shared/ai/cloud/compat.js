/* SlopAIKit cloud format 'compat': the OpenAI-compatible Chat Completions API (POST <base>/chat/completions), spoken by
 * OpenRouter, Ollama, LM Studio, llama.cpp's server, vLLM and many hosted services. Classic script; adds
 * SlopAIKit.cloud.formats.compat.
 *   request(cfg, messages, tools, opts) → { url, init }    parser() → { push(ev), done() }    models(cfg) → [{ id, name, price? }]
 * cfg: { key (may be empty for a local server), model, base, provider: { headers?, usageOption?, maxTokens? } }.
 * Tools: { type: 'function', function: { name, description, parameters } }. Streamed calls arrive as tool_calls deltas
 * by index (id and name first, then the arguments in pieces). Results: { role: 'tool', tool_call_id, content }. Tool
 * messages carry text only, so a picture from look_at_file follows them as a user message with an image_url part.
 * The assistant message is kept as it came (with OpenRouter's reasoning_details, which some models need back). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {}); C.formats = C.formats || {};
  /** base + path (a query in the base, Azure's ?api-version=…, stays at the end); the key in the provider's header. */
  const url = (cfg, path) => C.endpoint(cfg.base, path);
  const headers = (cfg) => Object.assign({ 'content-type': 'application/json' }, C.authHeaders(cfg));

  function convert(messages) {
    const out = [];
    let pics = [];
    const flush = () => { if (pics.length) { out.push({ role: 'user', content: [{ type: 'text', text: 'The picture you asked to look at:' }, ...pics.map((x) => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } }))] }); pics = []; } };
    for (const m of messages) {
      if (m.role !== 'tool') flush();
      if (m.role === 'system') { if (m.content) out.push({ role: 'system', content: String(m.content) }); continue; }
      if (m.role === 'tool') {
        if (m.callId) { out.push({ role: 'tool', tool_call_id: m.callId, content: String(m.content) }); pics.push(...(m.media || []).filter((x) => /^image\//.test(x.mime))); }
        else out.push({ role: 'user', content: `Result of ${m.name || 'a tool'}: ${m.content}` });
        continue;
      }
      if (m.role === 'assistant') {
        if (m.native && typeof m.native === 'object' && !Array.isArray(m.native)) { out.push(Object.assign({ role: 'assistant' }, m.native)); continue; }
        const text = String(m.display != null ? m.display : m.content || '').trim();
        if (text) out.push({ role: 'assistant', content: text });
        continue;
      }
      out.push({ role: 'user', content: String(m.content == null ? '' : m.content) });
    }
    flush();
    return out;
  }

  function request(cfg, messages, tools = [], opts = {}) {
    const p = cfg.provider || {};
    const body = { model: cfg.model, messages: convert(messages), stream: true };
    if (p.usageOption !== false) body.stream_options = { include_usage: true };
    if (p.maxTokens) body.max_tokens = opts.maxTokens || p.maxTokens;
    if (tools.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description || t.name, parameters: t.inputSchema } }));
    return { url: url(cfg, '/chat/completions'), init: { method: 'POST', headers: headers(cfg), body: JSON.stringify(body) } };
  }

  function parser() {
    const calls = [], usage = { input: 0, output: 0 }, reasoning = [];
    let text = '', stop = null, model = null;
    return {
      push(ev) {
        if (ev.data === '[DONE]') return [];
        const d = C.json(ev.data);
        if (!d) return [];
        if (d.error) {
          const msg = C.redact(typeof d.error === 'string' ? d.error : d.error.message), code = Number(d.error.code) || 0;
          const kind = code === 429 ? 'rate' : code === 401 ? 'key' : code === 402 ? 'money' : 'request';
          throw new C.CloudError(kind, C.plain(kind, '', { detail: msg }), { status: code, detail: msg });
        }
        if (d.model) model = d.model;
        if (d.usage) { usage.input = d.usage.prompt_tokens || 0; usage.output = d.usage.completion_tokens || 0; usage.cacheRead = (d.usage.prompt_tokens_details && d.usage.prompt_tokens_details.cached_tokens) || 0; }
        const ch = (d.choices || [])[0];
        if (!ch) return [];
        if (ch.finish_reason) stop = ch.finish_reason;
        const x = ch.delta || ch.message || {}, out = [];
        if (typeof x.content === 'string' && x.content) { text += x.content; out.push(x.content); }
        if (Array.isArray(x.reasoning_details)) reasoning.push(...x.reasoning_details);
        for (const tc of x.tool_calls || []) {
          const i = tc.index != null ? tc.index : calls.length;
          const c = (calls[i] = calls[i] || { id: '', name: '', args: '' });
          if (tc.id) c.id = tc.id;
          if (tc.function) { if (tc.function.name) c.name += tc.function.name; if (tc.function.arguments) c.args += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments); }
        }
        return out;
      },
      done() {
        const list = calls.filter(Boolean).map((c, i) => ({ id: c.id || 'call_' + (i + 1), name: c.name, arguments: C.json(c.args || '{}') || {} }));
        const native = { content: text || null };
        if (list.length) native.tool_calls = list.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } }));
        if (reasoning.length) native.reasoning_details = reasoning;
        return { text, calls: list, native, usage, stop: stop === 'content_filter' ? 'refusal' : stop === 'length' ? 'length' : stop, model };
      },
    };
  }

  /** Lists also carry embedding, picture, speech and rerank models (Together, DeepInfra, Fireworks…), which cannot chat. */
  const NOT = /(^|[-_/.])(embed|embedding|rerank|whisper|tts|moderation|guard)/i;
  const chatty = (m) => !(m.type && /embed|image|rerank|moderation|audio|transcri/i.test(m.type)) && !NOT.test(m.id || m.name);
  async function models(cfg) {
    const res = await C.call(url(cfg, (cfg.provider && cfg.provider.modelsEndpoint) || '/models'), { headers: headers(cfg), signal: cfg.signal }, { secret: cfg.key, provider: cfg.provider });
    const j = await res.json();
    const list = (Array.isArray(j) ? j : j.data || j.models || []).map((m) => (typeof m === 'string' ? { id: m } : m)).filter((m) => m && (m.id || m.name) && chatty(m));
    return list.map((m) => {
      const o = { id: m.id || m.name, name: m.name || m.id };
      if (m.pricing) o.price = { input: Number(m.pricing.prompt) * 1e6 || 0, output: Number(m.pricing.completion) * 1e6 || 0 };   // $ per token → per million
      if (m.pricing && m.pricing.input_cache_read != null) o.price.cacheRead = Number(m.pricing.input_cache_read) * 1e6 || 0;
      if (Array.isArray(m.supported_parameters)) o.tools = m.supported_parameters.includes('tools');
      if (C.free && (m.pricing || /:free$/.test(o.id))) o.free = C.free.priced(m);   // OpenRouter: ':free' ids and zero prices
      return o;
    });
  }

  C.formats.compat = { request, parser, models, convert };
})();
