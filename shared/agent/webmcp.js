/* SlopWebMCP: registers the page's tools with the browser's model context, so an AI agent in the browser (or a desktop
 * agent through the MCP-B extension) can use the app. Loaded by shared/agent/boot.js only when the API is there and the
 * setting is on. Classic script; window.SlopWebMCP. The tools are never written per app: they are the page's agent tools
 * (shared/agent/toolset.js: the one tool list of the Slop AI panel and the cloud engines, plus open_file and download),
 * turned into WebMCP tools by shared/agent/tools.js. The local bridge to an AI app on this computer
 * (shared/agent/bridge.js) sends the same tools.
 * They are registered again when what the app offers changes: a command registered or removed, a command that becomes
 * available or not (its when()), a dialog of the app opening or closing (the command tools wait while one is open).
 * A destructive call (delete, clear, overwrite, new…) asks the person first (SlopAgentToolset.confirm).
 *   refresh() → Promise   build and register again now (only when something changed; force: true always)
 *   stop()                unregister every tool (the setting turned off)
 *   tools()               the tools as registered (name, description, inputSchema, annotations, execute)
 *   definitions()         the neutral definitions they came from
 *   ready                 resolves once the first set is registered (after SlopCmd.prepare(), the app's AI commands) */
(function (g) {
  'use strict';
  if (g.SlopWebMCP) return;
  const S = g.SlopAgentToolset, A = g.SlopAgents;
  let current = [], defsNow = [], sig = '', handles = [], ctrl = null, stopped = false;

  /** The current API (spec of Oct 2026, Chrome 152+): registerTool(tool, { signal }) and no unregister call: aborting the
   * signal removes the tool. Chrome 146–149 builds also had unregisterTool(name), and the first drafts provideContext. */
  function unregisterAll() {
    const mc = A.api();
    if (ctrl) { ctrl.abort(); ctrl = null; }
    if (mc && typeof mc.unregisterTool === 'function') for (const n of handles) try { mc.unregisterTool(n); } catch (e) { /* already gone */ }
    handles = [];
  }
  function apply(tools) {
    const mc = A.api();
    if (!mc) return;
    if (typeof mc.registerTool === 'function') {
      unregisterAll();
      ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const opts = ctrl ? { signal: ctrl.signal } : undefined;
      for (const t of tools) {
        const warn = (e) => console.warn('WebMCP: could not register ' + t.name, e);
        try { Promise.resolve(mc.registerTool(t, opts)).catch(warn); handles.push(t.name); } catch (e) { warn(e); }
      }
    } else if (typeof mc.provideContext === 'function') mc.provideContext({ tools });
  }

  async function refresh({ force = false } = {}) {
    if (stopped || !A.enabled() || !A.api()) return current;
    if (S.busy() && !force) return current;
    const defs = S.defs(), s = S.signature(defs);
    if (!force && s === sig) return current;
    sig = s; defsNow = defs;
    current = S.tools();
    apply(current);
    document.dispatchEvent(new CustomEvent('slop:agent-tools', { detail: { count: current.length, names: current.map((t) => t.name) } }));
    return current;
  }

  function stop() {
    stopped = true;
    const mc = A.api();
    unregisterAll();
    if (mc && typeof mc.clearContext === 'function' && typeof mc.registerTool !== 'function') try { mc.clearContext(); } catch (e) { /* none */ }
    current = []; defsNow = []; sig = '';
    document.dispatchEvent(new CustomEvent('slop:agent-tools', { detail: { count: 0, names: [] } }));
  }

  S.onChange(() => refresh());

  g.SlopWebMCP = {
    refresh: (o) => { stopped = false; return refresh(Object.assign({ force: true }, o)); },
    stop, tools: () => current.slice(), definitions: () => defsNow.slice(), ready: null,
  };
  g.SlopWebMCP.ready = S.ready.then(() => refresh({ force: true }));
})(window);
