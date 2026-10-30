/* Slop Workflows: the one workflow tool. mountWorkflow puts the whole builder and runner in any element: the Workflows
 * page (inside the shared List · View · Panel frame, shared/frame) and the "Run a workflow…" dialog over any app
 * (shared/ops/dialog.js, compact). Every instance has its own state, ids ("wf", then "wf2"…) and Undo; its styles are all
 * under .wf-tool (css/tool.css, css/steps.css), so it looks the same in any page or dialog.
 *   const t = mountWorkflow(host, {
 *     files,          File[] to start with
 *     workflow,       a template id ('product-photos'), a workflow document, or .slopflow text
 *     compact,        no list column and no frame: "Open ▾" holds the templates and saved workflows (a dialog)
 *     frame,          false: no SlopFrame even when not compact (default: the frame when not compact)
 *     draft,          keep the open workflow in this browser between visits (the page)
 *     landmark,       the workflow part is the page's <main>
 *     drop,           options for the drop zone (shared/drop attach), e.g. { window: false, targets: [dialogBack] }
 *     onResults,      (outputs: [{ name, blob, kind }]) after each run
 *   });
 *   t.ready (resolves once it is drawn), t.root, t.ns, t.S, t.addFiles(files), t.run(), t.stop(), t.addStep(id, options),
 *   t.load(workflow), t.openTemplate(id), t.results(), t.resultsZip(), t.lib, t.runner, t.frame, t.edit, t.emit, t.destroy() */
import { createState } from './state.js';
import { createSteps } from './steps.js';
import { mountAdd, addStep } from './addmenu.js';
import { createRun } from './run.js';
import { createLibrary } from './library.js';
import { markup } from './markup.js';
import { tr, onLang } from '../core/text.js';

const g = globalThis;
let count = 0;
const TOOL_CSS = ['workflows/css/tool.css', 'workflows/css/steps.css', 'shared/frame/frame.css'];
const SITE = new URL('../../../', import.meta.url).href;

/** The tool's stylesheets, added once to a page that has not linked them. */
function styles() {
  for (const rel of TOOL_CSS) {
    const href = new URL(rel, SITE).href;
    if (![...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => l.href === href)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  }
}

export function mountWorkflow(host, opts = {}) {
  styles();
  const ns = count++ ? `wf${count}` : 'wf';
  const ui = markup(ns, opts);
  host.append(ui.root);
  const ctx = createState({ ns, draft: !!opts.draft });
  ctx.root = ui.root;
  const $ = ui.$;
  const frame = !opts.compact && opts.frame !== false ? g.SlopFrame.mount(ui.root, {
    list: ui.list, view: ui.main, panel: ui.side, storageKey: 'workflows', panelLabel: 'workflows.run.panel',
    phone: '(max-width: 900px)', width: 340, min: 280, max: 560, phoneButton: false, command: !!opts.commands,
  }) : null;
  ctx.frame = frame;
  const steps = createSteps(ctx, $('steps'));
  mountAdd(ctx, $('add'));
  const runner = createRun(ctx, ui.side, { frame, drop: opts.drop, onResults: opts.onResults });
  const lib = createLibrary(ctx, { saved: $('saved'), templates: $('templates') });
  const { S } = ctx;

  function drawHead() {
    const n = S.doc.steps.length, name = $('name');
    if (document.activeElement !== name) name.value = S.doc.name;
    $('empty').hidden = n > 0;
    $('count').textContent = n ? tr('workflows.tool.steps_n', ['{n} steps', '{n} step'], { n }) : '';
    $('state').textContent = S.id ? (ctx.dirty() ? tr('workflows.tool.not_saved', 'Not saved') : tr('workflows.tool.saved', 'Saved')) : n ? tr('workflows.tool.not_saved_yet', 'Not saved yet') : '';
    $('undo').disabled = !S.history.size;
    $('undo').title = S.history.next ? tr('workflows.tool.undo_tip', 'Undo {what} (Ctrl+Z)', { what: S.history.next }) : tr('workflows.tool.nothing_undo', 'Nothing to undo');
    if ($('phone-files')) $('phone-files').textContent = S.files.length ? tr('workflows.run.panel_n', 'Files and run ({n})', { n: S.files.length }) : tr('workflows.run.panel', 'Files and run');
  }
  async function undo() {
    const r = await S.history.undo();
    const msg = r.ok ? tr('workflows.tool.undone', 'Undone: {what}', { what: r.label }) : r.message;
    if (g.SlopUI) g.SlopUI.toast(msg);
    return msg;
  }

  $('name').addEventListener('change', () => { const v = $('name').value.trim() || tr('workflows.tool.untitled', 'Untitled workflow'); ctx.edit(tr('workflows.undo.rename', 'Rename'), (d) => { d.name = v; }); });
  $('save').addEventListener('click', () => lib.save());
  $('export').addEventListener('click', () => lib.exportFile());
  $('share').addEventListener('click', () => lib.shareLink());
  $('undo').addEventListener('click', undo);
  if ($('new')) $('new').addEventListener('click', () => lib.newFlow());
  if ($('import')) $('import').addEventListener('click', () => lib.pickImport());
  if ($('back')) $('back').addEventListener('click', () => frame && frame.showList());
  if ($('phone-files')) $('phone-files').addEventListener('click', () => frame && frame.openSheet());
  if ($('open')) g.SlopMenuButton.attach($('open'), { label: tr('workflows.tool.open_menu', 'Open a workflow'), search: 'auto', items: () => lib.menuItems().map((it, i) => (it.heading ? it : { value: String(i), label: it.label, keywords: it.keywords })), onPick: (v) => { const it = lib.menuItems()[Number(v)]; if (it && it.act) it.act(); } });
  for (const b of ui.root.querySelectorAll('[data-template]')) b.addEventListener('click', () => lib.openTemplate(b.dataset.template));
  ctx.on('doc', drawHead); ctx.on('saved', drawHead); ctx.on('files', drawHead);
  ctx.on('opened', () => { if (frame) frame.showView(); });
  // a language change: the words the code writes (the marked ones change by themselves), the list, the cards, the panel
  onLang(() => { drawHead(); lib.renderList(); steps.render(); runner.render(); });

  const tool = {
    root: ui.root, ns, S, ctx, lib, runner, frame, steps, R: ctx.R, F: ctx.F, edit: ctx.edit, emit: ctx.emit, undo,
    addFiles: (files) => runner.addFiles([...files]), run: () => runner.run(), stop: () => runner.stop(),
    addStep: (id, options, o) => addStep(ctx, id, options, o), load: (w) => lib.load(w), openTemplate: (id) => lib.openTemplate(id),
    results: () => runner.results(), resultsZip: () => runner.resultsZip(),
    destroy: () => { if (frame) frame.destroy(); runner.destroy(); ui.root.remove(); },
  };
  ctx.R.onMacros(() => ctx.emit('doc', {}));   // an app saved a macro: the step menu and the macro steps see it
  tool.ready = (async () => {
    await ctx.R.macrosReady;
    const draft = ctx.readDraft();
    if (draft) ctx.setDoc(draft.doc, { id: draft.id, saved: draft.saved });
    if (opts.workflow) lib.load(opts.workflow);
    if (opts.files && opts.files.length) await runner.addFiles([...opts.files]);
    await lib.renderList();
    steps.render(); runner.render(); drawHead();
    if (frame && S.doc.steps.length) frame.showView();
    return tool;
  })();
  host.workflowTool = tool;
  return tool;
}
