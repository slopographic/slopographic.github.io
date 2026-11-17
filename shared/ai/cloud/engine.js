/* SlopAIKit.CloudEngine: a model at an AI provider, used with the person's own key, behind the same engine interface
 * as the local models (shared/ai/engines.js), so the one agent loop (tools.js run), the one tool list (apptools.js +
 * cmdtools.js) and the one panel drive it. Classic script; needs engines.js, cloud/net.js, providers.js and the format.
 *   new CloudEngine({ provider, model, base?, key: () => Promise<string>, modelName?, price? })
 *   load() → nothing to download; marks it ready      info() → { kind: 'cloud', id, name, provider, who, loaded }
 *   chat(messages, { tools, signal, maxTokens }) → the stream: { type: 'delta', text } … then { type: 'done', text, raw,
 *       toolCalls: [{ id, name, arguments }], native (the provider's own reply, sent back unchanged next turn),
 *       usage: { tokens, prompt, input, output, cacheRead, cacheWrite, cost ($ or null), ms, ttft, tps }, stop ('refusal' | 'length' | …), aborted }
 * Tool calling is NATIVE: each tool goes to the provider as JSON Schema (cmdTools.inputSchema, the one schema maker) and
 * its calls come back structured, never parsed out of text. Deferred tools (toolbox.js) reach the model when find_tools
 * loads them (plan below). Temperature and the small max_tokens the panel gives local
 * models are not passed on (several providers refuse sampling settings; thinking models need room). */
(function () {
  'use strict';
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const C = K.cloud;
  const now = () => performance.now();

  /** A tool of the kit as a provider-neutral definition: name, description, its input as JSON Schema (compact: the app
   * checks bounds and lengths itself, toolbox.js) and deferred (a format that loads tools natively sends it unloaded). */
  function toolDef(t, native) {
    const schema = K.cmdTools && K.cmdTools.inputSchema ? K.cmdTools.inputSchema(t) : (t.schema || { type: 'object', properties: {} });
    const d = { name: t.name, description: t.description || t.name, inputSchema: K.toolbox ? K.toolbox.compact(schema) : schema };
    if (native && t.deferred) d.deferred = true;
    return d;
  }
  /** What one turn sends: with a format that defers tools itself (Claude's defer_loading) every tool, deferred ones
   * marked, and the history as it was (the provider clears old results on its side); for the others only the tools shown
   * so far (toolbox.visible: loaded ones join at the end) and the earlier requests' results shortened (toolbox.trim). */
  function plan(F, model, messages, list) {
    const B = K.toolbox, native = !!(F.defers && F.defers(model));
    if (!B) return { tools: list.map((t) => toolDef(t)), messages };
    return { tools: (native ? list : B.visible(list, messages)).map((t) => toolDef(t, native)), messages: F.serverEdits ? messages : B.trim(messages) };
  }

  class CloudEngine extends K.Engine {
    constructor({ provider, model, base = null, key = async () => '', modelName = '', price = null } = {}) {
      super();
      this.kind = 'cloud'; this.provider = typeof provider === 'string' ? C.byId(provider) : provider;
      if (!this.provider) throw new Error('Unknown AI provider');
      this.base = base || this.provider.base || ''; this.getKey = key; this.price = price || C.price(this.provider, model);
      this.model = { id: model, name: modelName || ((this.provider.models || []).find((m) => m.id === model) || {}).name || model };
      this.vision = true;
    }
    async load() { this.loaded = true; }
    info() { return Object.assign(super.info(), { kind: 'cloud', provider: this.provider.id, who: this.provider.who, short: this.provider.short }); }
    cfg(key, signal) { return { key, model: this.model.id, base: this.base, provider: this.provider, signal }; }

    /** Test connection: the provider's own check (OpenRouter), else its model list. Resolves with the models ([] when it has
     * none), only those the site offers (providers.js offered, shared/ai/makers.js). */
    async test({ signal } = {}) {
      const key = await this.getKey(), F = C.formats[this.provider.format];
      if (this.provider.needsKey && !key) throw new C.CloudError('key', T('ui.ai.cloud.paste_key'));
      const cfg = this.cfg(key, signal);
      if (this.provider.test) await this.provider.test(cfg);
      if (this.provider.modelsEndpoint === false) return [];   // no model list (Azure deployments): the first request checks the key
      return F.models(cfg).then((list) => C.offered(this.provider, list), (e) => { if (this.provider.test && e.kind !== 'key') return []; throw e; });
    }

    chat(messages, opts = {}) {
      const self = this, p = this.provider, F = C.formats[p.format];
      const sent = plan(F, this.model.id, messages, opts.tools || []), tools = sent.tools;
      async function* gen() {
        const t0 = now();
        let first = 0, streamed = '', parse = null;
        const key = await self.getKey();
        if (p.needsKey && !key) throw new C.CloudError('key', T('ui.ai.cloud.connect_first', { name: p.short }));
        const { url, init } = F.request(self.cfg(key), C.seal(sent.messages), tools, { maxTokens: opts.maxTokens });
        init.signal = opts.signal;
        let aborted = false;
        try {
          const res = await C.call(url, init, { secret: key, provider: p, model: self.model.id });
          parse = F.parser();
          for await (const ev of C.sse(res.body)) {
            for (const piece of parse.push(ev)) { if (!first) first = now(); streamed += piece; yield { type: 'delta', text: piece }; }
          }
        } catch (e) {
          if (!(e && (e.name === 'AbortError' || e.kind === 'abort')) && !(opts.signal && opts.signal.aborted)) {
            if (e instanceof C.CloudError) throw e;
            throw new C.CloudError('network', C.plain('network', p.who), { detail: C.redact(e && e.message, key) });
          }
          aborted = true;
        }
        const r = parse && !aborted ? parse.done() : { text: streamed, calls: [], native: null, usage: { input: 0, output: 0 }, stop: 'aborted' };
        const end = now(), genMs = Math.max(1, end - (first || t0));
        const usage = { input: r.usage.input || 0, output: r.usage.output || 0, cacheRead: r.usage.cacheRead || 0, cacheWrite: r.usage.cacheWrite || 0 };
        usage.tokens = usage.output; usage.prompt = usage.input; usage.cost = C.cost(usage, self.price);
        usage.ms = Math.round(end - t0); usage.ttft = Math.round((first || end) - t0); usage.tps = Math.round((usage.output / (genMs / 1000)) * 10) / 10;
        let text = r.text;
        if (!text && !r.calls.length && r.stop === 'refusal') text = C.plain('refusal', p.short);
        else if (r.stop === 'length' && !r.calls.length) text += (text ? '\n\n' : '') + T('ui.ai.cloud.cut_off');
        yield { type: 'done', text, raw: text, toolCalls: aborted ? [] : r.calls, native: aborted ? null : r.native, usage, stop: r.stop, aborted: aborted || !!(opts.signal && opts.signal.aborted) };
      }
      if (opts.stream === false) return (async () => { let last = null; for await (const c of gen()) last = c; return last; })();
      return gen();
    }
  }

  K.CloudEngine = CloudEngine;
  C.toolDef = toolDef; C.plan = plan;
})();
