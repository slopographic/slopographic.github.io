/* Slop Workflows: every action as a SlopCmd command (the menus, Ctrl+K and the Slop AI assistant use the same list).
 * The commands with args, which let the assistant build, run and export a workflow, are in ai-commands.js; the rest are
 * here. app_state (provide) is the workflow, its steps with their options and problems, the files and the results.
 * The page's tool only (a dialog's tool has its own buttons and the global "Run a workflow…").
 *   init(tool)   tool: mountWorkflow's result */
import { TEMPLATES } from '../core/templates.js';
import { saveBlob } from '../../../convert/js/io/files.js';
import { aiCommands } from './ai-commands.js';
import { tr, onLang } from '../core/text.js';

const g = globalThis;
let S, R, tool;
const checks = () => tool.steps.checks();
const undo = () => tool.undo();

function state() {
  const res = checks();
  return {
    workflow: S.doc.name, saved: !!S.id,
    steps: S.doc.steps.map((s, i) => ({ step: i + 1, id: s.id, label: (R.byId(s.id) || {}).label || s.id, options: s.options, keep: !!s.keep, problem: res[i] && res[i].message || '' })),
    files: S.files.map((f) => ({ name: f.name, kind: f.kind })),
    running: !!(S.run && S.run.busy),
    results: S.run && S.run.result ? S.run.result.outputs.map((o) => o.name) : [],
    templates: TEMPLATES.map((t) => t.id),
  };
}

export function init(t) {
  const C = g.SlopCmd;
  if (!C) return;
  tool = t; ({ S, R } = t);
  const { lib, runner } = t;
  C.init({ app: 'workflows' });
  const W = 'Workflows';
  // the palette's commands in the page's language; registered again on a language change (register replaces by id)
  const own = () => [
    { id: 'workflows.stop', title: tr('workflows.cmd.stop', 'Workflows: stop the run'), group: W, keys: [], when: () => !!(S.run && S.run.busy), run: () => runner.stop() },
    { id: 'workflows.import', title: tr('workflows.cmd.import', 'Workflows: import a .slopflow file…'), group: W, keys: ['Mod+O'], keywords: ['open', 'file'], run: () => lib.pickImport() },
    { id: 'workflows.share', title: tr('workflows.cmd.share', 'Workflows: copy a link to this workflow'), group: W, keys: [], keywords: ['share', 'url', 'send'], destructive: false, run: async () => (await lib.shareLink()).url },
    { id: 'workflows.undo', title: tr('workflows.cmd.undo', 'Workflows: undo'), group: W, keys: [], when: () => S.history.size > 0, run: undo },
    { id: 'workflows.files', title: tr('workflows.cmd.files', 'Workflows: add files…'), group: W, keys: [], keywords: ['open', 'pictures', 'choose'], run: () => runner.drop && runner.drop.choose() },
    { id: 'workflows.clear-files', title: tr('workflows.cmd.clear_files', 'Workflows: clear the files'), group: W, keys: [], when: () => S.files.length > 0, run: () => runner.clearFiles() },
    { id: 'workflows.zip', title: tr('workflows.cmd.zip', 'Workflows: download all results (ZIP)'), group: W, keys: [], destructive: false, when: () => !!(S.run && S.run.result && S.run.result.outputs.length),
      run: async () => { saveBlob(await runner.resultsZip(), `${S.doc.name || 'workflow'}.zip`); return 'Downloaded the ZIP.'; } },
  ];
  // the commands with arguments: their palette titles in the current language (descriptions and arguments are for agents)
  const ai = aiCommands(t);
  const aiShown = () => ai.map((c) => Object.assign({}, c, { title: tr('workflows.cmd.ai_' + c.tool, c.title) }));
  C.register(aiShown().concat(own()));
  onLang(() => C.register(aiShown().concat(own())));
  C.provide({ state, checkpoint: () => { const n = S.history.size; return async () => { while (S.history.size > n) await S.history.undo(); }; } });
  if (g.SlopUndo) g.SlopUndo.keys(S.history, undo);
}
