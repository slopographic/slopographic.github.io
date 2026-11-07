/* Slop AI — ui/chatlist: the Chat view: conversation sidebar (new, rename, delete, export, import), the chat bar
 * (title, persona, Control apps) and its ChatPanel. */
'use strict';
(function (AI) {
  const el = AI.el, E = AI.E;
  let panel = null, convs = [];

  function empty() {
    const ready = E.ready();
    return el('div', { class: 'empty hello' },
      el('canvas', { class: 'hello-sloppo', width: 192, height: 192, 'aria-hidden': 'true' }),
      el('b', null, AI.t(ready ? 'ai.chat.hello_ready' : 'ai.chat.hello')),
      el('p', null, AI.t(ready ? 'ai.chat.hello_ready_lead' : 'ai.chat.hello_lead')),
      // the last starter opens an app, so it turns Control apps on first
      ready ? el('div', { class: 'starters' }, ['ai.chat.starter_explain', 'ai.chat.starter_haiku', 'ai.chat.starter_names', 'ai.chat.starter_open_app'].map((k) => AI.t(k)).map((s, i) =>
        el('button', { type: 'button', class: 'btn sm', onclick: () => { if (i === 3 && panel.conv) panel.conv.tools = true; else if (i === 3) AI.pendingTools = true; panel.send(s); } }, s)))
        : el('div', { class: 'starters' }, el('button', { type: 'button', class: 'btn primary', onclick: () => AI.setTab('models') }, AI.t('ai.chat.choose_model')), el('button', { type: 'button', class: 'btn', onclick: () => AI.setTab('sys') }, AI.tabLabel('sys'))));
  }

  let seq = 0;
  async function refresh() {
    const my = ++seq, got = await AI.db.list('chat');
    if (my !== seq) return; // a newer refresh is on its way
    convs = got;
    const list = AI.$('convList'); if (!list) return;
    list.textContent = '';
    if (!convs.length) list.append(el('div', { class: 'faint conv-empty' }, AI.t('ai.chat.no_chats')));
    for (const c of convs) {
      list.append(el('div', { class: 'conv' + (panel.conv && panel.conv.id === c.id ? ' on' : ''), 'data-id': c.id, role: 'button', tabindex: 0,
        onclick: (e) => { if (!e.target.closest('.conv-more')) AI.openConv(c.id); },
        onkeydown: (e) => { if (e.key === 'Enter') AI.openConv(c.id); } },
      el('span', { class: 'conv-t' }, c.title), el('span', { class: 'faint conv-d' }, AI.fmtTime(c.updated)),
      el('button', { type: 'button', class: 'conv-more', 'aria-label': AI.t('ai.chat.more_for', { title: c.title }), onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); convMenu(c, r.left, r.bottom); } }, AI.icon('more'))));
    }
  }
  /** The menu rows for one conversation (the More button and the right-click menu share them). */
  AI.convItems = function (c) {
    return [{ label: AI.t('ui.rename_dots'), act: () => AI.renameConv(c) }, { label: AI.t('menu.export'), sub: AI.exportItems(c) }, '-', { label: AI.t('ai.chat.delete_dots'), act: () => AI.deleteConv(c) }];
  };
  AI.convById = (id) => convs.find((c) => String(c.id) === String(id)) || null;
  function convMenu(c, x, y) { window.SlopUI.menu(AI.convItems(c), x, y); }

  AI.openConv = async function (id) {
    const c = await AI.db.get(id); if (!c) return;
    panel.setConv(c); bar(); refresh();
    if (AI.chatsUI) AI.chatsUI.close();   // the phone drawer
  };
  AI.newChat = function () {
    if (AI.tab !== 'chat') AI.setTab('chat');
    const c = AI.db.blank('chat');
    if (AI.pendingTools) { c.tools = true; AI.pendingTools = false; }
    panel.setConv(c); bar(); refresh(); panel.input.focus();
    if (AI.chatsUI) AI.chatsUI.close();   // the phone drawer
    return c;
  };
  AI.renameConv = async function (c) {
    c = c || panel.conv; if (!c) return;
    const t = await window.SlopUI.prompt(AI.t('ai.chat.rename_title'), AI.t('ai.chat.title_label'), c.title); if (!t) return;
    c.title = t.trim().slice(0, 80); await AI.db.put(c, { touch: false });
    if (panel.conv && panel.conv.id === c.id) { panel.conv.title = c.title; bar(); }
    refresh();
  };
  AI.deleteConv = async function (c) {
    c = c || panel.conv; if (!c) return;
    if (!(await window.SlopUI.confirm(AI.t('ai.chat.delete_q'), AI.t('ai.chat.delete_body', { title: c.title }), AI.t('ui.delete'), { danger: true }))) return;
    await AI.db.remove(c.id);
    if (panel.conv && panel.conv.id === c.id) AI.newChat(); else refresh();
  };
  AI.exportItems = function (c) {
    const get = () => c || panel.conv;
    const md = () => new Blob([AI.toMarkdown(get())], { type: 'text/markdown' }), js = () => new Blob([AI.toJSON(get())], { type: 'application/json' });
    const nm = (ext) => AI.slug(get().title) + ext;
    return [
      { label: AI.t('ai.export.md_drive'), act: () => window.SlopHub.saveToDrive(md(), nm('.md'), { from: 'ai' }), disabled: !window.SlopHub },
      { label: AI.t('ai.export.json_drive'), act: () => window.SlopHub.saveToDrive(js(), nm('.json'), { from: 'ai' }), disabled: !window.SlopHub },
      { label: AI.t('ai.export.md_dl'), act: () => window.SlopUI.download(md(), nm('.md')) },
      { label: AI.t('ai.export.json_dl'), act: () => window.SlopUI.download(js(), nm('.json')) },
    ];
  };
  /** Import a conversation (.json): the intake's part 'ai.conv' (ui/intake.js). */
  AI.importConv = () => AI.intake.importConv();

  let chatsBtn = null;   // made once: it is the phone drawer's toggle, so bar() keeps the same button
  function bar() {
    const c = panel.conv, b = AI.$('chatBar'); if (!b) return;
    const persona = AI.personaName(c ? (c.system && c.persona !== 'builder' ? 'custom_short' : AI.PERSONAS[c.persona] ? c.persona : 'helper') : AI.PERSONAS[AI.prefs.persona] ? AI.prefs.persona : 'helper');
    b.replaceChildren(
      chatsBtn,
      el('button', { type: 'button', class: 'conv-title', id: 'convTitle', title: AI.t('ui.rename'), onclick: () => c && c.messages.length && AI.renameConv() }, c ? c.title : AI.t('ai.chat.new')),
      el('button', { type: 'button', class: 'btn sm', id: 'btnPersona', title: AI.t('ai.chat.persona_tip'), onclick: () => AI.settingsDialog(panel.conv || null, { onSave: bar }) }, AI.icon('gear'), el('span', null, persona)),
      el('button', { type: 'button', class: 'btn sm toggle', id: 'btnTools', 'aria-pressed': String(!!(c ? c.tools : AI.prefs.tools)), title: AI.t('ai.chat.tools_tip'),
        onclick: async () => { const cv = panel.conv || (await panel.ensureConv()); cv.tools = !cv.tools; if (cv.messages.length) await AI.db.put(cv, { touch: false }); bar(); AI.toast(AI.t(cv.tools ? 'ai.chat.tools_on' : 'ai.chat.tools_off')); } }, AI.icon('tool'), el('span', null, AI.t('ai.chat.tools'))),
      el('button', { type: 'button', class: 'tb', title: AI.t('menu.export'), 'aria-label': AI.t('menu.export'), disabled: !c || !c.messages.length, onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); window.SlopUI.menu(AI.exportItems(), r.right - 220, r.bottom + 4); } }, AI.icon('download')));
  }

  AI.initChat = function () {
    const v = AI.$('view-chat');
    const side = el('aside', { class: 'convs', id: 'convs', 'aria-label': AI.t('ai.chat.chats'), 'data-i18n-attr': 'aria-label:ai.chat.chats' },
      el('div', { class: 'convs-h' }, el('button', { type: 'button', class: 'btn primary new-chat', id: 'btnNewChat', onclick: () => AI.newChat() }, AI.icon('plus'), el('span', { 'data-i18n': 'ai.chat.new' }, AI.t('ai.chat.new')))),
      el('div', { class: 'conv-list', id: 'convList' }),
      AI.renderLauncher());
    const main = el('div', { class: 'chat-main' }, el('div', { class: 'chat-bar', id: 'chatBar' }));
    v.append(side, main);
    // On a phone the chat list is a drawer from the start edge: SlopSheet (shared/ui/sheet.js) gives it the Chats button as
    // its toggle, the ×, Escape, a tap outside and a swipe left.
    chatsBtn = el('button', { type: 'button', class: 'tb only-mobile', 'aria-label': AI.t('ai.chat.chats'), 'data-i18n-attr': 'aria-label:ai.chat.chats', 'aria-controls': 'convs' }, AI.icon('menu'));
    AI.chatsUI = window.SlopSheet.attach({ root: document.body, panel: side, side: 'start', phone: '(max-width: 760px)', toggles: [chatsBtn], label: AI.t('ai.chat.chats') });
    panel = AI.chat = new AI.ChatPanel(main, { kind: 'chat', empty, toolsFor: AI.toolsFor, onDone: () => bar(), onCreate: (c) => { if (AI.pendingTools) { c.tools = true; AI.pendingTools = false; } bar(); } });
    AI.on('convs', AI.debounce(refresh, 30));
    AI.on('engine', () => { if (panel.conv && !panel.conv.messages.length || !panel.conv) panel.render(); });
    panel.setConv(null); bar(); refresh();
    AI.onLang(() => { bar(); refresh(); if (!panel.conv || !panel.conv.messages.length) panel.render(); });
  };
  AI.refreshChats = refresh;
})(window.AI);
