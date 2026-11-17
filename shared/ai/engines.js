/* SlopAIKit engines: the engine interface and the fake engine. Classic script; adds SlopAIKit.Engine, SlopAIKit.FakeEngine.
 * Every engine has the same shape:
 *   load(model, onProgress, { signal }) → Promise        onProgress({ progress: 0..1, text })
 *   chat(messages, { tools, stream = true, temperature, max_tokens, signal })
 *       stream: an async iterator of { type: 'delta', text } … then { type: 'done', text, raw, toolCalls, usage }
 *       stream: false → Promise of the 'done' object
 *   unload() → Promise,   info() → { kind, id, name, loaded }
 * Subclasses implement _raw(messages, opts): an async iterator of text pieces (or { usage } objects).
 * Tool use is prompt-based (SlopAIKit.tools), so it works with every model and over the bridge. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const now = () => performance.now();
  const sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });

  class Engine {
    constructor() { this.model = null; this.loaded = false; this.kind = 'base'; }
    async load(model) { this.model = model; this.loaded = true; }
    async unload() { this.loaded = false; }
    info() { const m = this.model || {}; return { kind: this.kind, id: m.id || null, name: m.name || m.id || null, loaded: this.loaded }; }
    async *_raw() { /* subclass */ }
    chat(messages, opts = {}) {
      const tools = opts.tools && opts.tools.length ? opts.tools : null;
      const msgs = K.tools ? K.tools.prepare(messages, tools) : messages;
      const self = this;
      async function* gen() {
        let raw = '', n = 0, first = 0, usage = null;
        const t0 = now();
        for await (const piece of self._raw(msgs, opts)) {
          if (piece && typeof piece === 'object') { if (piece.usage) usage = piece.usage; continue; }
          if (!piece) continue;
          if (!first) first = now();
          raw += piece; n++;
          yield { type: 'delta', text: piece };
        }
        const end = now(), genMs = Math.max(1, end - (first || t0));
        const tokens = (usage && usage.completion_tokens) || n;
        const parsed = tools && K.tools ? K.tools.parse(raw, tools) : { text: raw, calls: [] };
        yield { type: 'done', text: parsed.text, raw, toolCalls: parsed.calls, aborted: !!(opts.signal && opts.signal.aborted),
          usage: { tokens, prompt: usage ? usage.prompt_tokens : null, ms: Math.round(end - t0), ttft: Math.round((first || end) - t0), tps: Math.round((tokens / (genMs / 1000)) * 10) / 10 } };
      }
      if (opts.stream === false) return (async () => { let last = null; for await (const c of gen()) last = c; return last; })();
      return gen();
    }
  }

  /* ---------- the fake engine: canned, streamed, tool-capable. For tests and development without a GPU. ---------- */
  const CALC = `<!doctype html>
<html><head><meta charset="utf-8"><title>Slop Calculator</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#111;color:#eee;font:20px system-ui}
.c{display:grid;grid-template-columns:repeat(4,64px);gap:8px}#d{grid-column:span 4;background:#222;padding:12px;text-align:right;min-height:28px;border-radius:8px}
button{height:56px;border:0;border-radius:10px;background:#2a2a30;color:#eee;font:inherit}button.o{background:#d4ff3a;color:#111}</style></head>
<body><div class="c"><div id="d">0</div></div>
<script>
const d = document.getElementById('d'), c = document.querySelector('.c'); let s = '';
for (const k of '789/456*123-0.=+C') { const b = document.createElement('button'); b.textContent = k; if ('/*-+='.includes(k)) b.className = 'o';
  b.onclick = () => { if (k === 'C') s = ''; else if (k === '=') { try { s = String(Function('return (' + s + ')')()); } catch (e) { s = 'error'; } } else s += k; d.textContent = s || '0'; };
  c.append(b); }
</script></body></html>`;
  const SLOPPO_LINES = ['SLURP. I am the slop. ask me anything.', 'SLURP! My brain is 90% goo and 10% vibes.', 'I ate a font once. It was Comic Sans. Never again.', 'Beep boop, I mean, blorp.', 'I run on your GPU. Please do not unplug my brain.'];

  class FakeEngine extends Engine {
    /** opts.delay: ms per token (0 in tests). opts.replies: scripted replies, used first, one per chat() call. */
    constructor({ delay = 12, replies = null, loadMs = 120 } = {}) { super(); this.kind = 'fake'; this.delay = delay; this.replies = replies ? replies.slice() : []; this.loadMs = loadMs; this.calls = []; }
    async load(model, onProgress, { signal } = {}) {
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        if (signal && signal.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
        await sleep(this.loadMs / steps, signal);
        if (onProgress) onProgress({ progress: i / steps, text: i < steps ? `Fetching param cache[${i}/${steps - 1}] (fake)` : 'Finish loading (fake engine)' });
      }
      this.model = typeof model === 'string' ? { id: model, name: model } : model; this.loaded = true;
    }
    async *_raw(messages, opts = {}) {
      this.calls.push({ messages, opts });
      const reply = this.replies.length ? this.replies.shift() : this.respond(messages, opts);
      const toks = String(reply).match(/\s*\S+|\s+/g) || [];
      let left = opts.max_tokens || 1e9;
      for (const t of toks) {
        if ((opts.signal && opts.signal.aborted) || left-- <= 0) break;
        if (this.delay) await sleep(this.delay, opts.signal);
        yield t;
      }
    }
    /** Canned answers, good enough to drive every UI path. */
    respond(messages) {
      const sys = (messages.find((m) => m.role === 'system') || {}).content || '';
      const last = messages[messages.length - 1] || {}, q = String(last.content || '');
      const lq = q.toLowerCase(), tools = (sys.match(/^- (\w+)\(/gm) || []).map((s) => s.slice(2, -1));
      const call = (name, args) => `<tool_call>{"name": "${name}", "arguments": ${JSON.stringify(args)}}</tool_call>`;
      if (/^TOOL RESULT/.test(q)) return /error|said no/i.test(q) ? 'That did not work: ' + q.slice(0, 120) : 'Done! ' + q.replace(/^TOOL RESULT[^:]*:\s*/, '').slice(0, 140);
      const apps = window.SLOP_APPS || [];
      if (tools.includes('open_app') && /\b(open|launch|start|go to)\b/.test(lq)) {
        const app = apps.find((a) => lq.includes(a.name.toLowerCase()) || new RegExp('\\b' + a.id + '\\b').test(lq));
        const file = (q.match(/\bwith\s+([\w.-]+\.\w+)/i) || [])[1];
        if (app) return 'Opening ' + app.name + '. ' + call('open_app', file ? { id: app.id, file } : { id: app.id });
      }
      // a thing another app makes ("make a presentation" in Slop PDF): hand the task over instead of refusing
      const maker = tools.includes('open_app') && /\b(make|create|write|build|start|draft)\b/.test(lq) && apps.find((a) => (a.creates || []).some((c) => lq.includes(String(c.label).toLowerCase())));
      if (maker && !sys.includes('inside ' + maker.name)) return `That is a job for ${maker.name}. ` + call('open_app', { id: maker.id, task: q });
      if (tools.includes('run_command') && /\b(run|do|command)\b/.test(lq)) { const m = q.match(/[a-z]+\.[\w.]+/i); if (m) return call('run_command', { id: m[0] }); }
      if (tools.includes('save_to_drive') && /\bsave\b/.test(lq)) return call('save_to_drive', { name: 'note from Slop AI.md', content: '# Note\n\nSaved by the fake engine.' });
      if (tools.includes('list_apps') && /\b(which|what|list)\b.*\bapps?\b/.test(lq)) return call('list_apps', {});
      if (/single-file html|mini-app/i.test(sys) || /\b(build|make|create)\b.*\b(app|game|calculator|page|tool)\b/.test(lq)) {
        const title = /game/.test(lq) ? 'Slop Game' : /landing|page/.test(lq) ? 'Slop Landing' : 'Slop Calculator';
        return `Here is a small single-file app (${title}).\n\n\`\`\`html\n${CALC.replace(/Slop Calculator/g, title)}\n\`\`\`\n\nTell me what to change.`;
      }
      if (/SLURP/.test(sys)) return SLOPPO_LINES[(q.length + messages.length) % SLOPPO_LINES.length];
      const files = (q.match(/^Attached file: (.+)$/gm) || []).map((s) => s.slice(15));
      return `**Fake engine** reply (no real model is loaded).\n\nYou said: "${q.split('\n')[0].slice(0, 80)}"` +
        (files.length ? `\n\nI can see ${files.length} attached file(s): ${files.join(', ')}.` : '') +
        '\n\n- streaming works\n- *markdown* works\n\n```js\nconsole.log("hello from the slop");\n```';
    }
  }

  K.Engine = Engine; K.FakeEngine = FakeEngine; K.sleep = sleep;
  K.FAKE_APP_HTML = CALC;
})();
