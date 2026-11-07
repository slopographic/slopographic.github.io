/* SlopAgentToolset: the page's tools for AI agents and when they change, for every way an agent reaches the page:
 * WebMCP in the browser (shared/agent/webmcp.js) and an AI app on this computer through the local bridge
 * (shared/agent/bridge.js). Classic script; window.SlopAgentToolset. The tools are the one tool list of the Slop AI panel
 * and the cloud engines (shared/ai/apptools.js appTools.build with the operations and the page's SlopCmd commands, made
 * provider-neutral by cmdTools.neutral), plus open_file and download (shared/agent/workspace.js).
 *   defs()                  the neutral definitions now: commands whose when() is false left out, and while a dialog of the
 *                           app is open (the app waits on the person) only the read-only command tools
 *   tools()                 the same as WebMCP-shaped tools (shared/agent/tools.js toWebMCP), each asking first when destructive
 *   signature(defs)         a string that changes when the set changes
 *   confirm(text, client, about)  the question before a destructive call: the site's AI permissions
 *                           (SlopAIPermissions.ask, shared/ai/permissions.js) when the page has them, else the app's
 *                           SlopUI.confirm; inside client.requestUserInteraction when an agent passes one
 *   onChange(fn) → off      fn() after something that may change the set (debounced; callers compare signatures)
 *   ready                   resolves once the app's AI commands are prepared (SlopCmd.prepare())
 *   appName(), appId(), busy() */
(function (g) {
  'use strict';
  if (g.SlopAgentToolset) return;
  const T = g.SlopAgentTools, W = g.SlopAgentWorkspace;
  const tr = (k, v) => { const I = g.SlopI18n; return I ? I.t(k, v) : k; };
  const subs = new Set();
  let busy = 0, timer = 0;

  const appName = () => { const a = g.SlopShell && g.SlopShell.currentApp; return (a && a.name) || document.title.split(/[|–—-]/)[0].trim() || tr('ui.ai.this_app'); };
  const appId = () => (g.SlopHub && g.SlopHub.self && g.SlopHub.self.app) || ((g.SlopShell && g.SlopShell.currentApp) || {}).id || '';
  const dialogOpen = () => !!(g.SlopUI && g.SlopUI.openDialogs > 0);
  function usable(id) {
    const c = g.SlopCmd && g.SlopCmd.get(id);
    try { return !!c && (!c.when || !!c.when()); } catch (e) { return false; }
  }

  /** The page's SlopCmd, once it is there (some apps load it late): the app's AI commands (SlopCmd.provide({ prepare }):
   * PhotoSlop loads them only when an assistant needs them) and its change events. */
  let cmdP = null, hooked = false;
  function hookCmd() {
    const C = g.SlopCmd;
    if (!C || hooked) return cmdP || Promise.resolve();
    if (!cmdP) cmdP = (async () => {
      if (C.prepare) await Promise.resolve(C.prepare()).catch(() => null);
      if (C.on) for (const ev of ['change', 'run', 'open', 'close']) C.on(ev, schedule);
      hooked = true;
      schedule();
    })().catch((e) => { console.warn('Agent tools: the app commands could not load', e); });
    return cmdP;
  }

  function defs() {
    hookCmd();
    const K = g.SlopAIKit;
    // look: the agent can see the result too (look_at_canvas, look_at_file: a small picture, asked as a 'send')
    let list = K.appTools.build({ cmd: hooked ? g.SlopCmd : null, ops: true, appId: appId(), appName: appName(), look: true, who: tr('ui.agent.the_agent') }).map(K.cmdTools.neutral)
      .filter((d) => !d.cmdId || usable(d.cmdId));
    const isCmd = (d) => !!d.cmdId || d.name === 'run_command';
    if (dialogOpen() && !busy) list = list.filter((d) => !isCmd(d) || d.readOnly);
    return T.unique(list.concat(W ? W.defs({ app: appName() }) : []));
  }

  async function confirm(text, client, about = {}) {
    const P = g.SlopAIPermissions;
    const ask = () => (P && typeof P.ask === 'function'
      ? P.ask({ kind: about.kind || 'delete', app: appId() || 'site', appName: appName(), action: about.action || '', detail: text, who: about.who || tr('ui.agent.an_agent') })
      : g.SlopUI && g.SlopUI.confirm ? g.SlopUI.confirm(tr('ui.agent.allow_q'), text, tr('ui.agent.allow'), { danger: true })
        : Promise.resolve(g.confirm(text)));
    if (client && typeof client.requestUserInteraction === 'function') return !!(await client.requestUserInteraction(ask));
    return !!(await ask());
  }
  /** The kind of approval a tool needs (permissions.js): 'send' for a command that sends the app's content (sends: true),
   * else deleting words in its command id or name, else an app change. */
  const kindOf = (d) => { const P = g.SlopAIPermissions, own = typeof d.kind === 'function' ? d.kind({}) : null; return own || (d.sends ? 'send' : d.name === 'run_command' ? 'delete' : P && P.kindOf ? P.kindOf(d.cmdId || d.name) : 'delete'); };

  /** Keeps a running call out of the change checks (its own dialog would otherwise change the tool set under it). */
  function wrap(tool) {
    const run = tool.execute;
    tool.execute = async (input, client) => { busy++; try { return await run(input, client); } finally { busy--; schedule(); } };
    return tool;
  }
  function tools({ who } = {}) {
    return defs().map((d) => wrap(T.toWebMCP(d, { confirm: (text, client) => confirm(text, client, { kind: kindOf(d), action: d.title || d.name, who }) })));
  }
  const signature = (list) => JSON.stringify(list.map((d) => [d.name, d.description, T.schemaOf(d), !!d.readOnly, T.mayDestroy(d)]));

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => { timer = 0; for (const fn of subs) try { fn(); } catch (e) { console.warn(e); } }, 120);
  }

  // What changes the set: commands registered or removed, a command run, the palette, dialogs, files coming in, and the
  // app's own state, which only shows in its commands' when(): checked again after input and every few seconds while
  // the page is visible (subscribers act only on a changed signature).
  for (const ev of ['slop:intake-after', 'slop:agent-tools-stale']) document.addEventListener(ev, schedule);
  for (const ev of ['pointerup', 'keyup', 'focusin']) g.addEventListener(ev, schedule, { passive: true, capture: true });
  let lastDialog = dialogOpen();
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (dialogOpen() !== lastDialog) { lastDialog = dialogOpen(); schedule(); } }).observe(document.body, { childList: true });
  setInterval(() => { if (!document.hidden && subs.size) schedule(); }, 3000);

  g.SlopAgentToolset = {
    defs, tools, signature, confirm, appName, appId, busy: () => busy, ready: null,
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
  g.SlopAgentToolset.ready = hookCmd();
})(window);
