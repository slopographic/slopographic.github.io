/* SlopAIKit toolbox: keeps what the AI panel sends small, for every engine (cloud and local). Classic script; adds
 * SlopAIKit.toolbox. The one place for progressive tool disclosure, compact schemas, small results and history trimming.
 *   arrange(tools, env) → the list with find_tools added and every tool outside CORE marked deferred (only when the list
 *        is long). A deferred tool can always be called; its schema reaches the model once find_tools loads it:
 *        Anthropic natively (every tool is sent with defer_loading, find_tools answers with tool_reference blocks that the
 *        API expands in place, so the cached prefix stays), the other providers and local models by adding the loaded
 *        tools to the next requests (visible). find_tools also finds file operations and what other apps can do.
 *   loaded(messages) → Set of tool names that find_tools loaded in this conversation (tool messages carry load)
 *   visible(tools, messages) → the tools to describe to a model now: not deferred, or loaded
 *   compact(schema) → the schema without what the app checks anyway (huge bounds, lengths, additionalProperties)
 *   signature(tool) → 'blur(radius: number 0.1–250 =4): Blur the active layer…', one line per tool (unused by find_tools,
 *        whose loaded tools arrive as definitions; kept for prompts that list tools in text)
 *   extra(text) → a find_tools answer after its first line (operations, other apps)
 *   summarize(value, { items, chars, depth }) → the same JSON with long lists and strings cut ("… 30 more")
 *   trim(messages) → the history with tool results from earlier requests (before the last user message) cut to a line
 *        and their pictures left out; the current request is never changed, so its cached prefix stays */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // words people read (steps, questions): shared/i18n/ui/<code>/ai2.js
  /** Always sent: reading the app, finding and running tools, moving between apps, looking, Slop Drive. */
  const CORE = new Set(['app_state', 'find_tools', 'run_command', 'run_operation', 'open_in_app', 'open_app', 'look_at_canvas', 'look_at_file',
    'list_files', 'read_file', 'save_to_drive', 'app_search', 'app_command']);
  const MIN_TO_DEFER = 16, FOUND = 6, OLD_RESULT = 200;

  function compact(s) {
    if (Array.isArray(s)) return s.map(compact);
    if (!s || typeof s !== 'object') return s;
    const o = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'additionalProperties' && v === false) continue;
      if (k === 'maxLength' || k === 'maxItems' || k === 'minItems' || k === '$schema') continue;
      if ((k === 'minimum' || k === 'maximum') && typeof v === 'number' && Math.abs(v) >= 10000) continue;
      if (k === 'required' && Array.isArray(v) && !v.length) continue;
      o[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([p, x]) => [p, compact(x)])) : compact(v);
    }
    return o;
  }
  const schemaOf = (t) => (K.cmdTools && K.cmdTools.inputSchema ? K.cmdTools.inputSchema(t) : t.schema || { type: 'object', properties: {} });
  function argText(name, p, req) {
    let s = `${name}${req ? '' : '?'}: ${p.enum ? p.enum.slice(0, 10).join('|') + (p.enum.length > 10 ? '|…' : '') : p.type || 'any'}`;
    if (p.minimum != null || p.maximum != null) s += ` ${p.minimum != null ? p.minimum : ''}–${p.maximum != null ? p.maximum : ''}`;
    if (p.default !== undefined && typeof p.default !== 'object') s += ` =${p.default}`;
    if (p.description && !/^px$/.test(p.description)) s += ` (${String(p.description).slice(0, 90)})`;
    return s;
  }
  function signature(t) {
    const s = compact(schemaOf(t)), req = new Set(s.required || []);
    const args = Object.entries(s.properties || {}).map(([k, p]) => argText(k, p, req.has(k)));
    return `${t.name}(${args.join(', ')}): ${String(t.description || '').slice(0, 200)}`;
  }

  function summarize(v, o = {}, d = 0) {
    const items = o.items || 8, chars = o.chars || 160, depth = o.depth || 4;
    if (typeof v === 'string') return v.length > chars ? v.slice(0, chars) + `… (${v.length - chars} more characters)` : v;
    if (!v || typeof v !== 'object') return v;
    if (d >= depth) return Array.isArray(v) ? `[${v.length} items]` : '{…}';
    if (Array.isArray(v)) {
      const out = v.slice(0, items).map((x) => summarize(x, o, d + 1));
      if (v.length > items) out.push(`… ${v.length - items} more`);
      return out;
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, summarize(x, o, d + 1)]));
  }

  const words = (s) => String(s || '').toLowerCase().replace(/[_./-]+/g, ' ').split(/[^a-z0-9]+/).filter((w) => w.length > 1).map((w) => w.replace(/(ing|es|s)$/, ''));
  /** How well a tool matches the words: its name counts most, then the description, then the argument names. */
  function score(t, ws) {
    const name = words(t.name).join(' '), desc = words(t.description).join(' '), args = words(Object.keys(schemaOf(t).properties || {}).join(' ')).join(' ');
    return ws.reduce((n, w) => n + (name.includes(w) ? 3 : 0) + (desc.includes(w) ? 1 : 0) + (args.includes(w) ? 0.5 : 0), 0);
  }
  /** Other apps whose tools or description match (from app-skills.js and the app registry), for open_in_app. */
  function otherApps(ws, env) {
    const apps = (env.apps ? env.apps() : window.SLOP_APPS) || [], skills = K.appSkills || {};
    return apps.filter((a) => a.kind === 'app' && a.id !== env.appId).map((a) => {
      const s = skills[a.id] || {}, tools = [...new Set([...(s.create || []), ...(s.add || [])])];
      const hay = words(`${a.name} ${a.tagline} ${tools.join(' ')}`).join(' ');
      return { a, tools, n: ws.filter((w) => hay.includes(w)).length };
    }).filter((x) => x.n).sort((x, y) => y.n - x.n).slice(0, 3)
      .map((x) => `- ${x.a.id} (${x.a.name}): ${x.tools.slice(0, 6).join(', ') || String(x.a.tagline).slice(0, 80)}`);
  }
  async function operations(q) {
    if (!K.opTools || !K.opTools.search) return [];
    const wait = new Promise((r) => setTimeout(() => r([]), 4000));
    return Promise.race([K.opTools.search(q, 5).catch(() => []), wait]);
  }

  function finder(all, env) {
    return {
      name: 'find_tools', readOnly: true, maxChars: 6000,
      description: 'Load more tools of this app: by what they do (query, e.g. "blur text gradient") or by name (names). Returns each tool\'s arguments; then call it. Also lists matching file operations (run_operation) and other apps (open_in_app).',
      params: { query: { type: 'string', description: 'what you want to do' }, names: { type: 'array', description: 'tool names to load' } },
      schema: { type: 'object', properties: { query: { type: 'string', description: 'what you want to do' }, names: { type: 'array', items: { type: 'string' }, description: 'tool names to load' } } },
      label: (a) => T('ui.ai.step.find_tools', { what: a.query || [].concat(a.names || []).join(', ') }),
      run: async (a) => {
        const named = new Set([].concat(a.names || []).map(String)), ws = words(a.query);
        const pool = all.filter((t) => t.deferred);
        const hits = pool.filter((t) => named.has(t.name));
        if (ws.length) {
          const ranked = pool.filter((t) => !named.has(t.name)).map((t) => ({ t, n: score(t, ws) })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
          const best = ranked.length ? ranked[0].n : 0;   // weak matches (a word only in an argument) only when nothing better
          hits.push(...ranked.filter((x) => x.n >= best / 2).slice(0, FOUND).map((x) => x.t));
        }
        // the loaded tools' definitions reach the model as tools (visible, or Claude's tool_reference), so only their names here
        const lines = [hits.length ? `Loaded: ${hits.map((t) => t.name).join(', ')}. Call them directly.` : `No tool here matches${a.query ? ` "${a.query}"` : ''}.`];
        const ops = env.ops && ws.length ? await operations(a.query) : [];
        if (ops.length) lines.push('File operations (run_operation):', ...ops);
        const others = ws.length ? otherApps(ws, env) : [];
        if (others.length) lines.push('In other apps (open_in_app):', ...others);
        return { text: lines.join('\n'), load: hits.map((t) => t.name) };
      },
    };
  }

  /** A deferred tool called with arguments it does not take (the model guessed before loading it): it does not run, and
   * the answer says what it takes, so the next call is right. */
  function guard(t) {
    const run = t.run, props = Object.keys(schemaOf(t).properties || {});
    if (!props.length && !t.schema) return t;
    return Object.assign(t, { deferred: true, run: (a = {}, e) => {
      const odd = Object.keys(a || {}).filter((k) => !props.includes(k));
      if (odd.length) throw new Error(`${t.name} does not take ${odd.join(', ')}. It takes: ${signature(t)}`);
      return run(a, e);
    } });
  }
  function arrange(tools, env = {}) {
    if (env.defer === false || tools.length < MIN_TO_DEFER || tools.some((t) => t.name === 'find_tools')) return tools;
    const out = tools.map((t) => (CORE.has(t.name) ? t : t.schema || t.cmdId ? guard(t) : Object.assign(t, { deferred: true })));
    const at = Math.max(0, out.findIndex((t) => t.name === 'app_state') + 1);
    out.splice(at, 0, finder(out, env));
    return out;
  }
  function loaded(messages) {
    const s = new Set();
    for (const m of messages || []) if (m && m.role === 'tool' && Array.isArray(m.load)) m.load.forEach((n) => s.add(n));
    return s;
  }
  function visible(tools, messages) {
    if (!tools || !tools.some((t) => t.deferred)) return tools;
    const s = loaded(messages);
    const core = tools.filter((t) => !t.deferred), more = tools.filter((t) => t.deferred && s.has(t.name));
    return core.concat(more);   // loaded tools go last: the earlier part of the list stays as it was
  }
  /** A find_tools answer without its first line (the loaded names): the operations and other apps, if any. */
  const extra = (text) => String(text || '').split('\n').slice(1).join('\n');
  function trim(messages) {
    let last = -1;
    (messages || []).forEach((m, i) => { if (m.role === 'user') last = i; });
    return (messages || []).map((m, i) => {
      if (i > last || m.role !== 'tool' || m.trimmed) return m;
      const c = String(m.content == null ? '' : m.content), media = (m.media || []).length;
      if (c.length <= OLD_RESULT && !media) return m;
      const short = c.length > OLD_RESULT ? c.slice(0, OLD_RESULT).replace(/\s+\S*$/, '') + ` … (earlier result, ${c.length} characters, shortened)` : c;
      return Object.assign({}, m, { content: short + (media ? ` (${media} picture${media > 1 ? 's' : ''} left out)` : ''), media: undefined, trimmed: true });
    });
  }

  K.toolbox = { CORE, arrange, loaded, visible, compact, signature, summarize, trim, words, extra };
})();
