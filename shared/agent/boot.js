/* SlopAgents: lets AI agents use the app through WebMCP, the browser's model context (a W3C Web Machine Learning CG
 * draft; Chrome's origin trial). Classic script, loaded by shell/shell.js after the page has painted. window.SlopAgents:
 *   enabled() / set(on)   the site-wide setting "Let AI agents use this app" (localStorage 'slop.agents'; on by default,
 *                         only "off" is stored). Turning it off unregisters every tool at once; on registers them again.
 *   api()                 the model context: document.modelContext (current), else navigator.modelContext (the old name,
 *                         which the MCP-B polyfill and early Chrome builds still use), else null
 *   supported()           api() is there
 *   start()               the origin trial token for this origin (shared/agent/trial-tokens.json), then, when the API is
 *                         there and the setting is on, shared/agent/webmcp.js, which registers the tools
 *   about()               the Help note (shared/agent/about.js): what agents can do, in plain words, and the setting
 *   load()                the page's agent tools (shared/agent/toolset.js and the one tool list it is made from)
 *   connect({ ask, port }) an AI app on this computer through the local bridge (bridge.js, bridge-ui.js): the command
 *                         "Connect an AI app…" (Help, Ctrl+K), ?connect=1&port=N, and again after a reload of a paired tab
 * Also adds the command "AI agents…" (Help) to the page's SlopCmd, so the note is in Ctrl+K and in Help menus. */
(function (g) {
  'use strict';
  if (g.SlopAgents) return;
  const SCRIPT = document.currentScript;
  const ROOT = SCRIPT && SCRIPT.src ? new URL('../../', SCRIPT.src).href : new URL('/', location.href).href;
  const KEY = 'slop.agents';
  const listeners = new Set();
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };

  function enabled() { try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; } }
  function set(on) {
    try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch (e) { /* storage blocked: this visit only */ }
    mem = !!on;
    for (const fn of listeners) try { fn(!!on); } catch (e) { console.warn(e); }
    if (on) start(); else { if (g.SlopWebMCP) g.SlopWebMCP.stop(); if (g.SlopBridge) g.SlopBridge.disconnect(); }
    return !!on;
  }
  let mem = null;
  const isOn = () => (mem == null ? enabled() : mem);
  const api = () => (document.modelContext || (g.navigator && g.navigator.modelContext) || null);

  function script(rel) {
    return new Promise((res, rej) => {
      const src = new URL(rel, ROOT).href;
      if ([...document.scripts].some((s) => s.src === src && s.dataset.loaded)) { res(); return; }
      const s = Object.assign(document.createElement('script'), { src, async: false });
      s.onload = () => { s.dataset.loaded = '1'; res(); }; s.onerror = () => rej(new Error('Could not load ' + rel));
      document.head.append(s);
    });
  }

  /** The origin trial token of this origin, as <meta http-equiv="origin-trial">. The pages' heads carry it already
   * (tools/seo/write.mjs); this adds it to a page that does not (an app page outside the SEO writer). */
  let tokenP = null;
  function token() {
    if (tokenP) return tokenP;
    tokenP = (async () => {
      if (document.querySelector('meta[http-equiv="origin-trial"]')) return;
      if (!/^https:/.test(location.protocol)) return;
      const r = await fetch(new URL('shared/agent/trial-tokens.json', ROOT)).catch(() => null);
      const cfg = r && r.ok ? await r.json().catch(() => null) : null;
      for (const t of (cfg && cfg.tokens) || []) {
        if (t.origin !== location.origin || !t.token) continue;
        document.head.append(Object.assign(document.createElement('meta'), { httpEquiv: 'origin-trial', content: t.token }));
      }
    })();
    return tokenP;
  }

  /** The page's agent tools (shared/agent/toolset.js) and what they need: the one tool list of shared/ai. */
  let loadP = null;
  function load() {
    if (g.SlopAgentToolset) return Promise.resolve(true);
    if (loadP) return loadP;
    loadP = (async () => {
      const K = (g.SlopAIKit = g.SlopAIKit || {});
      K.base = K.base || new URL('shared/ai/', ROOT).href;
      // the one tool list (shared/ai/HANDOFF.md): the side panel's app tools, its command tools and the operations
      if (!g.SlopCmdArgs) await script('shared/commands/args.js');
      for (const [name, have] of [['apptools', K.appTools], ['cmdtools', K.cmdTools], ['optools', K.opTools], ['filetools', K.fileTools]]) if (!have) await script('shared/ai/' + name + '.js');
      if (!g.SlopAgentTools) await script('shared/agent/tools.js');
      if (!g.SlopAgentWorkspace) await script('shared/agent/workspace.js');
      await script('shared/agent/toolset.js');
      return true;
    })().finally(() => { loadP = null; });
    return loadP;
  }

  let startP = null;
  function start() {
    if (!isOn()) return Promise.resolve(false);
    if (g.SlopWebMCP) return g.SlopWebMCP.refresh().then(() => true);
    if (startP) return startP;
    startP = (async () => {
      if (!api()) await token();
      if (!api() || !isOn()) return false;
      await load();
      await script('shared/agent/webmcp.js');
      return !!g.SlopWebMCP;
    })().catch((e) => { console.warn('SlopAgents', e); return false; }).finally(() => { startP = null; });
    return startP;
  }

  /** An AI app on this computer (Claude Code, Codex, Cursor…) through the local bridge (shared/agent/bridge.js):
   * connect({ port, ask }) opens the pairing dialog (ask) or resumes this tab's pairing; the same tools as WebMCP. */
  function connect(opts = {}) {
    return load().then(() => script('shared/agent/bridge.js')).then(() => script('shared/agent/bridge-ui.js'))
      .then(() => g.SlopBridgeUI.start(opts))
      .catch((e) => { console.warn('SlopAgents', e); if (g.SlopUI) g.SlopUI.toast(tr('ui.agent.offline_connect')); return false; });
  }

  function about() {
    return script('shared/agent/about.js').then(() => g.SlopAgentAbout.open()).catch((e) => { console.warn(e); if (g.SlopUI) g.SlopUI.toast(tr('ui.agent.offline_note')); });
  }
  /** Some apps load SlopCmd after the page: looked for again for a few seconds. */
  function command(tries = 0) {
    const C = g.SlopCmd;
    if (!C || !C.register) { if (tries < 10) setTimeout(() => command(tries + 1), 1000); return; }
    if (!C.get('agents.about')) C.register([{ id: 'agents.about', title: tr('ui.agent.cmd_about'), group: 'Help', ai: false, noRecent: true,
      keywords: ['agents', 'webmcp', 'mcp', 'ai', 'automation', 'assistant', 'privacy'], run: about }]);
    if (!C.get('agents.connect')) C.register([{ id: 'agents.connect', title: tr('ui.agent.connect_dots'), group: 'Help', ai: false, noRecent: true,
      keywords: ['claude code', 'codex', 'cursor', 'gemini', 'vs code', 'mcp', 'connect', 'pair', 'ai', 'agent'], run: () => connect({ ask: true }) }]);
    if (!worded && g.SlopI18n && g.SlopI18n.on) {   // the titles follow a language switch (the group is an English id)
      worded = true;
      g.SlopI18n.on(() => {
        for (const [id, key] of [['agents.about', 'ui.agent.cmd_about'], ['agents.connect', 'ui.agent.connect_dots']]) {
          const c = C.get(id); if (c) { c.title = tr(key); }
        }
      });
    }
  }
  let worded = false;

  g.SlopAgents = { KEY, ROOT, enabled: isOn, set, api, supported: () => !!api(), start, about, token, script, load, connect,
    onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
  command();
  start();
  // ?connect=1 (the AI app opened this page to pair), or this tab was paired before (a reload or the next app page)
  const q = new URLSearchParams(location.search);
  let paired = false;
  try { paired = !!sessionStorage.getItem('slop.bridge'); } catch (e) { /* storage blocked */ }
  if (q.get('connect') === '1') connect({ ask: true, port: Number(q.get('port')) || 0 });
  else if (paired && isOn()) connect({ ask: false });
})(window);
