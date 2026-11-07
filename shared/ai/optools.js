/* SlopAIKit opTools: the site's file operations as tools, from the one operations registry (shared/ops/registry.js via
 * shared/ops/all.js: every File convert conversion, background removal, watermark, resize, upscale, OCR, PDF tools,
 * recorded macros) and the one runner (workflows/js/core/plan.js runWorkflow). Classic script; adds SlopAIKit.opTools.
 * Part of the one tool list: appTools.build adds them when env.ops is set (the side panel does for cloud models).
 *   opTools.build(env) → [list_operations, run_operation, run_workflow]
 *   opTools.search(query, n) → the n best matching operations as lines, for find_tools (toolbox.js)
 * Each tool has params (for prompt-based models) and schema (JSON Schema, for native tool calling and WebMCP).
 * Files are Slop Drive names or ids, or "open" (what the app has open, shared/convert/provided.js). The new files are
 * saved to Slop Drive (from 'ai') so the person finds them there; nothing is uploaded. The modules load on first use. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // words people read (steps, questions): shared/i18n/ui/<code>/ai2.js
  let modsP = null;
  const root = () => new URL('../../', K.base || document.baseURI).href;
  const mod = (rel) => import(root() + rel);

  function mods() {
    if (!modsP) modsP = (async () => {
      const [R, plan, detect, io, load] = await Promise.all([mod('shared/ops/all.js'), mod('workflows/js/core/plan.js'), mod('convert/js/core/detect.js'), mod('convert/js/io/files.js'), mod('shared/ops/load.js')]);
      await load.scripts(['shared/commands/args.js', 'shared/ops/flowdoc.js'], () => window.SlopCmdArgs && window.SlopFlowDoc);
      if (R.macrosReady) await Promise.race([Promise.resolve(R.macrosReady), new Promise((r) => setTimeout(r, 3000))]).catch(() => {});   // a promise: the saved macros read
      return { R, plan, detect, io };
    })().catch((e) => { modsP = null; throw e; });
    return modsP;
  }

  function describe(R, op, full) {
    const o = { id: op.id, label: op.label, app: R.appLabel(op.app), takes: op.from, makes: op.ext || (op.out ? 'depends on the options' : 'the same kind'), mode: op.mode };
    if (op.kind === 'macro') o.step = { kind: 'macro', app: op.app, macroId: op.macroId };
    if (full) { o.options = window.SlopCmdArgs.jsonSchema(R.argsOf(op)); if (op.description) o.description = op.description; }
    return o;
  }

  const TYPE = { json: 'application/json', md: 'text/markdown', csv: 'text/csv', txt: 'text/plain', html: 'text/html', svg: 'image/svg+xml', xml: 'application/xml', tsv: 'text/tab-separated-values', yaml: 'text/yaml' };
  /** An input written in the call (no file needed): { name, text } or { name, json } becomes a file of that name. */
  function inlineFile(input) {
    if (!input || typeof input !== 'object') return null;
    const json = input.json !== undefined, ext = String(input.name || '').split('.').pop().toLowerCase();
    const name = String(input.name || (json ? 'input.json' : 'input.txt')).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
    const body = json ? (typeof input.json === 'string' ? input.json : JSON.stringify(input.json, null, 2)) : String(input.text == null ? '' : input.text);
    return new File([body], name, { type: TYPE[ext] || (json ? 'application/json' : 'text/plain') });
  }
  async function filesOf(list, env, input) {
    const hub = env.hub !== undefined ? env.hub : window.SlopHub, out = [];
    const own = inlineFile(input);
    if (own) out.push(own);
    for (const q of [].concat(list || [])) {
      if (/^(open|current|app(:\d+)?)$/i.test(String(q))) {
        const { ask } = await mod('shared/convert/provided.js');
        const { files, app } = await ask();
        if (!files.length) throw new Error(`${app} has nothing open.`);
        out.push(...files);
      } else {
        const f = await K.appTools.findFile(hub, q);
        out.push(new File([f.blob], f.name, { type: f.type || f.blob.type || '' }));
      }
    }
    if (!out.length) throw new Error('Name the files to work on (Slop Drive names from list_files, or "open"), or give the input in the call: input: { name: "outline.json", json: {…} } or { name: "notes.md", text: "…" }.');
    return out;
  }

  async function runFlow(doc, names, env, input) {
    const { R, plan, detect, io } = await mods(), F = window.SlopFlowDoc;
    const n = typeof doc === 'string' ? F.fromText(doc) : F.normalize(doc);
    if (!n.doc) throw new Error((n.errors && n.errors[0]) || 'This is not a workflow.');
    if (!n.doc.steps.length) throw new Error('The workflow has no steps.');
    const items = [];
    for (const f of await filesOf(names, env, input)) items.push({ id: 'f' + items.length, name: f.name, file: f, kind: detect.detectKind(f.name, f.type, await io.readHead(f)) });
    const res = await plan.runWorkflow(n.doc, items, R, { signal: env.signal || null });
    const hub = env.hub !== undefined ? env.hub : window.SlopHub, saved = [];
    for (const o of res.outputs.concat(res.middles || [])) {
      const blob = o.blob || o.file;
      if (hub && hub.put) { await hub.put(blob, { name: o.name, from: 'ai' }); saved.push({ name: o.name, size: blob.size, saved: 'Slop Drive' }); }
      else saved.push({ name: o.name, size: blob.size });
    }
    const errors = res.errors.map((e) => `Step ${e.step}: ${e.message}`);
    if (!saved.length && errors.length) throw new Error(errors.join(' '));   // nothing made: a failed step, not a ✓
    return { files: saved, errors, notes: (res.notes || []).concat(n.errors || []) };
  }

  const hay = (op) => `${op.id} ${op.label} ${op.group || ''} ${(op.keywords || []).join(' ')}`.toLowerCase();
  /** Operations that take the kind and contain every word. */
  function match(R, query, kind) {
    const q = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), k = String(kind || '').toLowerCase().replace(/^\./, '');
    return R.all().filter((op) => (!k || R.accepts(op, k)) && q.every((w) => hay(op).includes(w)));
  }
  /** For find_tools (toolbox.js): the operations most words match, one line each ('id: label (png → jpg)'). */
  async function search(query, n = 5) {
    const { R } = await mods(), ws = K.toolbox ? K.toolbox.words(query) : String(query || '').toLowerCase().split(/\s+/);
    return R.all().map((op) => ({ op, s: ws.filter((w) => hay(op).includes(w)).length })).filter((x) => x.s).sort((x, y) => y.s - x.s).slice(0, n)
      .map(({ op }) => `- ${op.id}: ${op.label} (${[].concat(op.from || []).slice(0, 4).join(', ') || 'any'} → ${op.ext || 'same kind'})`);
  }

  const FILES = { type: 'array', items: { type: 'string' }, description: 'Slop Drive names or ids, or "open" (what is open here)' };
  const INPUT = { type: 'object', description: 'instead of a file: { name: "outline.json", json: {…} } or { name: "notes.md", text: "…" }',
    properties: { name: { type: 'string' }, text: { type: 'string' }, json: { type: 'object' } } };
  function build(env = {}) {
    return [
      { name: 'list_operations', maxChars: 6000, label: (a) => (a.query || a.kind ? T('ui.ai.step.find_ops', { what: [a.query, a.kind].filter(Boolean).join(', ') }) : T('ui.ai.step.list_ops')),
        description: 'List the file operations this site runs on the device (conversions, remove background, watermark, resize, upscale, OCR, PDF tools, recorded macros). Filter by words or by a file kind (png, pdf, csv…); a short filtered list includes each operation\'s options.',
        params: { query: { type: 'string', description: 'words in the name' }, kind: { type: 'string', description: 'a file kind the operation takes, e.g. png' } },
        schema: { type: 'object', properties: { query: { type: 'string', description: 'words in the name' }, kind: { type: 'string', description: 'a file kind the operation takes, e.g. png' } } },
        run: async (a) => {
          const { R } = await mods();
          const hits = match(R, a.query, a.kind), short = (op) => ({ id: op.id, label: op.label });
          // unfiltered or broad: ids and labels only (option lists are long), so the answer stays small; a filtered
          // list gives the options of its best matches (the query in the id first)
          if (!(a.query || a.kind) || hits.length > 25) return { count: hits.length, operations: hits.slice(0, 60).map(short), hint: 'Filter with query or kind to see the options.' };
          const q = String(a.query || '').toLowerCase(), first = hits.filter((op) => q && op.id.toLowerCase().includes(q.split(/\s+/)[0]));
          const ranked = [...new Set([...first, ...hits])];
          return { count: hits.length, operations: ranked.map((op, i) => (i < 6 ? describe(R, op, true) : short(op))) };
        } },
      { name: 'run_operation', label: (a) => T('ui.ai.step.run_op', { op: String(a.operation), files: [...[].concat(a.files || []), ...(a.input && a.input.name ? [a.input.name] : a.input ? [T('ui.ai.step.the_input')] : [])].join(', ') }),
        description: 'Run a file operation (id from find_tools or list_operations) on files, or on an input written in the call (e.g. an outline → a presentation). New files go to Slop Drive on this device.',
        params: { operation: { type: 'string', description: 'operation id from list_operations', required: true }, files: { type: 'array', description: 'Slop Drive file names, or "open"' }, input: { type: 'object', description: '{ name, text | json }: an input written here instead of a file' }, options: { type: 'object', description: 'the operation\'s options' } },
        schema: { type: 'object', properties: { operation: { type: 'string', description: 'operation id from list_operations' }, files: FILES, input: INPUT, options: { type: 'object', description: 'its options (list_operations with a query shows them)' } }, required: ['operation'] },
        run: async (a) => {
          const { R } = await mods(), op = R.byId(String(a.operation));
          if (!op) throw new Error(`No operation "${a.operation}". Use list_operations.`);
          const step = op.kind === 'macro' ? describe(R, op).step : { kind: 'op' };
          return runFlow({ kind: 'slopflow', v: 1, name: op.label, steps: [Object.assign(step, { id: op.id, options: a.options || {} })] }, a.files, env, a.input);
        } },
      { name: 'run_workflow', label: (a) => T('ui.ai.step.run_flow', { name: (a.workflow && a.workflow.name) || '' }).trim(),
        description: 'Run a Slop Workflows document on files: { kind: "slopflow", v: 1, name, steps: [{ kind: "op", id, options }] }, or workflow_text (a .slopflow file\'s text). Each step\'s files go to the next; the results are saved to Slop Drive.',
        params: { workflow: { type: 'object', description: 'the .slopflow document' }, workflow_text: { type: 'string', description: 'or the text of a .slopflow file' }, files: { type: 'array', description: 'Slop Drive file names, or "open"' }, input: { type: 'object', description: '{ name, text | json }: an input written here instead of a file' } },
        schema: { type: 'object', properties: { workflow: { type: 'object', description: 'the .slopflow document' }, workflow_text: { type: 'string', description: 'or the text of a .slopflow file' }, files: FILES, input: INPUT } },
        run: (a) => runFlow(a.workflow || a.workflow_text, a.files, env, a.input) },
    ];
  }

  K.opTools = { build, mods, search };
})();
