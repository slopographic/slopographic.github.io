/* Slop Workflows: the page. The one workflow tool (mount.js) inside the shared List · View · Panel frame: saved workflows
 * and templates on the left, the step cards in the centre, files, run, progress and results on the right (a bottom sheet
 * on phones). The page adds what only it has: the draft kept between visits, the address (?flow= links, ?template=,
 * ?add= from another app's "Add to a workflow…", ?drive= from Slop Drive) and the commands (menus, Ctrl+K, the AI).
 * See workflows/HANDOFF.md. Exposes window.SlopWorkflows (the page's tool) for the tests and the console. */
import { mountWorkflow } from './mount.js';
import * as commands from './commands.js';

const g = globalThis;
g.SlopWorkflowsPage = true;   // the global "Run a workflow…" command (shared/commands) is not offered on this page

async function boot() {
  const tool = mountWorkflow(document.getElementById('wf-host'), { draft: true, landmark: true, commands: true });
  const drawn = tool.ready;
  tool.ready = false;   // true once the address and Slop Drive have been read (the tests wait for it)
  g.SlopWorkflows = tool;
  commands.init(tool);
  await drawn;
  const q = new URLSearchParams(location.search);
  if (['flow', 'template', 'add'].some((k) => q.has(k))) {
    await tool.lib.takeLink(q);
    for (const k of ['flow', 'template', 'add']) q.delete(k);
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  }
  if (g.SlopHub) {
    g.SlopHub.register('workflows');
  }
  await g.SlopIntake.launch({ to: tool.runner.intakeId }); // ?drive=<id> (Add to a workflow…, Open in) and a PWA launch
  if (tool.S.doc.steps.length) tool.frame.showView();
  tool.ready = true;
  document.documentElement.dataset.wfReady = '1';
  addEventListener('beforeunload', (e) => { if (tool.S.run && tool.S.run.busy) { e.preventDefault(); e.returnValue = ''; } });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
