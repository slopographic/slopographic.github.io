/* SlopAIKit bridge: share one loaded model between tabs of the same site over a BroadcastChannel.
 * Classic script; adds SlopAIKit.bridge and SlopAIKit.RemoteEngine.
 * A page that has a model loaded (Slop AI, or any page whose panel loaded one) is a HOST: bridge.host(engine).
 * Any other page is a CLIENT: bridge.hosts() lists live hosts, new RemoteEngine(hostId) streams through one.
 * The model only ever lives in the host tab (WebGPU memory is per tab), so a client needs that tab to stay open.
 * Messages: ping → host {id, model}; chat {req, to, messages, opts} → delta {req, text} … done {req, usage} | error; abort {req}; gone {id}. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const NAME = 'slop-ai-bridge';
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const me = uid();
  let ch = null;
  const hosts = new Map(); // id → { id, model, time }
  const listeners = new Set();
  const waiters = new Map(); // req → handler
  let hosted = null; // { engine, queue: Promise, aborts: Map }

  const post = (m) => { try { channel().postMessage(Object.assign({ src: me }, m)); } catch (e) { /* closed */ } };
  const emit = () => listeners.forEach((fn) => { try { fn(list()); } catch (e) { console.warn(e); } });
  function channel() {
    if (ch) return ch;
    ch = new BroadcastChannel(NAME);
    ch.onmessage = (e) => onMessage(e.data || {});
    addEventListener('pagehide', () => { if (hosted) post({ t: 'gone', id: me }); });
    return ch;
  }
  function onMessage(m) {
    if (m.src === me) return;
    if (m.t === 'ping' && hosted && hosted.engine.loaded) post({ t: 'host', id: me, model: hosted.engine.info() });
    else if (m.t === 'host') { hosts.set(m.id, { id: m.id, model: m.model, time: Date.now() }); emit(); }
    else if (m.t === 'gone') { if (hosts.delete(m.id)) emit(); }
    else if ((m.t === 'delta' || m.t === 'done' || m.t === 'error') && waiters.has(m.req)) waiters.get(m.req)(m);
    else if (m.t === 'chat' && m.to === me && hosted) serve(m);
    else if (m.t === 'abort' && hosted && hosted.aborts.has(m.req)) hosted.aborts.get(m.req).abort();
  }
  function serve(m) {
    const ctl = new AbortController(); hosted.aborts.set(m.req, ctl);
    const job = async () => {
      try {
        if (!hosted.engine.loaded) throw new Error('The model was unloaded');
        // tools are handled by the client (they run in the client's page), so the host only streams text
        const s = hosted.engine.chat(m.messages, Object.assign({}, m.opts, { tools: null, stream: true, signal: ctl.signal }));
        for await (const c of s) { if (c.type === 'delta') post({ t: 'delta', req: m.req, text: c.text }); else post({ t: 'done', req: m.req, usage: c.usage }); }
      } catch (e) { post({ t: 'error', req: m.req, error: String((e && e.message) || e) }); }
      hosted.aborts.delete(m.req);
    };
    hosted.queue = hosted.queue.then(job, job);
  }

  /** Make this page a host for engine (call again after loading another model; host(null) stops). */
  function host(engine) {
    channel();
    if (!engine) { if (hosted) post({ t: 'gone', id: me }); hosted = null; return; }
    hosted = hosted && hosted.engine === engine ? hosted : { engine, queue: Promise.resolve(), aborts: new Map() };
    if (engine.loaded) post({ t: 'host', id: me, model: engine.info() }); else post({ t: 'gone', id: me });
  }
  function list() { return [...hosts.values()].sort((a, b) => b.time - a.time); }
  /** Ask every tab who has a model. Resolves with the hosts that answered within ms. */
  function discover(ms = 250) { channel(); post({ t: 'ping' }); return new Promise((r) => setTimeout(() => r(list()), ms)); }
  function onHosts(fn) { channel(); listeners.add(fn); return () => listeners.delete(fn); }

  class RemoteEngine extends K.Engine {
    constructor(hostId) { super(); this.kind = 'remote'; this.hostId = hostId; const h = hosts.get(hostId); this.model = h && h.model; this.loaded = !!h; }
    info() { const h = hosts.get(this.hostId); return Object.assign({}, (h && h.model) || {}, { kind: 'remote', host: this.hostId, loaded: !!h }); }
    async load() { throw new Error('A shared model is loaded in its own tab. Load models in Slop AI.'); }
    async unload() { this.loaded = false; }
    async *_raw(messages, opts = {}) {
      if (!hosts.has(this.hostId)) throw new Error('The tab with the model was closed. Open Slop AI and load a model.');
      const req = uid(), q = [];
      let wake = null, end = false, err = null, usage = null;
      waiters.set(req, (m) => {
        if (m.t === 'delta') q.push(m.text); else if (m.t === 'done') { end = true; usage = m.usage; } else { end = true; err = m.error; }
        if (wake) { wake(); wake = null; }
      });
      const onAbort = () => post({ t: 'abort', req });
      if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
      const { signal, tools, ...rest } = opts;
      post({ t: 'chat', req, to: this.hostId, messages, opts: rest });
      try {
        while (true) {
          if (q.length) { yield q.shift(); continue; }
          if (end) break;
          await new Promise((r) => { wake = r; });
        }
        if (err) throw new Error(err);
        if (usage) yield { usage: { completion_tokens: usage.tokens, prompt_tokens: usage.prompt } };
      } finally { waiters.delete(req); if (opts.signal) opts.signal.removeEventListener('abort', onAbort); }
    }
  }

  K.bridge = { host, hosts: list, discover, onHosts, id: me, get hosting() { return !!(hosted && hosted.engine.loaded); } };
  K.RemoteEngine = RemoteEngine;
})();
