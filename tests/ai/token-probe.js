/* The AI panel's real requests on an app page, for the token budget (tools/ai-tokens.mjs, tests/node/ai-tokens.test.mjs).
 * Injected after tests/ai/cloud-util.js into a real app page. window.TokenProbe.run({ prompt, providers }) opens the
 * panel, connects each provider with a fake fetch (no key, no network), sends the prompt, answers with tool calls one
 * turn each (find_tools "blur" when the panel defers tools, then app_state, else list_files) and then text, and returns
 * what each request carried:
 *   { app, tools: [names], requests: { anthropic: [body1, body2], openai: […], openrouter: […], gemini: […], local: [msgs1, msgs2] } }
 * "local" is a prompt-based model on this device (a 3B model the panel counts as capable), through the same panel run. */
window.TokenProbe = (function () {
  'use strict';
  const MODELS = { anthropic: 'claude-haiku-5-5', openai: 'gpt-6-astra', openrouter: 'anthropic/claude-sonnet-5.5', gemini: 'gemini-3.8-flash' };
  const FORMAT = { anthropic: 'anthropic', openai: 'openai', openrouter: 'compat', gemini: 'gemini' };
  const CHAT = /\/v1\/messages$|\/responses$|\/chat\/completions$|:streamGenerateContent/;

  async function ready() {
    for (let i = 0; i < 300 && !(window.SlopHeader && document.readyState === 'complete'); i++) await new Promise((r) => setTimeout(r, 100));
    if (!window.SlopHeader) throw new Error('no shell header on this page');
    await window.SlopHeader.openAI();
    await window.SlopAIPanel.ready;
    await window.SlopAIKit.picker.loadCloud();
  }
  /** The tool calls, read-only and never asked: find_tools when the tools are deferred (toolbox.js), then app_state
   * when the app shares state, else list_files; none on a page without commands (the panel then sends no tools). */
  const calls = () => (!window.SlopCmd ? [] : [...(window.SlopAIKit.toolbox && window.SlopCmd && window.SlopCmd.list ? [['find_tools', { query: 'blur' }]] : []),
    [window.SlopCmd.state ? 'app_state' : 'list_files', {}]]);   // no commands, no tools: a plain answer

  async function cloud(id, prompt) {
    const K = window.SlopAIKit, CU = window.CU, P = window.SlopAIPanel;
    localStorage.setItem('slop-firstrun:ai-cloud:' + id, '1');
    const F = CU.install(window, id === 'openrouter' ? 'openrouter' : id), fmt = CU[FORMAT[id]];
    F.replies.push(...calls().map(([n, a]) => fmt.call(n, a)), fmt.text('ok'));
    const eng = new K.CloudEngine({ provider: id, model: MODELS[id], key: async () => 'sk-probe-0123456789' });
    await eng.load(); await P.use(eng);
    P.messages.length = 0;
    await P.send(prompt);
    return F.requests.filter((r) => CHAT.test(r.url)).map((r) => r.body);
  }

  async function local(prompt) {
    const K = window.SlopAIKit, P = window.SlopAIPanel, seen = [];
    const script = calls().map(([n, a]) => `<tool_call>{"name": "${n}", "arguments": ${JSON.stringify(a)}}</tool_call>`).concat('ok');
    class Probe extends K.Engine {
      constructor() { super(); this.kind = 'webllm'; this.model = { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B' }; this.loaded = true; }
      async *_raw(msgs) {
        seen.push(msgs);
        yield script.shift() || 'ok';
      }
    }
    await P.use(new Probe());
    P.messages.length = 0;
    await P.send(prompt);
    return seen;
  }

  async function run({ prompt = 'Make it look nicer.', providers = ['anthropic', 'openai', 'openrouter', 'gemini', 'local'] } = {}) {
    await ready();
    const requests = {};
    for (const id of providers) requests[id] = id === 'local' ? await local(prompt) : await cloud(id, prompt);
    const P = window.SlopAIPanel;
    return { app: P._p.appId(), requests, said: P.messages.filter((m) => m.role === 'assistant').map((m) => m.display || m.content).join(' | ') };
  }

  return { run, MODELS };
})();
