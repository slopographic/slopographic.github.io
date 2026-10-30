/* Slop AI for the assistant: SlopCmd commands with arguments (shared/commands/args.js), loaded on demand by
 * SlopCmd.prepare() (ui/commands.js). Through the chat panel (ui/chat.js), the chat list (ui/chatlist.js) and the store:
 *   new_chat       a new chat, with a persona or a system prompt, settings and a title
 *   open_chat      open a saved chat by title or id
 *   add_message    put a message in the chat as written (a user note or an assistant reply), without running the model
 *   send_message   send a user message and let the loaded model reply; with no model loaded nothing is sent, and it says so
 *   set_settings   persona, system prompt, temperature, max tokens, Control apps (tools) and the title
 *   export_chat    the chat as Markdown or JSON to Slop Drive and/or a download
 * state() describes the open chat and the model; the checkpoint puts the chat back as it was. */
'use strict';
(function (AI) {
  const C = window.SlopCmd, E = AI && AI.E;
  if (!C || !AI || !AI.chat || C.get('ai.ai.new-chat')) return;
  const P = () => AI.chat;
  const list = [];
  const add = C.aiAdder('ai', list);   // shared/commands/commands.js
  const PERSONAS = Object.keys(AI.PERSONAS).filter((k) => !AI.PERSONAS[k].hidden);
  const notBusy = () => { if (P().busy || (AI.builder && AI.builder.busy)) throw new Error('Slop AI is writing a reply; wait for it or stop it first'); };
  const personaName = (c) => (c.system && c.persona !== 'builder' ? 'Custom' : (AI.PERSONAS[c.persona] || AI.PERSONAS.helper).name);
  /** Settings onto a conversation, as the settings dialog saves them (ui/settings.js). */
  function apply(c, a) {
    const done = [];
    if (a.persona) { if (!AI.PERSONAS[a.persona] || AI.PERSONAS[a.persona].hidden) throw new Error(`persona must be one of ${PERSONAS.join(', ')}`); c.persona = a.persona; c.system = a.persona === 'custom' ? c.system || '' : null; done.push('persona ' + AI.PERSONAS[a.persona].name); }
    if (a.system != null && a.system !== '') { c.persona = 'custom'; c.system = String(a.system).trim(); done.push('a custom system prompt'); }
    if (a.temperature != null) { c.temperature = Math.max(0, Math.min(2, +a.temperature)); done.push('temperature ' + c.temperature); }
    if (a.max_tokens != null) { c.maxTokens = Math.max(16, Math.min(8192, Math.round(+a.max_tokens))); done.push('max tokens ' + c.maxTokens); }
    if (a.tools != null) { if (c.kind === 'build') throw new Error('A mini-app chat has no Control apps tools'); c.tools = !!a.tools; done.push('Control apps ' + (c.tools ? 'on' : 'off')); }
    if (a.title) { c.title = String(a.title).trim().slice(0, 80); done.push(`title “${c.title}”`); }
    return done;
  }
  const save = async (c) => { if (c.messages.length) await AI.db.put(c); AI.emit('convs', c); };
  const refreshBar = () => { P().render(); if (P().opts.onDone) P().opts.onDone(P().conv); };   // onDone redraws the chat bar (chatlist.js)
  const SETTINGS = [
    { name: 'persona', type: 'enum', values: PERSONAS, description: 'helper (default), sloppo, coder, writer, or custom (with system)' }, // i18n-ignore: for the assistant (API)
    { name: 'system', type: 'string', maxLength: 8000, description: 'a system prompt of your own (makes the persona custom)' }, // i18n-ignore
    { name: 'temperature', type: 'number', min: 0, max: 2, description: 'lower is focused, higher is creative' }, // i18n-ignore
    { name: 'max_tokens', type: 'number', integer: true, min: 16, max: 8192, description: 'the longest reply' }, // i18n-ignore
    { name: 'tools', type: 'boolean', description: 'Control apps: let the model open apps and save files (asks before anything destructive)' }, // i18n-ignore
  ];

  add('new_chat', 'New chat', [{ name: 'title', type: 'string', maxLength: 80, description: 'optional title' }].concat(SETTINGS), (a) => { // i18n-ignore
    notBusy();
    const c = AI.newChat(), done = apply(c, a);
    refreshBar();
    return `Opened a new chat${done.length ? ' with ' + done.join(', ') : ''}. It is saved once it has a message (add_message or send_message).`;
  }, { description: 'Start a new chat in Slop AI, optionally with a persona or system prompt and settings.' }); // i18n-ignore

  add('open_chat', 'Open a chat', [{ name: 'chat', type: 'string', required: true, maxLength: 200, description: 'the chat\'s title (or a part of it) or id' }], async (a) => { // i18n-ignore
    notBusy();
    const s = String(a.chat).toLowerCase(), all = await AI.db.list('chat');
    const c = all.find((x) => String(x.id) === a.chat) || all.find((x) => x.title.toLowerCase() === s) || all.find((x) => x.title.toLowerCase().includes(s));
    if (!c) throw new Error(`No chat “${a.chat}”. The chats: ${all.slice(0, 20).map((x) => x.title).join(', ') || 'none'}.`);
    if (AI.tab !== 'chat') AI.setTab('chat');
    await AI.openConv(c.id);
    return `Opened “${c.title}” (${c.messages.length} messages).`;
  }, { description: 'Open one of the saved chats.' }); // i18n-ignore

  add('add_message', 'Add a message', [
    { name: 'text', type: 'string', required: true, maxLength: 50000 },
    { name: 'role', type: 'enum', options: [['user', 'from the person'], ['assistant', 'a reply from Slop AI']], default: 'user' },
  ], async (a) => {
    notBusy();
    const c = await P().ensureConv(), text = String(a.text);
    c.messages.push({ role: a.role, content: text, time: Date.now() });
    if (AI.isBlankTitle(c.title) && a.role === 'user') c.title = text.replace(/\s+/g, ' ').slice(0, 48);
    await AI.db.put(c);
    refreshBar();
    return `Added a ${a.role} message to “${c.title}” (${c.messages.length} messages). The model did not run; send_message asks it for a reply.`;
  }, { description: 'Put a message in the open chat as written, without running the model (a note, or a reply you wrote).' }); // i18n-ignore

  add('send_message', 'Send a message', [{ name: 'text', type: 'string', required: true, maxLength: 20000 }], async (a) => {
    notBusy();
    if (!E.ready()) throw new Error('No model is loaded in Slop AI, so nothing was sent. The person loads one in Models (a download needs their OK); add_message puts the text in the chat without a reply.');
    if (AI.tab !== 'chat') AI.setTab('chat');
    const c = await P().send(String(a.text));
    const bot = c && c.messages.filter((m) => m.role === 'assistant').pop();
    if (!bot) throw new Error('No reply came back');
    if (bot.error) throw new Error('The model failed: ' + String(bot.display || '').replace(/^⚠️ /, ''));
    return `Reply from ${E.label()}${bot.stopped ? ' (stopped)' : ''}:\n${String(bot.content).slice(0, 6000)}`;
  }, { description: 'Send a user message in the open chat and wait for the loaded model\'s reply (runs on this device). Fails, sending nothing, when no model is loaded.' }); // i18n-ignore

  add('set_settings', 'Chat settings', [{ name: 'title', type: 'string', maxLength: 80, description: 'rename the chat' }].concat(SETTINGS), async (a) => { // i18n-ignore
    notBusy();
    const c = await P().ensureConv(), done = apply(c, a);
    if (!done.length) throw new Error('Give a setting to change');
    await save(c);
    refreshBar();
    return `“${c.title}”: ${done.join(', ')}.`;
  }, { description: 'Change the open chat\'s persona, system prompt, temperature, max tokens, Control apps or title.' }); // i18n-ignore

  add('export_chat', 'Export the chat', [
    { name: 'format', type: 'enum', options: [['md', 'Markdown'], ['json', 'JSON (Import reads it back)']], default: 'md' },
    { name: 'to', type: 'enum', options: [['drive', 'Slop Drive'], ['download', 'a download'], ['both', 'both']], default: 'drive' },
  ], async (a) => {
    const c = P().conv;
    if (!c || !c.messages.length) throw new Error('The open chat has no messages to export');
    const md = a.format !== 'json', name = AI.slug(c.title) + (md ? '.md' : '.json');
    const blob = new Blob([md ? AI.toMarkdown(c) : AI.toJSON(c)], { type: md ? 'text/markdown' : 'application/json' }), out = [];
    if (a.to !== 'download') {
      if (!window.SlopHub) throw new Error('Slop Drive is not available here');
      out.push(`saved ${name} to Slop Drive (id ${await window.SlopHub.put(blob, { name, from: 'ai' })})`);
    }
    if (a.to !== 'drive') { window.SlopUI.download(blob, name); out.push(`downloaded ${name}`); }
    return out.join(' and ').replace(/^./, (x) => x.toUpperCase()) + '.';
  }, { description: 'Export the open chat as Markdown or JSON to Slop Drive and/or a download.' }); // i18n-ignore

  function state() {
    const c = P().conv, cut = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
    return {
      app: 'Slop AI', tab: AI.tab, busy: !!P().busy,
      model: E.ready() ? E.label() : null, engine: E.isFake() ? 'demo' : 'webllm', modelState: E.state,
      chat: c ? { id: c.id, title: c.title, saved: c.messages.length > 0, persona: personaName(c), system: c.system ? cut(c.system, 300) : null,
        temperature: c.temperature, maxTokens: c.maxTokens, tools: !!c.tools, messages: c.messages.length,
        last: c.messages.slice(-6).map((m) => ({ role: m.role, text: cut(String(m.display != null ? m.display : m.content || ''), 400) })) } : null,
    };
  }
  /** The open chat as it is now: the rollback brings back its messages and settings, and reopens it. */
  function checkpoint() {
    const c = P().conv, was = c && JSON.parse(JSON.stringify(c));
    return () => {
      if (P().busy) return false;
      if (!c) { P().setConv(null); return true; }
      for (const k of Object.keys(c)) if (!(k in was)) delete c[k];
      Object.assign(c, was);
      (c.messages.length ? AI.db.put(c, { touch: false }) : AI.db.remove(c.id)).catch(() => {});
      P().setConv(c); AI.emit('convs', c);
      return true;
    };
  }
  C.register(list);
  C.provide({ state, checkpoint });
})(window.AI);
