/* SlopAIKit cloud format 'anthropic': the Claude Messages API (POST https://api.anthropic.com/v1/messages, API version
 * 2026-10-21), called from the browser with the person's own key. Classic script; adds SlopAIKit.cloud.formats.anthropic.
 *   request(cfg, messages, tools, opts) → { url, init }    cfg: { key, model, base?, provider }
 *   parser() → { push({ event, data }) → [text pieces], done() → { text, calls, native, usage, stop } }
 *   models(cfg) → [{ id, name }] (GET /v1/models; Test connection)
 * Browser calls need the header anthropic-dangerous-direct-browser-access: true (CORS). Native tool use: the tools as
 * { name, description, input_schema }, the calls come back as tool_use blocks, the results go back in ONE user message
 * of tool_result blocks (an image from look_at_file as an image block inside its result). The assistant's reply is
 * kept whole (thinking blocks with their signatures, tool_use) and sent back unchanged, as the API requires; after a
 * server-side fallback the blocks before the last fallback marker are left out, as documented. No temperature: API
 * version 2026-10-21 refuses sampling parameters. Opus/Sonnet 5.x get fallbacks: "default" (a declined request is run
 * again on the model Anthropic picks); Haiku has no server-side fallback.
 * Prompt caching (the agent loop sends the same tools and system prompt every turn): an explicit cache breakpoint on the
 * system prompt (it caches the tools too, which come first) plus top-level automatic caching for the growing
 * conversation, as the API's guide recommends for agent loops. usage: input (all input tokens), cacheRead, cacheWrite.
 * Text blocks of one reply are joined with a blank line (a reply may hold several, with progress notes between).
 * Deferred tools (shared/ai/toolbox.js; Claude 4.5 and later, defers()): sent with defer_loading, so they are not in
 * the model's context until find_tools answers with tool_reference blocks (the documented custom tool search); the tool
 * list never changes, so the cache and the thinking blocks stay valid. Long histories: context editing
 * (clear_tool_uses, beta context-management-2025-06-27) instead of editing earlier turns here (serverEdits). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {}); C.formats = C.formats || {};
  const BASE = 'https://api.anthropic.com';
  const VERSION = '2026-10-21';
  const ECHO = new Set(['text', 'thinking', 'redacted_thinking', 'tool_use', 'fallback']);

  const headers = (cfg) => ({ 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': VERSION, 'anthropic-dangerous-direct-browser-access': 'true' });
  /** Models that take effort and server-side fallbacks (the 5.x Opus and Sonnet lines and Fable). */
  const fallbacks = (id) => /^claude-(opus-5|sonnet-5|fable-5)/.test(id);
  const effort = (id) => /^claude-(opus|sonnet|haiku|fable)-(4-[6-9]|5)/.test(id);

  /** The reply as it may be sent back: after a fallback, the declined attempt's thinking and calls are dropped. */
  function echo(blocks) {
    let cut = -1;
    blocks.forEach((b, i) => { if (b && b.type === 'fallback') cut = i; });
    return blocks.filter((b, i) => b && ECHO.has(b.type) && (i >= cut || b.type === 'text' || b.type === 'fallback'));
  }

  /** Models with tool search (defer_loading and tool_reference): Claude 4.5 and later. */
  const defers = (id) => /^claude-(opus|sonnet|haiku|fable|mythos)-(4-[5-9]|[5-9])/.test(String(id || ''));
  const CLEAR = { type: 'clear_tool_uses_20250919', trigger: { type: 'input_tokens', value: 30000 }, keep: { type: 'tool_uses', value: 4 },
    clear_at_least: { type: 'input_tokens', value: 5000 }, exclude_tools: ['find_tools'] };

  function resultBlock(m, refs) {
    const media = (m.media || []).filter((x) => /^image\//.test(x.mime));
    // find_tools (toolbox.js): the loaded tools as tool_reference blocks only (the API expands them into their
    // definitions and refuses other content beside them); the rest of its answer follows the results (convert)
    const load = (m.load || []).filter((n) => refs && refs.has(n)).map((n) => ({ type: 'tool_reference', tool_name: n }));
    if (load.length) return { type: 'tool_result', tool_use_id: m.callId, content: load };
    const content = media.length ? [{ type: 'text', text: String(m.content) }, ...media.map((x) => ({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } }))] : String(m.content);
    const b = { type: 'tool_result', tool_use_id: m.callId, content };
    if (m.ok === false) b.is_error = true;
    return b;
  }

  function convert(messages, refs = null) {
    const system = [], out = [];
    const add = (role, blocks) => {
      const prev = out[out.length - 1];
      if (prev && prev.role === role) prev.content.push(...blocks); else out.push({ role, content: blocks });
    };
    let tail = [];   // text that must come after a turn's tool_result blocks (the rest of a find_tools answer)
    const flush = () => { if (tail.length) add('user', tail); tail = []; };
    for (const m of messages) {
      if (m.role !== 'tool') flush();
      if (m.role === 'system') { if (m.content) system.push(String(m.content)); continue; }
      if (m.role === 'tool') {
        const b = m.callId ? resultBlock(m, refs) : null, more = b && Array.isArray(b.content) && b.content[0].type === 'tool_reference' && K.toolbox ? K.toolbox.extra(m.content) : '';
        if (more) tail.push({ type: 'text', text: more });
        if (b) add('user', [b]);
        else add('user', [{ type: 'text', text: `Result of ${m.name || 'a tool'}: ${m.content}` }]);
        continue;
      }
      if (m.role === 'assistant') {
        if (Array.isArray(m.native) && m.native.length) { add('assistant', echo(m.native)); continue; }
        const text = String(m.display != null ? m.display : m.content || '').trim();
        if (text) add('assistant', [{ type: 'text', text }]);
        continue;
      }
      const text = String(m.content == null ? '' : m.content);
      if (text) add('user', [{ type: 'text', text }]);
    }
    flush();
    return { system: system.join('\n\n'), messages: out };
  }

  function request(cfg, messages, tools = [], opts = {}) {
    const refs = new Set(tools.filter((t) => t.deferred).map((t) => t.name));
    const { system, messages: msgs } = convert(messages, refs);
    const body = { model: cfg.model, max_tokens: opts.maxTokens || 16000, stream: true, messages: msgs, cache_control: { type: 'ephemeral' } };
    if (tools.length) body.tools = tools.map((t) => Object.assign({ name: t.name, description: t.description || t.name, input_schema: t.inputSchema }, t.deferred ? { defer_loading: true } : {}));
    if (system) body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    else if (body.tools) { const last = body.tools.filter((t) => !t.defer_loading).pop(); if (last) last.cache_control = { type: 'ephemeral' }; }   // a deferred tool cannot carry one
    if (effort(cfg.model)) body.output_config = { effort: opts.effort || 'medium' };
    const h = headers(cfg), beta = [];
    if (fallbacks(cfg.model)) { body.fallbacks = 'default'; beta.push('server-side-fallback-2026-07-01'); }
    // old tool results are cleared on Anthropic's side once a request is long (context editing): it keeps thinking
    // blocks valid, which an edited history would not; find_tools results stay (they hold the loaded tools)
    if (tools.length) { body.context_management = { edits: [CLEAR] }; beta.push('context-management-2025-06-27'); }
    if (beta.length) h['anthropic-beta'] = beta.join(',');
    return { url: (cfg.base || BASE).replace(/\/+$/, '') + '/v1/messages', init: { method: 'POST', headers: h, body: JSON.stringify(body) } };
  }

  function parser() {
    const blocks = [], partial = {}, usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let texts = 0;
    let stop = null, model = null;
    return {
      push(ev) {
        const d = C.json(ev.data);
        if (!d) return [];
        const out = [];
        switch (d.type) {
          case 'message_start': {
            const u = (d.message && d.message.usage) || {};
            usage.cacheRead = u.cache_read_input_tokens || 0; usage.cacheWrite = u.cache_creation_input_tokens || 0;
            usage.input = (u.input_tokens || 0) + usage.cacheRead + usage.cacheWrite;
            usage.output = u.output_tokens || 0; model = d.message && d.message.model; break;
          }
          case 'content_block_start': {
            const b = Object.assign({}, d.content_block);
            if (b.type === 'tool_use') { partial[d.index] = ''; b.input = b.input || {}; }
            blocks[d.index] = b;
            if (b.type === 'text') { if (texts++) out.push('\n\n'); if (b.text) out.push(b.text); }
            break;
          }
          case 'content_block_delta': {
            const b = blocks[d.index], x = d.delta || {};
            if (!b) break;
            if (x.type === 'text_delta') { b.text = (b.text || '') + x.text; out.push(x.text); }
            else if (x.type === 'thinking_delta') b.thinking = (b.thinking || '') + x.thinking;
            else if (x.type === 'signature_delta') b.signature = (b.signature || '') + x.signature;
            else if (x.type === 'input_json_delta') partial[d.index] = (partial[d.index] || '') + (x.partial_json || '');
            break;
          }
          case 'content_block_stop': {
            const b = blocks[d.index];
            if (b && b.type === 'tool_use' && partial[d.index]) b.input = C.json(partial[d.index]) || {};
            break;
          }
          case 'message_delta':
            if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason;
            if (d.usage && d.usage.output_tokens != null) usage.output = d.usage.output_tokens;
            break;
          case 'error': {
            const e = d.error || {}, kind = e.type === 'overloaded_error' ? 'server' : e.type === 'rate_limit_error' ? 'rate' : 'request';
            throw new C.CloudError(kind, C.plain(kind, 'Claude', { detail: C.redact(e.message) }), { detail: C.redact(e.message) });
          }
          default: break;
        }
        return out;
      },
      done() {
        const list = blocks.filter(Boolean);
        let cut = -1; list.forEach((b, i) => { if (b.type === 'fallback') cut = i; });
        const calls = list.filter((b, i) => b.type === 'tool_use' && i > cut).map((b) => ({ id: b.id, name: b.name, arguments: b.input && typeof b.input === 'object' ? b.input : {} }));
        const text = list.filter((b) => b.type === 'text').map((b) => b.text || '').join('\n\n');
        return { text, calls, native: list, usage, stop: stop === 'refusal' ? 'refusal' : stop === 'max_tokens' ? 'length' : stop, model };
      },
    };
  }

  async function models(cfg) {
    const res = await C.call((cfg.base || BASE).replace(/\/+$/, '') + '/v1/models?limit=100', { headers: headers(cfg), signal: cfg.signal }, { secret: cfg.key, provider: cfg.provider });
    const j = await res.json();
    return (j.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  C.formats.anthropic = { request, parser, models, convert, echo, defers, serverEdits: true, CLEAR, VERSION };
})();
