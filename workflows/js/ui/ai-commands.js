/* Slop Workflows: the commands with arguments (shared/commands/args.js), the tools of the Slop AI panel, WebMCP and
 * macros. They build a workflow through the tool's own parts: a new workflow (empty, from a template, or with steps),
 * add a step by its operation id (shared/ops) with its options, change, remove or move a step, rename, run, save in this
 * browser, and export the .slopflow file to Slop Drive and/or a download. Each change is one Undo step (ctx.edit). From
 * the palette (args null) a command opens the tool's own control instead.
 *   aiCommands(tool) → the SlopCmd list (commands.js registers it)   tool: mountWorkflow's result */
import { TEMPLATES } from '../core/templates.js';
import { saveBlob } from '../../../convert/js/io/files.js';

const g = globalThis;
const MAX = 40;
const defaults = (args) => Object.fromEntries(args.filter((a) => a.default !== undefined).map((a) => [a.name, a.default]));

/** A JSON object from text (or an object). */
function parseJson(text, what, example) {
  if (text == null || text === '') return null;
  if (typeof text === 'object') return text;
  try { return JSON.parse(text); } catch (e) { throw new Error(`${what} must be JSON, like ${example}.`); }
}
function parseOptions(text) {
  const o = parseJson(text, 'options', '{"width": 1080}');
  if (o == null) return {};
  if (typeof o !== 'object' || Array.isArray(o)) throw new Error('options must be a JSON object, like {"width": 1080}.');
  return o;
}

export function aiCommands(tool) {
  const { S, R, edit, lib, runner, frame } = tool;
  const checks = () => tool.steps.checks();
  const W = 'Workflows';
  const label = (i) => (R.byId(S.doc.steps[i].id) || {}).label || S.doc.steps[i].id;
  const stepAt = (n) => {
    const i = Math.round(Number(n)) - 1;
    if (!(i >= 0 && i < S.doc.steps.length)) throw new Error(`There is no step ${n}; the workflow has ${S.doc.steps.length}.`);
    return i;
  };
  /** Adds one step and says what happened (its notes, dropped options, and a problem with the step before it). */
  function addOne(op, options, at) {
    if (S.doc.steps.length >= MAX) throw new Error(`A workflow has at most ${MAX} steps.`);
    const r = tool.addStep(op, parseOptions(options), { at: at ? at - 1 : null });
    const i = S.doc.steps.findIndex((s) => s.uid === r.step.uid), res = checks();
    return [`Added step ${i + 1}: ${R.byId(op).label}.`, ...r.notes, ...r.errors, res[i] && res[i].message].filter(Boolean).join(' ');
  }
  const ops = R.all().map((o) => [o.id, `${o.label} (${R.appLabel(o.app)})`]);
  const STEP = { name: 'step', type: 'number', integer: true, min: 1, max: MAX, required: true, description: 'the step number, 1 = first' };
  const list = [];
  /** One command. palette(): what it does from Ctrl+K or a menu (no arguments); default: run with no arguments. */
  function add(tool_, id, title, args, run, extra = {}) {
    const { palette, ...rest } = extra;
    list.push(Object.assign({ id: 'workflows.' + id, tool: tool_, title, group: W, keys: [], destructive: false, args,
      run: (a) => (a == null && palette ? palette() : run(a || defaults(args))) }, rest));
  }

  add('new_workflow', 'new', 'Workflows: new workflow', [
    { name: 'name', type: 'string', maxLength: 120, description: 'the workflow name (default: Untitled workflow, or the template’s)' },
    { name: 'template', type: 'enum', options: TEMPLATES.map((t) => [t.id, t.name]), description: 'start from a copy of this template' },
    { name: 'steps', type: 'string', maxLength: 40000, description: 'steps to add, a JSON array like [{"op": "resize.image", "options": {"width": 1080}}, {"op": "to-webp"}]' }], (a) => {
    const steps = parseJson(a.steps, 'steps', '[{"op": "to-jpg"}]') || [];
    if (!Array.isArray(steps) || steps.some((s) => !s || typeof s.op !== 'string')) throw new Error('steps must be a JSON array of {"op": "<operation id>", "options": {…}}.');
    const bad = steps.filter((s) => !R.byId(s.op)).map((s) => s.op);
    if (bad.length) throw new Error(`There is no step called ${bad.join(', ')}. list_commands shows the operation ids of add_step.`);
    if (a.template) lib.openTemplate(a.template); else lib.newFlow();
    if (a.name) edit('Rename', (d) => { d.name = a.name; });
    const said = steps.map((s) => addOne(s.op, s.options));
    return [`Opened a new workflow “${S.doc.name}” with ${S.doc.steps.length} step${S.doc.steps.length === 1 ? '' : 's'}.`, ...said].join(' ');
  }, { palette: () => lib.newFlow(), description: 'Opens a new workflow in place of the open one (Undo goes back): empty, a copy of a template, and/or with steps, each with its options.' });

  add('add_step', 'add-step', 'Workflows: add a step…', [{ name: 'op', type: 'enum', options: ops, required: true, description: 'the operation id' },
    { name: 'options', type: 'string', maxLength: 20000, description: 'a JSON object of option values, e.g. {"width": 1080, "format": "jpg"}' },
    { name: 'at', type: 'number', integer: true, min: 1, max: MAX, description: 'the position, 1 = first (default: the end)' }],
  (a) => addOne(a.op, a.options, a.at), {
    keys: ['Mod+Shift+A'], keywords: ['operation', 'app', 'new step'],
    description: 'Adds a step at the end (or at a position) with option values. The options are the step’s own; unknown ones are dropped.',
    palette: () => { const b = tool.root.querySelector('.wf-add'); if (b) b.click(); return ''; } });

  add('set_option', 'set-option', 'Workflows: set a step option', [STEP, { name: 'key', type: 'string', required: true, description: 'the option name' }, { name: 'value', type: 'string', required: true }], (a) => {
    const i = stepAt(a.step), op = R.byId(S.doc.steps[i].id);
    if (!op.options.some((o) => o.key === a.key)) throw new Error(`${op.label} has no option ${a.key}. It has: ${op.options.map((o) => o.key).join(', ')}.`);
    const v = R.validateOptions(op, { ...S.doc.steps[i].options, [a.key]: a.value });
    if (!v.ok) throw new Error(v.errors.join(' '));
    edit(`Change ${op.label}`, (d) => { d.steps[i].options = { ...d.steps[i].options, [a.key]: v.options[a.key] }; });
    return `Step ${i + 1} (${op.label}): ${a.key} is ${v.options[a.key]}.`;
  }, { hidden: true, description: 'Sets one option of a step.' });

  add('set_step', 'set-step', 'Workflows: change a step', [STEP,
    { name: 'options', type: 'string', maxLength: 20000, description: 'a JSON object of option values to change; the others stay' },
    { name: 'replace', type: 'boolean', description: 'true: the options not given go back to their defaults' },
    { name: 'keep', type: 'boolean', description: 'true: also keep this step’s files among the results ("Keep these files")' }], (a) => {
    const i = stepAt(a.step), op = R.byId(S.doc.steps[i].id), given = parseOptions(a.options);
    if (!Object.keys(given).length && a.keep == null) throw new Error('Nothing to change: give options or keep.');
    const v = R.validateOptions(op, a.replace ? given : { ...S.doc.steps[i].options, ...given });
    if (!v.ok) throw new Error(v.errors.join(' '));
    const defs = R.defaultsOf(op), next = {};
    for (const [k, val] of Object.entries(v.options)) if (val !== defs[k] && !op.options.some((o) => o.key === k && o.type === 'password')) next[k] = val;
    edit(`Change ${op.label}`, (d) => { d.steps[i].options = next; if (a.keep != null) d.steps[i].keep = !!a.keep; });
    const res = checks()[i];
    return [`Step ${i + 1} (${op.label}): ${Object.entries(next).map(([k, val]) => `${k} ${val}`).join(', ') || 'the defaults'}${S.doc.steps[i].keep ? ', files kept' : ''}.`, ...v.notes, res && res.message].filter(Boolean).join(' ');
  }, { hidden: true, description: 'Changes a step: several options at once (JSON), back to the defaults, and whether its files are kept among the results.' });

  add('remove_step', 'remove-step', 'Workflows: remove a step', [STEP], (a) => {
    const i = stepAt(a.step), l = label(i);
    edit(`Remove ${l}`, (d) => { d.steps.splice(i, 1); });
    return `Removed step ${i + 1} (${l}).`;
  }, { hidden: true, destructive: true, description: 'Removes a step from the workflow (Undo puts it back).' });

  add('move_step', 'move-step', 'Workflows: move a step', [STEP, { name: 'to', type: 'number', integer: true, min: 1, max: MAX, required: true, description: 'the new position, 1 = first' }], (a) => {
    const i = stepAt(a.step), j = stepAt(a.to);
    edit('Move step', (d) => { const [s] = d.steps.splice(i, 1); d.steps.splice(j, 0, s); });
    return `Moved step ${i + 1} (${label(j)}) to ${j + 1}.`;
  }, { hidden: true, description: 'Moves a step to another position.' });

  add('open_template', 'template', 'Workflows: open a template', [{ name: 'template', type: 'enum', options: TEMPLATES.map((t) => [t.id, t.name]), required: true }],
    (a) => { lib.openTemplate(a.template); return `Opened the ${a.template} template: ${S.doc.steps.length} steps.`; },
    { palette: () => { frame.showList(); return ''; }, description: 'Replaces the open workflow with a copy of a template (Undo goes back).' });

  add('rename_workflow', 'rename', 'Workflows: rename the workflow', [{ name: 'name', type: 'string', maxLength: 120, required: true }],
    (a) => { edit('Rename', (d) => { d.name = a.name; }); return `Renamed to ${a.name}.`; }, { hidden: true, description: 'Renames the workflow.' });

  add('run_workflow', 'run', 'Workflows: run the workflow', [], async () => {
    const r = await runner.run();
    if (!r.ok && !r.outputs) throw new Error(r.message);
    return r.message;
  }, { keys: ['Mod+Enter'], keywords: ['start', 'go', 'process', 'batch'], description: 'Runs every step on the files in the panel and lists the results.' });

  add('save_workflow', 'save', 'Workflows: save in this browser', [{ name: 'name', type: 'string', maxLength: 120, description: 'save under this name (renames the workflow first)' }], async (a) => {
    if (a.name) edit('Rename', (d) => { d.name = a.name; });
    const r = await lib.save();
    if (!r.ok) throw new Error(r.message || 'Not saved.');
    return `Saved “${S.doc.name}” in this browser (it is in the list on the left).`;
  }, { keys: ['Mod+S'], description: 'Saves the workflow in this browser, so it is in the saved list next time.' });

  add('export_workflow', 'export', 'Workflows: export as a .slopflow file', [{ name: 'to', type: 'enum', values: ['drive', 'download', 'both'], default: 'drive', description: 'Slop Drive, a download, or both' }], async (a) => {
    const blob = lib.fileBlob(), name = lib.fileName(), out = [];
    if (a.to !== 'download') out.push(`saved ${name} to Slop Drive (id ${await g.SlopHub.put(blob, { name, from: 'workflows' })})`);
    if (a.to !== 'drive') { saveBlob(blob, name); out.push(`downloaded ${name}`); }
    return `“${S.doc.name}” (${S.doc.steps.length} steps): ${out.join(' and ')}. Passwords are never in the file.`;
  }, { keywords: ['download', 'file', 'backup', 'drive'], palette: () => `Downloaded ${lib.exportFile()}.`, description: 'Saves the workflow as a .slopflow file (the same JSON Import reads) to Slop Drive and/or a download.' });

  return list;
}
