/* SlopAIKit appTools: the "Control apps" tool set. Classic script; adds SlopAIKit.appTools.
 *   appTools.build(env) → tools for SlopAIKit.tools.run (with env.cmd, the page's own commands through cmdtools.js)
 * env: { apps(): SLOP_APPS, hub: SlopHub, cmd: SlopCmd (only inside an app, via the side panel), open(url),
 *        confirm(title, message), appId, workspace: SlopWorkspace (Slop AI: apps open beside the chat),
 *        look: add look_at_file (fileTools.js; for models that can see, it asks before each copy goes out), who: where
 *        that copy goes ("Anthropic"), ops: add the operations registry's tools (opTools.js), handoff({ app, task, url }):
 *        open_app takes a "task" and the conversation continues in that app (handoff.js), hop (open_in_app), appName };
 *        plus every set a file put in SlopAIKit.toolSets (a function env → tools), such as the pictures of imagegen/tools.js
 *   appTools.catalog(apps, skills?, { brief }) → the apps in a few words each (what they are, make and open; the tools that make or add
 *        something there and their operations, from app-skills.js, generated from the apps' own commands), for the system prompt
 * The one tool list: the side panel, Slop AI and every engine (local prompt-based or cloud native) use what build makes.
 * Destructive actions (commands that delete, clear, close, reset, …) always ask the person first.
 * With env.workspace, open_app opens the app in a frame beside the chat, and app_search / app_command / app_state
 * drive it through its SlopCmd registry (ai/js/ui/workspace.js). A web address given to open_app opens in a new tab. */
(function () {
  'use strict';
  const K = (window.SlopAIKit = window.SlopAIKit || {});
  const T = (k, v) => (window.SlopI18n ? SlopI18n.t(k, v) : k);   // words people read (steps, questions): shared/i18n/ui/<code>/ai2.js
  const DESTRUCTIVE = /\b(delete|remove|trash|purge|clear|erase|empty|reset|close|discard|revert|overwrite|replace|wipe|destroy|new|flatten|merge|crop|quit)\b/i;
  /** Workspace commands that always ask: the usual words, plus the ones that clearly destroy data. */
  const WS_DESTRUCTIVE = /(delete|remove|clear|empty|reset|overwrite|purge|discard|erase|wipe)/i;
  const isDestructiveCommand = (c) => !!c && (typeof c.destructive === 'boolean' ? c.destructive : DESTRUCTIVE.test(c.title || '') || DESTRUCTIVE.test((c.id || '').replace(/[._-]/g, ' ')));

  function listCommands(cmd) {
    let list = [];
    try { list = cmd.list() || []; } catch (e) { return []; }
    return list.filter((c) => { try { return !c.when || c.when(); } catch (e) { return false; } })
      .map((c) => ({ id: c.id, title: c.title, group: c.group || '' }));
  }

  const TEXT_TYPE = /^text\/|json|xml|javascript|svg|yaml|toml|sql/;
  const TEXT_NAME = /\.(md|markdown|txt|csv|tsv|json|js|mjs|ts|py|html?|css|xml|svg|ya?ml|toml|ini|sql|sh|log)$/i;
  const isText = (f) => TEXT_TYPE.test(f.type || '') || TEXT_NAME.test(f.name || '');
  /** A Slop Drive file by id, or by name (exact, then a part of the name). */
  async function findFile(hub, q) {
    if (!hub || !hub.list) throw new Error('Slop Drive is not available on this page.');
    const files = await hub.list(), s = String(q || '').trim().toLowerCase();
    const f = files.find((x) => x.id === q) || files.find((x) => x.name.toLowerCase() === s) || files.find((x) => x.name.toLowerCase().includes(s));
    if (!f) throw new Error(`No Slop Drive file "${q}". Use list_files to see the names.`);
    return f;
  }

  /** Edit distance between two strings. */
  function lev(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** The closest command ids to a mistyped one: items are { id, title }. */
  function nearest(q, items, n = 5) {
    const s = String(q || '').toLowerCase();
    const score = (c) => {
      const id = String(c.id).toLowerCase();
      return s && id.includes(s) ? 0 : Math.min(lev(s, id), lev(s, String(c.title || '').toLowerCase()));
    };
    return items.map((c) => ({ id: c.id, s: score(c) })).sort((x, y) => x.s - y.s).slice(0, n).map((x) => x.id);
  }

  /** The once-per-app question before the assistant drives another app: through the one permission module
   * (SlopAIPermissions, kind 'control': "Allow everything" never asks, "always" is remembered per app), else env.confirm. */
  async function allowControl(app, env = {}) {
    const P = window.SlopAIPermissions, title = T('ui.ai.step.control_q', { app: app.name });
    const detail = T('ui.ai.step.control', { app: app.name });
    if (env.permit) return !!(await env.permit({ kind: 'control', app: app.id, appName: app.name, action: title, detail, title }));
    if (P && P.ask && P.KINDS.control) return !!(await P.ask({ kind: 'control', app: app.id, appName: app.name, action: title, detail, title }));
    return !!(env.confirm && await env.confirm(title, detail));
  }
  /** The workspace tools. Each needs an app that is open beside the chat (open_app first). */
  function workspaceTools(ws, appFor) {
    const openFor = (id) => { const app = appFor(id); if (!ws.isOpen(app.id)) throw new Error(`${app.name} is not open. Call open_app with "${app.id}" first.`); return app; };
    const appArg = { type: 'string', description: 'app id, for example "drive"', required: true };
    const whose = (id) => { try { const x = appFor(id); return { app: x.id, appName: x.name }; } catch (e) { return null; } };   // whose permission a step asks for
    return [
      { name: 'app_search', description: 'List or search the commands of an app that is open beside the chat: with no query, every command that can run now, with the arguments each takes (create, add, edit, export); with a query, the best matches. Returns ids for app_command.',
        params: { appId: appArg, query: { type: 'string', description: 'words to look for; empty lists them all' } }, maxChars: 12000,
        run: async (a) => {
          const app = openFor(a.appId), hits = await ws.search(app.id, a.query || '');
          return hits.length ? hits : `No command matches "${a.query}" in ${app.name}.`;
        } },
      { name: 'app_command', description: 'Run one command of an app that is open beside the chat, by its id (from app_search). The first command in each app asks the person once for this session. Destructive commands ask every time.',
        params: { appId: appArg, commandId: { type: 'string', description: 'command id from app_search', required: true }, args: { type: 'object', description: 'optional arguments the command takes' } },
        destructive: (a) => { const c = ws.findCommand(a.appId, a.commandId); return !!c && WS_DESTRUCTIVE.test(`${a.commandId} ${c.title}`); },
        kind: () => 'delete', appOf: (a) => whose(a.appId),
        confirmText: (a) => { const c = ws.findCommand(a.appId, a.commandId); return T('ui.ai.step.run_cmd', { cmd: c ? c.title : a.commandId, app: appFor(a.appId).name }); },
        run: async (a, env = {}) => {
          const app = openFor(a.appId);
          const { list } = await ws.commands(app.id);
          const c = list.find((x) => x.id === a.commandId);
          if (!c) throw new Error(`No command "${a.commandId}" in ${app.name}. Closest: ${nearest(a.commandId, list).join(', ') || 'none'}. Use app_search to look for more.`);
          if (!c.enabled) throw new Error(`“${c.title}” is not available right now.`);
          if (!ws.granted(app.id)) {
            if (!(await allowControl(app, env))) throw new Error(`The person did not allow commands in ${app.name}.`);
            ws.grant(app.id);
          }
          const r = await ws.run(app.id, c.id, a.args || {});
          if (!r) throw new Error(`“${c.title}” did not run.`);
          const v = r.value, notes = r.notes && r.notes.length ? ' Note: ' + r.notes.join('; ') + '.' : '';
          const said = typeof v === 'string' ? ' ' + v : v && typeof v === 'object' ? ' ' + JSON.stringify(v).slice(0, 3000) : '';   // what it made: ids, numbers
          return `Ran “${c.title}” in ${app.name}.${said}${notes}`;
        } },
      { name: 'app_state', description: 'Read what is open in an app beside the chat, as JSON: its title, whether it can be driven, and its state (the open document or record, lists, selection). Call it after app_command to check the result.',
        params: { appId: appArg }, maxChars: 8000,
        run: (a) => ws.state(openFor(a.appId).id) },
      ...(ws.snapshot && K.fileTools ? [{ name: 'app_snapshot', description: 'See an app that is open beside the chat as a picture (at most 1024 px), to check your work there. Its own picture of the work, else its page drawn.',
        params: { appId: appArg }, destructive: true, kind: () => 'send', appOf: (a) => whose(a.appId),
        confirmTitle: () => T('ui.ai.step.send_work_q', { who: T('ui.ai.the_provider') }),
        confirmText: (a) => T('ui.ai.step.snapshot', { app: appFor(a.appId).name }),
        label: (a) => T('ui.ai.step.snapshot_label', { app: appFor(a.appId).name }),
        run: async (a) => {
          const app = openFor(a.appId), s = await K.fileTools.shrink(await ws.snapshot(app.id));
          return { text: `A ${s.width} × ${s.height} picture of ${app.name} (full size ${s.from.width} × ${s.from.height}).`, media: [{ mime: s.mime, data: s.data, name: app.name }] };
        } }] : []),
    ];
  }

  function build(env = {}) {
    const apps = env.apps || (() => window.SLOP_APPS || []);
    const hub = env.hub !== undefined ? env.hub : window.SlopHub;
    const open = env.open || ((url) => window.open(url, '_blank'));
    const ws = env.workspace || null;
    const findApp = (id) => apps().find((x) => x.id === id || x.name.toLowerCase() === String(id).toLowerCase()) || null;
    const appFor = (id) => { const app = findApp(id); if (!app) throw new Error(`No app "${id}". Use list_apps to see the ids.`); return app; };
    const tools = [
      { name: 'list_apps', description: 'List the Slopographic apps, games and experiments (id, name, what it does).', params: {}, maxChars: 12000,
        run: () => apps().map((a) => ({ id: a.id, name: a.name, kind: a.kind, does: a.tagline, status: a.status })) },
      { name: 'open_app', description: ws
        ? 'Open a Slopographic app beside this chat in the workspace, by its id (for example "photoslop", "vector", "pdf", "drive"), or focus it if it is already open. Pass a web address (https://…) as the id to open a website in a new browser tab instead; websites never open inside the workspace. With "file", the app opens that Slop Drive file in a new tab.'
        : 'Open a Slopographic app in a new tab by id ("photoslop", "pdf", "drive"…), optionally with a Slop Drive file.',
        params: Object.assign({ id: { type: 'string', description: 'app id, or a web address', required: true }, file: { type: 'string', description: 'Slop Drive file name or id' } },
          env.handoff ? { task: { type: 'string', description: 'what to do there: the chat continues there with it' } } : {}),
        run: async (a) => {
          if (ws && /^https?:\/\//i.test(String(a.id))) return ws.openUrl(String(a.id));
          const app = appFor(a.id);
          if (a.task && env.handoff) {
            const f = a.file ? await findFile(hub, a.file) : null;
            return env.handoff({ app, task: String(a.task), url: hub && hub.urlOf ? hub.urlOf(app, f ? { drive: f.id } : undefined) : new URL(app.path, location.href).href });
          }
          if (a.file) {
            const f = await findFile(hub, a.file);
            const fits = !hub.matches || (app.accepts || []).some((p) => hub.matches(f.type, p));
            open(hub.urlOf(app, { drive: f.id }));
            return `Opened ${app.name} with ${f.name}.` + (fits ? '' : ` ${app.name} may not open ${f.type || 'this'} files.`);
          }
          if (ws) {
            const r = await ws.open(app.id);
            return `${app.name} is open beside the chat.` + (r.drivable ? ' Use app_search and app_command to work in it.' : ' It has no command registry, so it can only be looked at.');
          }
          const url = hub && hub.urlOf ? hub.urlOf(app) : new URL(app.path, location.href).href;
          open(url);
          return `Opened ${app.name}.`;
        } },
      ...(ws ? workspaceTools(ws, appFor) : []),
      { name: 'save_to_drive', description: 'Save text as a new file in Slop Drive (the shared local drive).',
        params: { name: { type: 'string', description: 'file name with extension, e.g. notes.md', required: true }, content: { type: 'string', description: 'the file text', required: true } },
        run: async (a) => {
          if (!hub || !hub.put) throw new Error('Slop Drive is not available on this page.');
          const name = String(a.name).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120) || 'untitled.txt';
          const type = /\.html?$/i.test(name) ? 'text/html' : /\.json$/i.test(name) ? 'application/json' : /\.md$/i.test(name) ? 'text/markdown' : 'text/plain';
          const id = await hub.put(new Blob([String(a.content)], { type }), { name, from: 'ai' });
          return `Saved "${name}" to Slop Drive (id ${id}).`;
        } },
      { name: 'list_files', description: 'List files in Slop Drive, optionally filtered by a word in the name.',
        params: { query: { type: 'string', description: 'word to filter by' } },
        run: async (a) => {
          if (!hub || !hub.list) throw new Error('Slop Drive is not available on this page.');
          const q = String(a.query || '').toLowerCase();
          const files = (await hub.list()).filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 40);
          return files.map((f) => ({ id: f.id, name: f.name, type: f.type, size: f.size, from: f.from }));
        } },
      { name: 'read_file', description: 'Read a text file from Slop Drive (its first 4000 characters), so you can answer questions about it.',
        params: { file: { type: 'string', description: 'Slop Drive file name or id', required: true } },
        run: async (a) => {
          const f = await findFile(hub, a.file);
          if (!isText(f)) throw new Error(`${f.name} is not a text file (${f.type || 'unknown type'}).`);
          const text = await f.blob.text();
          return text.length > 4000 ? text.slice(0, 4000) + `\n… (${text.length - 4000} more characters)` : text;
        } },
    ];
    if (env.look && K.fileTools) tools.push(K.fileTools.look(env), K.fileTools.canvas(env));
    if (env.ops && K.opTools) tools.push(...K.opTools.build(env));
    if (env.hop && K.handoff) tools.push(K.handoff.tool(env));   // open_in_app: the task moves to another app with files
    for (const set of K.toolSets || []) tools.push(...set(env));   // registered sets, e.g. generate_image (imagegen/tools.js)
    const cmd = env.cmd;
    if (cmd && cmd.list && (cmd.run || cmd.exec) && K.cmdTools) {
      const name = env.appId ? ((apps().find((a) => a.id === env.appId) || {}).name) || env.appId : '';
      const label = name ? `the ${name} app` : 'this app';   // for the model (tool descriptions); people read appName
      tools.push(...K.cmdTools.build(cmd, { label, appName: name, who: env.who, look: !!env.look }));   // list_commands, run_command, app_state and one tool per command with args
    }
    return tools;
  }

  /** The apps (kind 'app') in a line each: the system prompt's map of the site, from the one registry (shared/apps.js). */
  const MIME = (m) => (m === '*/*' ? 'any file' : m.replace(/^image\/\*$/, 'images').replace(/^audio\/\*$/, 'audio').replace(/^video\/\*$/, 'video').replace(/^text\/\*$/, 'text')
    .replace(/^[a-z]+\/(x-|vnd\.)?/, '').replace(/^(vnd\.)?openxmlformats-officedocument\./, '').replace(/[.+-]/g, ' ').trim()).replace(/^wordprocessingml document$/, 'docx').replace(/^presentationml presentation$/, 'pptx').replace(/^spreadsheetml sheet$/, 'xlsx').replace(/^plain$/, 'text');
  /** skills: SlopAIKit.appSkills (app-skills.js, generated by tools/ai-coverage.mjs from the apps' own commands): the
   * tools that make or add something there, and the operations the app gives to every page (run_operation). brief: what
   * each app is and makes only (the AI panel's prompt; find_tools gives the tools and operations on demand). */
  function catalog(list, skills = K.appSkills || {}, { brief = false } = {}) {
    return (list || []).filter((a) => a.kind === 'app').map((a) => {
      const makes = (a.creates || []).map((c) => `${c.label}${c.ext ? ` (.${c.ext})` : ''}`), opens = [...new Set((a.accepts || []).map(MIME))].slice(0, 5);
      const s = skills[a.id] || {}, tools = [...new Set([...(s.create || []), ...(s.add || [])])];
      if (brief) return `- ${a.id}: ${a.name}, ${String(a.tagline).replace(/ Nothing uploaded\./, '').replace(/, rebuilt for the browser/, '')}${makes.length ? ` Makes: ${makes.join(', ')}.` : ''}`;
      return `- ${a.id}: ${a.name}, ${String(a.tagline).replace(/ Nothing uploaded\./, '')}${makes.length ? ` Makes: ${makes.join(', ')}.` : ''}${opens.length ? ` Opens: ${opens.join(', ')}.` : ''}`
        + `${tools.length ? ` Tools there: ${tools.join(', ')}.` : ''}${(s.ops || []).length ? ` Operations: ${s.ops.join(', ')}.` : ''}${a.status === 'building' ? ' (early version)' : ''}`;
    }).join('\n');
  }

  K.appTools = { catalog, build, isDestructiveCommand, listCommands, findFile, allowControl, DESTRUCTIVE, WS_DESTRUCTIVE, nearest };
})();
