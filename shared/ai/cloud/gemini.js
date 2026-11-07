/* SlopAIKit cloud format 'gemini': the Gemini API's generateContent, streamed
 * (POST https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse, key in the
 * x-goog-api-key header). Classic script; adds SlopAIKit.cloud.formats.gemini.
 *   request(cfg, messages, tools, opts) → { url, init }    parser() → { push(ev), done() }    models(cfg) → [{ id, name }]
 * Roles are 'user' and 'model'. Tools: { functionDeclarations: [{ name, description, parametersJsonSchema }] }. Calls
 * come back as functionCall parts; results go back in one user turn of functionResponse parts (same order, with the
 * call's id when it had one), a picture from look_at_file as an inlineData part after them. The model's parts are kept
 * exactly as they came, with their thoughtSignature: Gemini 3 models refuse a later turn whose function calls lost it. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = (K.cloud = K.cloud || {}); C.formats = C.formats || {};
  const BASE = 'https://generativelanguage.googleapis.com';
  const root = (cfg) => (cfg.base || BASE).replace(/\/+$/, '');
  const headers = (cfg) => ({ 'content-type': 'application/json', 'x-goog-api-key': cfg.key });
  const GEN = 'gem:';   // our own ids for calls that came without one (never sent back)
  const REFUSED = /^(SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY)$/;

  function convert(messages) {
    const sys = [], contents = [];
    const add = (role, parts) => { const prev = contents[contents.length - 1]; if (prev && prev.role === role) prev.parts.push(...parts); else contents.push({ role, parts }); };
    for (const m of messages) {
      if (m.role === 'system') { if (m.content) sys.push(String(m.content)); continue; }
      if (m.role === 'tool') {
        if (m.callId) {
          const fr = { name: m.name, response: m.ok === false ? { error: String(m.content).replace(/^ERROR:\s*/, '') } : { result: String(m.content) } };
          if (!String(m.callId).startsWith(GEN)) fr.id = m.callId;
          const media = (m.media || []).filter((x) => /^image\//.test(x.mime)).map((x) => ({ inlineData: { mimeType: x.mime, data: x.data } }));
          add('user', [{ functionResponse: fr }, ...media]);
        } else add('user', [{ text: `Result of ${m.name || 'a tool'}: ${m.content}` }]);
        continue;
      }
      if (m.role === 'assistant') {
        if (Array.isArray(m.native) && m.native.length) { add('model', m.native.map((p) => Object.assign({}, p))); continue; }
        const text = String(m.display != null ? m.display : m.content || '').trim();
        if (text) add('model', [{ text }]);
        continue;
      }
      const text = String(m.content == null ? '' : m.content);
      if (text) add('user', [{ text }]);
    }
    return { systemInstruction: sys.length ? { parts: [{ text: sys.join('\n\n') }] } : null, contents };
  }

  function request(cfg, messages, tools = [], opts = {}) {
    const { systemInstruction, contents } = convert(messages);
    const body = { contents, generationConfig: { maxOutputTokens: opts.maxTokens || 16000 } };
    if (systemInstruction) body.systemInstruction = systemInstruction;
    if (tools.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description || t.name, parametersJsonSchema: t.inputSchema })) }];
    const model = String(cfg.model).replace(/^models\//, '');
    return { url: `${root(cfg)}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, init: { method: 'POST', headers: headers(cfg), body: JSON.stringify(body) } };
  }

  function parser() {
    const parts = [], usage = { input: 0, output: 0 };
    let text = '', stop = null, model = null;
    return {
      push(ev) {
        const d = C.json(ev.data);
        if (!d) return [];
        if (d.error) {
          const msg = C.redact(d.error.message), kind = C.kindOf(Number(d.error.code) || 400, msg);
          throw new C.CloudError(kind, C.plain(kind, 'Gemini', { detail: msg }), { status: d.error.code, detail: msg });
        }
        if (d.modelVersion) model = d.modelVersion;
        const u = d.usageMetadata;
        if (u) { usage.input = u.promptTokenCount || 0; usage.output = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0); usage.cacheRead = u.cachedContentTokenCount || 0; }   // implicit caching: automatic
        if (d.promptFeedback && d.promptFeedback.blockReason) stop = 'refusal';
        const cand = (d.candidates || [])[0];
        if (!cand) return [];
        if (cand.finishReason) stop = REFUSED.test(cand.finishReason) ? 'refusal' : cand.finishReason === 'MAX_TOKENS' ? 'length' : cand.finishReason.toLowerCase();
        const out = [];
        for (const p of (cand.content && cand.content.parts) || []) {
          parts.push(p);
          if (typeof p.text === 'string' && p.text && !p.thought) { text += p.text; out.push(p.text); }
        }
        return out;
      },
      done() {
        let n = 0;
        const calls = parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall.id || GEN + (++n), name: p.functionCall.name, arguments: p.functionCall.args || {} }));
        return { text, calls, native: parts, usage, stop, model };
      },
    };
  }

  const NOT = /(embedding|aqa|imagen|veo|tts|image-generation|native-audio|live)/i;
  async function models(cfg) {
    const res = await C.call(root(cfg) + '/v1beta/models?pageSize=200', { headers: headers(cfg), signal: cfg.signal }, { secret: cfg.key, provider: cfg.provider });
    const j = await res.json();
    return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && !NOT.test(m.name))
      .map((m) => ({ id: String(m.name).replace(/^models\//, ''), name: m.displayName || m.name }));
  }

  C.formats.gemini = { request, parser, models, convert };
})();
