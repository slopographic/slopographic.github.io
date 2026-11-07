/* A fake WebMCP model context, in the shape of the current draft (Oct 2026): document.modelContext.registerTool(tool,
 * { signal }) → Promise (a bad or taken name rejects), no unregister call (aborting the signal removes the tool), and
 * getTools(). AgentFake.open(src) loads an app page in an iframe with the fake installed on its document before the
 * page's agent code looks for it (shared/agent/boot.js runs after the load event).
 *   const app = await AgentFake.open('../../photoslop/index.html', { ready: (w) => !!w.SlopCmd })
 *   app.w, app.mc (the fake: tools Map, log), app.names(), app.call(name, input), app.close() */
(function () {
  'use strict';
  const { waitFor } = SlopTest;
  const NAME = /^[A-Za-z0-9_.-]{1,128}$/;

  function fake(w) {
    const tools = new Map(), log = [];
    const mc = {
      tools, log,
      registerTool(tool, opts = {}) {
        if (!tool || !NAME.test(tool.name || '')) return Promise.reject(new w.DOMException('Bad tool name ' + (tool && tool.name), 'InvalidStateError'));
        if (tools.has(tool.name)) return Promise.reject(new w.DOMException('Duplicate tool name ' + tool.name, 'InvalidStateError'));
        if (typeof tool.execute !== 'function' || typeof tool.description !== 'string') return Promise.reject(new TypeError('execute and description are required'));
        JSON.stringify(tool.inputSchema || {});
        tools.set(tool.name, tool);
        log.push(['register', tool.name]);
        if (opts.signal) opts.signal.addEventListener('abort', () => { if (tools.get(tool.name) === tool) { tools.delete(tool.name); log.push(['abort', tool.name]); } });
        return Promise.resolve();
      },
      getTools: () => Promise.resolve([...tools.values()].map((t) => ({ name: t.name, description: t.description, inputSchema: JSON.stringify(t.inputSchema || {}), annotations: t.annotations }))),
    };
    return mc;
  }

  async function open(src, { ready = () => true, timeout = 40000, install = true } = {}) {
    const f = document.createElement('iframe');
    f.style.cssText = 'width:1200px;height:800px;border:0';
    document.body.append(f);
    let mc = null;
    const target = new URL(src, location.href).pathname;
    const put = () => {
      const w = f.contentWindow;
      if (mc || !w || !w.document || w.location.pathname !== target) return false;
      mc = fake(w);
      if (install) Object.defineProperty(w.document, 'modelContext', { value: mc, configurable: true });
      return true;
    };
    f.src = src;
    await new Promise((res) => { const tick = () => (put() ? res() : setTimeout(tick, 1)); tick(); });
    const w = f.contentWindow;
    await waitFor(() => w.document.readyState === 'complete' && w.SlopAgents && ready(w), { timeout });
    if (install) await waitFor(() => w.SlopWebMCP && mc.tools.size > 0, { timeout });
    if (w.SlopWebMCP) await w.SlopWebMCP.ready;
    const names = () => [...mc.tools.keys()];
    const call = async (name, input) => {
      const t = mc.tools.get(name);
      if (!t) throw new Error(`No tool ${name} (have ${names().join(', ')})`);
      const ac = new AbortController();
      const r = await t.execute(input || {}, { signal: ac.signal });
      JSON.stringify(r);   // the browser serializes the result
      return r;
    };
    const text = async (name, input) => { const r = await call(name, input); if (r.isError) throw new Error(name + ': ' + r.content[0].text); return r.content[0].text; };
    return { f, w, mc, names, call, text, json: async (n, i) => JSON.parse(await text(n, i)), close: () => f.remove() };
  }

  window.AgentFake = { open, fake };
})();
