/* SlopAIKit cmdTools: an app's SlopCmd commands as tools for the model. Classic script; adds SlopAIKit.cmdTools.
 *   cmdTools.build(cmd, { label, confirm }) → tools for SlopAIKit.tools.run:
 *     - one tool per command that has an args schema (shared/commands/args.js), named c.tool or from its id
 *       ('ps.ai.blur' → 'blur'); its arguments are checked and clamped against the schema before it runs
 *       (SlopCmd.exec), and the result says what was clamped or ignored
 *     - app_state: the app's own summary (SlopCmd.provide({ state })), when it has one
 *     - list_commands / run_command(id, args?): every other command, by id
 *   cmdTools.definitions(cmd) → OpenAI-style JSON-schema tool definitions [{ type: 'function', function: { name, description, parameters } }]
 *   cmdTools.specs(cmd, env) → the same tools provider-neutral, with inputSchema (JSON Schema) and readOnly / mayDestroy:
 *     what cloud engines and WebMCP (shared/agent/webmcp.js) take; inputSchema(tool) is the one schema maker;
 *     neutral(tool) does the same for any tool of the one list (appTools.build, with the operations and file tools)
 *   cmdTools.isDestructive(c): c.destructive when the command sets it, else the words in its id/title (appTools.DESTRUCTIVE)
 *   cmdTools.label(c, args): 'Gaussian blur, radius 8', for the panel's step list
 * A command may set readOnly: true (it only reads: no confirm, readOnly in specs) or sends: true (its value carries the
 * app's content to the model, e.g. a video frame: { text, media: [{ mime, data, name }] }). A sending command is asked
 * every time with the same question as look_at_file ("Send a copy to <env.who>?", permission kind 'send'), the one
 * permission hook in tools.js; any other command that asks is kindOf(c): 'delete' or 'change' (shared/ai/permissions.js).
 * The run's signal (env.signal) reaches the command as ctx.signal, so a long command (an export) can stop.
 * Tools carry cmdId, so the panel knows which steps changed the app (its "Undo all AI changes"). */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // words people read (steps, questions): shared/i18n/ui/<code>/ai2.js
  const WORDS = /\b(delete|remove|trash|purge|clear|erase|empty|reset|close|discard|revert|overwrite|replace|wipe|destroy|new|flatten|merge|crop|quit)\b/i;
  const A = () => window.SlopCmdArgs || null;

  function isDestructive(c) {
    if (!c) return false;
    if (typeof c.destructive === 'boolean') return c.destructive;
    const re = (K.appTools && K.appTools.DESTRUCTIVE) || WORDS;
    return re.test(c.title || '') || re.test((c.id || '').replace(/[._-]/g, ' '));
  }
  /** Which approval a destructive command needs: 'delete' or 'change' (shared/ai/permissions.js, the one rule). */
  const kindOf = (c) => { const P = window.SlopAIPermissions; return P && P.kindOf ? P.kindOf(`${(c && c.id) || ''} ${(c && c.title) || ''}`) : 'delete'; };
  const toolName = (c) => (c.tool || String(c.id).replace(/^[a-z0-9]+\./i, '')).replace(/\W+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
  const plainTitle = (c) => String(c.title || c.id).replace(/…$/, '').split(' › ').pop();
  function label(c, args) {
    const a = A();
    return a && c.args ? a.summary(plainTitle(c), c.args, a.validate(c.args, args || {}).args) : plainTitle(c);
  }
  function listAll(cmd) {
    try { return (cmd.list() || []).filter((c) => !/^cmd\./.test(c.id)); } catch (e) { return []; }
  }
  const usable = (c) => c.enabled !== false && (!c.when || (() => { try { return c.when(); } catch (e) { return false; } })());
  /** For tools.describe: { name: { type, description, required, hint } } from a schema. */
  function params(schema) {
    const a = A(), out = {};
    for (const p of a ? a.normalize(schema) : []) out[p.name] = { type: p.type, description: p.description || '', required: !!p.required && p.default === undefined, hint: a.hint(p).replace(/^\w+ ?/, '') };
    return out;
  }
  function said(c, r) {
    const bits = [`Done: ${label(c, r.args)}.`];
    if (r.notes && r.notes.length) bits.push('Note: ' + r.notes.join('; ') + '.');
    if (r.value != null && r.value !== true && r.value !== false) bits.push(typeof r.value === 'string' ? r.value : JSON.stringify(r.value));
    return bits.join(' ');
  }
  /** Runs a command with arguments: SlopCmd.exec when the page has it, else the plain run(id). */
  async function exec(cmd, c, args, env = {}) {
    if (cmd.exec) {
      const r = await cmd.exec(c.id, args || {}, { source: 'ai', signal: env.signal || null });
      if (!r.ok) throw new Error(r.error || `${plainTitle(c)} did not run`);
      if (r.value && typeof r.value === 'object' && Array.isArray(r.value.media)) return { text: said(c, Object.assign({}, r, { value: r.value.text || null })), media: r.value.media };
      return said(c, r);
    }
    if (cmd.run(c.id, { source: 'ai', args: args || {} }) === false) throw new Error(`${plainTitle(c)} is not available right now`);
    return `Ran “${c.title || c.id}”.`;
  }

  function build(cmd, env = {}) {
    if (!cmd || !cmd.list || !(cmd.run || cmd.exec)) return [];
    const where = env.label || 'this app', all = listAll(cmd), names = new Set(['app_state', 'list_commands', 'run_command']);
    const app = env.appName || T('ui.ai.this_app'), who = () => env.who || T('ui.ai.the_provider');   // the questions people read
    const confirmText = (c) => (c && c.sends ? T('ui.ai.step.use_cmd', { cmd: plainTitle(c), app, who: who() })
      : T('ui.ai.step.run_cmd', { cmd: c ? plainTitle(c) : T('ui.ai.step.a_command'), app }));
    const ask = (c) => !!c && !c.readOnly && (c.sends || isDestructive(c));
    const kindFor = (c) => (c && c.sends ? 'send' : kindOf(c));   // a sending command asks as look_at_file does (permissions.js 'send')
    const tools = [];
    for (const c of all) {
      if (!c.args || c.ai === false || (c.sends && env.look === false)) continue;   // a model that cannot see gets no picture tools
      let name = toolName(c);
      while (names.has(name)) name += '_';
      names.add(name);
      tools.push({ name, cmdId: c.id, description: c.description || plainTitle(c), params: params(c.args),
        schema: A() ? A().jsonSchema(c.args) : { type: 'object', properties: {} },
        destructive: () => ask(c), kind: () => kindFor(c), confirmText: () => confirmText(c), label: (a) => label(c, a), readOnly: !!c.readOnly, sends: !!c.sends,
        confirmTitle: c.sends ? () => T('ui.ai.step.send_copy_q', { who: who() }) : undefined,
        run: (a, e) => exec(cmd, c, a, Object.assign({}, env, e)) });
    }
    if (cmd.state) {
      // a summary by default (long lists and texts cut, toolbox.summarize); detail: true for all of it
      const DETAIL = { type: 'boolean', description: 'all of it, not a summary' };
      tools.unshift({ name: 'app_state', description: `${where} right now as JSON (document, layers, selection…), summarized; detail: true for all of it. Call it first.`,
        params: { detail: DETAIL }, schema: { type: 'object', properties: { detail: DETAIL } }, maxChars: 6000, label: () => T('ui.ai.step.app_state'),
        run: async (a = {}) => {
          const st = await cmd.state();   // the app's own, else the page's summary (shared/commands/view.js)
          if (!st) return `${where} shares no state.`;
          return a.detail || typeof st !== 'object' || !K.toolbox ? st : JSON.stringify(K.toolbox.summarize(st, { items: 8, chars: 160, depth: 4 }));
        } });
    }
    const byId = (id) => listAll(cmd).find((c) => c.id === id) || null;
    tools.push(
      { name: 'list_commands', description: `List the other commands of ${where} that can run now (id, title, and the arguments a command takes).`, params: {}, label: () => T('ui.ai.step.list_commands'),
        run: () => listAll(cmd).filter(usable).filter((c) => !c.hidden || c.args).map((c) => (c.args && A() ? { id: c.id, title: c.title, args: A().normalize(c.args).map((p) => `${p.name}: ${A().hint(p)}`) } : { id: c.id, title: c.title, group: c.group || '' })) },
      { name: 'run_command', description: `Run one command of ${where} by its id (ids from list_commands), with optional arguments.`,
        params: { id: { type: 'string', description: 'command id', required: true }, args: { type: 'object', description: 'arguments, when the command takes any' } },
        destructive: (a) => ask(byId(a.id) || { id: a.id }), kind: (a) => kindFor(byId(a.id) || { id: a.id }), confirmText: (a) => confirmText(byId(a.id) || { id: a.id }),
        confirmTitle: (a) => { const c = byId(a.id); return c && c.sends ? T('ui.ai.step.send_copy_q', { who: who() }) : undefined; },   // else the permission question's own
        label: (a) => { const c = byId(a.id); return c ? label(c, a.args) : String(a.id); },
        cmdIdOf: (a) => a.id,
        run: (a, e) => {
          const c = byId(a.id);
          if (!c || !usable(c)) throw new Error(`No command "${a.id}" right now. Use list_commands.`);
          return exec(cmd, c, a.args && typeof a.args === 'object' ? a.args : {}, Object.assign({}, env, e));
        } });
    return tools;
  }

  /** A tool's input as JSON Schema: its args schema (args.js), else one made from its params map. */
  function inputSchema(t) {
    if (t.schema) return t.schema;
    const params = t.params || {};
    return { type: 'object', properties: Object.fromEntries(Object.entries(params).map(([k, p]) => [k, Object.assign({ type: p.type === 'object' ? 'object' : 'string' }, p.description ? { description: p.description } : {})])),
      required: Object.keys(params).filter((k) => params[k].required) };
  }
  function definitions(cmd) {
    return build(cmd).filter((t) => t.schema || t.params).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: inputSchema(t) } }));
  }
  /** Tools that only read, and those that hand back the person's own content (names of the one tool list, appTools).
   * A command may also say so itself: readOnly (it only reads) or sends (its value carries the app's content). */
  const READ_ONLY = new Set(['app_state', 'list_commands', 'list_apps', 'list_files', 'read_file', 'list_operations', 'app_search']);
  const UNTRUSTED = new Set(['app_state', 'list_files', 'read_file']);
  /** One tool, provider-neutral (for cloud engines and WebMCP, shared/agent/): { name, description, inputSchema, readOnly,
   * untrusted (it returns the person's own content), sends, mayDestroy, confirmTitle, destructive(args), confirmText(args), cmdId, run(args) }. */
  const neutral = (t) => ({ name: t.name, description: t.description, inputSchema: inputSchema(t), cmdId: t.cmdId || null,
    readOnly: READ_ONLY.has(t.name) || !!t.readOnly, untrusted: UNTRUSTED.has(t.name) || !!t.readOnly || !!t.sends, sends: !!t.sends,
    mayDestroy: /^(run|app)_command$/.test(t.name) || (!t.sends && (typeof t.destructive === 'function' ? !!t.destructive({}) : !!t.destructive)),
    confirmTitle: t.confirmTitle, destructive: t.destructive || false, kind: t.kind || null, permission: t.permission || null, confirmText: t.confirmText, run: t.run });
  /** The command tools, provider-neutral. */
  const specs = (cmd, env = {}) => build(cmd, env).map(neutral);

  K.cmdTools = { build, definitions, specs, neutral, inputSchema, isDestructive, kindOf, label, toolName };
})();
